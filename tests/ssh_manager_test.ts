import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureGitLabSshKey, loadGitCredentials } from "../src/modules/git/sshManager.js";

const originalFetch = globalThis.fetch;

const makeHeaders = (extra?: Record<string, string>) =>
  new Map(
    Object.entries({
      "content-type": "text/html; charset=utf-8",
      ...(extra ?? {}),
    })
  );

class MockResponse {
  readonly headers: { get: (key: string) => string | null; getSetCookie?: () => string[] };
  constructor(
    private readonly body: string,
    readonly status: number,
    headerMap: Map<string, string>,
    setCookies?: string[]
  ) {
    this.headers = {
      get: (key: string) => headerMap.get(key.toLowerCase()) ?? null,
      getSetCookie: setCookies ? () => setCookies : undefined,
    };
  }
  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }
  async text(): Promise<string> {
    return this.body;
  }
  async json(): Promise<unknown> {
    return JSON.parse(this.body);
  }
}

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

const keysHtml = `
<html>
  <head><meta name="csrf-token" content="csrf-keys" /></head>
  <body>
    <form>
      <input type="hidden" name="authenticity_token" value="token-keys" />
    </form>
  </body>
</html>
`;

const keyDetailsHtml = `
<html>
  <body>
    <div class="key-title">paje</div>
  </body>
</html>
`;

const calls: Array<{ url: string; init?: RequestInit }> = [];
let allowLogin = false;

const mockFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  calls.push({ url, init });
  if (url.endsWith("/users/sign_in")) {
    return new MockResponse(signInHtml, 200, makeHeaders(), ["_gitlab_session=abc; Path=/; HttpOnly"]) as unknown as Response;
  }
  if (url.endsWith("/users/auth/ldapmain/callback")) {
    if (!allowLogin) {
      return new MockResponse("", 401, makeHeaders({ location: "/" })) as unknown as Response;
    }
    return new MockResponse("", 302, makeHeaders({ location: "/" }), ["_gitlab_session=def; Path=/; HttpOnly"]) as unknown as Response;
  }
  if (url.endsWith("/-/user_settings/ssh_keys") && (!init?.method || init.method === "GET")) {
    return new MockResponse(keysHtml, 200, makeHeaders(), ["_gitlab_session=ghi; Path=/; HttpOnly"]) as unknown as Response;
  }
  if (url.endsWith("/-/user_settings/ssh_keys") && init?.method === "POST") {
    return new MockResponse("", 302, makeHeaders({ location: "/-/user_settings/ssh_keys/1722" })) as unknown as Response;
  }
  if (url.endsWith("/-/user_settings/ssh_keys/1722")) {
    return new MockResponse(keyDetailsHtml, 200, makeHeaders()) as unknown as Response;
  }
  throw new Error(`URL inesperada: ${url}`);
};

globalThis.fetch = mockFetch as typeof fetch;

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "paje-home-"));
const envFilePath = path.join(tempHome, "env-test.yaml");
fs.writeFileSync(envFilePath, "username: usuario\npassword: segredo\n", "utf-8");
const credentials = loadGitCredentials({ allowProcessEnv: true, envFilePaths: [envFilePath] });

const resultPromise = ensureGitLabSshKey({
  baseUrl: "https://git.tse.jus.br",
  title: "paje",
  usageType: "auth_and_signing",
  credentials,
  keyInfo: {
    publicKeyPath: "/tmp/paje.pub",
    privateKeyPath: "/tmp/paje",
    publicKey: "ssh-ed25519 AAA",
  },
  fetchImpl: mockFetch as typeof fetch,
  maxAttempts: 2,
  retryDelayMs: 5,
  sleepFn: async () => {
    allowLogin = true;
  },
  logger: () => undefined,
});

const result = await resultPromise;

assert.strictEqual(result.id, 1722, "Deve retornar id da chave cadastrada");
assert.ok(calls.some((call) => call.url.endsWith("/users/auth/ldapmain/callback")), "Deve chamar login LDAP");
assert.ok(
  calls.some((call) => call.url.endsWith("/-/user_settings/ssh_keys") && call.init?.method === "POST"),
  "Deve chamar cadastro de chave via web"
);

globalThis.fetch = originalFetch as typeof fetch;

console.log("ssh_manager_test: OK");
