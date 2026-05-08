import assert from "node:assert/strict";
import React from "react";
import { Box, Text, render } from "ink";
import { PassThrough } from "node:stream";
import { Layout } from "../src/modules/git/tui/layout.js";
import { createLogEntry } from "../src/modules/git/tui/logger.js";

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

let output = "";
stdout.on("data", (chunk) => {
  output += chunk.toString();
});

const waitNextTick = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const logs = [
  createLogEntry("Evento inicial"),
  createLogEntry("Falha ao autenticar", "error"),
];

const tree = React.createElement(
  Layout,
  {
    title: "PAJÉ - Teste TUI",
    orientation: "Use Enter para confirmar",
    logEntries: logs,
    logMaximized: false,
    onToggleLog: () => undefined,
    children: React.createElement(
      Box,
      null,
      React.createElement(Text, null, "Conteúdo")
    ),
  }
);

const { unmount } = render(React.createElement(React.Fragment, null, tree), {
  stdout: stdout as unknown as NodeJS.WriteStream,
  stdin: stdin as unknown as NodeJS.ReadStream,
});
await waitNextTick();

assert.ok(output.includes("PAJÉ - Teste TUI"), "Deve renderizar o título no layout");
assert.ok(output.includes("Use Enter para confirmar"), "Deve renderizar a orientação");
assert.ok(output.includes("Evento inicial"), "Deve renderizar entradas do log");
assert.ok(output.includes("Falha ao autenticar"), "Deve renderizar mensagens de erro");
assert.ok(/\u001b\[(31|91)m/.test(output), "Deve colorir erro em vermelho");

unmount();

console.log("tui_render_test: OK");
