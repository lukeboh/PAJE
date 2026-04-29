import inquirer from "inquirer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { GitLabApi } from "./gitlabApi.js";
import { buildGitLabTree, collectSelectedProjects, recomputeTreeSelection, toggleTreeNode } from "./treeBuilder.js";
import { renderRepositoryTree } from "./tui.js";
import {
  getAheadBehind,
  getStatusPorcelain,
  hasGitDir,
  listLocalDirectories,
  readLocalRepoInfo,
} from "./gitRepoScanner.js";
import { TuiSession } from "./tuiSession.js";
import { GitLabProject, GitLabTreeNode, GitRepositoryTarget, ParallelSyncOptions } from "./types.js";
import { parallelSync, runGit } from "./parallelSync.js";
import { PajeLogger } from "./logger.js";
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

type GitSyncCliOptions = {
  baseDir?: string;
  verbose?: boolean;
  serverName?: string;
  baseUrl?: string;
  useBasicAuth?: boolean;
  username?: string;
  password?: string;
  keyLabel?: string;
  passphrase?: string;
  publicKeyPath?: string;
  gitShowPulicRepos?: boolean;
  gitShowPublicRepos?: boolean;
  envFile?: string;
  prepareLocalDirs?: boolean;
};

const parseBooleanFlag = (value?: string | boolean): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === undefined) {
    return undefined;
  }
  return value.trim().toLowerCase() === "true";
};

export type RepoSyncState = "SYNCED" | "BEHIND" | "AHEAD" | "REMOTE" | "EMPTY" | "LOCAL" | "UNCOMMITTED";

export type RepoSyncStatus = {
  branch: string;
  state: RepoSyncState;
  delta?: string;
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
    items.forEach((node) => {
      const suffix = node.status ? ` ${formatRepoStatus(node.status)}` : "";
      lines.push(`${prefix}+ ${node.label}${suffix}`);
      if (node.children && node.children.length > 0) {
        walk(node.children, `${prefix}| `);
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

  let resolvedUsername = resolveEnvString(cli?.username?.trim(), envConfig, "username");
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

  const resolvedPublicKeyPath = resolveEnvString(cli?.publicKeyPath, envConfig, "publicKeyPath");
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
      keyLabel: resolveEnvString(cli?.keyLabel, envConfig, "keyLabel"),
      passphrase: resolveEnvString(cli?.passphrase, envConfig, "passphrase"),
      overwrite: resolveEnvBoolean(cli?.keyOverwrite, envConfig, "keyOverwrite") ?? false,
      logger,
    });
  }

  upsertSshConfigHost(serverHost, keyInfo.privateKeyPath);
  await ensureKnownHost(serverHost, session, resolveEnvBoolean(cli?.verbose, envConfig, "verbose"));
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
    title: resolveEnvString(cli?.keyLabel, envConfig, "keyLabel") ?? "paje",
    usageType: "auth_and_signing",
    credentials: {
      ...credentials,
      username: resolvedUsername ?? credentials.username,
      password: resolvedPassword ?? credentials.password,
    },
    keyInfo,
    fetchImpl: globalThis.fetch,
    logger,
    maxAttempts: resolveEnvNumber(cli?.maxAttempts, envConfig, "maxAttempts"),
    retryDelayMs: resolveEnvNumber(cli?.retryDelayMs, envConfig, "retryDelayMs"),
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

  const resolvedTokenName = resolveEnvString(cli?.tokenName?.trim(), envConfig, "tokenName");
  const resolvedTokenScopes = resolveEnvStringArray(cli?.tokenScopes, envConfig, "tokenScopes");
  const resolvedTokenExpiresAt = resolveEnvString(cli?.tokenExpiresAt, envConfig, "tokenExpiresAt");
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
      password: resolvedPassword ?? credentials.password,
    },
    fetchImpl: globalThis.fetch,
    logger,
    maxAttempts: resolveEnvNumber(cli?.maxAttempts, envConfig, "maxAttempts"),
    retryDelayMs: resolveEnvNumber(cli?.retryDelayMs, envConfig, "retryDelayMs"),
  });

  const serverWithToken: GitServerEntry = {
    ...server,
    token: tokenResult.token,
  };
  const mergedServers = mergeServer(existingServers, serverWithToken);
  writeGitServers(mergedServers.servers);
};

