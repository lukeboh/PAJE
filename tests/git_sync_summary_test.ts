import assert from "node:assert/strict";
import { Command } from "commander";
import { configureGitSyncCommand } from "../src/modules/git/gitCommand.js";

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
process.env.HOME = "/tmp/paje-tests";

const program = new Command();
configureGitSyncCommand(program);
await program.parseAsync([
  "node",
  "cli.ts",
  "git-sync",
  "--server-name",
  "TSE-GIT",
  "--base-url",
  "https://git.tse.jus.br",
  "--base-dir",
  "repos",
  "--no-summary",
]);

assert.ok(!output.includes("Resumo"), "Não deve exibir resumo quando --no-summary=true");

output = "";
await program.parseAsync([
  "node",
  "cli.ts",
  "git-sync",
  "--server-name",
  "TSE-GIT",
  "--base-url",
  "https://git.tse.jus.br",
  "--base-dir",
  "repos",
  "--git-show-public-repos",
]);
assert.ok(output.includes("Resumo"), "Deve exibir resumo por padrão");
assert.ok(output.includes("Repositórios identificados"), "Deve contar todos os repositórios");
assert.ok(output.includes("Públicos"), "Deve contar repositórios públicos");
assert.ok(output.includes("Arquivados"), "Deve contar repositórios arquivados");

output = "";
await program.parseAsync([
  "node",
  "cli.ts",
  "git-sync",
  "--server-name",
  "TSE-GIT",
  "--base-url",
  "https://git.tse.jus.br",
  "--base-dir",
  "repos",
  "--git-show-public-repos",
  "--public-repos=true",
]);
assert.ok(!output.includes("public-repo"), "Não deve listar repositórios públicos");

output = "";
await program.parseAsync([
  "node",
  "cli.ts",
  "git-sync",
  "--server-name",
  "TSE-GIT",
  "--base-url",
  "https://git.tse.jus.br",
  "--base-dir",
  "repos",
  "--git-show-public-repos",
  "--archived-repos=true",
]);
assert.ok(!output.includes("archived-repo"), "Não deve listar repositórios arquivados");

console.log = originalLog;
process.env.HOME = originalHome;
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
