import { PajeLogger } from "../logger.js";
import type { LogEntry, LogLevel, LogTransport } from "./loggerBroker.js";

export const createConsoleTransport = (name: string, minLevel: LogLevel): LogTransport => {
  return {
    name,
    minLevel,
    log: (entry: LogEntry) => {
      const line = `[${entry.timestamp}] ${entry.message}`;
      if (entry.level === "error") {
        console.error(line);
        return;
      }
      console.log(line);
    },
  };
};

export const createFileTransport = (name: string, minLevel: LogLevel): LogTransport => {
  const logger = new PajeLogger();
  return {
    name,
    minLevel,
    log: (entry: LogEntry) => {
      if (entry.level === "debug") {
        logger.info(`[DEBUG] ${entry.message}`);
        return;
      }
      if (entry.level === "info") {
        logger.info(entry.message);
        return;
      }
      if (entry.level === "warn") {
        logger.warn(entry.message);
        return;
      }
      logger.error(entry.message);
    },
  };
};

export type PanelLogAppend = (message: string, level?: "info" | "warn" | "error") => void;

export const createPanelTransport = (
  name: string,
  minLevel: LogLevel,
  append: PanelLogAppend
): LogTransport => {
  return {
    name,
    minLevel,
    log: (entry: LogEntry) => {
      const level = entry.level === "debug" ? "info" : entry.level;
      append(`[${entry.timestamp}] ${entry.message}`, level);
    },
  };
};
