import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { configureGitSyncCommand } from "../src/modules/git/gitCommand.js";

const originalFetch = globalThis.fetch;
const originalHome = process.env.HOME;

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "paje-home-"));
process.env.HOME = tempHome;
const pajeDir = path.join(tempHome, ".paje");
fs.mkdirSync(pajeDir, { recursive: true });
fs.writeFileSync(
  path.join(pajeDir, "git-servers.json"),
  JSON.stringify([
    {
      id: "https://gitlab.example.com",
      name: "TSE-GIT",
      baseUrl: "https://gitlab.example.com",
      useBasicAuth: false,
    },
    {
      id: "https://gitlab.dev.local",
      name: "DEV-GIT",
      baseUrl: "https://gitlab.dev.local",
      useBasicAuth: false,
    },
  ])
);

const calls: Array<{ url: string; init?: RequestInit }> = [];
globalThis.fetch = (async (url: string, init?: RequestInit): Promise<Response> => {
  calls.push({ url, init });
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

let capturedLogs = "";
const originalLog = console.log;
console.log = (message?: unknown) => {
  capturedLogs += `${String(message ?? "")}\n`;
};

const program = new Command();
configureGitSyncCommand(program);
await program.parseAsync(["node", "cli.ts", "git-sync"]);

assert.ok(
  capturedLogs.includes("Não há autenticação configurada para TSE-GIT"),
  "Deve avisar quando não há autenticação no servidor TSE-GIT"
);
assert.ok(
  capturedLogs.includes("Não há autenticação configurada para DEV-GIT"),
  "Deve avisar quando não há autenticação no servidor DEV-GIT"
);
assert.ok(
  capturedLogs.includes("Nenhum servidor com autenticação válida"),
  "Deve informar quando nenhum servidor possui autenticação válida"
);
assert.strictEqual(calls.length, 0, "Não deve chamar API sem autenticação");

console.log = originalLog;
globalThis.fetch = originalFetch as typeof fetch;
process.env.HOME = originalHome;

console.log("git_sync_auth_guard_test: OK");