const prepareTargets = (projects: GitLabProject[], baseDir: string): GitRepositoryTarget[] => {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    pathWithNamespace: project.path_with_namespace,
    sshUrl: project.ssh_url_to_repo,
    localPath: path.join(baseDir, project.path_with_namespace),
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
    .option(
      "--git-show-pulic-repos",
      "Permitir listagem de repositórios sem autenticação (apenas públicos)",
      false
    )
    .option(
      "--git-show-public-repos",
      "Permitir listagem de repositórios sem autenticação (apenas públicos)",
      false
    )
    .action(async (options: GitSyncCliOptions) => {
      const logger = new PajeLogger();
      logger.info("Iniciando sincronização GitLab");

      const envConfig = loadEnvConfig({ envFile: resolveEnvFileFromCli(options.envFile) });
      const mergedOptions: GitSyncCliOptions = {
        ...options,
        baseDir: resolveEnvString(options.baseDir, envConfig, "baseDir") ?? options.baseDir,
        serverName: resolveEnvString(options.serverName, envConfig, "serverName") ?? options.serverName,
        baseUrl: resolveEnvString(options.baseUrl, envConfig, "baseUrl") ?? options.baseUrl,
        useBasicAuth: resolveEnvBoolean(options.useBasicAuth, envConfig, "useBasicAuth") ?? options.useBasicAuth,
        username: resolveEnvString(options.username, envConfig, "username") ?? options.username,
        password: resolveEnvString(options.password, envConfig, "password") ?? options.password,
        keyLabel: resolveEnvString(options.keyLabel, envConfig, "keyLabel") ?? options.keyLabel,
        passphrase: resolveEnvString(options.passphrase, envConfig, "passphrase") ?? options.passphrase,
        publicKeyPath: resolveEnvString(options.publicKeyPath, envConfig, "publicKeyPath") ?? options.publicKeyPath,
        gitShowPulicRepos:
          resolveEnvBoolean(options.gitShowPulicRepos, envConfig, "gitShowPulicRepos") ?? options.gitShowPulicRepos,
        gitShowPublicRepos:
          resolveEnvBoolean(options.gitShowPublicRepos, envConfig, "gitShowPublicRepos") ?? options.gitShowPublicRepos,
        verbose: resolveEnvBoolean(options.verbose, envConfig, "verbose") ?? options.verbose,
        prepareLocalDirs:
          resolveEnvBoolean(options.prepareLocalDirs, envConfig, "prepareLocalDirs") ??
          parseBooleanFlag(options.prepareLocalDirs) ??
          false,
      };

      const server = await selectGitServer(session, mergedOptions);
      let basicAuth: { username: string; password: string } | undefined;
      const serverHost = new URL(server.baseUrl).hostname;
      const hasSshAssociation = hasValidSshAssociation(serverHost);
      if (server.useBasicAuth && !hasSshAssociation) {
        const username = server.username?.trim();
        const resolvedUsername = username && username.length > 0 ? username : "";
        if (!resolvedUsername) {
          const message = "Usuário não informado para autenticação básica. Cadastre o servidor novamente informando o usuário.";
          if (session) {
            await session.showMessage({ title: "GitLab", message });
          } else {
            console.log(message);
          }
        } else {
          const password = await promptBasicAuthPassword(resolvedUsername, session, mergedOptions.password);
          basicAuth = { username: resolvedUsername, password };
        }
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
      const allowPublic = mergedOptions.gitShowPulicRepos || mergedOptions.gitShowPublicRepos;
      if (!api.hasAuth() && !allowPublic) {
        const message =
          "Não há autenticação configurada. Para consultar repositórios sem autenticação, use --git-show-public-repos.";
        if (session) {
          await session.showMessage({ title: "GitLab", message });
        } else {
          console.log(message);
        }
        return;
      }

      if (hasSshAssociation || api.hasAuth()) {
        await ensureSshKey(api, session, mergedOptions.verbose ?? false, mergedOptions);
      }

      const [groups, projects] = allowPublic && !api.hasAuth() && !hasSshAssociation
        ? await Promise.all([api.listPublicGroups(), api.listPublicProjects()])
        : await Promise.all([api.listGroups(), api.listUserProjects()]);

      const tree = buildGitLabTree(groups, projects);
      if (!session) {
        const defaultBaseDir = mergedOptions.baseDir ?? "repos";
        await ensureLocalDirsIfNeeded(projects, defaultBaseDir, mergedOptions.prepareLocalDirs ?? false);
        const statusEntries = await Promise.all(
          projects.map(async (project) => {
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
          projects.map((project) => path.join(defaultBaseDir, project.path_with_namespace))
        );
        const localScan = await buildLocalStatusMap(defaultBaseDir, knownPaths);
        const treeNodes = buildHierarchyTree(projects, statusMap, localScan.localPaths, localScan.statusMap);
        const header = `${server.name} (${server.baseUrl})`;
        renderTreeLines(header, treeNodes).forEach((line) => console.log(line));
        return;
      }

      const tuiResult = await renderRepositoryTree(tree, (id) => toggleById(tree, id), session);
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
      const targets = prepareTargets(selected, mergedOptions.baseDir ?? "repos");

      logger.info(`Sincronizando ${targets.length} repositórios`);
      await parallelSync(targets, parallelOptions, (result) => {
        if (result.status === "failed") {
          logger.error(`${result.target.pathWithNamespace} falhou: ${result.message}`);
        } else {
          logger.info(`${result.target.pathWithNamespace} ${result.status}`);
        }
      });
      if (session) {
        await session.showMessage({
          title: "Sincronização concluída",
          message: "Processo finalizado. Confira os logs em ~/.paje/logs",
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
      const baseUrl = options.baseUrl?.trim() ?? "https://git.tse.jus.br";
      const server: GitServerEntry = {
        id: baseUrl,
        name: options.serverName ?? "GitLab",
        baseUrl,
        useBasicAuth: true,
        username: options.username,
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
