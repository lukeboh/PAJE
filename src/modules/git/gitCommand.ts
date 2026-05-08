import inquirer from "inquirer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { GitLabApi } from "./gitlabApi.js";
import { buildGitLabTree, collectSelectedProjects, recomputeTreeSelection, toggleTreeNode } from "./treeBuilder.js";
import { renderRepositoryTree, type TuiTreeProgress } from "./tui.js";
import {
  getAheadBehind,
  getStatusPorcelain,
  hasGitDir,
  listLocalDirectories,
  readLocalRepoInfo,
} from "./gitRepoScanner.js";
import { TuiSession } from "./tuiSession.js";
import {
  GitLabGroup,
  GitLabProject,
  GitLabTreeNode,
  GitRepositoryTarget,
  ParallelSyncOptions,
  RepoSyncStatus,
  RepoSyncState,
} from "./types.js";
import { parallelSync, runGit, type ProgressEvent, resolveConcurrency } from "./parallelSync.js";
import { PajeLogger } from "./logger.js";
import { antPatternToRegex, compileAntPatterns, matchesAntPatterns, splitFilterPatterns } from "./patternFilter.js";
import {
  addHostToKnownHosts,
  getIdentityFileForHost,
  getSshConfigPath,
  listSshPublicKeys,
  resolveSshIdentityPath,
  upsertSshConfigHost,
  generatePajeKeyPair,
  isHostInKnownHosts,
  readPublicKey,
  sanitizePublicKey,
  registerKeyInGitLab,
  sshKeyExists,
  ensureGitLabSshKey,
  ensureGitLabPersonalAccessToken,
  validatePersonalAccessToken,
  rotatePersonalAccessToken,
  loadGitCredentials,
  ensurePajeKeyPair,
  loadEnvConfig,
  type EnvConfig,
  type EnvConfigValue,
  type SshKeyInfo,
} from "./sshManager.js";
import { readGitServers, writeGitServers } from "./persistence.js";

type GitServerEntry = {
  id: string;
  name: string;
  baseUrl: string;
  useBasicAuth?: boolean;
  username?: string;
  token?: string;
};

const buildServerPrefix = (server: GitServerEntry): string => {
  const normalizedName = server.name?.trim() || "Servidor";
  return `[${normalizedName}]`;
};

const mergeServerList = (servers: GitServerEntry[]): GitServerEntry[] => {
  return servers.map((server) => ({
    ...server,
    id: normalizeBaseUrl(server.baseUrl),
    baseUrl: normalizeBaseUrl(server.baseUrl),
  }));
};

const mergeGroupsByPath = (
  entries: Array<{ server: GitServerEntry; groups: GitLabGroup[] }>
): { groups: GitLabGroup[]; idMapByServer: Map<string, Map<number, number>> } => {
  const byPath = new Map<string, GitLabGroup>();
  const idMapByServer = new Map<string, Map<number, number>>();
  let nextId = 1;

  entries.forEach(({ server, groups }) => {
    const localMap = new Map<number, number>();
    groups.forEach((group) => {
      localMap.set(group.id, nextId);
      nextId += 1;
    });
    idMapByServer.set(server.id, localMap);

    groups.forEach((group) => {
      const normalizedPath = `${server.name}/${group.full_path}`;
      if (byPath.has(normalizedPath)) {
        return;
      }
      const mappedId = localMap.get(group.id) ?? nextId;
      const mappedParent = group.parent_id ? localMap.get(group.parent_id) ?? null : null;
      byPath.set(normalizedPath, {
        ...group,
        id: mappedId,
        full_path: normalizedPath,
        parent_id: mappedParent,
      });
    });
  });

  return { groups: Array.from(byPath.values()), idMapByServer };
};

const mergeProjectsByPath = (
  entries: Array<{ server: GitServerEntry; projects: GitLabProject[] }>,
  idMapByServer: Map<string, Map<number, number>>
): { projects: GitLabProject[]; projectIdMapByServer: Map<string, Map<number, number>> } => {
  const byPath = new Map<string, GitLabProject>();
  const projectIdMapByServer = new Map<string, Map<number, number>>();
  let nextProjectId = 1;

  entries.forEach(({ server, projects }) => {
    const groupMap = idMapByServer.get(server.id);
    const localMap = new Map<number, number>();
    projects.forEach((project) => {
      localMap.set(project.id, nextProjectId);
      nextProjectId += 1;
    });
    projectIdMapByServer.set(server.id, localMap);

    projects.forEach((project) => {
      const normalizedPath = `${server.name}/${project.path_with_namespace}`;
      if (byPath.has(normalizedPath)) {
        return;
      }
      const mappedNamespace = project.namespace
        ? {
            ...project.namespace,
            id: groupMap?.get(project.namespace.id) ?? project.namespace.id,
            full_path: `${server.name}/${project.namespace.full_path}`,
          }
        : project.namespace;
      const mappedId = localMap.get(project.id) ?? nextProjectId;
      byPath.set(normalizedPath, {
        ...project,
        id: mappedId,
        name: `${buildServerPrefix(server)} ${project.name}`,
        path_with_namespace: normalizedPath,
        namespace: mappedNamespace,
      });
    });
  });

  return { projects: Array.from(byPath.values()), projectIdMapByServer };
};
type GitSyncCliOptions = {
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

const parseBooleanFlag = (value?: string | boolean): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return normalized === "true";
};

type RepoSummary = {
  total: number;
  publicCount: number;
  archivedCount: number;
  byStatus: Record<RepoSyncState, number>;
};

export type TreePrintNode = {
  label: string;
  status?: RepoSyncStatus;
  children?: TreePrintNode[];
};

const STATUS_COLOR: Record<RepoSyncState, string> = {
  SYNCED: "green",
  BEHIND: "red",
  AHEAD: "blue",
  REMOTE: "orange",
  EMPTY: "magenta",
  LOCAL: "red",
  UNCOMMITTED: "red",
};

const ANSI_COLOR: Record<string, string> = {
  green: "\u001b[32m",
  red: "\u001b[31m",
  blue: "\u001b[34m",
  orange: "\u001b[33m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
  white: "\u001b[37m",
  yellow: "\u001b[33m",
  reset: "\u001b[0m",
};

const BRANCH_COLOR: Record<string, string> = {
  main: "cyan",
  master: "magenta",
  stable: "green",
  develop: "yellow",
};

const colorize = (value: string, color?: string): string => {
  if (!color) {
    return value;
  }
  return `${ANSI_COLOR[color] ?? ""}${value}${ANSI_COLOR.reset}`;
};

const resolveBranchColor = (branch: string): string | undefined => {
  const normalized = branch.trim().toLowerCase();
  if (normalized.startsWith("develop")) {
    return BRANCH_COLOR.develop;
  }
  if (normalized.startsWith("main")) {
    return BRANCH_COLOR.main;
  }
  if (normalized.startsWith("master")) {
    return BRANCH_COLOR.master;
  }
  if (normalized.startsWith("stable")) {
    return BRANCH_COLOR.stable;
  }
  return undefined;
};

const createSummary = (): RepoSummary => ({
  total: 0,
  publicCount: 0,
  archivedCount: 0,
  byStatus: {
    SYNCED: 0,
    BEHIND: 0,
    AHEAD: 0,
    REMOTE: 0,
    EMPTY: 0,
    LOCAL: 0,
    UNCOMMITTED: 0,
  },
});

const renderSummaryLines = (summary: RepoSummary): string[] => {
  const entries: Array<[string, number]> = [
    ["Repositórios identificados:", summary.total],
    ["Públicos", summary.publicCount],
    ["Arquivados:", summary.archivedCount],
    ["Synced:", summary.byStatus.SYNCED],
    ["Behind:", summary.byStatus.BEHIND],
    ["Ahead:", summary.byStatus.AHEAD],
    ["Remote:", summary.byStatus.REMOTE],
    ["Empty:", summary.byStatus.EMPTY],
    ["Local:", summary.byStatus.LOCAL],
    ["Uncommitted:", summary.byStatus.UNCOMMITTED],
  ];
  const labelWidth = Math.max(...entries.map(([label]) => label.length)) + 2;
  const formatLine = (label: string, value: number): string => `${label.padEnd(labelWidth)}${value}`;
  return [
    "*********** Resumo ************",
    ...entries.map(([label, value]) => formatLine(label, value)),
  ];
};

export const formatRepoStatus = (status: RepoSyncStatus): string => {
  const state = status.state.toLowerCase();
  const delta = status.delta ? ` ${status.delta}` : "";
  const branchColor = resolveBranchColor(status.branch);
  const stateColor = STATUS_COLOR[status.state];
  const branchLabel = colorize(status.branch, branchColor);
  const stateLabel = colorize(`${state}${delta}`, stateColor);
  return `[${branchLabel}, ${stateLabel}]`;
};

export const renderTreeLines = (rootLabel: string, nodes: TreePrintNode[]): string[] => {
  const lines: string[] = [rootLabel];
  const walk = (items: TreePrintNode[], prefix: string): void => {
    items.forEach((node, index) => {
      const isLast = index === items.length - 1;
      const suffix = node.status ? ` ${formatRepoStatus(node.status)}` : "";
      lines.push(`${prefix}+ ${node.label}${suffix}`);
      if (node.children && node.children.length > 0) {
        const nextPrefix = `${prefix}${isLast ? "  " : "| "}`;
        walk(node.children, nextPrefix);
      }
    });
  };
  walk(nodes, "");
  return lines;
};

export const buildHierarchyTree = (
  projects: GitLabProject[],
  statuses: Record<number, RepoSyncStatus>,
  localPaths: string[] = [],
  localStatuses: Record<string, RepoSyncStatus> = {}
): TreePrintNode[] => {
  const root: TreePrintNode = { label: "__root__", children: [] };
  const ensureChild = (parent: TreePrintNode, label: string): TreePrintNode => {
    const existing = parent.children?.find((child) => child.label === label);
    if (existing) {
      return existing;
    }
    const created: TreePrintNode = { label, children: [] };
    parent.children = parent.children ?? [];
    parent.children.push(created);
    return created;
  };

  projects.forEach((project) => {
    const segments = project.path_with_namespace.split("/").filter(Boolean);
    let cursor = root;
    segments.forEach((segment, index) => {
      const isLeaf = index === segments.length - 1;
      const node = ensureChild(cursor, segment);
      if (isLeaf) {
        node.status = statuses[project.id];
      }
      cursor = node;
    });
  });

  localPaths.forEach((localPath) => {
    const segments = localPath.split("/").filter(Boolean);
    let cursor = root;
    segments.forEach((segment, index) => {
      const isLeaf = index === segments.length - 1;
      const node = ensureChild(cursor, segment);
      if (isLeaf) {
        node.status = localStatuses[localPath];
      }
      cursor = node;
    });
  });

  const clearNonLeafStatus = (nodes: TreePrintNode[]): void => {
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        node.status = undefined;
        clearNonLeafStatus(node.children);
      }
    });
  };

  const sortNodes = (nodes: TreePrintNode[]): void => {
    nodes.sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  };

  clearNonLeafStatus(root.children ?? []);
  sortNodes(root.children ?? []);

  return root.children ?? [];
};

const ensureLocalDirsIfNeeded = async (
  projects: GitLabProject[],
  baseDir: string,
  enabled: boolean
): Promise<void> => {
  if (!enabled) {
    return;
  }
  await Promise.all(
    projects.map(async (project) => {
      const targetPath = path.join(baseDir, project.path_with_namespace);
      await fs.promises.mkdir(targetPath, { recursive: true });
    })
  );
};

type SyncRepoSpec = {
  projectPath: string;
  branch?: string;
};

const extractSyncRepoSpec = (pattern: string): SyncRepoSpec => {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return { projectPath: "" };
  }
  const [pathPart, branchPart] = trimmed.split("#");
  let projectPath = pathPart.trim();
  if (projectPath.endsWith(".git")) {
    projectPath = projectPath.slice(0, -4);
  }
  const branch = branchPart?.trim();
  return {
    projectPath,
    branch: branch && branch.length > 0 ? branch : undefined,
  };
};

