import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { configureGitSyncCommand } from "../src/modules/git/gitCommand.js";
import { writeGitServers } from "../src/modules/git/persistence.js";

const originalFetch = globalThis.fetch;

const projects = [
  {
    id: 1,
    name: "Public Repo",
    path_with_namespace: "grupo/public-repo",
    ssh_url_to_repo: "git@git.tse.jus.br:grupo/public-repo.git",
    http_url_to_repo: "https://git.tse.jus.br/grupo/public-repo.git",
    visibility: "public",
    archived: false,
    default_branch: "main",
  },
  {
    id: 2,
    name: "Archived Repo",
    path_with_namespace: "grupo/archived-repo",
    ssh_url_to_repo: "git@git.tse.jus.br:grupo/archived-repo.git",
    http_url_to_repo: "https://git.tse.jus.br/grupo/archived-repo.git",
    visibility: "private",
    archived: true,
    default_branch: "main",
  },
  {
    id: 3,
    name: "Private Repo",
    path_with_namespace: "grupo/private-repo",
    ssh_url_to_repo: "git@git.tse.jus.br:grupo/private-repo.git",
    http_url_to_repo: "https://git.tse.jus.br/grupo/private-repo.git",
    visibility: "private",
    archived: false,
    default_branch: "main",
  },
];

const groups = [
  { id: 10, name: "Grupo", full_path: "grupo", parent_id: null },
];

globalThis.fetch = (async (url: string): Promise<Response> => {
  if (url.includes("/api/v4/groups")) {
    return new Response(JSON.stringify(groups), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("/api/v4/projects")) {
    return new Response(JSON.stringify(projects), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const runSummaryTests = async (): Promise<void> => {

let output = "";
const originalLog = console.log;
console.log = (message?: unknown) => {
  output += `${String(message ?? "")}\n`;
  originalLog(message);
};

const originalHome = process.env.HOME;
const originalArgv = process.argv;
process.env.HOME = "/tmp/paje-tests";
const homeDir = process.env.HOME;
const sshDir = path.join(homeDir, ".ssh");
fs.mkdirSync(sshDir, { recursive: true });
const keyPath = path.join(sshDir, "paje");
fs.writeFileSync(keyPath, "dummy-private-key", "utf-8");
const sshConfigPath = path.join(sshDir, "config");
fs.writeFileSync(
  sshConfigPath,
  "Host git.tse.jus.br\n  HostName git.tse.jus.br\n  User git\n  IdentityFile ~/.ssh/paje\n  IdentitiesOnly yes\n",
  "utf-8"
);
const knownHostsPath = path.join(sshDir, "known_hosts");
fs.writeFileSync(knownHostsPath, "git.tse.jus.br ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD\n", "utf-8");
const envPath = path.join(homeDir, "env-test.yaml");
fs.writeFileSync(envPath, "", "utf-8");

const program = new Command();
configureGitSyncCommand(program);
const runCli = async (args: string[]): Promise<void> => {
  process.argv = ["node", "cli.ts", ...args];
  await program.parseAsync(["node", "cli.ts", ...args]);
};
writeGitServers([
  {
    id: "https://git.tse.jus.br",
    name: "TSE-GIT",
    baseUrl: "https://git.tse.jus.br",
    token: "glpat-test-token",
  },
]);
await runCli([
  "git-sync",
  "--server-name",
  "TSE-GIT",
  "--base-url",
  "https://git.tse.jus.br",
  "--base-dir",
  "repos",
  "--env-file",
  envPath,
  "--no-summary=true",
]);

assert.ok(!output.includes("Resumo"), "Não deve exibir resumo quando --no-summary=true");

output = "";
await runCli([
  "git-sync",
  "--server-name",
  "TSE-GIT",
  "--base-url",
  "https://git.tse.jus.br",
  "--base-dir",
  "repos",
  "--env-file",
  envPath,
]);
assert.ok(output.includes("Resumo"), "Deve exibir resumo por padrão");
assert.ok(output.includes("Repositórios identificados"), "Deve contar todos os repositórios");
assert.ok(output.includes("Públicos"), "Deve contar repositórios públicos");
assert.ok(output.includes("Arquivados"), "Deve contar repositórios arquivados");

output = "";
await runCli([
  "git-sync",
  "--server-name",
  "TSE-GIT",
  "--base-url",
  "https://git.tse.jus.br",
  "--base-dir",
  "repos",
  "--env-file",
  envPath,
  "--no-public-repos=true",
]);
assert.ok(!output.includes("public-repo"), "Não deve listar repositórios públicos");

output = "";
await runCli([
  "git-sync",
  "--server-name",
  "TSE-GIT",
  "--base-url",
  "https://git.tse.jus.br",
  "--base-dir",
  "repos",
  "--env-file",
  envPath,
  "--no-archived-repos=true",
]);
assert.ok(!output.includes("archived-repo"), "Não deve listar repositórios arquivados");

console.log = originalLog;
process.env.HOME = originalHome;
process.argv = originalArgv;
globalThis.fetch = originalFetch as typeof fetch;

console.log("git_sync_summary_test: OK");
};

const summaryPromise = runSummaryTests();
const globalBucket = globalThis as { __pajeTests?: Promise<void>[] };
if (globalBucket.__pajeTests) {
  globalBucket.__pajeTests.push(summaryPromise);
} else {
  globalBucket.__pajeTests = [summaryPromise];
}
