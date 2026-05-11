export type ParameterSource = "cli" | "env" | "default" | "resolved" | "prompt";

export type ParameterDescriptor = {
  name: string;
  description: string;
  value: string;
  source: ParameterSource;
};

export type CommandParameters = {
  command: string;
  label: string;
  parameters: ParameterDescriptor[];
};

export const formatParameterValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
};

export const buildParameter = (options: {
  name: string;
  description: string;
  value: unknown;
  source: ParameterSource;
}): ParameterDescriptor => {
  return {
    name: options.name,
    description: options.description,
    value: formatParameterValue(options.value),
    source: options.source,
  };
};
