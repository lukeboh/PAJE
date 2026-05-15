import assert from "node:assert/strict";
import type { LogEntry } from "../src/modules/git/core/loggerBroker.js";
import { createConsoleTransport, createFileTransport } from "../src/modules/git/core/loggerTransports.js";
import { PajeLogger } from "../src/modules/git/logger.js";

const logged: string[] = [];
const errored: string[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = (...args: unknown[]) => {
  logged.push(args.join(" "));
};
console.error = (...args: unknown[]) => {
  errored.push(args.join(" "));
};

const infoEntry: LogEntry = { level: "info", message: "linha info", timestamp: "2026-05-10 20:21:00" };
const errorEntry: LogEntry = { level: "error", message: "linha erro", timestamp: "2026-05-10 20:21:01" };

const consoleTransport = createConsoleTransport("console", "info");
consoleTransport.log(infoEntry);
consoleTransport.log(errorEntry);

assert.ok(
  logged[0]?.includes("[2026-05-10 20:21:00] [INFO] linha info"),
  "Deve escrever info no console.log"
);
assert.ok(
  errored[0]?.includes("[2026-05-10 20:21:01] [ERROR] linha erro"),
  "Deve escrever erro no console.error"
);

console.log = originalConsoleLog;
console.error = originalConsoleError;

const originalInfo = PajeLogger.prototype.info;
const originalWarn = PajeLogger.prototype.warn;
const originalError = PajeLogger.prototype.error;
const fileLogged: Array<{ level: "info" | "warn" | "error"; message: string }> = [];

PajeLogger.prototype.info = function info(message: string): void {
  fileLogged.push({ level: "info", message });
};
PajeLogger.prototype.warn = function warn(message: string): void {
  fileLogged.push({ level: "warn", message });
};
PajeLogger.prototype.error = function error(message: string): void {
  fileLogged.push({ level: "error", message });
};

try {
  const fileTransport = createFileTransport("file", "debug");
  fileTransport.log({ level: "debug", message: "debug", timestamp: "2026-05-10 20:21:02" });
  fileTransport.log({ level: "info", message: "info", timestamp: "2026-05-10 20:21:03" });
  fileTransport.log({ level: "warn", message: "warn", timestamp: "2026-05-10 20:21:04" });
  fileTransport.log({ level: "error", message: "error", timestamp: "2026-05-10 20:21:05" });

  assert.deepEqual(
    fileLogged,
    [
      { level: "info", message: "[DEBUG] debug" },
      { level: "info", message: "info" },
      { level: "warn", message: "warn" },
      { level: "error", message: "error" },
    ],
    "Deve mapear níveis para o logger de arquivo"
  );
} finally {
  PajeLogger.prototype.info = originalInfo;
  PajeLogger.prototype.warn = originalWarn;
  PajeLogger.prototype.error = originalError;
}

console.log("logger_transports_test: OK");
