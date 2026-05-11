import os from "node:os";
import path from "node:path";

export type EnvConfigValue = string | number | boolean | string[] | null | undefined;
export type EnvConfig = Record<string, EnvConfigValue>;

export type EnvResolution = {
  value?: EnvConfigValue;
  source: "cli" | "env" | "default";
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

export const resolveEnvValueWithSource = <T extends EnvConfigValue>(
  cliValue: T | undefined,
  env: EnvConfig,
  key: string,
  defaultValue?: T
): EnvResolution => {
  if (cliValue !== undefined && cliValue !== null && String(cliValue).trim() !== "") {
    return { value: cliValue, source: "cli" };
  }
  const value = env[key];
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    return { value: value as T, source: "env" };
  }
  if (defaultValue !== undefined) {
    return { value: defaultValue, source: "default" };
  }
  return { value: undefined, source: "default" };
};

export const resolveEnvString = (cliValue: string | undefined, env: EnvConfig, key: string): string | undefined => {
  const resolved = resolveEnvValue(cliValue, env, key);
  if (resolved === undefined) {
    return undefined;
  }
  return String(resolved);
};

export const resolveEnvStringWithSource = (
  cliValue: string | undefined,
  env: EnvConfig,
  key: string,
  defaultValue?: string
): EnvResolution => {
  const resolved = resolveEnvValueWithSource(cliValue, env, key, defaultValue);
  if (resolved.value === undefined) {
    return resolved;
  }
  return { value: String(resolved.value), source: resolved.source };
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

export const resolveEnvBooleanWithSource = (
  cliValue: boolean | undefined,
  env: EnvConfig,
  key: string,
  defaultValue?: boolean
): EnvResolution => {
  if (cliValue !== undefined) {
    return { value: cliValue, source: "cli" };
  }
  const value = env[key];
  if (typeof value === "boolean") {
    return { value, source: "env" };
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return { value: true, source: "env" };
    }
    if (value.toLowerCase() === "false") {
      return { value: false, source: "env" };
    }
  }
  if (defaultValue !== undefined) {
    return { value: defaultValue, source: "default" };
  }
  return { value: undefined, source: "default" };
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

export const resolveEnvNumberWithSource = (
  cliValue: number | undefined,
  env: EnvConfig,
  key: string,
  defaultValue?: number
): EnvResolution => {
  if (cliValue !== undefined && !Number.isNaN(cliValue)) {
    return { value: cliValue, source: "cli" };
  }
  const value = env[key];
  if (typeof value === "number") {
    return { value, source: "env" };
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return { value: parsed, source: "env" };
    }
  }
  if (defaultValue !== undefined) {
    return { value: defaultValue, source: "default" };
  }
  return { value: undefined, source: "default" };
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

export const resolveEnvStringArrayWithSource = (
  cliValue: string | undefined,
  env: EnvConfig,
  key: string,
  defaultValue?: string
): EnvResolution => {
  if (cliValue && cliValue.trim()) {
    return { value: cliValue, source: "cli" };
  }
  const value = env[key];
  if (Array.isArray(value)) {
    return { value: value.join(","), source: "env" };
  }
  if (typeof value === "string") {
    return { value, source: "env" };
  }
  if (defaultValue !== undefined) {
    return { value: defaultValue, source: "default" };
  }
  return { value: undefined, source: "default" };
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

export const resolveHomePathWithSource = (value?: string, source: "cli" | "env" | "default" = "default"): EnvResolution => {
  if (!value) {
    return { value, source };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: trimmed, source };
  }
  if (trimmed === "~") {
    return { value: os.homedir(), source };
  }
  if (trimmed.startsWith("~/")) {
    return { value: path.join(os.homedir(), trimmed.slice(2)), source };
  }
  return { value, source };
};

export const resolveEnvFileFromCli = (envFile?: string): string | undefined => {
  if (envFile && envFile.trim()) {
    return envFile;
  }
  return path.join(os.homedir(), ".paje", "env.yaml");
};
