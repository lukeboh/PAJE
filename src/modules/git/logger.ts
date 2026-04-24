import fs from "node:fs";
import path from "node:path";
import { ensurePajeDirs, resolvePajePaths } from "./persistence.js";

export type LogLevel = "info" | "warn" | "error";

export class PajeLogger {
  private readonly logFile: string;

  constructor() {
    const paths = resolvePajePaths();
    ensurePajeDirs(paths);
    const date = new Date().toISOString().slice(0, 10);
    this.logFile = path.join(paths.logsDir, `git-sync-${date}.log`);
  }

  private write(level: LogLevel, message: string): void {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(this.logFile, line);
  }

  info(message: string): void {
    this.write("info", message);
  }

  warn(message: string): void {
    this.write("warn", message);
  }

  error(message: string): void {
    this.write("error", message);
  }
}
