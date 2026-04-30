const REGEX_SPECIAL_CHARS = /[.+^${}()|[\]\\]/g;

const normalizePath = (value: string): string => {
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
};

const normalizePattern = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const withRecursive = trimmed.replace(/\/{2,}\*/g, "/**");
  return withRecursive.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
};

const escapeRegexChar = (char: string): string => {
  if (REGEX_SPECIAL_CHARS.test(char)) {
    return `\\${char}`;
  }
  return char;
};

const segmentToRegex = (segment: string): string => {
  let result = "";
  for (const char of segment) {
    if (char === "*") {
      result += "[^/]*";
      continue;
    }
    if (char === "?") {
      result += "[^/]";
      continue;
    }
    result += escapeRegexChar(char);
  }
  return result;
};

export const splitFilterPatterns = (rawPatterns?: string): string[] => {
  if (!rawPatterns) {
    return [];
  }
  return rawPatterns
    .split(";")
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);
};

export const antPatternToRegex = (pattern: string): RegExp => {
  const normalized = normalizePattern(pattern);
  if (!normalized) {
    return /^$/;
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 1 && segments[0] === "**") {
    return /^.*$/;
  }

  const parts: string[] = ["^"];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === "**") {
      if (index === 0) {
        parts.push("(?:[^/]+/)*");
      } else {
        parts.push("(?:/[^/]+)*");
      }
      continue;
    }

    if (index > 0) {
      const previous = segments[index - 1];
      if (previous === "**" && index - 1 === 0) {
        parts.push("(?:/)?");
      } else {
        parts.push("/");
      }
    }
    parts.push(segmentToRegex(segment));
  }
  parts.push("$");
  return new RegExp(parts.join(""));
};

export const compileAntPatterns = (rawPatterns?: string): RegExp[] => {
  return splitFilterPatterns(rawPatterns).map((pattern) => antPatternToRegex(pattern));
};

export const matchesAntPatterns = (pathWithNamespace: string, patterns: RegExp[]): boolean => {
  if (patterns.length === 0) {
    return true;
  }
  const normalized = normalizePath(pathWithNamespace);
  return patterns.some((pattern) => pattern.test(normalized));
};
