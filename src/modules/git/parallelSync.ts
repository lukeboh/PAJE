import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { GitRepositoryTarget, ParallelSyncOptions } from "./types.js";

const execFileAsync = promisify(execFile);

export type SyncResult = {
  target: GitRepositoryTarget;
  status: "cloned" | "pulled" | "failed";
  message?: string;
};

export const resolveConcurrency = (options?: ParallelSyncOptions): number => {
  if (!options || options.concurrency === undefined || options.concurrency === "auto") {
    const cores = os.cpus().length || 2;
    return Math.max(2, Math.floor(cores * 0.75));
  }

  return Math.max(1, options.concurrency);
};

const runGit = async (args: string[], cwd?: string): Promise<string> => {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
};

const ensureParentDir = async (targetPath: string): Promise<void> => {
  await execFileAsync("mkdir", ["-p", path.dirname(targetPath)]);
};

const syncRepository = async (
  target: GitRepositoryTarget,
  options?: ParallelSyncOptions
): Promise<SyncResult> => {
  try {
    await ensureParentDir(target.localPath);
    const gitDir = path.join(target.localPath, ".git");
    const exists = await execFileAsync("test", ["-d", gitDir]).then(
      () => true,
      () => false
    );

    if (!exists) {
      const args = ["clone", target.sshUrl, target.localPath];
      if (options?.shallow) {
        args.splice(1, 0, "--depth", "1");
      }
      await runGit(args);
      return { target, status: "cloned" };
    }

    await runGit(["-C", target.localPath, "pull", "--rebase"]);
    return { target, status: "pulled" };
  } catch (error) {
    return {
      target,
      status: "failed",
      message: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
};

export const parallelSync = async (
  targets: GitRepositoryTarget[],
  options?: ParallelSyncOptions,
  onProgress?: (result: SyncResult) => void
): Promise<SyncResult[]> => {
  const concurrency = resolveConcurrency(options);
  const queue = [...targets];
  const results: SyncResult[] = [];

  const workers = Array.from({ length: concurrency }).map(async () => {
    while (queue.length > 0) {
      const target = queue.shift();
      if (!target) {
        return;
      }
      const result = await syncRepository(target, options);
      results.push(result);
      onProgress?.(result);
    }
  });

  await Promise.all(workers);
  return results;
};
