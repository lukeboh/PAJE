import blessed from "blessed";
import { GitLabTreeNode } from "./types.js";
import { TuiSession } from "./tuiSession.js";

export type TuiSelectionResult = {
  confirmed: boolean;
  nodes: GitLabTreeNode[];
};

type BlessedTreeNode = {
  name: string;
  extended?: boolean;
  children?: Record<string, BlessedTreeNode>;
};

type FlatTreeItem = {
  id: string;
  label: string;
};

export const buildBlessedTreeNode = (node: GitLabTreeNode): BlessedTreeNode => {
  const indicator = node.partiallySelected ? "[~]" : node.selected ? "[x]" : "[ ]";
  const label = `${indicator} ${node.label}`;

  const blessedNode: BlessedTreeNode = {
    name: label,
    extended: true,
  };

  if (node.children && node.children.length > 0) {
    blessedNode.children = {};
    node.children.forEach((child: GitLabTreeNode) => {
      if (blessedNode.children) {
        blessedNode.children[child.id] = buildBlessedTreeNode(child);
      }
    });
  }

  return blessedNode;
};

export const renderRepositoryTree = async (
  nodes: GitLabTreeNode[],
  onToggle: (nodeId: string) => void,
  session?: TuiSession
): Promise<TuiSelectionResult> => {
  return new Promise((resolve) => {
    const screen = session
      ? (session as any).screen
      : blessed.screen({
          smartCSR: true,
          fullUnicode: true,
          title: "PAJÉ - Sincronização Git",
        });

    const screenRows = Number((screen as any).rows ?? (screen as any).height ?? 24);
    const footerHeight = Math.max(4, Math.floor(screenRows * 0.2));
    const listHeight = Math.max(4, screenRows - footerHeight);

    const overlay = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
    });

    const list = blessed.list({
      parent: overlay,
      border: "line",
      width: "100%",
      height: listHeight,
      top: 0,
      left: 0,
      keys: true,
      vi: true,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: " ",
        track: { bg: "gray" },
        style: { bg: "blue" },
      },
      style: { selected: { bg: "blue" } },
    });

    const footer = blessed.box({
      parent: overlay,
      label: "Orientações",
      height: footerHeight,
      width: "100%",
      bottom: 0,
      left: 0,
      border: "line",
      content:
        "Use ↑/↓ e PgUp/PgDn para navegar | Espaço para selecionar | Enter para confirmar | Esc para cancelar",
    });

    let flatItems: FlatTreeItem[] = [];

    const flattenTree = (items: GitLabTreeNode[], depth = 0): FlatTreeItem[] => {
      const output: FlatTreeItem[] = [];
      items.forEach((node) => {
        const indicator = node.partiallySelected ? "[~]" : node.selected ? "[x]" : "[ ]";
        const indent = "  ".repeat(depth);
        output.push({ id: node.id, label: `${indent}${indicator} ${node.label}` });
        if (node.children && node.children.length > 0) {
          output.push(...flattenTree(node.children, depth + 1));
        }
      });
      return output;
    };

    const refreshList = (): void => {
      flatItems = flattenTree(nodes);
      const labels = flatItems.map((item) => item.label);
      list.setItems(labels.length > 0 ? labels : ["(Nenhum repositório encontrado)"]);
      if (labels.length > 0) {
        list.select(0);
      }
      screen.render();
    };

    const toggleSelectedIndex = (index: number | undefined): void => {
      if (typeof index !== "number") {
        return;
      }
      const selected = flatItems[index];
      if (!selected) {
        return;
      }
      onToggle(selected.id);
      refreshList();
      list.select(index);
    };

    list.on("select", (_item: unknown, index: number) => {
      toggleSelectedIndex(index);
    });

    screen.key(["space"], () => {
      const index = typeof list.selected === "number" ? list.selected : undefined;
      toggleSelectedIndex(index);
    });

    screen.key(["enter"], () => {
      if (!session) {
        screen.destroy();
      }
      resolve({ confirmed: true, nodes });
    });

    screen.key(["escape", "q", "C-c"], () => {
      if (!session) {
        screen.destroy();
      }
      resolve({ confirmed: false, nodes });
    });

    refreshList();
    list.focus();
    screen.render();
  });
};
