import { loadEnvConfig } from "../sshManager.js";
import {
  resolveEnvBoolean,
  resolveEnvFileFromCli,
  resolveEnvNumber,
  resolveEnvString,
  resolveEnvStringArray,
  resolveHomePath,
} from "./envResolver.js";

export type GitSyncConfigInput = {
  baseDir?: string;
  verbose?: boolean;
  serverName?: string;
  baseUrl?: string;
  useBasicAuth?: boolean;
  username?: string;
  password?: string;
  userEmail?: string;
  keyLabel?: string;
  passphrase?: string;
  publicKeyPath?: string;
  envFile?: string;
  prepareLocalDirs?: boolean;
  noSummary?: boolean;
  noPublicRepos?: boolean;
  noArchivedRepos?: boolean;
  filter?: string;
  syncRepos?: string;
  dryRun?: boolean;
  parallels?: string;
};

export type GitSyncConfig = Required<Omit<GitSyncConfigInput, "envFile">> & { envFile?: string };

const DEFAULT_BASE_DIR = "repos";

export const resolveGitSyncConfig = (
  cliOptions: GitSyncConfigInput,
  hasCliArg: (flag: string) => boolean,
  resolveCliBoolean: (flag: string) => boolean | undefined
): GitSyncConfig => {
  const envConfig = loadEnvConfig({ envFile: resolveEnvFileFromCli(cliOptions.envFile) });

  const resolveEnvOrCliString = (cliValue: string | undefined, key: string, flag: string): string | undefined => {
    const resolvedCli = hasCliArg(flag) ? cliValue : undefined;
    return resolveEnvString(resolvedCli, envConfig, key) ?? cliValue;
  };
  const resolveEnvOrCliBoolean = (
    cliValue: boolean | undefined,
    key: string,
    flag: string,
    resolvedFlag?: boolean
  ): boolean | undefined => {
    const resolvedCli = hasCliArg(flag) ? (resolvedFlag ?? cliValue) : undefined;
    return resolveEnvBoolean(resolvedCli, envConfig, key) ?? resolvedFlag ?? cliValue;
  };
  const resolveEnvOrCliNumber = (cliValue: number | undefined, key: string, flag: string): number | undefined => {
    const resolvedCli = hasCliArg(flag) ? cliValue : undefined;
    return resolveEnvNumber(resolvedCli, envConfig, key) ?? cliValue;
  };

  const cliNoSummary = resolveCliBoolean("no-summary");
  const cliPrepareLocalDirs = resolveCliBoolean("prepare-local-dirs");
  const cliNoPublicRepos = resolveCliBoolean("no-public-repos");
  const cliNoArchivedRepos = resolveCliBoolean("no-archived-repos");
  const cliVerbose = resolveCliBoolean("verbose");
  const cliDryRun = resolveCliBoolean("dry-run");

  return {
    ...cliOptions,
    baseDir: resolveHomePath(resolveEnvOrCliString(cliOptions.baseDir, "baseDir", "base-dir")) ?? DEFAULT_BASE_DIR,
    serverName: resolveEnvOrCliString(cliOptions.serverName, "serverName", "server-name") ?? "",
    baseUrl: resolveEnvOrCliString(cliOptions.baseUrl, "baseUrl", "base-url") ?? "",
    useBasicAuth: resolveEnvOrCliBoolean(cliOptions.useBasicAuth, "useBasicAuth", "use-basic-auth") ?? false,
    username: resolveEnvOrCliString(cliOptions.username, "username", "username") ?? "",
    userEmail: resolveEnvOrCliString(cliOptions.userEmail, "userEmail", "user-email") ?? "",
    password: resolveEnvOrCliString(cliOptions.password, "password", "password") ?? "",
    keyLabel: resolveEnvOrCliString(cliOptions.keyLabel, "keyLabel", "key-label") ?? "",
    passphrase: resolveEnvOrCliString(cliOptions.passphrase, "passphrase", "passphrase") ?? "",
    publicKeyPath: resolveEnvOrCliString(cliOptions.publicKeyPath, "publicKeyPath", "public-key-path") ?? "",
    verbose: resolveEnvOrCliBoolean(cliOptions.verbose, "verbose", "verbose", cliVerbose) ?? false,
    prepareLocalDirs:
      resolveEnvOrCliBoolean(cliOptions.prepareLocalDirs, "prepareLocalDirs", "prepare-local-dirs", cliPrepareLocalDirs) ??
      false,
    noSummary: resolveEnvOrCliBoolean(cliOptions.noSummary, "noSummary", "no-summary", cliNoSummary) ?? false,
    noPublicRepos:
      resolveEnvOrCliBoolean(cliOptions.noPublicRepos, "noPublicRepos", "no-public-repos", cliNoPublicRepos) ?? false,
    noArchivedRepos:
      resolveEnvOrCliBoolean(cliOptions.noArchivedRepos, "noArchivedRepos", "no-archived-repos", cliNoArchivedRepos) ??
      false,
    filter: resolveEnvOrCliString(cliOptions.filter, "filter", "filter") ?? "",
    syncRepos: resolveEnvOrCliString(cliOptions.syncRepos, "syncRepos", "sync-repos") ?? "",
    dryRun: resolveEnvOrCliBoolean(cliOptions.dryRun, "dryRun", "dry-run", cliDryRun) ?? false,
    parallels: resolveEnvOrCliString(cliOptions.parallels, "parallels", "parallels") ?? "",
    envFile: resolveEnvFileFromCli(cliOptions.envFile),
  };
};

export const resolveTokenScopes = (rawValue: string | undefined, envFile?: string): string[] => {
  const envConfig = loadEnvConfig({ envFile: resolveEnvFileFromCli(envFile) });
  const resolved = resolveEnvStringArray(rawValue, envConfig, "tokenScopes");
  if (!resolved) {
    return [];
  }
  return resolved
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};