const resolveProjectMatchPath = (project: GitLabProject): string => {
  return project.path_with_namespace;
};

const resolveSyncReposSpecs = (rawPatterns?: string): SyncRepoSpec[] => {
  const specs: SyncRepoSpec[] = [];
  splitFilterPatterns(rawPatterns).forEach((rawPattern: string) => {
    const spec = extractSyncRepoSpec(rawPattern);
    if (!spec.projectPath) {
      return;
    }
    specs.push(spec);
  });
  return specs;
};

const buildSyncPattern = (spec: SyncRepoSpec): RegExp => {
  return antPatternToRegex(spec.projectPath);
};

const resolveSyncTargets = (projects: GitLabProject[], specs: SyncRepoSpec[]): GitRepositoryTarget[] => {
  if (specs.length === 0) {
    return [];
  }
  const normalizedProjects = projects.map((project) => ({
    project,
    matchPath: resolveProjectMatchPath(project),
  }));
  const matches: GitRepositoryTarget[] = [];
  specs.forEach((spec) => {
    const pattern = buildSyncPattern(spec);
    normalizedProjects.forEach(({ project, matchPath }) => {
      if (!pattern.test(matchPath)) {
        return;
      }
      matches.push({
        id: project.id,
        name: project.name,
        pathWithNamespace: project.path_with_namespace,
        sshUrl: project.ssh_url_to_repo,
        localPath: "",
        defaultBranch: project.default_branch,
        branch: spec.branch,
      });
    });
  });
  const uniqueByPath = new Map<string, GitRepositoryTarget>();
  matches.forEach((target) => {
    const key = `${target.pathWithNamespace}#${target.branch ?? ""}`;
    if (!uniqueByPath.has(key)) {
      uniqueByPath.set(key, target);
    }
  });
  return Array.from(uniqueByPath.values());
};

const resolveRepoStatus = async (options: {
  targetPath: string;
  defaultBranch?: string;
  knownRemote: boolean;
}): Promise<RepoSyncStatus> => {
  const branchFallback = options.defaultBranch ?? "main";
  const hasRepo = await hasGitDir(options.targetPath);
  if (!hasRepo) {
    return {
      branch: branchFallback,
      state: options.knownRemote ? "EMPTY" : "LOCAL",
    };
  }

  const repoInfo = await readLocalRepoInfo(options.targetPath);
  const branch = repoInfo.currentBranch ?? branchFallback;
  if (!repoInfo.remoteUrl) {
    return {
      branch,
      state: options.knownRemote ? "REMOTE" : "LOCAL",
    };
  }

  const pendingChanges = await getStatusPorcelain(options.targetPath);
  if (pendingChanges) {
    return { branch, state: "UNCOMMITTED" };
  }

  await runGit(["-C", options.targetPath, "fetch", "--quiet"]).catch(() => undefined);
  const { ahead, behind } = await getAheadBehind(options.targetPath, branch);
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

const buildLocalStatusMap = async (
  baseDir: string,
  knownPaths: Set<string>
): Promise<{ localPaths: string[]; statusMap: Record<string, RepoSyncStatus> }> => {
  const allDirs = await listLocalDirectories(baseDir);
  const localPaths = allDirs
    .filter((dir) => !knownPaths.has(dir))
    .map((dir) => path.relative(baseDir, dir));
  const statusEntries = await Promise.all(
    localPaths.map(async (relativePath) => {
      const targetPath = path.join(baseDir, relativePath);
      const status = await resolveRepoStatus({
        targetPath,
        knownRemote: false,
      });
      return [relativePath, status] as const;
    })
  );
  return {
    localPaths,
    statusMap: Object.fromEntries(statusEntries),
  };
};

type SshKeyStoreCliOptions = {
  verbose?: boolean;
  serverName?: string;
  baseUrl?: string;
  username?: string;
  keyLabel?: string;
  passphrase?: string;
  publicKeyPath?: string;
  keyOverwrite?: boolean;
  retryDelayMs?: number;
  maxAttempts?: number;
  envFile?: string;
  tokenName?: string;
  tokenScopes?: string;
  tokenExpiresAt?: string;
};

export const normalizeBaseUrl = (url: string): string => url.trim().replace(/\/+$/, "");

type MergeResult = {
  servers: GitServerEntry[];
  updated: boolean;
};

export const mergeServer = (servers: GitServerEntry[], server: GitServerEntry): MergeResult => {
  const normalized = normalizeBaseUrl(server.baseUrl);
  const existingIndex = servers.findIndex((item) => normalizeBaseUrl(item.baseUrl) === normalized);
  const sanitized = {
    ...server,
    id: normalized,
    baseUrl: normalized,
  };

  if (existingIndex >= 0) {
    const updated = [...servers];
    updated[existingIndex] = { ...updated[existingIndex], ...sanitized };
    return { servers: updated, updated: true };
  }

  return { servers: [...servers, sanitized], updated: false };
};

export const promptGitServer = async (
  session?: TuiSession,
  overrides?: Partial<GitServerEntry>
): Promise<GitServerEntry> => {
  if (session) {
    const form = await session.promptForm<{ name: string; baseUrl: string; username: string }>({
      title: "Servidor GitLab",
      fields: [
        {
          name: "name",
          label: "Nome do servidor GitLab",
          defaultValue: overrides?.name ?? "GitLab",
        },
        {
          name: "baseUrl",
          label: "URL base do GitLab",
          defaultValue: overrides?.baseUrl ?? "https://gitlab.com",
        },
        {
          name: "username",
          label: "Usuário do GitLab (para autenticação básica)",
          description: "Opcional. Preencha para usar autenticação básica.",
          defaultValue: overrides?.username ?? "",
        },
      ],
    });
    const useBasicAuth =
      overrides?.useBasicAuth ??
      (await session.promptConfirm({
      title: "Servidor GitLab",
      message: "Usar autenticação básica (usuário/senha)?",
      defaultValue: false,
    }));

    return {
      id: form?.baseUrl ?? overrides?.baseUrl ?? "",
      name: form?.name ?? overrides?.name ?? "GitLab",
      baseUrl: form?.baseUrl ?? overrides?.baseUrl ?? "https://gitlab.com",
      useBasicAuth: useBasicAuth ?? false,
      username: form?.username ?? overrides?.username ?? "",
    };
  }

  const answers = (await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Nome do servidor GitLab",
      default: overrides?.name ?? "GitLab",
    },
    {
      type: "input",
      name: "baseUrl",
      message: "URL base do GitLab",
      default: overrides?.baseUrl ?? "https://gitlab.com",
    },
    {
      type: "confirm",
      name: "useBasicAuth",
      message: "Usar autenticação básica (usuário/senha)?",
      default: overrides?.useBasicAuth ?? false,
    },
    {
      type: "input",
      name: "username",
      message: "Usuário do GitLab (para autenticação básica)",
      when: (answers) => Boolean(answers.useBasicAuth),
      default: overrides?.username ?? "",
    },
  ])) as { name: string; baseUrl: string; useBasicAuth: boolean; username?: string };

  return {
    id: answers.baseUrl ?? overrides?.baseUrl ?? "",
    name: answers.name ?? overrides?.name ?? "GitLab",
    baseUrl: answers.baseUrl ?? overrides?.baseUrl ?? "https://gitlab.com",
    useBasicAuth: answers.useBasicAuth,
    username: answers.username ?? overrides?.username,
  };
};

export const promptBasicAuthPassword = async (
  username: string,
  session?: TuiSession,
  presetPassword?: string
): Promise<string> => {
  if (presetPassword) {
    return presetPassword;
  }
  if (session) {
    const form = await session.promptForm<{ password: string }>({
      title: "GitLab - Autenticação Básica",
      fields: [
        {
          name: "password",
          label: `Senha do usuário ${username}`,
          secret: true,
          description: "Senha do GitLab para autenticação básica.",
        },
      ],
    });
    return form?.password ?? "";
  }

  const answers = (await inquirer.prompt([
    { type: "password", name: "password", message: `Senha do usuário ${username}` },
  ])) as { password: string };
  return answers.password;
};

