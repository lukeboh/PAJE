import assert from "node:assert";
import blessed from "blessed";
import blessedContrib from "blessed-contrib";

const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  title: "PAJÉ - Teste de Stack Overflow",
});

const treeFactory = (blessed as any).tree ?? (blessedContrib as any).tree;
assert.ok(treeFactory, "treeFactory deve existir");

const screenRows = (screen as any).rows ?? 24;
const footerHeight = Math.max(4, Math.floor(screenRows * 0.2));
const treeHeight = Math.max(4, screenRows - footerHeight);

const tree = treeFactory({
  parent: screen,
  border: "line",
  width: "100%",
  height: treeHeight,
  top: 0,
  vi: true,
  keys: false,
  scrollable: true,
});

const root = {
  name: "root",
  extended: true,
  children: {
    "1": { name: "[ ] grupo-a", extended: true, children: { "1-1": { name: "[ ] projeto-a" } } },
  },
};

try {
  tree.setData(root);
  screen.render();
} finally {
  screen.destroy();
}

assert.ok(true, "Renderização concluída sem stack overflow");
console.log("tui_stack_overflow_test: OK");
