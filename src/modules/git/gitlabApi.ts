import * as cheerio from "cheerio";
import { GitLabGroup, GitLabProject } from "./types.js";

export type GitLabApiOptions = {
  baseUrl: string;
  basicAuth?: {
    username: string;
    password: string;
  };
  token?: string;
  verbose?: boolean;
  logger?: (message: string) => void;
};

export type GitLabApiErrorDetails = {
  method: string;
  url: string;
  status: number;
  responseBody: string;
  curl: string;
};

class CookieJar {
  private readonly cookies = new Map<string, string>();

  addFromSetCookieHeaders(headers: string[]): void {
    headers.forEach((header) => {
      const [pair] = header.split(";");
      if (!pair) {
        return;
      }
      const [name, ...valueParts] = pair.split("=");
      if (!name || valueParts.length === 0) {
        return;
      }
      this.cookies.set(name.trim(), valueParts.join("=").trim());
    });
  }

  getCookieHeader(): string | undefined {
    if (this.cookies.size === 0) {
      return undefined;
    }
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

export class GitLabApi {
  private readonly baseUrl: string;
  private readonly basicAuth?: { username: string; password: string };
  private readonly token?: string;
  private sessionCookie?: string;
  private csrfToken?: string;
  private webAuthenticityToken?: string;
  private readonly cookieJar = new CookieJar();
  private readonly userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0";
  private readonly verbose: boolean;
  private readonly logger?: (message: string) => void;

  constructor(options: GitLabApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.basicAuth = options.basicAuth;
    this.token = options.token;
    this.verbose = options.verbose ?? false;
    this.logger = options.logger;
  }

  getServerHost(): string {
    return new URL(this.baseUrl).hostname;
  }

  hasAuth(): boolean {
    return Boolean(this.basicAuth || this.token);
  }

  private updateCookies(response: Response): void {
    const setCookies = (response.headers as any).getSetCookie?.() as string[] | undefined;
    const fallback = response.headers.get("set-cookie");
    const cookieList = setCookies ?? (fallback ? [fallback] : []);
    if (cookieList.length === 0) {
      return;
    }
    this.cookieJar.addFromSetCookieHeaders(cookieList);
    this.sessionCookie = this.cookieJar.getCookieHeader();
  }

  private logVerbose(message: string): void {
    if (!this.verbose) {
      return;
    }
    if (this.logger) {
      this.logger(message);
      return;
    }
    console.log(message);
  }

  private redactHeaders(headers: Record<string, string>): Record<string, string> {
    const redacted = { ...headers };
    if (redacted.Authorization) {
      redacted.Authorization = "Basic <REDACTED>";
    }
    if (redacted["PRIVATE-TOKEN"]) {
      redacted["PRIVATE-TOKEN"] = "<REDACTED>";
    }
    if (redacted.Cookie) {
      redacted.Cookie = "<REDACTED>";
    }
    if (redacted["X-CSRF-Token"]) {
      redacted["X-CSRF-Token"] = "<REDACTED>";
    }
    return redacted;
  }

  private redactBody(body: string): string {
    return body
      .replace(/"key"\s*:\s*"[^"]+"/g, '"key":"<REDACTED>"')
      .replace(/"password"\s*:\s*"[^"]+"/g, '"password":"<REDACTED>"');
  }

  private extractAuthenticityTokenFromHtml(html: string): string | null {
    const $ = cheerio.load(html);
    return $("input[name='authenticity_token']").attr("value") ?? $("meta[name='csrf-token']").attr("content") ?? null;
  }

  private extractCsrfTokenFromHtml(html: string): string | null {
    const $ = cheerio.load(html);
    return $("meta[name='csrf-token']").attr("content") ?? null;
  }

  private buildBrowserHeaders(referer?: string): Record<string, string> {
    return {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Upgrade-Insecure-Requests": "1",
      "User-Agent": this.userAgent,
      ...(referer ? { Referer: referer } : {}),
      ...(this.sessionCookie ? { Cookie: this.sessionCookie } : {}),
    };
  }

  private async ensureWebSession(): Promise<void> {
    if (!this.basicAuth) {
      return;
    }
    if (this.sessionCookie && this.csrfToken && this.webAuthenticityToken) {
      return;
    }

    const signInUrl = `${this.baseUrl}/users/sign_in`;
    this.logVerbose(`HTTP GET ${signInUrl}`);
    const signInResponse = await fetch(signInUrl, {
      headers: this.buildBrowserHeaders(),
    });
    this.logVerbose(`HTTP ${signInResponse.status} ${signInUrl}`);
    this.updateCookies(signInResponse);
    const signInHtml = await signInResponse.text();
    const authenticityToken = this.extractAuthenticityTokenFromHtml(signInHtml);
    if (!authenticityToken) {
      throw new Error("Não foi possível obter o token de autenticidade do GitLab.");
    }

    const form = new URLSearchParams();
    form.set("authenticity_token", authenticityToken);
    form.set("username", this.basicAuth.username);
    form.set("password", this.basicAuth.password);
    form.set("remember_me", "0");

    const loginUrl = `${this.baseUrl}/users/auth/ldapmain/callback`;
    const loginResponse = await fetch(loginUrl, {
      method: "POST",
      headers: {
        ...this.buildBrowserHeaders(signInUrl),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      redirect: "manual",
    });
    this.logVerbose(`HTTP ${loginResponse.status} ${loginUrl} (login)`);
    this.updateCookies(loginResponse);

    const keysUrl = `${this.baseUrl}/-/user_settings/ssh_keys`;
    const keysResponse = await fetch(keysUrl, {
      headers: this.buildBrowserHeaders(signInUrl),
    });
    this.logVerbose(`HTTP ${keysResponse.status} ${keysUrl}`);
    this.updateCookies(keysResponse);
    const keysHtml = await keysResponse.text();
    const csrfToken = this.extractCsrfTokenFromHtml(keysHtml);
    const webAuthenticityToken = this.extractAuthenticityTokenFromHtml(keysHtml);
    const tokenForForm = webAuthenticityToken ?? csrfToken;
    if (!tokenForForm) {
      throw new Error("Não foi possível obter o token de autenticidade da página de chaves SSH.");
    }
    this.csrfToken = csrfToken ?? tokenForForm;
    this.webAuthenticityToken = tokenForForm;
  }

  private async createSshKeyViaWeb(title: string, key: string, usageType = "auth_and_signing"): Promise<{ id: number }> {
    await this.ensureWebSession();
    if (!this.webAuthenticityToken) {
      throw new Error("Sessão web não inicializada para cadastro de chave.");
    }

    const keysUrl = `${this.baseUrl}/-/user_settings/ssh_keys`;
    const form = new URLSearchParams();
    form.set("authenticity_token", this.webAuthenticityToken);
    form.set("key[key]", key);
    form.set("key[title]", title);
    form.set("key[usage_type]", usageType);

    const response = await fetch(keysUrl, {
      method: "POST",
      headers: {
        ...this.buildBrowserHeaders(keysUrl),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      redirect: "manual",
    });
    this.logVerbose(`HTTP ${response.status} ${keysUrl} (cadastro chave)`);
    this.updateCookies(response);

    if (response.status >= 400) {
      const text = await response.text();
      throw new Error(`Falha ao cadastrar chave SSH via web (${response.status}): ${text}`);
    }

    const location = response.headers.get("location") ?? "";
    const idMatch = location.match(/\/ssh_keys\/(\d+)/);
    return { id: idMatch ? Number(idMatch[1]) : 0 };
  }

  private buildCurl(url: string, init: RequestInit): string {
    const method = init.method ?? "GET";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.basicAuth
        ? {
            Authorization: `Basic ${Buffer.from(`${this.basicAuth.username}:${this.basicAuth.password}`).toString(
              "base64"
            )}`,
          }
        : {}),
      ...(init.headers as Record<string, string> | undefined),
    };
    const redactedHeaders = this.redactHeaders(headers);
    const headerArgs = Object.entries(redactedHeaders)
      .map(([key, value]) => `-H ${JSON.stringify(`${key}: ${value}`)}`)
      .join(" ");
    const body = typeof init.body === "string" ? init.body : init.body ? JSON.stringify(init.body) : "";
    const redactedBody = this.redactBody(body);
    const bodyArg = redactedBody ? `-d ${JSON.stringify(redactedBody)}` : "";
    return `curl -i -X ${method} ${headerArgs} ${bodyArg} ${JSON.stringify(url)}`.replace(/\s+/g, " ").trim();
  }

  private async requestWithHeaders<T>(path: string, init: RequestInit = {}): Promise<{ data: T; headers: Headers }> {
    const url = `${this.baseUrl}${path}`;
    if (this.basicAuth) {
      await this.ensureWebSession();
    }
    const verboseHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.sessionCookie ? { Cookie: this.sessionCookie } : {}),
      ...(this.csrfToken ? { "X-CSRF-Token": this.csrfToken } : {}),
      ...(this.token ? { "PRIVATE-TOKEN": this.token } : {}),
      ...(init.headers as Record<string, string> | undefined),
    };
    const verboseBody = typeof init.body === "string" ? init.body : init.body ? JSON.stringify(init.body) : "";
    if (this.verbose) {
      this.logVerbose(`HTTP ${init.method ?? "GET"} ${url}`);
      this.logVerbose(`Headers: ${JSON.stringify(this.redactHeaders(verboseHeaders))}`);
      if (verboseBody) {
        this.logVerbose(`Body: ${this.redactBody(verboseBody)}`);
      }
    }
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(this.sessionCookie ? { Cookie: this.sessionCookie } : {}),
        ...(this.csrfToken ? { "X-CSRF-Token": this.csrfToken } : {}),
        ...(this.token ? { "PRIVATE-TOKEN": this.token } : {}),
        ...(init.headers ?? {}),
      },
    });
    this.logVerbose(`HTTP ${response.status} ${url}`);
    this.updateCookies(response);

    if (!response.ok) {
      const text = await response.text();
      const details: GitLabApiErrorDetails = {
        method: init.method ?? "GET",
        url,
        status: response.status,
        responseBody: text,
        curl: this.buildCurl(url, init),
      };
      const error = new Error(`GitLab API ${response.status}: ${text}`) as Error & { details?: GitLabApiErrorDetails };
      error.details = details;
      throw error;
    }

    return { data: (await response.json()) as T, headers: response.headers };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { data } = await this.requestWithHeaders<T>(path, init);
    return data;
  }

  private buildPagedPath(path: string, perPage: number, page: number): string {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}per_page=${perPage}&page=${page}`;
  }

  private async paginate<T>(path: string, init: RequestInit = {}): Promise<T[]> {
    const perPage = 100;
    const results: T[] = [];
    let page = 1;

    while (true) {
      const pagePath = this.buildPagedPath(path, perPage, page);
      const { data, headers } = await this.requestWithHeaders<T[]>(pagePath, init);
      if (data.length === 0) {
        break;
      }
      results.push(...data);
      const nextHeader = headers.get("x-next-page") ?? headers.get("X-Next-Page") ?? "";
      const nextPage = Number(nextHeader);
      if (Number.isFinite(nextPage) && nextPage > page) {
        page = nextPage;
        continue;
      }
      if (data.length < perPage) {
        break;
      }
      page += 1;
    }

    return results;
  }

  async listGroups(): Promise<GitLabGroup[]> {
    if (!this.hasAuth()) {
      return [];
    }
    return this.paginate<GitLabGroup>("/api/v4/groups?all_available=true");
  }

  async listSubgroups(groupId: number): Promise<GitLabGroup[]> {
    if (!this.hasAuth()) {
      return [];
    }
    return this.paginate<GitLabGroup>(`/api/v4/groups/${groupId}/subgroups`);
  }

  async listGroupProjects(groupId: number): Promise<GitLabProject[]> {
    if (!this.hasAuth()) {
      return [];
    }
    return this.paginate<GitLabProject>(`/api/v4/groups/${groupId}/projects`);
  }

  async listUserProjects(): Promise<GitLabProject[]> {
    return this.paginate<GitLabProject>("/api/v4/projects?membership=true");
  }

  async listPublicGroups(): Promise<GitLabGroup[]> {
    return this.paginate<GitLabGroup>("/api/v4/groups?visibility=public");
  }

  async listPublicProjects(): Promise<GitLabProject[]> {
    return this.paginate<GitLabProject>("/api/v4/projects?visibility=public");
  }

  async createSshKey(title: string, key: string): Promise<{ id: number }> {
    if (this.basicAuth) {
      return this.createSshKeyViaWeb(title, key);
    }
    return this.request<{ id: number }>("/api/v4/user/keys", {
      method: "POST",
      body: JSON.stringify({ title, key }),
    });
  }
}
