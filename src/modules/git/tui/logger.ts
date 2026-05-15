export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  id: string;
  message: string;
  level: LogLevel;
  timestamp: string;
};

export const formatTimestamp = (date: Date = new Date()): string => {
  return date.toISOString().replace("T", " ").slice(0, 19);
};

export const createLogEntry = (message: string, level: LogLevel = "info", date = new Date()): LogEntry => {
  return {
    id: `${date.getTime()}-${Math.random().toString(16).slice(2)}`,
    message,
    level,
    timestamp: formatTimestamp(date),
  };
};
