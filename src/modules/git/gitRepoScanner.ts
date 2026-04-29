import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LocalGitRepoInfo = {
  path: string;
  remoteUrl?: string;
  currentBranch?: string;
};

export const getRemoteUrl = async (repoPath: string): Promise<string | undefined> => {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "remote", "get-url", "origin"]);
    return stdout.trim();
  } catch {
    return undefined;
  }
};

export const getCurrentBranch = async (repoPath: string): Promise<string | undefined> => {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"]);
    return stdout.trim();
  } catch {
    return undefined;
  }
};

export const readLocalRepoInfo = async (repoPath: string): Promise<LocalGitRepoInfo> => {
  const [remoteUrl, currentBranch] = await Promise.all([
    getRemoteUrl(repoPath),
    getCurrentBranch(repoPath),
  ]);
  return {
    path: repoPath,
    remoteUrl,
    currentBranch,
  };
};

export const getAheadBehind = async (
  repoPath: string,
  branch: string
): Promise<{ ahead: number; behind: number }> => {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      repoPath,
      "rev-list",
      "--left-right",
      "--count",
      `origin/${branch}...${branch}`,
    ]);
    const [behindRaw, aheadRaw] = stdout.trim().split(/\s+/);
    return {
      behind: Number(behindRaw ?? 0),
      ahead: Number(aheadRaw ?? 0),
    };
  } catch {
    return { ahead: 0, behind: 0 };
  }
};
