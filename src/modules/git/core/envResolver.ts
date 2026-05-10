import os from "node:os";
import path from "node:path";

export type EnvConfigValue = string | number | boolean | string[] | null | undefined;
export type EnvConfig = Record<string, EnvConfigValue>;

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

export const resolveEnvFileFromCli = (envFile?: string): string | undefined => {
  if (envFile && envFile.trim()) {
    return envFile;
  }
  return path.join(os.homedir(), ".paje", "env.yaml");
};