export const selectGitServer = async (session?: TuiSession, cli?: GitSyncCliOptions): Promise<GitServerEntry> => {
  if (cli?.serverName && cli?.baseUrl) {
    const server: GitServerEntry = {
      id: cli.baseUrl,
      name: cli.serverName,
      baseUrl: cli.baseUrl,
      useBasicAuth: cli.useBasicAuth ?? false,
      username: cli.username,
    };
    const servers = readGitServers<GitServerEntry[]>([]);
    const merge = mergeServer(servers, server);
    writeGitServers(merge.servers);
    return merge.servers.find((item) => normalizeBaseUrl(item.baseUrl) === normalizeBaseUrl(server.baseUrl)) ?? server;
  }
  const servers = readGitServers<GitServerEntry[]>([]);
  if (cli?.serverName && servers.length > 0) {
    const normalizedName = cli.serverName.trim().toLowerCase();
    const matched = servers.find((server) => server.name.trim().toLowerCase() === normalizedName);
    if (matched) {
      return matched;
    }
  }
  if (servers.length === 0) {
    const server = await promptGitServer(session, {
      name: cli?.serverName,
      baseUrl: cli?.baseUrl,
      useBasicAuth: cli?.useBasicAuth,
      username: cli?.username,
    });
    const merge = mergeServer([], server);
    writeGitServers(merge.servers);
    return merge.servers[0];
  }

  if (session) {
    const selected = await session.promptList({
      title: "Servidor GitLab",
      message: "Escolha o servidor",
      choices: [
        ...servers.map((server) => ({
          label: `${server.name} (${server.baseUrl})`,
          value: server.id,
          description: "Selecione para usar este servidor nas próximas etapas.",
        })),
        {
          label: "Adicionar novo servidor",
          value: "__new__",
          description: "Crie um novo servidor GitLab informando nome, URL e autenticação básica (opcional).",
        },
      ],
    });

    if (selected === "__new__") {
        const server = await promptGitServer(session, {
          name: cli?.serverName,
          baseUrl: cli?.baseUrl,
          useBasicAuth: cli?.useBasicAuth,
          username: cli?.username,
        });
      const merge = mergeServer(servers, server);
      writeGitServers(merge.servers);
      if (merge.updated && session) {
        await session.showMessage({
          title: "Servidor GitLab",
          message: "Servidor já existente. Dados atualizados para a mesma URL.",
        });
      }
      return (
        merge.servers.find((item) => normalizeBaseUrl(item.baseUrl) === normalizeBaseUrl(server.baseUrl)) ??
        merge.servers[0]
      );
    }

    return servers.find((server) => server.id === selected) ?? servers[0];
  }

  const { selected } = (await inquirer.prompt([
    {
      name: "selected",
      type: "list",
      message: "Servidor GitLab",
      choices: [
        ...servers.map((server) => ({ name: `${server.name} (${server.baseUrl})`, value: server.id })),
        { name: "Adicionar novo servidor", value: "__new__" },
      ],
    },
  ])) as { selected: string };

  if (selected === "__new__") {
    const server = await promptGitServer(undefined, {
      name: cli?.serverName,
      baseUrl: cli?.baseUrl,
      useBasicAuth: cli?.useBasicAuth,
      username: cli?.username,
    });
    const merge = mergeServer(servers, server);
    writeGitServers(merge.servers);
    if (merge.updated) {
      console.log("Servidor já existente. Dados atualizados para a mesma URL.");
    }
    return (
      merge.servers.find((item) => normalizeBaseUrl(item.baseUrl) === normalizeBaseUrl(server.baseUrl)) ??
      merge.servers[0]
    );
  }

  return servers.find((server) => server.id === selected) ?? servers[0];
};
const ensureSshKey = async (
  api: GitLabApi,
  session?: TuiSession,
  verbose?: boolean,
  cli?: GitSyncCliOptions
): Promise<void> => {
  const existingKeys = listSshPublicKeys();
  const server = api.getServerHost();
  let associatedIdentityPath = getIdentityFileForHost(server);
  if (associatedIdentityPath) {
    const resolved = resolveSshIdentityPath(associatedIdentityPath);
    if (!fs.existsSync(resolved)) {
      if (session) {
        await session.showMessage({
          title: "Chave SSH",
          message: `A chave vinculada em ~/.ssh/config para ${server} não existe (${associatedIdentityPath}).`,
        });
      } else {
        console.log(`A chave vinculada em ~/.ssh/config para ${server} não existe (${associatedIdentityPath}).`);
      }
      associatedIdentityPath = null;
    }
  }

  if (associatedIdentityPath) {
    await ensureKnownHost(server, session, verbose);
    await reportSshPersistenceStatus(server, session);
    return;
  }

  if (!associatedIdentityPath && existingKeys.length > 0) {
    if (cli?.publicKeyPath) {
      const selectedKey = cli.publicKeyPath;
      if (!fs.existsSync(selectedKey)) {
        const message = `Chave pública informada não existe: ${selectedKey}`;
        if (session) {
          await session.showMessage({ title: "Chave SSH", message });
        } else {
          console.log(message);
        }
        return;
      }
      const key = sanitizePublicKey(readPublicKey(selectedKey));
      upsertSshConfigHost(server, selectedKey.replace(/\.pub$/, ""));
      await ensureKnownHost(server, session, verbose);
      await reportSshPersistenceStatus(server, session);
      if (api.hasAuth()) {
        try {
          await registerKeyInGitLab(api, `paje-existing-${Date.now()}`, key);
        } catch (error) {
          const details = (error as { details?: { method: string; url: string; status: number; responseBody: string; curl: string } })
            .details;
          const message = details
            ? `Falha ao registrar chave no GitLab: ${details.status}.\nURL: ${details.url}\nResposta: ${details.responseBody}\nCURL (redigido): ${details.curl}`
            : `Falha ao registrar chave no GitLab: ${error instanceof Error ? error.message : "erro desconhecido"}.`;
          if (session) {
            await session.showMessage({ title: "GitLab", message });
          } else {
            console.log(message);
          }
        }
      }
      return;
    }
    let choice: "existing" | "generate" = "generate";
    if (session) {
      const selection = await session.promptList({
        title: "Chave SSH",
        message: "Selecione uma opção",
        choices: [
          {
            label: "Usar chave existente",
            value: "existing",
            description: "Seleciona uma chave pública já existente em ~/.ssh.",
          },
          {
            label: "Gerar nova chave SSH no diretório .ssh",
            value: "generate",
            description: "Cria uma nova chave ed25519 em ~/.ssh e registra no GitLab.",
          },
        ],
      });
      choice = (selection ?? "generate") as "existing" | "generate";
    } else {
      const promptChoice = (await inquirer.prompt([
        {
          name: "choice",
          type: "list",
          message: "Chave SSH",
          choices: [
            { name: "Usar chave existente", value: "existing" },
            { name: "Gerar nova chave para o PAJÉ", value: "generate" },
          ],
        },
      ])) as { choice: "existing" | "generate" };
      choice = promptChoice.choice;
    }

    if (choice === "existing") {
      let selectedKey: string | null = null;
      if (session) {
        selectedKey = await session.promptList({
          title: "Chave SSH",
          message: "Selecione a chave pública",
          choices: existingKeys.map((key) => ({
            label: key,
            value: key,
            description: "Confirme a chave pública que será registrada no GitLab.",
          })),
        });
      } else {
        const promptKey = (await inquirer.prompt([
          {
            name: "selectedKey",
            type: "list",
            message: "Selecione a chave pública",
            choices: existingKeys,
          },
        ])) as { selectedKey: string };
        selectedKey = promptKey.selectedKey;
      }

      if (!selectedKey) {
        return;
      }

      const key = sanitizePublicKey(readPublicKey(selectedKey));
      upsertSshConfigHost(server, selectedKey.replace(/\.pub$/, ""));
      await ensureKnownHost(server, session, verbose);
      await reportSshPersistenceStatus(server, session);
      if (api.hasAuth()) {
        try {
          await registerKeyInGitLab(api, `paje-existing-${Date.now()}`, key);
        } catch (error) {
          const details = (error as { details?: { method: string; url: string; status: number; responseBody: string; curl: string } })
            .details;
          const message = details
            ? `Falha ao registrar chave no GitLab: ${details.status}.\nURL: ${details.url}\nResposta: ${details.responseBody}\nCURL (redigido): ${details.curl}`
            : `Falha ao registrar chave no GitLab: ${error instanceof Error ? error.message : "erro desconhecido"}.`;
          if (session) {
            await session.showMessage({ title: "GitLab", message });
          } else {
            console.log(message);
          }
        }
      }
      return;
    }
  }

  let passphrase: string | null = cli?.passphrase ?? null;
  let keyLabel: string | null = cli?.keyLabel ?? null;
  if (session) {
    if (cli?.keyLabel) {
      keyLabel = cli.keyLabel;
    }
    if (cli?.passphrase) {
      passphrase = cli.passphrase;
    }
    if (cli?.keyLabel || cli?.passphrase) {
      // não abrir formulário se parâmetros foram fornecidos
    } else {
    const form = await session.promptForm<{ keyLabel: string; passphrase: string }>({
      title: "Chave SSH",
      fields: [
        {
          name: "keyLabel",
          label: "Nome/identificador da chave",
          defaultValue: "paje",
          description: "Esse nome será usado no arquivo e comentário da chave SSH.",
        },
        {
          name: "passphrase",
          label: "Passphrase (opcional)",
          secret: true,
          description: "Protege a chave privada com uma senha. Pode ficar em branco.",
        },
      ],
    });
    keyLabel = form?.keyLabel ?? "paje";
    passphrase = form?.passphrase ?? null;
    }
  } else {
    if (!cli?.keyLabel) {
    const promptLabel = (await inquirer.prompt([
      { name: "keyLabel", message: "Nome/identificador da chave", type: "input", default: "paje" },
    ])) as { keyLabel?: string };
    keyLabel = promptLabel.keyLabel ?? "paje";
    }
    if (!cli?.passphrase) {
    const promptPass = (await inquirer.prompt([
      { name: "passphrase", message: "Passphrase (opcional)", type: "password" },
    ])) as { passphrase?: string };
    passphrase = promptPass.passphrase ?? null;
    }
  }

  let resolvedLabel = keyLabel || "paje";
  while (sshKeyExists(resolvedLabel)) {
    if (session) {
      session.showInlineError(`Já existe uma chave com o nome "${resolvedLabel}". Escolha outro nome.`);
      const retryForm = await session.promptForm<{ keyLabel: string; passphrase: string }>({
        title: "Chave SSH",
        fields: [
          {
            name: "keyLabel",
            label: "Nome/identificador da chave",
            defaultValue: resolvedLabel,
            description: "Esse nome será usado no arquivo e comentário da chave SSH.",
          },
          {
            name: "passphrase",
            label: "Passphrase (opcional)",
            secret: true,
            description: "Protege a chave privada com uma senha. Pode ficar em branco.",
          },
        ],
      });
      resolvedLabel = retryForm?.keyLabel ?? resolvedLabel;
      passphrase = retryForm?.passphrase ?? passphrase;
    } else {
      console.log(`Já existe uma chave com o nome "${resolvedLabel}". Escolha outro nome.`);
      break;
    }
  }

  if (sshKeyExists(resolvedLabel)) {
    return;
  }

      const keyInfo = await generatePajeKeyPair(passphrase || undefined, resolvedLabel);
      const sanitizedKey = sanitizePublicKey(keyInfo.publicKey);
      upsertSshConfigHost(server, keyInfo.privateKeyPath);
      await ensureKnownHost(server, session, verbose);
      await reportSshPersistenceStatus(server, session);
      if (api.hasAuth()) {
        try {
          await registerKeyInGitLab(api, `paje-${Date.now()}`, sanitizedKey);
        } catch (error) {
          const details = (error as { details?: { method: string; url: string; status: number; responseBody: string; curl: string } })
            .details;
          const message = details
            ? `Falha ao registrar chave no GitLab: ${details.status}.\nURL: ${details.url}\nResposta: ${details.responseBody}\nCURL (redigido): ${details.curl}`
            : `Falha ao registrar chave no GitLab: ${error instanceof Error ? error.message : "erro desconhecido"}.`;
          if (session) {
            await session.showMessage({ title: "GitLab", message });
          } else {
            console.log(message);
          }
        }
      }
};

const ensureKnownHost = async (server: string, session?: TuiSession, verbose?: boolean): Promise<void> => {
  if (await isHostInKnownHosts(server)) {
    return;
  }
  let confirm = true;
  if (session) {
    confirm =
      (await session.promptConfirm({
        title: "Confiança SSH",
        message: `Host ${server} não está em ~/.ssh/known_hosts. Adicionar via ssh-keyscan?`,
        defaultValue: true,
      })) ?? true;
  } else {
    const promptConfirm = (await inquirer.prompt([
      {
        name: "confirm",
        type: "confirm",
        message: `Host ${server} não está em ~/.ssh/known_hosts. Adicionar via ssh-keyscan?`,
        default: true,
      },
    ])) as { confirm: boolean };
    confirm = promptConfirm.confirm;
  }

  if (!confirm) {
    return;
  }

  const added = await addHostToKnownHosts(server, {
    verbose,
    logger: session
      ? (message) => {
          session.showMessage({ title: "Verbose", message });
        }
      : undefined,
  });
  if (!added) {
    const message = `Não foi possível adicionar ${server} ao ~/.ssh/known_hosts via ssh-keyscan. Host inacessível: ${server}. Verifique conectividade/porte 22 e permissões.`;
    if (session) {
      await session.showMessage({ title: "Confiança SSH", message });
    } else {
      console.log(message);
    }
  }
};

const hasValidSshAssociation = (host: string): boolean => {
  const identityPath = getIdentityFileForHost(host);
  if (!identityPath) {
    return false;
  }
  return fs.existsSync(resolveSshIdentityPath(identityPath));
};

const reportSshPersistenceStatus = async (server: string, session?: TuiSession): Promise<void> => {
  const sshDir = path.join(os.homedir(), ".ssh");
  const configPath = getSshConfigPath();
  const configExists = fs.existsSync(configPath);
  const knownHostsPath = path.join(sshDir, "known_hosts");
  const knownHostsExists = fs.existsSync(knownHostsPath);

  if (configExists && knownHostsExists) {
    return;
  }

  const missing = [
    configExists ? null : "~/.ssh/config",
    knownHostsExists ? null : "~/.ssh/known_hosts",
  ].filter(Boolean);
  const message = `Não foi possível gravar ${missing.join(" e ")}. Verifique permissões de ~/.ssh (recomendado 700).`;
  if (session) {
    await session.showMessage({ title: "Chave SSH", message });
  } else {
    console.log(message);
  }
};

const resolveEnvPaths = (envFile?: string): string[] | undefined => {
  if (!envFile) {
    return undefined;
  }
  return [envFile];
};

const defaultEnvPath = path.join(os.homedir(), ".paje", "env.yaml");

const resolveEnvFileFromCli = (envFile?: string): string | undefined => {
  if (envFile && envFile.trim()) {
    return envFile;
  }
  return defaultEnvPath;
};

export const resolveEnvValue = <T extends EnvConfigValue>(
  cliValue: T | undefined,
  env: EnvConfig,
  key: string
): T | undefined => {
  if (cliValue !== undefined && cliValue !== null && String(cliValue).trim() !== "") {
    return cliValue;
  }
  const value = env[key];
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }
  return value as T;
};

export const resolveEnvString = (cliValue: string | undefined, env: EnvConfig, key: string): string | undefined => {
  const resolved = resolveEnvValue(cliValue, env, key);
  if (resolved === undefined) {
    return undefined;
  }
  return String(resolved);
};

export const resolveEnvBoolean = (cliValue: boolean | undefined, env: EnvConfig, key: string): boolean | undefined => {
  if (cliValue !== undefined) {
    return cliValue;
  }
  const value = env[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }
    if (value.toLowerCase() === "false") {
      return false;
    }
  }
  return undefined;
};

