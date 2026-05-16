import { runGit } from "../parallelSync.js";
import { getAheadBehind, getStatusPorcelain, hasGitDir, readLocalRepoInfo } from "../gitRepoScanner.js";
import type { RepoSyncStatus } from "../types.js";

type BranchStatusOptions = {
  targetPath: string;
  defaultBranch?: string;
  fetch?: boolean;
};

const normalizeBranchName = (name: string): string => {
  const withoutRemotes = name.replace(/^remotes\//, "");
  return withoutRemotes.replace(/^origin\//, "");
};

const hasRef = async (targetPath: string, ref: string): Promise<boolean> => {
  try {
    await runGit(["-C", targetPath, "show-ref", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
};

const formatGitCommand = (args: string[]): string => `git ${args.join(" ")}`;

export const listLocalBranches = async (targetPath: string): Promise<string[]> => {
  const output = await runGit(["-C", targetPath, "branch", "-a", "--format=%(refname:short)"]);
  const branches = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((name) => name !== "HEAD" && !name.endsWith("/HEAD"))
    .map((name) => normalizeBranchName(name));
  return Array.from(new Set(branches));
};

export const checkoutBranch = async (targetPath: string, branch: string): Promise<string> => {
  const normalizedBranch = normalizeBranchName(branch);
  const localRef = `refs/heads/${normalizedBranch}`;
  const remoteRef = `refs/remotes/origin/${normalizedBranch}`;
  if (await hasRef(targetPath, localRef)) {
    const args = ["-C", targetPath, "checkout", normalizedBranch];
    await runGit(args);
    return formatGitCommand(args);
  }
  if (await hasRef(targetPath, remoteRef)) {
    const args = ["-C", targetPath, "checkout", "-b", normalizedBranch, "--track", `origin/${normalizedBranch}`];
    await runGit(args);
    return formatGitCommand(args);
  }
  const args = ["-C", targetPath, "checkout", normalizedBranch];
  await runGit(args);
  return formatGitCommand(args);
};

export const createBranchAndPush = async (targetPath: string, branch: string): Promise<void> => {
  await runGit(["-C", targetPath, "checkout", "-b", branch]);
  await runGit(["-C", targetPath, "push", "-u", "origin", branch]);
};

export const resolveRepoStatus = async ({ targetPath, defaultBranch, fetch }: BranchStatusOptions): Promise<RepoSyncStatus> => {
  const branchFallback = defaultBranch ?? "main";
  const hasRepo = await hasGitDir(targetPath);
  if (!hasRepo) {
    return {
      branch: branchFallback,
      state: "EMPTY",
    };
  }

  const repoInfo = await readLocalRepoInfo(targetPath);
  const branch = repoInfo.currentBranch ?? branchFallback;
  if (!repoInfo.remoteUrl) {
    return {
      branch,
      state: "LOCAL",
    };
  }

  const pendingChanges = await getStatusPorcelain(targetPath);
  if (pendingChanges) {
    return { branch, state: "UNCOMMITTED" };
  }

  if (fetch) {
    await runGit(["-C", targetPath, "fetch", "--quiet"]).catch(() => undefined);
  }

  const { ahead, behind } = await getAheadBehind(targetPath, branch);
  if (ahead === 0 && behind === 0) {
    return { branch, state: "SYNCED" };
  }
  if (behind > 0 && ahead === 0) {
    return { branch, state: "BEHIND", delta: `-${behind}` };
  }
  if (ahead > 0 && behind === 0) {
    return { branch, state: "AHEAD", delta: `+${ahead}` };
  }
  return { branch, state: "AHEAD", delta: `+${ahead}/-${behind}` };
};
