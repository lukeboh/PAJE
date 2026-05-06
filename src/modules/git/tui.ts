import blessed from "blessed";
import { GitLabTreeNode, RepoSyncStatus, RepoSyncState } from "./types.js";
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

type ProgressSnapshot = {
  text?: string;
};

const STATUS_COLOR: Record<RepoSyncState, string> = {
  SYNCED: "green",
  BEHIND: "red",
  AHEAD: "blue",
  REMOTE: "yellow",
  EMPTY: "magenta",
  LOCAL: "red",
  UNCOMMITTED: "red",
};

const BRANCH_COLOR: Record<string, string> = {
  main: "cyan",
  master: "magenta",
  stable: "green",
  develop: "yellow",
  desenvolvimento: "yellow",
  feature: "magenta",
};

const resolveBranchColor = (branch: string): string | undefined => {
  const normalized = branch.trim().toLowerCase();
  if (normalized.startsWith("develop")) {
    return BRANCH_COLOR.develop;
  }
  if (normalized.startsWith("desenvolv")) {
    return BRANCH_COLOR.desenvolvimento;
  }
  if (normalized.startsWith("main")) {
    return BRANCH_COLOR.main;
  }
  if (normalized.startsWith("master")) {
    return BRANCH_COLOR.master;
  }
  if (normalized.startsWith("stable")) {
    return BRANCH_COLOR.stable;
  }
  if (normalized.startsWith("feature")) {
    return BRANCH_COLOR.feature;
  }
  return undefined;
};

const renderRepoStatus = (status: RepoSyncStatus): string => {
  const state = status.state.toLowerCase();
  const delta = status.delta ? ` ${status.delta}` : "";
  const branchColor = resolveBranchColor(status.branch);
  const stateColor = STATUS_COLOR[status.state];
  const branchLabel = branchColor ? `{${branchColor}-fg}${status.branch}{/${branchColor}-fg}` : status.branch;
  const stateLabel = stateColor ? `{${stateColor}-fg}${state}${delta}{/${stateColor}-fg}` : `${state}${delta}`;
  return `[${branchLabel}, ${stateLabel}]`;
};

const formatProgress = (text?: string): string => {
  if (!text) {
    return "";
  }
  return ` ${text}`;
};

export type TuiTreeProgress = {
  updateProgress: (nodeId: string, text: string) => void;
  updateStatus: (nodeId: string, status: RepoSyncStatus) => void;
  clearProgress: (nodeId: string) => void;
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
  session?: TuiSession,
  options?: {
    title?: string;
    footer?: string;
    header?: string;
    onReady?: (handlers: { render: () => void; progress: TuiTreeProgress }) => void;
  }
): Promise<TuiSelectionResult> => {
  return new Promise((resolve) => {
    const screen = session
      ? (session as any).screen
      : blessed.screen({
          smartCSR: true,
          fullUnicode: true,
          title: options?.title ?? "PAJ? - Sincroniza??o Git",
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

    const header = blessed.box({
      parent: overlay,
      top: 0,
      left: 0,
      width: "100%",
      height: 3,
      border: "line",
      content: options?.header ?? "PAJ? - Sincroniza??o Git",
    });

    const list = blessed.list({
      parent: overlay,
      border: "line",
      width: "100%",
      height: Math.max(4, listHeight - 3),
      top: 3,
      left: 0,
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      scrollable: true,
      alwaysScroll: false,
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
        options?.footer ??
        "Use ↑/↓ e PgUp/PgDn para navegar | Espaço para selecionar | Enter para sincronizar | Esc para cancelar",
      tags: true,
    });

    let flatItems: FlatTreeItem[] = [];
    const progressMap = new Map<string, ProgressSnapshot>();

    const flattenTree = (items: GitLabTreeNode[], depth = 0): FlatTreeItem[] => {
      const output: FlatTreeItem[] = [];
      items.forEach((node) => {
        const indicator = node.partiallySelected ? "[~]" : node.selected ? "[x]" : "[ ]";
        const indent = "  ".repeat(depth);
        const statusLabel = node.status ? ` ${renderRepoStatus(node.status)}` : "";
        const progressLabel = formatProgress(progressMap.get(node.id)?.text);
        output.push({
          id: node.id,
          label: `${indent}${indicator} ${node.label}${statusLabel}${progressLabel}`,
        });
        if (node.children && node.children.length > 0) {
          output.push(...flattenTree(node.children, depth + 1));
        }
      });
      return output;
    };

    let lastKnownIndex = 0;

    const refreshList = (preferredIndex?: number): void => {
      const selectedIndex = typeof preferredIndex === "number"
        ? preferredIndex
        : typeof list.selected === "number"
        ? list.selected
        : lastKnownIndex;
      const currentScroll = typeof (list as any).getScroll === "function" ? (list as any).getScroll() : undefined;
      const currentScrollPerc = typeof (list as any).getScrollPerc === "function" ? (list as any).getScrollPerc() : undefined;
      flatItems = flattenTree(nodes);
      const labels = flatItems.map((item) => item.label);
      list.setItems(labels.length > 0 ? labels : ["(Nenhum reposit?rio encontrado)"]);
      if (labels.length > 0) {
        const safeIndex = Math.min(Math.max(selectedIndex, 0), labels.length - 1);
        list.select(safeIndex);
        lastKnownIndex = safeIndex;
      }
      if (currentScroll !== undefined && typeof (list as any).setScroll === "function") {
        (list as any).setScroll(currentScroll);
      } else if (currentScrollPerc !== undefined && typeof (list as any).setScrollPerc === "function") {
        (list as any).setScrollPerc(currentScrollPerc);
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
      refreshList(index);
    };

    list.on("click", (_item: unknown, index: number) => {
      toggleSelectedIndex(index);
    });

    list.on("keypress", () => {
      if (typeof list.selected === "number") {
        lastKnownIndex = list.selected;
      }
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

    const updateProgress = (nodeId: string, text: string): void => {
      progressMap.set(nodeId, { text });
      refreshList();
    };

    const updateStatus = (nodeId: string, status: RepoSyncStatus): void => {
      const visit = (node: GitLabTreeNode): boolean => {
        if (node.id === nodeId) {
          node.status = status;
          return true;
        }
        return (node.children ?? []).some((child) => visit(child));
      };
      nodes.some((node) => visit(node));
      refreshList();
    };

    const clearProgress = (nodeId: string): void => {
      progressMap.delete(nodeId);
      refreshList();
    };

    options?.onReady?.({ render: refreshList, progress: { updateProgress, updateStatus, clearProgress } });

    refreshList();
    list.focus();
    screen.render();
  });
};