export const resolveEnvNumber = (cliValue: number | undefined, env: EnvConfig, key: string): number | undefined => {
  if (cliValue !== undefined && !Number.isNaN(cliValue)) {
    return cliValue;
  }
  const value = env[key];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

export const resolveEnvStringArray = (cliValue: string | undefined, env: EnvConfig, key: string): string | undefined => {
  if (cliValue && cliValue.trim()) {
    return cliValue;
  }
  const value = env[key];
  if (Array.isArray(value)) {
    return value.join(",");
  }
  if (typeof value === "string") {
    return value;
  }
  return undefined;
};

export const resolveHomePath = (value?: string): string | undefined => {
  if (!value) {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return value;
};

const storeSshKeyOnly = async (
  server: GitServerEntry,
  session?: TuiSession,
  cli?: SshKeyStoreCliOptions
): Promise<void> => {
  const logger = session
    ? (message: string) => {
        session.showMessage({ title: "SSH", message });
      }
    : console.log;
  const serverHost = new URL(server.baseUrl).hostname;

  const envConfig = loadEnvConfig({ envFile: resolveEnvFileFromCli(cli?.envFile) });
  const hasCliArg = (flag: string): boolean => {
    const dashed = `--${flag}`;
    return process.argv.some((arg) => arg === dashed || arg.startsWith(`${dashed}=`));
  };
  const resolveEnvOrCliString = (cliValue: string | undefined, key: string, flag: string): string | undefined => {
    const resolvedCli = hasCliArg(flag) ? cliValue : undefined;
    return resolveEnvString(resolvedCli, envConfig, key) ?? cliValue;
  };
  const resolveEnvOrCliBoolean = (cliValue: boolean | undefined, key: string, flag: string): boolean | undefined => {
    const resolvedCli = hasCliArg(flag) ? cliValue : undefined;
    return resolveEnvBoolean(resolvedCli, envConfig, key) ?? cliValue;
  };
  const resolveEnvOrCliNumber = (cliValue: number | undefined, key: string, flag: string): number | undefined => {
    const resolvedCli = hasCliArg(flag) ? cliValue : undefined;
    return resolveEnvNumber(resolvedCli, envConfig, key) ?? cliValue;
  };

  let resolvedUsername = resolveEnvOrCliString(cli?.username?.trim(), "username", "username");
  if (!resolvedUsername) {
    if (session) {
      const form = await session.promptForm<{ username: string }>({
        title: "GitLab",
        fields: [
          {
            name: "username",
            label: "Usuário do GitLab",
            description: "Informe o usuário para autenticação básica.",
          },
        ],
      });
      resolvedUsername = form?.username?.trim();
    } else {
      const promptUser = (await inquirer.prompt([
        { name: "username", message: "Usuário do GitLab", type: "input" },
      ])) as { username?: string };
      resolvedUsername = promptUser.username?.trim();
    }
  }

  const resolvedPublicKeyPath = resolveEnvOrCliString(cli?.publicKeyPath, "publicKeyPath", "public-key-path");
  let keyInfo: SshKeyInfo | undefined;
  if (resolvedPublicKeyPath) {
    const selectedKey = resolvedPublicKeyPath;
    if (!fs.existsSync(selectedKey)) {
      const message = `Chave pública informada não existe: ${selectedKey}`;
      if (session) {
        await session.showMessage({ title: "Chave SSH", message });
      } else {
        console.log(message);
      }
      return;
    }
    keyInfo = {
      publicKeyPath: selectedKey,
      privateKeyPath: selectedKey.replace(/\.pub$/, ""),
      publicKey: readPublicKey(selectedKey),
    };
  } else {
    keyInfo = await ensurePajeKeyPair({
      keyLabel: resolveEnvOrCliString(cli?.keyLabel, "keyLabel", "key-label"),
      passphrase: resolveEnvOrCliString(cli?.passphrase, "passphrase", "passphrase"),
      overwrite: resolveEnvOrCliBoolean(cli?.keyOverwrite, "keyOverwrite", "key-overwrite") ?? false,
      logger,
    });
  }

  upsertSshConfigHost(serverHost, keyInfo.privateKeyPath);
  await ensureKnownHost(serverHost, session, resolveEnvOrCliBoolean(cli?.verbose, "verbose", "verbose"));
  await reportSshPersistenceStatus(serverHost, session);

  if (process.env.PAJE_SKIP_SSH_STORE === "1") {
    logger?.("Execução de testes: etapa de armazenamento remoto ignorada.");
    return;
  }

  let resolvedPassword = resolveEnvString(undefined, envConfig, "password");
  if (!resolvedPassword) {
    if (session) {
      const form = await session.promptForm<{ password: string }>({
        title: "GitLab",
        fields: [
          {
            name: "password",
            label: "Senha do GitLab",
            secret: true,
            description: "Informe a senha para autenticação básica.",
          },
        ],
      });
      resolvedPassword = form?.password ?? "";
    } else {
      const promptPass = (await inquirer.prompt([
        { name: "password", message: "Senha do GitLab", type: "password" },
      ])) as { password?: string };
      resolvedPassword = promptPass.password ?? "";
    }
  }

  const credentials = loadGitCredentials({
    envFilePaths: resolveEnvPaths(resolveEnvFileFromCli(cli?.envFile)),
    allowProcessEnv: false,
  });

  await ensureGitLabSshKey({
    baseUrl: server.baseUrl,
    title: resolveEnvOrCliString(cli?.keyLabel, "keyLabel", "key-label") ?? "paje",
    usageType: "auth_and_signing",
    credentials: {
      ...credentials,
      username: resolvedUsername ?? credentials.username,
      password: resolveEnvOrCliString(cliOptions.password, "password", "password"),
    },
    keyInfo,
    fetchImpl: globalThis.fetch,
    logger,
    maxAttempts: resolveEnvOrCliNumber(cli?.maxAttempts, "maxAttempts", "max-attempts"),
    retryDelayMs: resolveEnvOrCliNumber(cli?.retryDelayMs, "retryDelayMs", "retry-delay-ms"),
  });

  if (process.env.PAJE_SKIP_SSH_STORE === "1") {
    logger?.("Execução de testes: etapa de token remoto ignorada.");
    return;
  }

  const normalizedBaseUrl = normalizeBaseUrl(server.baseUrl);
  const existingServers = readGitServers<GitServerEntry[]>([]);
  const existingServer = existingServers.find((item) => normalizeBaseUrl(item.baseUrl) === normalizedBaseUrl);

  if (existingServer?.token) {
    try {
      const tokenStatus = await validatePersonalAccessToken({
        baseUrl: normalizedBaseUrl,
        token: existingServer.token,
        fetchImpl: globalThis.fetch,
        logger,
      });
      if (tokenStatus.valid) {
        const expiresAt = tokenStatus.expiresAt ?? "não informado";
        const scopes = tokenStatus.scopes && tokenStatus.scopes.length > 0 ? tokenStatus.scopes.join(", ") : "não informado";
        const active = tokenStatus.active ?? true;
        logger?.(`Token já existe e está válido para ${normalizedBaseUrl}.`);
        logger?.(`Detalhes do token: ativo=${active}, expira=${expiresAt}, escopos=${scopes}.`);
        logger?.("Reutilizando token existente.");
        return;
      }
      logger?.("Token existente inválido/expirado. Status=401 ou expirado.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido";
      logger?.(`Falha ao validar token existente (${message}). Tentando rotacionar.`);
    }

    logger?.(`Token existente inválido/expirado para ${normalizedBaseUrl}. Tentando rotacionar.`);
    try {
      const rotated = await rotatePersonalAccessToken({
        baseUrl: normalizedBaseUrl,
        token: existingServer.token,
        fetchImpl: globalThis.fetch,
        logger,
      });
      const serverWithToken: GitServerEntry = {
        ...server,
        token: rotated.token,
      };
      const mergedServers = mergeServer(existingServers, serverWithToken);
      writeGitServers(mergedServers.servers);
      logger?.(`Token rotacionado com sucesso para ${normalizedBaseUrl}.`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido";
      logger?.(`Falha ao rotacionar token (${message}). Gerando novo token.`);
    }
  }

  const resolvedTokenName = resolveEnvOrCliString(cli?.tokenName?.trim(), "tokenName", "token-name");
  const resolvedTokenScopes = resolveEnvStringArray(
    hasCliArg("token-scopes") ? cli?.tokenScopes : undefined,
    envConfig,
    "tokenScopes"
  );
  const resolvedTokenExpiresAt = resolveEnvOrCliString(cli?.tokenExpiresAt, "tokenExpiresAt", "token-expires-at");
  const tokenName = resolvedTokenName ?? "";
  const scopeList = resolvedTokenScopes
    ? resolvedTokenScopes.split(",").map((item) => item.trim()).filter(Boolean)
    : ["read_repository", "read_api", "read_virtual_registry", "self_rotate"];
  if (!resolvedTokenName) {
    logger?.("Nome do token não informado. Configure tokenName no env-test.yaml.");
    return;
  }

  const tokenResult = await ensureGitLabPersonalAccessToken({
    baseUrl: normalizedBaseUrl,
    name: tokenName,
    scopes: scopeList,
    expiresAt: resolvedTokenExpiresAt,
    credentials: {
      ...credentials,
      username: resolvedUsername ?? credentials.username,
      password: resolveEnvOrCliString(cli?.password, "password", "password"),
    },
    fetchImpl: globalThis.fetch,
    logger,
    maxAttempts: resolveEnvOrCliNumber(cli?.maxAttempts, "maxAttempts", "max-attempts"),
    retryDelayMs: resolveEnvOrCliNumber(cli?.retryDelayMs, "retryDelayMs", "retry-delay-ms"),
  });

  const serverWithToken: GitServerEntry = {
    ...server,
    token: tokenResult.token,
  };
  const mergedServers = mergeServer(existingServers, serverWithToken);
  writeGitServers(mergedServers.servers);
};

const prepareTargets = (
  projects: GitLabProject[],
  baseDir: string,
  gitUserName?: string,
  gitUserEmail?: string
): GitRepositoryTarget[] => {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    pathWithNamespace: project.path_with_namespace,
    sshUrl: project.ssh_url_to_repo,
    localPath: path.join(baseDir, project.path_with_namespace),
    gitUserName,
    gitUserEmail,
  }));
};

const findNodeById = (nodes: GitLabTreeNode[], id: string): GitLabTreeNode | undefined => {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
};

const toggleById = (nodes: GitLabTreeNode[], id: string): void => {
  const node = findNodeById(nodes, id);
  if (!node) {
    return;
  }
  toggleTreeNode(node, !(node.selected ?? false));
  nodes.forEach((root) => recomputeTreeSelection(root));
};

const resolveParallelOptions = async (session?: TuiSession): Promise<ParallelSyncOptions> => {
  if (session) {
    const concurrency = await session.promptList<number | "auto">({
      title: "Paralelismo",
      message: "Nível de paralelismo",
      choices: [
        { label: "Automático", value: "auto", description: "Calcula o paralelismo com base nos recursos da máquina." },
        { label: "1", value: 1, description: "Executa um repositório por vez." },
        { label: "2", value: 2, description: "Executa dois repositórios em paralelo." },
        { label: "4", value: 4, description: "Executa quatro repositórios em paralelo." },
        { label: "8", value: 8, description: "Executa oito repositórios em paralelo." },
      ],
    });
    const shallow = await session.promptConfirm({
      title: "Paralelismo",
      message: "Clonagem shallow (depth=1)",
      defaultValue: false,
    });

    return {
      concurrency: (concurrency ?? "auto") as ParallelSyncOptions["concurrency"],
      shallow: shallow ?? false,
    };
  }

  const { concurrency, shallow } = (await inquirer.prompt([
    {
      name: "concurrency",
      type: "list",
      message: "Nível de paralelismo",
      choices: [
        { name: "Automático", value: "auto" },
        { name: "1", value: 1 },
        { name: "2", value: 2 },
        { name: "4", value: 4 },
        { name: "8", value: 8 },
      ],
    },
    {
      name: "shallow",
      type: "confirm",
      message: "Clonagem shallow (depth=1)",
      default: false,
    },
  ])) as { concurrency: number | "auto"; shallow: boolean };

  return { concurrency, shallow } as ParallelSyncOptions;
};

const resolveParallels = (rawValue?: string): ParallelSyncOptions["concurrency"] => {
  if (!rawValue) {
    return 1;
  }
  const trimmed = rawValue.trim().toLowerCase();
  if (!trimmed || trimmed === "auto") {
    return "auto";
  }
  const parsed = Number(trimmed);
  if (!Number.isNaN(parsed)) {
    if (parsed <= 0) {
      return "auto";
    }
    return parsed;
  }
  return 1;
};

const formatProgressValue = (value?: string): string => {
  if (!value) {
    return "--";
  }
  return value;
};

const renderWorkerLine = (event: ProgressEvent, width: number): string => {
  const percent = event.percent ?? 0;
  const filled = Math.round((percent / 100) * width);
  const empty = Math.max(0, width - filled);
  const bar = `[${"#".repeat(filled)}${"-".repeat(empty)}]`;
  const percentLabel = colorize(`${percent.toString().padStart(3, " ")}%`, "cyan");
  const sizeLabel = colorize(formatProgressValue(event.transferred), "white");
  const speedLabel = colorize(formatProgressValue(event.speed), "magenta");
  const phaseLabel = colorize(event.phase.toUpperCase(), "yellow");
  const objectsLabel = event.objectsTotal
    ? colorize(`${event.objectsReceived ?? 0}/${event.objectsTotal} objetos`, "white")
    : colorize("-- objetos", "white");
  return `${bar} ${percentLabel} ${sizeLabel} ${speedLabel} ${objectsLabel} ${phaseLabel} ${event.target.pathWithNamespace}`;
};

const renderProgressBar = (current: number, total: number): string => {
  const width = 20;
  const ratio = total === 0 ? 1 : current / total;
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);
  return `[${"#".repeat(filled)}${"-".repeat(empty)}]`;
};

