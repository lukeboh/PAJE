import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import inquirer from "inquirer";
import { promptBasicAuthPassword, selectGitServer } from "../src/modules/git/gitCommand.js";

const originalHome = process.env.HOME;
const originalPrompt = inquirer.prompt;

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "paje-home-"));
process.env.HOME = tempHome;

const pajeDir = path.join(tempHome, ".paje");
fs.mkdirSync(pajeDir, { recursive: true });
const serversPath = path.join(pajeDir, "git-servers.json");
fs.writeFileSync(
  serversPath,
  JSON.stringify([
    {
      id: "https://git.tse.jus.br",
      name: "TSE-GIT",
      baseUrl: "https://git.tse.jus.br",
    },
  ]),
  "utf-8"
);

const cliServer = await selectGitServer(undefined, {
  serverName: "NOVO",
  baseUrl: "https://gitlab.com",
});
assert.strictEqual(cliServer.baseUrl, "https://gitlab.com");

inquirer.prompt = (async () => ({ selected: "https://git.tse.jus.br" })) as unknown as typeof inquirer.prompt;
const selectedServer = await selectGitServer(undefined, {});
assert.strictEqual(selectedServer.name, "TSE-GIT");

const sessionMock = {
  promptList: async () => "__new__",
  promptForm: async () => ({ name: "TSE-GIT", baseUrl: "https://git.tse.jus.br", username: "user" }),
  promptConfirm: async () => true,
  showMessage: async () => undefined,
} as any;
const sessionServer = await selectGitServer(sessionMock, {});
assert.strictEqual(sessionServer.baseUrl, "https://git.tse.jus.br");

inquirer.prompt = (async () => ({ password: "segredo" })) as unknown as typeof inquirer.prompt;
const password = await promptBasicAuthPassword("usuario", undefined, undefined);
assert.strictEqual(password, "segredo");

process.env.HOME = originalHome;
inquirer.prompt = originalPrompt;

console.log("git_command_select_server_test: OK");
