import assert from "node:assert/strict";
import { ensureGitLabPersonalAccessToken } from "../src/modules/git/sshManager.js";

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
    <input id="created-personal-access-token" value="glpat-123456" />
  </body>
</html>
`;

const calls: Array<{ url: string; init?: RequestInit }> = [];
let tokenCreated = false;

const mockFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  calls.push({ url, init });
  if (url.endsWith("/users/sign_in")) {
    return new MockResponse(signInHtml, 200, makeHeaders(), ["_gitlab_session=abc; Path=/; HttpOnly"]) as unknown as Response;
  }
  if (url.endsWith("/users/auth/ldapmain/callback")) {
    return new MockResponse("", 302, makeHeaders({ location: "/" }), ["_gitlab_session=def; Path=/; HttpOnly"]) as unknown as Response;
  }
  if (url.endsWith("/-/profile/personal_access_tokens") && (!init?.method || init.method === "GET")) {
    if (tokenCreated) {
      return new MockResponse(createdTokenHtml, 200, makeHeaders()) as unknown as Response;
    }
    return new MockResponse(tokenHtml, 200, makeHeaders(), ["_gitlab_session=ghi; Path=/; HttpOnly"]) as unknown as Response;
  }
  if (url.endsWith("/-/profile/personal_access_tokens") && init?.method === "POST") {
    tokenCreated = true;
    return new MockResponse("", 302, makeHeaders({ location: "/-/profile/personal_access_tokens" })) as unknown as Response;
  }
  throw new Error(`URL inesperada: ${url}`);
};

globalThis.fetch = mockFetch as typeof fetch;

const result = await ensureGitLabPersonalAccessToken({
  baseUrl: "https://git.tse.jus.br",
  name: "paje-token",
  scopes: ["api"],
  credentials: { username: "usuario", password: "segredo", source: "test" },
  fetchImpl: mockFetch as typeof fetch,
  maxAttempts: 1,
  retryDelayMs: 0,
  logger: () => undefined,
});

assert.strictEqual(result.token, "glpat-123456", "Deve extrair token pessoal criado");
assert.ok(
  calls.some((call) => call.url.endsWith("/-/profile/personal_access_tokens") && call.init?.method === "POST"),
  "Deve chamar cadastro de token pessoal"
);

globalThis.fetch = originalFetch as typeof fetch;

console.log("gitlab_personal_token_test: OK");