const formatTransferDetail = (options: {
  progress?: {
    objectsReceived?: number;
    objectsTotal?: number;
    transferred?: string;
    speed?: string;
  };
  status: "cloned" | "pulled" | "pushed" | "skipped" | "failed";
  message?: string;
}): string => {
  if (options.status === "failed") {
    return options.message ? ` (${options.message})` : " (Erro desconhecido)";
  }
  const parts: string[] = [];
  const received = options.progress?.objectsReceived;
  const total = options.progress?.objectsTotal;
  if (total || received) {
    if (total) {
      parts.push(`${received ?? 0}/${total} objetos copiados`);
    } else {
      parts.push(`${received ?? 0} objetos copiados`);
    }
  }
  if (options.progress?.transferred) {
    parts.push(options.progress.transferred);
  }
  if (options.progress?.speed) {
    parts.push(`a ${options.progress.speed}`);
  }
  if (parts.length === 0) {
    return "";
  }
  return ` ${parts.join(", ")}`;
};

const parseMiB = (value?: string, isSpeed = false): string => {
  if (!value) {
    return "--";
  }
  const trimmed = value.trim();
  const cleaned = isSpeed ? trimmed.replace("/s", "") : trimmed;
  const match = cleaned.match(/^([\d.,]+)\s*(KiB|MiB|GiB)$/i);
  if (!match) {
    return "--";
  }
  const raw = Number(match[1].replace(",", "."));
  if (Number.isNaN(raw)) {
    return "--";
  }
  const unit = match[2].toLowerCase();
  const inMiB = unit === "kib" ? raw / 1024 : unit === "gib" ? raw * 1024 : raw;
  const label = inMiB.toFixed(2);
  return isSpeed ? `${label} MiB/s` : `${label} MiB`;
};

const formatObjects = (progress?: { objectsReceived?: number; objectsTotal?: number }): string => {
  if (!progress) {
    return "--";
  }
  if (progress.objectsTotal) {
    return `${progress.objectsReceived ?? 0}/${progress.objectsTotal}`;
  }
  if (progress.objectsReceived) {
    return String(progress.objectsReceived);
  }
  return "--";
};

const formatRepoLabel = (value: string, width: number): string => {
  if (value.length <= width) {
    return value.padEnd(width, " ");
  }
  return `${value.slice(0, Math.max(0, width - 1))}?`;
};

