import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { GitRepositoryTarget, ParallelSyncOptions } from "./types.js";

const execFileAsync = promisify(execFile);

export type SyncResult = {
  target: GitRepositoryTarget;
  status: "cloned" | "pulled" | "pushed" | "skipped" | "failed";
  message?: string;
};

export type ProgressPhase = "clone" | "pull" | "push";

export type ProgressEvent = {
  workerId: number;
  target: GitRepositoryTarget;
  phase: ProgressPhase;
  percent?: number;
  transferred?: string;
  speed?: string;
  objectsReceived?: number;
  objectsTotal?: number;
  raw?: string;
};

type RepoStatusSnapshot = {
  branch: string;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  hasRepo: boolean;
};

export const resolveConcurrency = (options?: ParallelSyncOptions): number => {
  if (!options || options.concurrency === undefined || options.concurrency === "auto") {
    const cores = os.cpus().length || 2;
    return Math.max(2, Math.floor(cores * 0.75));
  }

  return Math.max(1, options.concurrency);
};

export const runGit = async (args: string[], cwd?: string): Promise<string> => {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
};

const runGitQuiet = async (args: string[], cwd?: string): Promise<string> => {
  return runGit(args, cwd).catch(() => "");
};

const parseProgressLine = (line: string): {
  percent?: number;
  transferred?: string;
  speed?: string;
  objectsReceived?: number;
  objectsTotal?: number;
} => {
  const percentMatch = line.match(/(\d{1,3})%/);
  const percent = percentMatch ? Number(percentMatch[1]) : undefined;
  const sizeMatch = line.match(/(\d+(?:\.\d+)?\s*(?:KiB|MiB|GiB|KB|MB|GB))/i);
  const speedMatch = line.match(/(\d+(?:\.\d+)?\s*(?:KiB|MiB|GiB|KB|MB|GB)\/s)/i);
  const objectsMatch = line.match(/\((\d+)\/(\d+)\)/);
  const objectsReceived = objectsMatch ? Number(objectsMatch[1]) : undefined;
  const objectsTotal = objectsMatch ? Number(objectsMatch[2]) : undefined;
  return {
    percent: Number.isNaN(percent) ? undefined : percent,
    transferred: sizeMatch?.[1],
    speed: speedMatch?.[1],
    objectsReceived: Number.isNaN(objectsReceived ?? NaN) ? undefined : objectsReceived,
    objectsTotal: Number.isNaN(objectsTotal ?? NaN) ? undefined : objectsTotal,
  };
};

