import assert from "node:assert/strict";
import blessed from "blessed";
import { renderRepositoryTree } from "../src/modules/git/tui.js";

const originalScreen = blessed.screen;

let lastScreen: { _keys: Record<string, () => void> } | null = null;

const fakeScreen = () => {
  const keys: Record<string, () => void> = {};
  const screen = {
    rows: 24,
    height: 24,
    render: () => undefined,
    destroy: () => undefined,
    key: (names: string[] | string, handler: () => void) => {
      const list = Array.isArray(names) ? names : [names];
      list.forEach((name) => {
        keys[name] = handler;
      });
    },
    _keys: keys,
  } as unknown as any;
  lastScreen = screen as unknown as { _keys: Record<string, () => void> };
  return screen;
};

const fakeBox = () => ({}) as unknown as any;

const fakeList = () => {
  const list = {
    selected: 0,
    setItems: () => undefined,
    select: () => undefined,
    focus: () => undefined,
    on: (event: string, handler: () => void) => {
      if (event === "select") {
        handler();
      }
    },
  } as unknown as any;
  return list;
};

(blessed as any).screen = () => fakeScreen();
(blessed as any).box = () => fakeBox();
(blessed as any).list = () => fakeList();

const nodes = [{ id: "1", label: "Repo", selected: false } as any];
const toggleCalls: string[] = [];
const resultPromise = renderRepositoryTree(nodes, (id) => toggleCalls.push(id));
setTimeout(() => {
  lastScreen?._keys?.enter?.();
}, 0);
const result = await resultPromise;

assert.ok(result.nodes.length === 1, "Deve retornar nós informados");
assert.ok(typeof result.confirmed === "boolean", "Deve retornar resultado confirmado");

(blessed as any).screen = originalScreen;

console.log("tui_render_test: OK");