export const configureGitSyncCommand = (program: Command, session?: TuiSession): void => {
  program
    .command("git-sync")
    .description("Sincronizar repositórios GitLab em paralelo")
    .option("-v, --verbose", "Exibe detalhes das operações executadas", false)
    .option("--base-dir <dir>", "Diretório base para clonagem", "repos")
    .option("--server-name <name>", "Nome do servidor GitLab")
    .option("--base-url <url>", "URL base do GitLab")
    .option("--use-basic-auth", "Usar autenticação básica", false)
    .option("--username <username>", "Usuário do GitLab para autenticação básica")
    .option("--user-email <email>", "Email do Git para configurar nos repositórios clonados")
    .option("--password <password>", "Senha do GitLab para autenticação básica")
    .option("--key-label <label>", "Nome da chave SSH a ser gerada")
    .option("--passphrase <passphrase>", "Passphrase da chave SSH")
    .option("--public-key-path <path>", "Caminho para chave pública existente (.pub)")
    .option("--env-file <path>", "Caminho do arquivo de ambiente (yaml)")
    .option(
      "--prepare-local-dirs [value]",
      "Cria hierarquia de diretórios locais sem clonar repositórios",
      false
    )
    .option("--no-summary [value]", "Oculta o resumo final", false)
    .option("--no-public-repos [value]", "Oculta repositórios públicos", false)
    .option("--no-archived-repos [value]", "Oculta repositórios arquivados", false)
    .option("-f, --filter <pattern>", "Filtro Ant/Glob para path_with_namespace (separe por ;)")
    .option("--sync-repos <pattern>", "Repos/branchs para sincronizar (separe por ;)")
    .option("--parallels <value>", "Número de processos/threads para sincronização (AUTO|0|1..N)")
    .option("--dry-run", "Simula operações sem persistir", false)
    .action(async function (this: Command, options: GitSyncCliOptions) {
      const logger = new PajeLogger();
      logger.info("Iniciando sincronização GitLab");

      let tuiLogState = {
        append: (_message: string, _level?: "info" | "warn" | "error") => {},
        setOrientation: (_message: string) => {},
      };
      let tuiLogReady = false;
      const logBuffer: Array<{ message: string; level?: "info" | "warn" | "error" }> = [];
      const logToTui = (message: string, level: "info" | "warn" | "error" = "info"): void => {
        if (tuiLogReady) {
          tuiLogState.append(message, level);
          return;
        }
        logBuffer.push({ message, level });
      };

      const cliOptions = options;
      const envConfig = loadEnvConfig({ envFile: resolveEnvFileFromCli(cliOptions.envFile) });
      const resolveCliBoolean = (flag: string): boolean | undefined => {
        const dashed = `--${flag}`;
        const args = process.argv;
        for (let index = 0; index < args.length; index += 1) {
          const arg = args[index];
          if (arg === dashed) {
            const next = args[index + 1];
            if (!next || next.startsWith("--")) {
              return true;
            }
            return parseBooleanFlag(next);
          }
          if (arg.startsWith(`${dashed}=`)) {
            const value = arg.slice(dashed.length + 1);
            return parseBooleanFlag(value);
          }
        }
        return undefined;
      };
      const hasCliArg = (flag: string): boolean => {
        const dashed = `--${flag}`;
        return process.argv.some((arg) => arg === dashed || arg.startsWith(`${dashed}=`));
      };
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
      const resolveEnvOrCliNumber = (
        cliValue: number | undefined,
        key: string,
        flag: string
      ): number | undefined => {
        const resolvedCli = hasCliArg(flag) ? cliValue : undefined;
        return resolveEnvNumber(resolvedCli, envConfig, key) ?? cliValue;
      };
      const cliNoSummary = resolveCliBoolean("no-summary");
      const cliPrepareLocalDirs = resolveCliBoolean("prepare-local-dirs");
      const cliNoPublicRepos = resolveCliBoolean("no-public-repos");
      const cliNoArchivedRepos = resolveCliBoolean("no-archived-repos");
      const cliVerbose = resolveCliBoolean("verbose");
      const cliDryRun = resolveCliBoolean("dry-run");
      const mergedOptions: GitSyncCliOptions = {
        ...cliOptions,
        baseDir: resolveHomePath(resolveEnvOrCliString(cliOptions.baseDir, "baseDir", "base-dir")),
        serverName: resolveEnvOrCliString(cliOptions.serverName, "serverName", "server-name"),
        baseUrl: resolveEnvOrCliString(cliOptions.baseUrl, "baseUrl", "base-url"),
        useBasicAuth: resolveEnvOrCliBoolean(cliOptions.useBasicAuth, "useBasicAuth", "use-basic-auth"),
        username: resolveEnvOrCliString(cliOptions.username, "username", "username"),
        userEmail: resolveEnvOrCliString(cliOptions.userEmail, "userEmail", "user-email"),
        password: resolveEnvOrCliString(cliOptions.password, "password", "password"),
        keyLabel: resolveEnvOrCliString(cliOptions.keyLabel, "keyLabel", "key-label"),
        passphrase: resolveEnvOrCliString(cliOptions.passphrase, "passphrase", "passphrase"),
        publicKeyPath: resolveEnvOrCliString(cliOptions.publicKeyPath, "publicKeyPath", "public-key-path"),
        verbose: resolveEnvOrCliBoolean(cliOptions.verbose, "verbose", "verbose", cliVerbose),
        prepareLocalDirs:
          resolveEnvOrCliBoolean(cliOptions.prepareLocalDirs, "prepareLocalDirs", "prepare-local-dirs", cliPrepareLocalDirs) ??
          false,
        noSummary:
          resolveEnvOrCliBoolean(cliOptions.noSummary, "noSummary", "no-summary", cliNoSummary) ??
          false,
        noPublicRepos:
          resolveEnvOrCliBoolean(cliOptions.noPublicRepos, "noPublicRepos", "no-public-repos", cliNoPublicRepos) ??
          false,
        noArchivedRepos:
          resolveEnvOrCliBoolean(cliOptions.noArchivedRepos, "noArchivedRepos", "no-archived-repos", cliNoArchivedRepos) ??
          false,
        filter: resolveEnvOrCliString(cliOptions.filter, "filter", "filter"),
        syncRepos: resolveEnvOrCliString(cliOptions.syncRepos, "syncRepos", "sync-repos"),
        dryRun: resolveEnvOrCliBoolean(cliOptions.dryRun, "dryRun", "dry-run", cliDryRun) ?? false,
        parallels: resolveEnvOrCliString(cliOptions.parallels, "parallels", "parallels"),
      };

      const storedServers = readGitServers<GitServerEntry[]>([]);
      let servers = mergeServerList(storedServers);

      if (mergedOptions.serverName && mergedOptions.baseUrl) {
        const server: GitServerEntry = {
          id: mergedOptions.baseUrl,
          name: mergedOptions.serverName,
          baseUrl: mergedOptions.baseUrl,
          useBasicAuth: mergedOptions.useBasicAuth ?? false,
          username: mergedOptions.username,
        };
        const merge = mergeServer(servers, server);
        writeGitServers(merge.servers);
        servers = mergeServerList(merge.servers);
      }

      if (servers.length === 0) {
        const server = await promptGitServer(session, {
          name: mergedOptions.serverName,
          baseUrl: mergedOptions.baseUrl,
          useBasicAuth: mergedOptions.useBasicAuth,
          username: mergedOptions.username,
        });
        const merge = mergeServer([], server);
        writeGitServers(merge.servers);
        servers = mergeServerList(merge.servers);
      }

      if (mergedOptions.serverName && !mergedOptions.baseUrl) {
        const normalizedName = mergedOptions.serverName.trim().toLowerCase();
        servers = servers.filter((server) => server.name.trim().toLowerCase() == normalizedName);
      }

      if (mergedOptions.baseUrl) {
        const normalizedBaseUrl = normalizeBaseUrl(mergedOptions.baseUrl);
        servers = servers.filter((server) => normalizeBaseUrl(server.baseUrl) === normalizedBaseUrl);
      }

      if (servers.length === 0) {
        const message = "Nenhum servidor GitLab configurado.";
        if (session) {
          await session.showMessage({ title: "GitLab", message });
        } else {
          console.log(message);
        }
        return;
      }

      const listStartAt = Date.now();
      let requestCount = 0;
      let spinnerIndex = 0;
      const spinnerFrames = ["/", "-", "\\", "|"];
      const renderSpinner = (): void => {
        if (!session) {
          return;
        }
        const frame = spinnerFrames[spinnerIndex % spinnerFrames.length];
        spinnerIndex += 1;
        session.showMessage({
          title: "GitLab",
          message: `Acessando servidores e carregando repositórios ${frame} requisições: ${requestCount}`,
        });
      };
      const wrapRequest = async <T,>(server: GitServerEntry, label: string, fn: () => Promise<T>): Promise<T> => {
        requestCount += 1;
        renderSpinner();
        logToTui(`HTTP: ${server.name} - ${label} (requisição ${requestCount})`);
        try {
          const result = await fn();
          logToTui(`HTTP: ${server.name} - ${label} concluído`);
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : "erro desconhecido";
          logToTui(`HTTP: ${server.name} - ${label} falhou: ${message}`, "error");
          throw error;
        }
      };

      const serverResults = await Promise.all(
        servers.map(async (server) => {
          const serverHost = new URL(server.baseUrl).hostname;
          const hasSshAssociation = hasValidSshAssociation(serverHost);
          let basicAuth: { username: string; password: string } | undefined;

          if (server.useBasicAuth && !hasSshAssociation) {
            const username = server.username?.trim();
            const resolvedUsername = username && username.length > 0 ? username : "";
            if (!resolvedUsername) {
              const message = `Usuário não informado para autenticação básica em ${server.name}. Cadastre o servidor novamente informando o usuário.`;
              if (session) {
                await session.showMessage({ title: "GitLab", message });
              } else {
                console.log(message);
              }
              return null;
            }
            const password = await promptBasicAuthPassword(resolvedUsername, session, mergedOptions.password);
            basicAuth = { username: resolvedUsername, password };
          }

          const api = new GitLabApi({
            baseUrl: server.baseUrl,
            basicAuth,
            token: server.token,
            verbose: mergedOptions.verbose ?? false,
            logger: session
              ? (message) => {
                  session.showMessage({ title: "Verbose", message });
                }
              : undefined,
          });

          if (!api.hasAuth()) {
            const message = `Não há autenticação configurada para ${server.name}. Configure um token ou autenticação básica para continuar.`;
            if (session) {
              await session.showMessage({ title: "GitLab", message });
            } else {
              console.log(message);
            }
            return null;
          }

          if (hasSshAssociation || api.hasAuth()) {
            await ensureSshKey(api, session, mergedOptions.verbose ?? false, mergedOptions);
          }

          const [groups, userProjects, publicProjects] = await Promise.all([
            wrapRequest(server, "listar grupos", () => api.listGroups()),
            wrapRequest(server, "listar projetos do usuário", () => api.listUserProjects()),
            mergedOptions.noPublicRepos
              ? Promise.resolve([])
              : wrapRequest(server, "listar projetos públicos", () => api.listPublicProjects()),
          ]);
          const projects = [...userProjects, ...publicProjects].filter((project, index, all) => {
            return all.findIndex((item) => item.id === project.id) === index;
          });

          return { server, groups, projects };
        })
      );

      const validServerResults = serverResults.filter(
        (result): result is { server: GitServerEntry; groups: GitLabGroup[]; projects: GitLabProject[] } =>
          result !== null
      );

      if (validServerResults.length === 0) {
        const message = "Nenhum servidor com autenticação válida encontrado.";
        if (session) {
          await session.showMessage({ title: "GitLab", message });
        } else {
          console.log(message);
        }
        return;
      }

      const { groups, idMapByServer } = mergeGroupsByPath(
        validServerResults.map((result) => ({ server: result.server, groups: result.groups }))
      );
      const { projects } = mergeProjectsByPath(
        validServerResults.map((result) => ({ server: result.server, projects: result.projects })),
        idMapByServer
      );
      const activeServers = validServerResults.map((result) => result.server);
      const header =
        activeServers.length === 1
          ? `${activeServers[0].name} (${activeServers[0].baseUrl})`
          : `GitLab (${activeServers.length} servidores)`;
      const listDurationMs = Date.now() - listStartAt;
      if (!session) {
        const tempoLabel = colorize("TEMPO", "yellow");
        const tempoValor = colorize(`${(listDurationMs / 1000).toFixed(2)}s`, "cyan");
        console.log(`${tempoLabel} ? Listagem de repositórios: ${tempoValor}`);
      }

      const filterPatterns = compileAntPatterns(mergedOptions.filter);
      const filteredProjects = projects.filter((project) => {
        if (mergedOptions.noPublicRepos && project.visibility === "public") {
          return false;
        }
        if (mergedOptions.noArchivedRepos && project.archived) {
          return false;
        }
        if (!matchesAntPatterns(project.path_with_namespace, filterPatterns)) {
          return false;
        }
        return true;
      });

      const summary = createSummary();
      filteredProjects.forEach((project) => {
        summary.total += 1;
        if (project.visibility === "public") {
          summary.publicCount += 1;
        }
        if (project.archived) {
          summary.archivedCount += 1;
        }
      });


      const tree = buildGitLabTree(groups, filteredProjects);
      if (!session) {
        const defaultBaseDir = mergedOptions.baseDir ?? "repos";
        const resolvedUserName = mergedOptions.username?.trim() || undefined;
        const resolvedUserEmail = mergedOptions.userEmail?.trim() || undefined;
        await ensureLocalDirsIfNeeded(filteredProjects, defaultBaseDir, mergedOptions.prepareLocalDirs ?? false);
        const statusEntries = await Promise.all(
          filteredProjects.map(async (project) => {
            const targetPath = path.join(defaultBaseDir, project.path_with_namespace);
            const status = await resolveRepoStatus({
              targetPath,
              defaultBranch: project.default_branch,
              knownRemote: true,
            });
            return [project.id, status] as const;
          })
        );
        const statusMap = Object.fromEntries(statusEntries) as Record<number, RepoSyncStatus>;
        const knownPaths = new Set(
          filteredProjects.map((project) => path.join(defaultBaseDir, project.path_with_namespace))
        );
        const localScan = await buildLocalStatusMap(defaultBaseDir, knownPaths);
        const treeNodes = buildHierarchyTree(filteredProjects, statusMap, localScan.localPaths, localScan.statusMap);
        renderTreeLines(header, treeNodes).forEach((line) => console.log(line));
        Object.values(statusMap).forEach((status) => {
          summary.byStatus[status.state] += 1;
        });
        if (!mergedOptions.noSummary) {
          Object.values(localScan.statusMap).forEach((status) => {
            summary.byStatus[status.state] += 1;
          });
        }
        if (!mergedOptions.noSummary) {
          renderSummaryLines(summary).forEach((line) => console.log(line));
        }

        const syncSpecs = resolveSyncReposSpecs(mergedOptions.syncRepos);
        if (syncSpecs.length > 0) {
          const syncTargets = resolveSyncTargets(filteredProjects, syncSpecs)
            .map((target) => ({
              ...target,
              localPath: path.join(defaultBaseDir, target.pathWithNamespace),
              gitUserName: resolvedUserName,
              gitUserEmail: resolvedUserEmail,
            }))
            .sort((a, b) =>
              `${a.pathWithNamespace}#${a.branch ?? ""}`.localeCompare(
                `${b.pathWithNamespace}#${b.branch ?? ""}`,
                "pt-BR",
                { sensitivity: "base" }
              )
            );
          if (syncTargets.length === 0) {
            console.log("Nenhum repositório corresponde ao sync-repos informado.");
            return;
          }
          const tituloSync = colorize("SINCRONIZAÇÃO", "yellow");
          const totalLabel = colorize(String(syncTargets.length), "cyan");
          const dryRunBadge = mergedOptions.dryRun ? ` ${colorize("DRY-RUN", "magenta")}` : "";
          const concurrency = resolveParallels(mergedOptions.parallels);
          const concurrencyLabel =
            concurrency === "auto" ? colorize("AUTO", "cyan") : colorize(String(concurrency), "cyan");
          console.log(`${tituloSync} ? ${totalLabel} repositórios ? paralelos=${concurrencyLabel}${dryRunBadge}`);
          let completedCount = 0;
          const totalCount = syncTargets.length;
          const workerLines = new Map<number, string>();
          const workerStates = new Map<
            number,
            { line: string; targetPath?: string; percent?: number; objectsReceived?: number }
          >();
          const targetWorkerMap = new Map<string, number>();
          const completedTargets = new Set<string>();
          const lastPrinted = new Map<number, { percent?: number; objectsReceived?: number; line?: string }>();
          const historyLines: string[] = [];
          const targetLastUpdateAt = new Map<string, number>();
          const targetLastLine = new Map<string, string>();
          const startedTargets = new Set<string>();
          const targetProgress = new Map<
            string,
            {
              objectsReceived?: number;
              objectsTotal?: number;
              transferred?: string;
              speed?: string;
            }
          >();
          let overallLine = "";
          const useTty = false;
          const progressLineCount =
            concurrency === "auto" ? Math.min(syncTargets.length, resolveConcurrency()) : Number(concurrency ?? 1);
          const progressWidth = 20;
          if (useTty) {
            for (let index = 1; index <= progressLineCount; index += 1) {
              const placeholder = colorize(`Worker ${index.toString().padStart(2, "0")}`, "white");
              const line = `${placeholder} aguardando...`;
              workerLines.set(index, line);
              workerStates.set(index, { line });
            }
            workerLines.forEach((line) => console.log(line));
            overallLine = "";
            console.log(overallLine);
          }
          let blockLines = workerLines.size + 1;
          const saveCursor = (): void => {
            if (!useTty) {
              return;
            }
            process.stdout.write("\u001b[s");
          };
          const restoreCursor = (): void => {
            if (!useTty) {
              return;
            }
            process.stdout.write("\u001b[u");
          };
          if (useTty) {
            saveCursor();
          }
          const renderBlock = (nextOverallLine?: string): void => {
            if (!useTty) {
              return;
            }
            if (nextOverallLine !== undefined) {
              overallLine = nextOverallLine;
            }
            restoreCursor();
            const moveUp = Math.max(0, blockLines - 1);
            if (moveUp > 0) {
              process.stdout.write(`\u001b[${moveUp}A`);
            }
            historyLines.forEach((content) => {
              process.stdout.write(`\r\u001b[2K${content}\n`);
            });
            workerLines.forEach((content) => {
              process.stdout.write(`\r\u001b[2K${content}\n`);
            });
            process.stdout.write(`\r\u001b[2K${overallLine}\n`);
            blockLines = historyLines.length + workerLines.size + 1;
            saveCursor();
          };
          const writeLine = (line: string): void => {
            if (useTty) {
              console.log(line);
              return;
            }
            console.log(line);
          };
          const appendHistoryLine = (line: string): void => {
            if (!useTty) {
              const last = lastPrinted.get(-1);
              if (last?.line === line) {
                return;
              }
              lastPrinted.set(-1, { line });
              console.log(line);
              return;
            }
            historyLines.push(line);
            renderBlock();
          };
          const shouldPrintProgress = (workerId: number, percent?: number, objectsReceived?: number, line?: string): boolean => {
            const previous = lastPrinted.get(workerId);
            if (previous?.line === line) {
              return false;
            }
            const percentChanged = percent !== undefined && percent !== previous?.percent;
            const objectsChanged = objectsReceived !== undefined && objectsReceived !== previous?.objectsReceived;
            if (!percentChanged && !objectsChanged) {
              return false;
            }
            lastPrinted.set(workerId, { percent, objectsReceived, line });
            return true;
          };
          const renderProgressBar = (current: number, total: number): string => {
            const width = 20;
            const ratio = total === 0 ? 1 : current / total;
            const filled = Math.round(ratio * width);
            const empty = Math.max(0, width - filled);
            return `[${"#".repeat(filled)}${"-".repeat(empty)}]`;
          };
          const buildWorkerPlaceholder = (workerId: number): string => {
            const workerLabel = colorize(`Worker ${workerId.toString().padStart(2, "0")}`, "white");
            return `${workerLabel} aguardando...`;
          };
          const formatTransferDetail = (options: {
            progress?: {
              objectsReceived?: number;
              objectsTotal?: number;
              transferred?: string;
              speed?: string;
            };
            status: "cloned" | "pulled" | "pushed" | "skipped" | "failed";
            message?: string;
          }): string => {
            if (options.status === "failed") {
              return options.message ? ` (${options.message})` : " (Erro desconhecido)";
            }
            const parts: string[] = [];
            const received = options.progress?.objectsReceived;
            const total = options.progress?.objectsTotal;
            if (total || received) {
              if (total) {
                parts.push(`${received ?? 0}/${total} objetos copiados`);
              } else {
                parts.push(`${received ?? 0} objetos copiados`);
              }
            }
            if (options.progress?.transferred) {
              parts.push(options.progress.transferred);
            }
            if (options.progress?.speed) {
              parts.push(`a ${options.progress.speed}`);
            }
            if (parts.length === 0) {
              return "";
            }
            return ` ${parts.join(", ")}`;
          };
          const parseMiB = (value?: string, isSpeed = false): string => {
            if (!value) {
              return "--";
            }
            const trimmed = value.trim();
            const cleaned = isSpeed ? trimmed.replace("/s", "") : trimmed;
            const match = cleaned.match(/^([\d.,]+)\s*(KiB|MiB|GiB)$/i);
            if (!match) {
              return "--";
            }
            const raw = Number(match[1].replace(",", "."));
            if (Number.isNaN(raw)) {
              return "--";
            }
            const unit = match[2].toLowerCase();
            const inMiB =
              unit === "kib" ? raw / 1024 : unit === "gib" ? raw * 1024 : raw;
            const label = inMiB.toFixed(2);
            return isSpeed ? `${label} MiB/s` : `${label} MiB`;
          };
          const formatObjects = (progress?: { objectsReceived?: number; objectsTotal?: number }): string => {
            if (!progress) {
              return "--";
            }
            if (progress.objectsTotal) {
              return `${progress.objectsReceived ?? 0}/${progress.objectsTotal}`;
            }
            if (progress.objectsReceived) {
              return String(progress.objectsReceived);
            }
            return "--";
          };
          const formatRepoLabel = (value: string, width: number): string => {
            if (value.length <= width) {
              return value.padEnd(width, " ");
            }
            return `${value.slice(0, Math.max(0, width - 1))}?`;
          };
          const syncStartAt = Date.now();
          const syncResults = await parallelSync(
            syncTargets,
            {
              concurrency,
              shallow: false,
              dryRun: mergedOptions.dryRun ?? false,
            },
            (result) => {
              completedCount += 1;
              const branchLabel = result.target.branch ? `#${result.target.branch}` : "";
              const actionLabelRaw = result.status === "skipped" ? "SEM AÇÃO" : result.status.toUpperCase();
              const actionColor =
                result.status === "cloned"
                  ? "green"
                  : result.status === "pulled"
                  ? "cyan"
                  : result.status === "pushed"
                  ? "blue"
                  : result.status === "failed"
                  ? "red"
                  : "yellow";
              const actionLabel = colorize(actionLabelRaw, actionColor);
              const prefix = mergedOptions.dryRun ? `${colorize("DRY-RUN", "magenta")} ` : "";
              const bar = renderProgressBar(completedCount, totalCount);
              const counter = colorize(`${completedCount}/${totalCount}`, "white");
              const targetKey = `${result.target.pathWithNamespace}${branchLabel}`;
              const progressSnapshot = targetProgress.get(targetKey);
              if (progressSnapshot?.objectsTotal && (progressSnapshot.objectsReceived ?? 0) < progressSnapshot.objectsTotal) {
                progressSnapshot.objectsReceived = progressSnapshot.objectsTotal;
                targetProgress.set(targetKey, progressSnapshot);
              }
              const detail = formatTransferDetail({
                progress: targetProgress.get(targetKey),
                status: result.status,
                message: result.message,
              });
              const workerId = targetWorkerMap.get(targetKey);
              if (workerId) {
                if (useTty) {
                  const workerLabel = colorize(`Worker ${workerId.toString().padStart(2, "0")}`, "white");
                  const doneLabel = colorize("100%", "cyan");
                  const doneLine = `${workerLabel} [${"#".repeat(progressWidth)}] ${doneLabel} -- -- ${actionLabel} ${result.target.pathWithNamespace}${detail}`;
                  if (!completedTargets.has(targetKey)) {
                    completedTargets.add(targetKey);
                    appendHistoryLine(doneLine);
                  }
                  const placeholder = buildWorkerPlaceholder(workerId);
                  workerLines.set(workerId, placeholder);
                  workerStates.set(workerId, { line: placeholder });
                }
              }
              if (useTty) {
                renderBlock(
                  `${bar} ${counter} ${prefix}${result.target.pathWithNamespace}${branchLabel} ${actionLabel}${detail}`
                );
              } else {
                console.log(`${bar} ${counter} ${prefix}${result.target.pathWithNamespace}${branchLabel} ${actionLabel}${detail}`);
              }
            },
            (event) => {
              if (!workerLines.has(event.workerId)) {
                if (!useTty) {
                  const placeholder = colorize(`Worker ${event.workerId.toString().padStart(2, "0")}`, "white");
                  workerLines.set(event.workerId, `${placeholder} aguardando...`);
                  workerStates.set(event.workerId, { line: `${placeholder} aguardando...` });
                } else {
                  return;
                }
              }
              const workerLabel = colorize(`Worker ${event.workerId.toString().padStart(2, "0")}`, "white");
              const branchLabel = event.target.branch ? `#${event.target.branch}` : "";
              const targetKey = `${event.target.pathWithNamespace}${branchLabel}`;
              targetWorkerMap.set(targetKey, event.workerId);
              const previousProgress = targetProgress.get(targetKey);
              const nextObjectsReceived = Math.max(
                previousProgress?.objectsReceived ?? 0,
                event.objectsReceived ?? 0
              );
              const nextObjectsTotal = Math.max(
                previousProgress?.objectsTotal ?? 0,
                event.objectsTotal ?? 0
              );
              targetProgress.set(targetKey, {
                objectsReceived: nextObjectsReceived || undefined,
                objectsTotal: nextObjectsTotal || undefined,
                transferred: event.transferred ?? previousProgress?.transferred,
                speed: event.speed ?? previousProgress?.speed,
              });
              if (!useTty) {
                const now = Date.now();
                if (!startedTargets.has(targetKey)) {
                  startedTargets.add(targetKey);
                  const startPhase = event.phase === "check" ? "ANÁLISE" : event.phase.toUpperCase();
                  const startLine = `${colorize("INÍCIO", "yellow")} ${startPhase} ${event.target.pathWithNamespace}${branchLabel}`;
                  console.log(startLine);
                  targetLastUpdateAt.set(targetKey, now);
                  targetLastLine.set(targetKey, startLine);
                }
                if (event.percent !== undefined && event.percent >= 100) {
                  return;
                }
                const lastAt = targetLastUpdateAt.get(targetKey) ?? 0;
                if (now - lastAt < 2000) {
                  return;
                }
                const line = renderWorkerLine(event, progressWidth);
                if (targetLastLine.get(targetKey) === line) {
                  return;
                }
                targetLastLine.set(targetKey, line);
                targetLastUpdateAt.set(targetKey, now);
                console.log(line);
                return;
              }
              const line = `${workerLabel} ${renderWorkerLine(event, progressWidth)}`;
              const currentState = workerStates.get(event.workerId);
              if (currentState?.line === line) {
                return;
              }
              if (completedTargets.has(targetKey)) {
                return;
              }
              if (event.percent === 100) {
                return;
              }
              const percent = event.percent ?? currentState?.percent ?? 0;
              const objectsReceived = event.objectsReceived ?? currentState?.objectsReceived ?? 0;
              if (currentState?.targetPath === event.target.pathWithNamespace) {
                const samePercent = percent === currentState.percent;
                const sameObjects = objectsReceived === currentState.objectsReceived;
                if (samePercent && sameObjects) {
                  return;
                }
              }
              workerStates.set(event.workerId, {
                line,
                targetPath: event.target.pathWithNamespace,
                percent,
                objectsReceived,
              });
              workerLines.set(event.workerId, line);
              renderBlock();
            }
          );
          if (useTty) {
            workerLines.forEach((line, workerId) => {
              const placeholder = buildWorkerPlaceholder(workerId);
              if (line === placeholder) {
                return;
              }
              workerLines.set(workerId, placeholder);
            });
            overallLine = "";
            renderBlock("");
          }
          const syncDurationMs = Date.now() - syncStartAt;
          const counts = syncResults.reduce(
            (acc, result) => {
              acc.total += 1;
              if (result.status === "cloned") {
                acc.cloned += 1;
              } else if (result.status === "pulled") {
                acc.pulled += 1;
              } else if (result.status === "pushed") {
                acc.pushed += 1;
              } else if (result.status === "skipped") {
                acc.skipped += 1;
              } else if (result.status === "failed") {
                acc.failed += 1;
              }
              return acc;
            },
            { total: 0, cloned: 0, pulled: 0, pushed: 0, skipped: 0, failed: 0 }
          );
          const tempoSync = colorize(`${(syncDurationMs / 1000).toFixed(2)}s`, "cyan");
          writeLine(`${colorize("Tempo de Sincronização:", "yellow")} ${tempoSync}`);
          const resumoTitulo = colorize("RESUMO SINCRONIZAÇÃO", "yellow");
          writeLine(`${resumoTitulo}`);
          writeLine(
            `  ${colorize("TOTAL", "white")} ${colorize(String(counts.total), "cyan")}  ` +
              `${colorize("CLONE", "green")} ${colorize(String(counts.cloned), "green")}  ` +
              `${colorize("PULL", "cyan")} ${colorize(String(counts.pulled), "cyan")}  ` +
              `${colorize("PUSH", "blue")} ${colorize(String(counts.pushed), "blue")}  ` +
              `${colorize("SEM AÇÃO", "yellow")} ${colorize(String(counts.skipped), "yellow")}  ` +
              `${colorize("FALHAS", "red")} ${colorize(String(counts.failed), "red")}`
          );
          writeLine("");
          const orderedResults = [...syncResults].sort((a, b) =>
            `${a.target.pathWithNamespace}#${a.target.branch ?? ""}`.localeCompare(
              `${b.target.pathWithNamespace}#${b.target.branch ?? ""}`,
              "pt-BR",
              { sensitivity: "base" }
            )
          );
          writeLine(`${colorize("RESUMO ORDENADO", "yellow")}`);
          const repoWidth = Math.min(
            64,
            Math.max(12, ...orderedResults.map((result) => result.target.pathWithNamespace.length))
          );
          writeLine(
            `  ${colorize("#", "white")}  ` +
              `${colorize("Repositório".padEnd(repoWidth, " "), "white")}  ` +
              `${colorize("STATUS".padEnd(8, " "), "white")}  ` +
              `${colorize("Qtd Objetos".padEnd(14, " "), "white")}  ` +
              `${colorize("Volume (MiB)".padEnd(13, " "), "white")}  ` +
              `${colorize("Velocidade (MiB/s)", "white")}`
          );
          orderedResults.forEach((result, index) => {
            const branchLabel = result.target.branch ? `#${result.target.branch}` : "";
            const actionLabelRaw = result.status === "skipped" ? "SEM AÇÃO" : result.status.toUpperCase();
            const progress = targetProgress.get(`${result.target.pathWithNamespace}${branchLabel}`);
            const objectsLabel = formatObjects(progress).padEnd(14, " ");
            const volumeLabel = parseMiB(progress?.transferred).padEnd(13, " ");
            const speedLabel = parseMiB(progress?.speed, true);
            const prefix = mergedOptions.dryRun ? `${colorize("DRY-RUN", "magenta")} ` : "";
            const repoLabel = formatRepoLabel(`${result.target.pathWithNamespace}${branchLabel}`, repoWidth);
            const rowNumber = String(index + 1).padStart(2, " ");
            writeLine(
              `${prefix}${rowNumber}  ${repoLabel}  ${actionLabelRaw.padEnd(8, " ")}  ${objectsLabel}  ${volumeLabel}  ${speedLabel}`
            );
            if (result.status === "failed") {
              const errorMessage = result.message ?? "Erro desconhecido";
              writeLine(`   ${colorize("erro:", "red")} ${errorMessage}`);
            }
          });
          if (process.stdout.isTTY) {
            process.stdout.write("\r\u001b[2K");
          }
          if (process.stderr.isTTY) {
            process.stderr.write("\r\u001b[2K");
          }
        }
        return;
      }

      const defaultBaseDir = mergedOptions.baseDir ?? "repos";
      await ensureLocalDirsIfNeeded(filteredProjects, defaultBaseDir, mergedOptions.prepareLocalDirs ?? false);
      const statusEntries = await Promise.all(
        filteredProjects.map(async (project) => {
          const targetPath = path.join(defaultBaseDir, project.path_with_namespace);
          const status = await resolveRepoStatus({
            targetPath,
            defaultBranch: project.default_branch,
            knownRemote: true,
          });
          return [project.id, status] as const;
        })
      );
      const statusMap = Object.fromEntries(statusEntries) as Record<number, RepoSyncStatus>;
      const applyStatusToTree = (node: GitLabTreeNode): void => {
        if (node.type === "project" && node.project) {
          node.status = statusMap[node.project.id];
          return;
        }
        node.children?.forEach((child) => applyStatusToTree(child));
      };
      tree.forEach((node) => applyStatusToTree(node));

      let treeProgress: TuiTreeProgress | null = null;
      const tuiResult = await renderRepositoryTree(tree, (id) => toggleById(tree, id), session, {
        header,
        footer:
          "Use ↑/↓ e PgUp/PgDn para navegar | Espaço para selecionar | Enter para sincronizar | Esc para cancelar | F12 para ampliar log",
        onReady: (handlers) => {
          treeProgress = handlers.progress;
          tuiLogState.append = handlers.log.append;
          tuiLogState.setOrientation = handlers.log.setOrientation;
          tuiLogReady = true;
          handlers.log.append("Tela de sincronização pronta.");
          logBuffer.forEach((entry) => handlers.log.append(entry.message, entry.level));
          logBuffer.length = 0;
          handlers.render();
        },
      });
      if (!tuiResult.confirmed) {
        logger.warn("Sincronização cancelada pelo usuário");
        return;
      }

      const selected = collectSelectedProjects(tree);
      if (selected.length === 0) {
        logger.warn("Nenhum repositório selecionado");
        return;
      }

      const parallelOptions = await resolveParallelOptions(session);
      const resolvedUserName = mergedOptions.username?.trim() || undefined;
      const resolvedUserEmail = mergedOptions.userEmail?.trim() || undefined;
      const targets = prepareTargets(
        selected,
        mergedOptions.baseDir ?? "repos",
        resolvedUserName,
        resolvedUserEmail
      );

      logger.info(`Sincronizando ${targets.length} repositórios`);
      logToTui(`Sincronizando ${targets.length} repositórios`);
      tuiLogState.setOrientation(
        "Sincronização em andamento | Aguarde a conclusão | F12 para ampliar log | Esc para cancelar"
      );
      const targetProgress = new Map<
        string,
        { objectsReceived?: number; objectsTotal?: number; transferred?: string; speed?: string }
      >();
      const syncStartAt = Date.now();
      const syncResults = await parallelSync(
        targets,
        { ...parallelOptions, logger: (message, level) => logToTui(message, level) },
        (result) => {
          const branchLabel = result.target.branch ? `#${result.target.branch}` : "";
          const targetKey = `${result.target.pathWithNamespace}${branchLabel}`;
          const progressSnapshot = targetProgress.get(targetKey);
          if (progressSnapshot?.objectsTotal && (progressSnapshot.objectsReceived ?? 0) < progressSnapshot.objectsTotal) {
            progressSnapshot.objectsReceived = progressSnapshot.objectsTotal;
            targetProgress.set(targetKey, progressSnapshot);
          }
          if (treeProgress) {
            const actionLabel = result.status === "skipped" ? "SEM AÇÃO" : result.status.toUpperCase();
            const detail = formatTransferDetail({
              progress: targetProgress.get(targetKey),
              status: result.status,
              message: result.message,
            });
            const line = `${renderProgressBar(1, 1)} 100% ${actionLabel}${detail}`;
            const nodeId = `project-${result.target.id}`;
            treeProgress.updateProgress(nodeId, line);
          }
          if (result.status === "failed") {
            logger.error(`${result.target.pathWithNamespace} falhou: ${result.message}`);
            logToTui(`${result.target.pathWithNamespace} falhou: ${result.message}`, "error");
          } else {
            logger.info(`${result.target.pathWithNamespace} ${result.status}`);
            logToTui(`${result.target.pathWithNamespace} ${result.status}`);
          }
        },
        (event) => {
          const branchLabel = event.target.branch ? `#${event.target.branch}` : "";
          const targetKey = `${event.target.pathWithNamespace}${branchLabel}`;
          const previousProgress = targetProgress.get(targetKey);
          const nextObjectsReceived = Math.max(previousProgress?.objectsReceived ?? 0, event.objectsReceived ?? 0);
          const nextObjectsTotal = Math.max(previousProgress?.objectsTotal ?? 0, event.objectsTotal ?? 0);
          targetProgress.set(targetKey, {
            objectsReceived: nextObjectsReceived || undefined,
            objectsTotal: nextObjectsTotal || undefined,
            transferred: event.transferred ?? previousProgress?.transferred,
            speed: event.speed ?? previousProgress?.speed,
          });
          if (!treeProgress) {
            return;
          }
          const line = renderWorkerLine(event, 20);
          const nodeId = `project-${event.target.id}`;
          treeProgress.updateProgress(nodeId, line);
          if (event.raw) {
            logToTui(`Git: ${event.raw}`);
          }
        }
      );
      const syncDurationMs = Date.now() - syncStartAt;
      const counts = syncResults.reduce(
        (acc, result) => {
          acc.total += 1;
          if (result.status === "cloned") {
            acc.cloned += 1;
          } else if (result.status === "pulled") {
            acc.pulled += 1;
          } else if (result.status === "pushed") {
            acc.pushed += 1;
          } else if (result.status === "skipped") {
            acc.skipped += 1;
          } else if (result.status === "failed") {
            acc.failed += 1;
          }
          return acc;
        },
        { total: 0, cloned: 0, pulled: 0, pushed: 0, skipped: 0, failed: 0 }
      );
      if (session) {
        const tempoSync = `${(syncDurationMs / 1000).toFixed(2)}s`;
        const orderedResults = [...syncResults].sort((a, b) =>
          `${a.target.pathWithNamespace}#${a.target.branch ?? ""}`.localeCompare(
            `${b.target.pathWithNamespace}#${b.target.branch ?? ""}`,
            "pt-BR",
            { sensitivity: "base" }
          )
        );
        const repoWidth = Math.min(
          64,
          Math.max(12, ...orderedResults.map((result) => result.target.pathWithNamespace.length))
        );
        const summaryLines: string[] = [];
        summaryLines.push(`Tempo: ${tempoSync}`);
        summaryLines.push(
          `TOTAL ${counts.total} | CLONE ${counts.cloned} | PULL ${counts.pulled} | PUSH ${counts.pushed} | ` +
            `SEM AÇÃO ${counts.skipped} | FALHAS ${counts.failed}`
        );
        summaryLines.push("");
        logToTui(
          `Resumo: TOTAL ${counts.total} | CLONE ${counts.cloned} | PULL ${counts.pulled} | PUSH ${counts.pushed}`
        );
        logToTui(`Resumo: SEM AÇÃO ${counts.skipped} | FALHAS ${counts.failed}`);
        summaryLines.push(
          `#  ${"Repositório".padEnd(repoWidth, " ")}  STATUS    Qtd Objetos    Volume (MiB)   Velocidade (MiB/s)`
        );
        orderedResults.forEach((result, index) => {
          const branchLabel = result.target.branch ? `#${result.target.branch}` : "";
          const progress = targetProgress.get(`${result.target.pathWithNamespace}${branchLabel}`);
          const objectsLabel = formatObjects(progress).padEnd(14, " ");
          const volumeLabel = parseMiB(progress?.transferred).padEnd(13, " ");
          const speedLabel = parseMiB(progress?.speed, true);
          const repoLabel = formatRepoLabel(`${result.target.pathWithNamespace}${branchLabel}`, repoWidth);
          const rowNumber = String(index + 1).padStart(2, " ");
          const actionLabelRaw = result.status === "skipped" ? "SEM AÇÃO" : result.status.toUpperCase();
          summaryLines.push(
            `${rowNumber}  ${repoLabel}  ${actionLabelRaw.padEnd(8, " ")}  ${objectsLabel}  ${volumeLabel}  ${speedLabel}`
          );
          if (result.status === "failed") {
            summaryLines.push(`   erro: ${result.message ?? "Erro desconhecido"}`);
          }
        });
        await session.showMessage({
          title: "Resumo da sincronização",
          message: summaryLines.join("\n"),
        });
      }
      return;
    });
};

