import assert from "node:assert/strict";
import { LoggerBroker, type LogEntry } from "../src/modules/git/core/loggerBroker.js";
import { createPanelTransport } from "../src/modules/git/core/loggerTransports.js";

const collected: LogEntry[] = [];
const broker = new LoggerBroker();
broker.addTransport({
  name: "collector",
  minLevel: "info",
  log: (entry: LogEntry) => {
    collected.push(entry);
  },
});

broker.debug("mensagem debug");
broker.info("mensagem info");
broker.warn("mensagem warn");
broker.error("mensagem error");

assert.strictEqual(collected.length, 3, "Deve respeitar nível mínimo por transport");
assert.deepEqual(
  collected.map((entry) => entry.level),
  ["info", "warn", "error"],
  "Deve preservar níveis acima do mínimo"
);
assert.ok(
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(collected[0]?.timestamp ?? ""),
  "Deve formatar timestamp sem milissegundos"
);

broker.setTransportLevel("collector", "debug");
broker.debug("mensagem debug 2");
assert.strictEqual(collected.at(-1)?.level, "debug", "Deve permitir ajustar nível do transport");

const panelMessages: Array<{ message: string; level: "info" | "warn" | "error" }> = [];
const panelTransport = createPanelTransport("panel", "debug", (message, level = "info") => {
  panelMessages.push({ message, level });
});

panelTransport.log({
  level: "debug",
  message: "debug no painel",
  timestamp: "2026-05-10 20:00:00",
});

assert.strictEqual(panelMessages.length, 1, "Deve encaminhar mensagens para o painel");
assert.ok(panelMessages[0]?.message.includes("debug no painel"), "Deve incluir mensagem no painel");
assert.strictEqual(panelMessages[0]?.level, "info", "Deve normalizar debug para info no painel");

console.log("logger_broker_test: OK");
