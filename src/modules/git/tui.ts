import blessed from "blessed";
import blessedContrib from "blessed-contrib";
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

const buildBlessedTreeNode = (node: GitLabTreeNode): BlessedTreeNode => {
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
    const screen = session ? (session as any).screen : blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      title: "PAJÉ - Sincronização Git",
    });

    const treeFactory = (blessed as any).tree ?? (blessedContrib as any).tree;
    if (!treeFactory) {
      throw new Error("Widget tree não disponível. Verifique a dependência blessed-contrib.");
    }
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

    const footer = blessed.box({
      parent: screen,
      label: "Orientações",
      height: footerHeight,
      width: "100%",
      bottom: 0,
      border: "line",
      content: "Use ↑/↓ para navegar | Espaço para selecionar | Enter para confirmar | Esc para cancelar",
    });

    const refreshTree = (): void => {
      const root: BlessedTreeNode = {
        name: "root",
        extended: true,
        children: {},
      };
      nodes.forEach((node: GitLabTreeNode) => {
        if (root.children) {
          root.children[node.id] = buildBlessedTreeNode(node);
        }
      });
      tree.setData(root);
      screen.render();
    };

    tree.on("select", (item: any) => {
      const idMatch = Object.keys(item.parent?.children ?? {}).find(
        (key) => item.parent.children[key] === item
      );
      if (idMatch) {
        onToggle(idMatch);
        refreshTree();
      }
    });

    screen.key(["space"], () => {
      const selected = tree.getSelected();
      if (selected) {
        const idMatch = Object.keys(selected.parent?.children ?? {}).find(
          (key) => selected.parent.children[key] === selected
        );
        if (idMatch) {
          onToggle(idMatch);
          refreshTree();
        }
      }
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

    refreshTree();
    screen.render();
  });
};