export const configureSshKeyStoreCommand = (program: Command, session?: TuiSession): void => {
  program
    .command("git-server-store")
    .description("Gerar e armazenar chave SSH e token no GitLab sem sincronizar repositórios")
    .option("-v, --verbose", "Exibe detalhes das operações executadas", false)
    .option("--server-name <name>", "Nome do servidor GitLab")
    .option("--base-url <url>", "URL base do GitLab")
    .option("--username <username>", "Usuário do GitLab")
    .option("--key-label <label>", "Nome da chave SSH a ser gerada", "paje")
    .option("--passphrase <passphrase>", "Passphrase da chave SSH")
    .option("--public-key-path <path>", "Caminho para chave pública existente (.pub)")
    .option("--key-overwrite", "Sobrescrever chave existente, salvando .bak", false)
    .option("--retry-delay-ms <ms>", "Intervalo de retry em ms", (value) => Number(value))
    .option("--max-attempts <count>", "Número máximo de tentativas", (value) => Number(value))
    .option("--env-file <path>", "Caminho do arquivo de credenciais (env.test)")
    .option("--token-name <name>", "Nome do token pessoal no GitLab")
    .option("--token-scopes <scopes>", "Escopos do token (ex: api,read_repository)")
    .option("--token-expires-at <date>", "Data de expiração do token (YYYY-MM-DD)")
    .action(async (options: SshKeyStoreCliOptions) => {
      const envConfig = loadEnvConfig({ envFile: resolveEnvFileFromCli(options.envFile) });
      const hasCliArg = (flag: string): boolean => {
        const dashed = `--${flag}`;
        return process.argv.some((arg) => arg === dashed || arg.startsWith(`${dashed}=`));
      };
      const resolveEnvOrCliString = (
        cliValue: string | undefined,
        key: string,
        flag: string,
        fallback?: string
      ): string | undefined => {
        const resolvedCli = hasCliArg(flag) ? cliValue : undefined;
        return resolveEnvString(resolvedCli, envConfig, key) ?? cliValue ?? fallback;
      };

      const baseUrl = resolveEnvOrCliString(
        options.baseUrl?.trim(),
        "baseUrl",
        "base-url",
        "https://git.tse.jus.br"
      ) as string;
      const serverName = resolveEnvOrCliString(options.serverName, "serverName", "server-name", "GitLab") as string;
      const username = resolveEnvOrCliString(options.username, "username", "username");
      const server: GitServerEntry = {
        id: baseUrl,
        name: serverName,
        baseUrl,
        useBasicAuth: true,
        username,
      };

      await storeSshKeyOnly(server, session, options);
    });

  program
    .command("ssh-key-store")
    .description("(Obsoleto) Use git-server-store")
    .action(async () => {
      const message = "Comando renomeado: use git-server-store.";
      if (session) {
        await session.showMessage({ title: "GitLab", message });
        return;
      }
      console.log(message);
    });
};
