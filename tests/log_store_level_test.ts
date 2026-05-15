import assert from "node:assert/strict";
import {
  appendLogEntry,
  clearLogEntries,
  getLogEntries,
  setLogLevel,
} from "../src/modules/git/tui/logStore.js";

clearLogEntries();
setLogLevel("info");

appendLogEntry("mensagem debug", "debug");
appendLogEntry("mensagem info", "info");

const entriesInfo = getLogEntries();
assert.strictEqual(entriesInfo.length, 1, "Deve filtrar mensagens abaixo do nível mínimo");
assert.strictEqual(entriesInfo[0]?.message, "mensagem info", "Deve manter mensagens no nível mínimo");

clearLogEntries();
setLogLevel("debug");

appendLogEntry("mensagem debug", "debug");

const entriesDebug = getLogEntries();
assert.strictEqual(entriesDebug.length, 1, "Deve aceitar mensagens debug quando nível mínimo é debug");
assert.strictEqual(entriesDebug[0]?.message, "mensagem debug", "Deve preservar mensagens debug");

setLogLevel("info");

console.log("log_store_level_test: OK");
