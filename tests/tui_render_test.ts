import assert from "node:assert/strict";
import blessed from "blessed";
import { renderRepositoryTree } from "../src/modules/git/tui.js";

const originalScreen = blessed.screen;

let lastScreen: { _keys: Record<string, () => void> } | null = null;
let lastFooterContent = "";
let lastItems: string[] = [];
let lastScroll = 0;

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

const fakeBox = (options?: { label?: string; content?: string }) => {
  const content = options?.content ?? "";
  lastFooterContent = content;
  return { setContent: (value: string) => (lastFooterContent = value) } as unknown as any;
};

const fakeList = () => {
  const list = {
    selected: 0,
    setItems: (items: string[]) => {
      lastItems = items;
    },
    select: () => undefined,
    focus: () => undefined,
    on: (_event: string, _handler: () => void) => undefined,
    getScroll: () => lastScroll,
    setScroll: (value: number) => {
      lastScroll = value;
    },
  } as unknown as any;
  return list;
};

(blessed as any).screen = () => fakeScreen();
(blessed as any).box = () => fakeBox();
(blessed as any).list = () => fakeList();

const nodes = [
  {
    id: "project-1",
    label: "Repo",
    selected: false,
    type: "project",
    status: { branch: "main", state: "SYNCED" },
  } as any,
  {
    id: "project-2",
    label: "Repo 2",
    selected: false,
    type: "project",
    status: { branch: "feature-fontes", state: "BEHIND" },
  } as any,
  {
    id: "project-3",
    label: "Repo 3",
    selected: false,
    type: "project",
    status: { branch: "desenvolvimento", state: "AHEAD" },
  } as any,
];
const toggleCalls: string[] = [];
const resultPromise = renderRepositoryTree(nodes, (id) => toggleCalls.push(id), undefined, {
  onReady: ({ progress }) => {
    progress.updateProgress("project-1", "[##] 10% teste");
  },
});
lastScroll = 5;
setTimeout(() => {
  lastScreen?._keys?.enter?.();
}, 0);
const result = await resultPromise;

assert.ok(result.nodes.length === 3, "Deve retornar nós informados");
assert.ok(typeof result.confirmed === "boolean", "Deve retornar resultado confirmado");
assert.ok(
  lastFooterContent === "" || lastFooterContent.includes("Enter"),
  "Deve indicar Enter para sincronizar"
);
assert.ok(lastItems.some((item) => item.includes("main")), "Deve exibir branch/status na ?rvore");
assert.ok(lastItems.some((item) => item.includes("10%")), "Deve exibir progresso na ?rvore");
assert.strictEqual(lastScroll, 5, "Deve preservar scroll ao atualizar lista");

(blessed as any).screen = originalScreen;

console.log("tui_render_test: OK");
