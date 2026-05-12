import ptBR, { type PtBrTranslations } from "./pt_BR.js";
import enUS, { type EnUsTranslations } from "./en_US.js";

type LocaleDictionary = PtBrTranslations;

export type LocaleKey = string;
export type Locale = "pt_BR" | "en_US";

const AVAILABLE_LOCALES: Record<Locale, LocaleDictionary> = {
  pt_BR: ptBR,
  en_US: enUS,
};

const DEFAULT_LOCALE: Locale = "en_US";

const normalizeLocale = (raw?: string | null): Locale => {
  const normalized = (raw ?? "").replace("-", "_").trim();
  if (!normalized) {
    return DEFAULT_LOCALE;
  }
  const lower = normalized.toLowerCase();
  if (lower.startsWith("pt")) {
    return "pt_BR";
  }
  if (lower.startsWith("en")) {
    return "en_US";
  }
  return DEFAULT_LOCALE;
};

const getEnvLocale = (): Locale => {
  const lang = process.env.PAJE_LOCALE || process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "";
  return normalizeLocale(lang);
};

let currentLocale: Locale = getEnvLocale();

export const setLocale = (locale?: string): void => {
  if (!locale) {
    currentLocale = getEnvLocale();
    return;
  }
  currentLocale = normalizeLocale(locale);
};

export const getLocale = (): Locale => currentLocale;

const resolveValue = (dictionary: LocaleDictionary, key: string): string | undefined => {
  const segments = key.split(".");
  let cursor: unknown = dictionary;
  for (const segment of segments) {
    if (cursor && typeof cursor === "object" && segment in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return typeof cursor === "string" ? cursor : undefined;
};

const interpolate = (value: string, params?: Record<string, string | number>): string => {
  if (!params) {
    return value;
  }
  return Object.entries(params).reduce((acc, [key, paramValue]) => {
    return acc.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(paramValue));
  }, value);
};

export const t = (key: string, params?: Record<string, string | number>): string => {
  const locale = getLocale();
  const dictionary = AVAILABLE_LOCALES[locale] ?? AVAILABLE_LOCALES[DEFAULT_LOCALE];
  const fallback = AVAILABLE_LOCALES[DEFAULT_LOCALE];
  const raw = resolveValue(dictionary, key) ?? resolveValue(fallback, key) ?? key;
  return interpolate(raw, params);
};