const runGitWithProgress = async (options: {
  args: string[];
  cwd?: string;
  workerId: number;
  target: GitRepositoryTarget;
  phase: ProgressPhase;
  onProgress?: (event: ProgressEvent) => void;
}): Promise<void> => {
  const { args, cwd, workerId, target, phase, onProgress } = options;
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", args, { cwd });
    const handleChunk = (chunk: Buffer): void => {
      const text = chunk.toString("utf-8");
      text.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }
        const parsed = parseProgressLine(trimmed);
        onProgress?.({
          workerId,
          target,
          phase,
          raw: trimmed,
          percent: parsed.percent,
          transferred: parsed.transferred,
          speed: parsed.speed,
          objectsReceived: parsed.objectsReceived,
          objectsTotal: parsed.objectsTotal,
        });
      });
    };
    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Git falhou (code ${code ?? "?"}).`));
    });
  });
};

export const ensureParentDir = async (targetPath: string): Promise<void> => {
  await execFileAsync("mkdir", ["-p", path.dirname(targetPath)]);
};

const hasGitDir = async (targetPath: string): Promise<boolean> => {
  const gitDir = path.join(targetPath, ".git");
  const exists = await execFileAsync("test", ["-d", gitDir]).then(
    () => true,
    () => false
  );
  return exists;
};

const readRepoStatus = async (target: GitRepositoryTarget): Promise<RepoStatusSnapshot> => {
  const hasRepo = await hasGitDir(target.localPath);
  const branchFallback = target.branch ?? target.defaultBranch ?? "main";
  if (!hasRepo) {
    return {
      branch: branchFallback,
      ahead: 0,
      behind: 0,
      hasRemote: true,
      hasRepo: false,
    };
  }

  const currentBranch = (await runGitQuiet(["-C", target.localPath, "rev-parse", "--abbrev-ref", "HEAD"]))
    .trim();
  const branch = currentBranch || branchFallback;
  const remoteUrl = (await runGitQuiet(["-C", target.localPath, "remote", "get-url", "origin"]))
    .trim();
  const hasRemote = Boolean(remoteUrl);

  if (!hasRemote) {
    return {
      branch,
      ahead: 0,
      behind: 0,
      hasRemote,
      hasRepo: true,
    };
  }

  await runGitQuiet(["-C", target.localPath, "fetch", "--quiet"]);
  const revList = await runGitQuiet([
    "-C",
    target.localPath,
    "rev-list",
    "--left-right",
    "--count",
    `origin/${branch}...${branch}`,
  ]);
  const [behindRaw, aheadRaw] = revList.trim().split(/\s+/);
  const behind = Number(behindRaw ?? 0);
  const ahead = Number(aheadRaw ?? 0);

  return {
    branch,
    ahead: Number.isNaN(ahead) ? 0 : ahead,
    behind: Number.isNaN(behind) ? 0 : behind,
    hasRemote,
    hasRepo: true,
  };
};

export const syncRepository = async (
  target: GitRepositoryTarget,
  options?: ParallelSyncOptions,
  workerId = 0,
  onProgress?: (event: ProgressEvent) => void
): Promise<SyncResult> => {
  try {
    await ensureParentDir(target.localPath);
    const snapshot = await readRepoStatus(target);
    const dryRun = options?.dryRun ?? false;

    if (!snapshot.hasRepo) {
      const args = ["clone", target.sshUrl, target.localPath];
      if (target.branch) {
        args.splice(1, 0, "--branch", target.branch);
      }
      if (options?.shallow) {
        args.splice(1, 0, "--depth", "1");
      }
      if (!dryRun) {
        await runGitWithProgress({
          args: ["clone", "--progress", ...args.slice(1)],
          cwd: undefined,
          workerId,
          target,
          phase: "clone",
          onProgress,
        });
      }
      return { target, status: "cloned" };
    }

    if (!snapshot.hasRemote) {
      return { target, status: "skipped", message: "Repositório local sem remoto configurado." };
    }

    if (snapshot.behind > 0 && snapshot.ahead === 0) {
      if (!dryRun) {
        await runGitWithProgress({
          args: ["-C", target.localPath, "pull", "--rebase", "--progress"],
          cwd: undefined,
          workerId,
          target,
          phase: "pull",
          onProgress,
        });
      }
      return { target, status: "pulled" };
    }

    if (snapshot.ahead > 0 && snapshot.behind === 0) {
      if (!dryRun) {
        await runGitWithProgress({
          args: ["-C", target.localPath, "push", "--progress", "origin", snapshot.branch],
          cwd: undefined,
          workerId,
          target,
          phase: "push",
          onProgress,
        });
      }
      return { target, status: "pushed" };
    }

    return { target, status: "skipped" };
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
  onProgress?: (result: SyncResult) => void,
  onProgressUpdate?: (event: ProgressEvent) => void
): Promise<SyncResult[]> => {
  const concurrency = resolveConcurrency(options);
  const queue = [...targets];
  const results: SyncResult[] = [];

  const workers = Array.from({ length: concurrency }).map(async (_, index) => {
    const workerId = index + 1;
    while (queue.length > 0) {
      const target = queue.shift();
      if (!target) {
        return;
      }
      const result = await syncRepository(target, options, workerId, onProgressUpdate);
      results.push(result);
      onProgress?.(result);
    }
  });

  await Promise.all(workers);
  return results;
};
