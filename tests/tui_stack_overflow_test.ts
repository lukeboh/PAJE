import assert from "node:assert/strict";
import React from "react";
import { Box, Text, render } from "ink";
import { PassThrough } from "node:stream";
import { Layout } from "../src/modules/git/tui/layout.js";
import { createLogEntry } from "../src/modules/git/tui/logger.js";

const waitNextTick = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const logs = [
  createLogEntry("Linha 1"),
  createLogEntry("Linha 2"),
  createLogEntry("Erro", "error"),
];

type SnapshotOptions = {
  logMaximized: boolean;
  orientation: string;
  workspaceLabel: string;
  panelTitle?: string;
};

const createTTYStreams = () => {
  const stdout = new PassThrough();
  (stdout as { columns?: number; rows?: number; isTTY?: boolean }).columns = 80;
  (stdout as { columns?: number; rows?: number; isTTY?: boolean }).rows = 24;
  (stdout as { columns?: number; rows?: number; isTTY?: boolean }).isTTY = true;

  const stdin = new PassThrough();
  (
    stdin as {
      isTTY?: boolean;
      setRawMode?: (value: boolean) => void;
      ref?: () => void;
      unref?: () => void;
    }
  ).isTTY = true;
  (
    stdin as {
      isTTY?: boolean;
      setRawMode?: (value: boolean) => void;
      ref?: () => void;
      unref?: () => void;
    }
  ).setRawMode = () => undefined;
  (
    stdin as {
      isTTY?: boolean;
      setRawMode?: (value: boolean) => void;
      ref?: () => void;
      unref?: () => void;
    }
  ).ref = () => undefined;
  (
    stdin as {
      isTTY?: boolean;
      setRawMode?: (value: boolean) => void;
      ref?: () => void;
      unref?: () => void;
    }
  ).unref = () => undefined;

  return { stdout, stdin };
};

const renderLayoutSnapshot = async (options: SnapshotOptions): Promise<string> => {
  const { stdout, stdin } = createTTYStreams();
  let output = "";
  stdout.on("data", (chunk) => {
    output += chunk.toString();
  });

  const tree = React.createElement(Layout, {
    title: "PAJÉ - Teste Ctrl+F12",
    workspaceLabel: options.panelTitle,
    orientation: options.orientation,
    logEntries: logs,
    initialLogMaximized: options.logMaximized,
    onEscape: () => undefined,
    children: React.createElement(
      Box,
      null,
      React.createElement(Text, null, options.workspaceLabel),
      React.createElement(Text, null, "ESC:0")
    ),
  });

  const { unmount } = render(React.createElement(React.Fragment, null, tree), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
  });

  await waitNextTick();
  unmount();

  return output;
};

const outputDefault = await renderLayoutSnapshot({
  logMaximized: false,
  orientation: "Log padrão",
  workspaceLabel: "WORKSPACE",
  panelTitle: "Painel de Teste",
});

assert.ok(outputDefault.includes("Log padrão"), "Deve renderizar orientação inicial");
assert.ok(outputDefault.includes("WORKSPACE"), "Deve renderizar workspace inicial");
assert.ok(outputDefault.includes("Painel de Teste"), "Deve renderizar legenda do fieldset");
assert.ok(outputDefault.includes("Log"), "Deve renderizar legenda do painel de log");

const outputMax = await renderLayoutSnapshot({
  logMaximized: true,
  orientation: "Log maximizado",
  workspaceLabel: "LOG_MAX",
  panelTitle: "Painel de Log",
});

assert.ok(outputMax.includes("Log maximizado"), "Deve alternar orientação ao maximizar log");
assert.ok(outputMax.includes("Linha 1"), "Deve manter log visível ao maximizar");
assert.ok(/\u001b\[(31|91)m/.test(outputMax), "Deve colorir erro em vermelho");

console.log("tui_stack_overflow_test: OK");
