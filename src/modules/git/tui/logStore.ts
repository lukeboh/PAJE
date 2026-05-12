import { useEffect, useMemo, useRef, useState } from "react";
import { createLogEntry, type LogEntry, type LogLevel } from "./logger.js";
import { t } from "../../../i18n/index.js";

export type LogListener = (entries: LogEntry[]) => void;

class LogStore {
  private entries: LogEntry[] = [];
  private listeners = new Set<LogListener>();

  append(message: string, level: LogLevel = "info"): void {
    this.appendEntry(createLogEntry(message, level));
  }

  appendEntry(entry: LogEntry): void {
    this.entries = [...this.entries, entry];
    this.notify();
  }

  replace(entries: LogEntry[]): void {
    this.entries = [...entries];
    this.notify();
  }

  getEntries(): LogEntry[] {
    return this.entries;
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.entries;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

const logStore = new LogStore();

export const appendLogEntry = (message: string, level: LogLevel = "info"): void => {
  logStore.append(message, level);
};

export const appendLogRecord = (entry: LogEntry): void => {
  logStore.appendEntry(entry);
};

export const getLogEntries = (): LogEntry[] => logStore.getEntries();

export const subscribeLogEntries = (listener: LogListener): (() => void) => {
  return logStore.subscribe(listener);
};

export const useLogEntries = (): LogEntry[] => {
  const [entries, setEntries] = useState<LogEntry[]>(() => logStore.getEntries());
  const initRef = useRef(false);

  useEffect(() => {
    return logStore.subscribe((next) => setEntries(next));
  }, []);

  useEffect(() => {
    if (initRef.current) {
      return;
    }
    initRef.current = true;
    if (logStore.getEntries().length === 0) {
      appendLogEntry(t("app.description"));
    }
  }, []);

  return useMemo(() => entries, [entries]);
};
