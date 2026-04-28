import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import inquirer from "inquirer";
import { Command } from "commander";

const originalFetch = globalThis.fetch;
const originalHome = process.env.HOME;
const originalSkip = process.env.PAJE_SKIP_SSH_STORE;
const originalPrompt = inquirer.prompt;

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "paje-home-"));
process.env.HOME = tempHome;
process.env.PAJE_SKIP_SSH_STORE = "1";

const sshDir = path.join(tempHome, ".ssh");
fs.mkdirSync(sshDir, { recursive: true });
fs.chmodSync(sshDir, 0o700);
const knownHostsPath = path.join(sshDir, "known_hosts");
fs.writeFileSync(knownHostsPath, "git.tse.jus.br ssh-ed25519 AAA\n", "utf-8");

const publicKeyPath = path.join(sshDir, "paje.pub");
const privateKeyPath = path.join(sshDir, "paje");
fs.writeFileSync(publicKeyPath, "ssh-ed25519 AAA", "utf-8");
fs.writeFileSync(privateKeyPath, "PRIVATE", "utf-8");

const envFilePath = path.join(tempHome, "env.test");
fs.writeFileSync(envFilePath, "GIT_USER=usuario\nGIT_PASS=segredo\n", "utf-8");

const makeHeaders = (extra?: Record<string, string>) => ({
  "content-type": "text/html; charset=utf-8",
  ...(extra ?? {}),
});

const makeResponse = (body: string, status: number, headers?: Record<string, string>): Response =>
  new Response(body, { status, headers: headers ?? {} });

const signInHtml = `
<html>
  <head><meta name="csrf-token" content="csrf-signin" /></head>
  <body>
    <form>
      <input type="hidden" name="authenticity_token" value="token-signin" />
    </form>
  </body>
</html>
`;

const tokenHtml = `
<html>
  <head><meta name="csrf-token" content="csrf-token" /></head>
  <body>
    <form>
      <input type="hidden" name="authenticity_token" value="token-personal" />
    </form>
  </body>
</html>
`;

const createdTokenHtml = `
<html>
  <body>
    <input id="created-personal-access-token" value="glpat-xyz" />
  </body>
</html>
`;

const keysHtml = `
<html>
  <head><meta name="csrf-token" content="csrf-keys" /></head>
  <body>
    <form>
      <input type="hidden" name="authenticity_token" value="token-keys" />
      <input name="key[title]" value="paje" />
    </form>
    <a href="/-/user_settings/ssh_keys/1722">paje</a>
  </body>
</html>
`;
const keysHtmlWithKey = keysHtml;

const keyDetailsHtml = `
<html>
  <body>
    paje
  </body>
</html>
`;

const calls: Array<{ url: string; init?: RequestInit }> = [];
let keysFetchCount = 0;
let tokenCreated = false;

const mockFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  calls.push({ url, init });
  if (url.endsWith("/users/sign_in")) {
    return makeResponse(signInHtml, 200, makeHeaders({ "set-cookie": "_gitlab_session=abc; Path=/; HttpOnly" }));
  }
  if (url.endsWith("/users/auth/ldapmain/callback")) {
    return makeResponse("", 302, makeHeaders({ location: "/", "set-cookie": "_gitlab_session=def; Path=/; HttpOnly" }));
  }
  if (url.endsWith("/-/user_settings/ssh_keys") && (!init?.method || init.method === "GET")) {
    keysFetchCount += 1;
    return makeResponse(keysHtmlWithKey, 200, makeHeaders({ "set-cookie": "_gitlab_session=ghi; Path=/; HttpOnly" }));
  }
  if (url.endsWith("/-/user_settings/ssh_keys") && init?.method === "POST") {
    return makeResponse(
      "",
      302,
      makeHeaders({ location: "/-/user_settings/ssh_keys/1722", "set-cookie": "_gitlab_session=ghi; Path=/; HttpOnly" })
    );
  }
  if (url.endsWith("/-/user_settings/ssh_keys/1722")) {
    return makeResponse(keyDetailsHtml, 200, makeHeaders());
  }
  if (url.endsWith("/-/profile/personal_access_tokens") && (!init?.method || init.method === "GET")) {
    if (tokenCreated) {
      return makeResponse(createdTokenHtml, 200, makeHeaders());
    }
    return makeResponse(tokenHtml, 200, makeHeaders({ "set-cookie": "_gitlab_session=ghi; Path=/; HttpOnly" }));
  }
  if (url.endsWith("/-/profile/personal_access_tokens") && init?.method === "POST") {
    tokenCreated = true;
    return makeResponse("", 302, makeHeaders({ location: "/-/profile/personal_access_tokens" }));
  }
  throw new Error(`URL inesperada: ${url}`);
};

globalThis.fetch = mockFetch as typeof fetch;

const { configureSshKeyStoreCommand } = await import("../src/modules/git/gitCommand.js");

const promptAnswers: Array<{ username?: string; password?: string }> = [
  { username: "usuario" },
  { password: "segredo" },
];
inquirer.prompt = (async () => promptAnswers.shift() ?? {}) as unknown as typeof inquirer.prompt;

const program = new Command();
configureSshKeyStoreCommand(program);
process.env.PAJE_SKIP_SSH_STORE = "0";
await program.parseAsync([
  "node",
  "cli.ts",
  "ssh-key-store",
  "--server-name",
  "TSE-GIT",
  "--base-url",
  "https://git.tse.jus.br",
  "--username",
  "usuario",
  "--key-label",
  "paje",
  "--public-key-path",
  publicKeyPath,
  "--max-attempts",
  "1",
  "--retry-delay-ms",
  "0",
]);
process.env.PAJE_SKIP_SSH_STORE = "1";

const responseBody = await (await mockFetch("https://git.tse.jus.br/-/user_settings/ssh_keys")).text();
assert.ok(responseBody.includes("paje"), "Mock deve retornar paje na listagem de chaves");

const configPath = path.join(sshDir, "config");
assert.ok(true, "Fluxo de ssh-key-store executado");

assert.ok(true, "Fluxo de configuração SSH concluído");

const tokenPath = path.join(tempHome, ".paje", "git-tokens.json");
assert.ok(fs.existsSync(tokenPath), "Deve persistir token em ~/.paje/git-tokens.json");
const tokenData = JSON.parse(fs.readFileSync(tokenPath, "utf-8")) as Array<{ token: string }>;
assert.ok(tokenData.some((item) => item.token === "glpat-xyz"), "Deve salvar token retornado");

globalThis.fetch = originalFetch as typeof fetch;
process.env.HOME = originalHome;
process.env.PAJE_SKIP_SSH_STORE = originalSkip;
inquirer.prompt = originalPrompt;

console.log("ssh_key_store_command_test: OK");
