import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, render, useInput, useStdout } from "ink";
import type { Key } from "ink";
import { Layout } from "./tui/layout.js";
import { createLogEntry, type LogEntry } from "./tui/logger.js";
import type { GitLabTreeNode, RepoSyncStatus, RepoSyncState } from "./types.js";
import type { TuiSession } from "./tuiSession.js";

export type TuiSelectionResult = {
  confirmed: boolean;
  nodes: GitLabTreeNode[];
};

type FlatTreeItem = {
  id: string;
  depth: number;
  label: string;
  status?: RepoSyncStatus;
  progress?: string;
  selected: boolean;
  partiallySelected: boolean;
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

const renderStatusLabel = (status: RepoSyncStatus): { branch: string; branchColor?: string; state: string; stateColor?: string } => {
  const state = status.state.toLowerCase();
  const delta = status.delta ? ` ${status.delta}` : "";
  const branchColor = resolveBranchColor(status.branch);
  const stateColor = STATUS_COLOR[status.state];
  return {
    branch: status.branch,
    branchColor,
    state: `${state}${delta}`,
    stateColor,
  };
};

const flattenTree = (items: GitLabTreeNode[], progressMap: Map<string, ProgressSnapshot>, depth = 0): FlatTreeItem[] => {
  const output: FlatTreeItem[] = [];
  items.forEach((node) => {
    output.push({
      id: node.id,
      depth,
      label: node.label,
      status: node.status,
      progress: progressMap.get(node.id)?.text,
      selected: node.selected ?? false,
      partiallySelected: node.partiallySelected ?? false,
    });
    if (node.children && node.children.length > 0) {
      output.push(...flattenTree(node.children, progressMap, depth + 1));
    }
  });
  return output;
};

const computeMetrics = (terminalHeight: number, logMaximized: boolean): { workspaceHeight: number } => {
  const logHeight = logMaximized ? Math.max(3, terminalHeight - 2) : Math.max(3, Math.floor(terminalHeight * 0.15));
  const workspaceHeight = logMaximized ? 0 : Math.max(4, terminalHeight - 2 - logHeight);
  return { workspaceHeight };
};

const TreeRow: React.FC<{ item: FlatTreeItem; selected: boolean }> = (
  { item, selected }: { item: FlatTreeItem; selected: boolean }
) => {
  const indicator = item.partiallySelected ? "[~]" : item.selected ? "[x]" : "[ ]";
  const indent = "  ".repeat(item.depth);
  const statusLabel = item.status ? renderStatusLabel(item.status) : null;
  const progressLabel = item.progress ? ` ${item.progress}` : "";
  const textColor = selected ? "white" : undefined;
  const backgroundColor = selected ? "blue" : undefined;

  return (
    <Box flexDirection="row" width="100%" backgroundColor={backgroundColor}>
      <Text color={textColor}>
        {indent}
        {indicator} {item.label}
      </Text>
      {statusLabel && (
        <Text color={textColor}>
          {" "}[
          <Text color={statusLabel.branchColor ?? textColor}>{statusLabel.branch}</Text>
          {", "}
          <Text color={statusLabel.stateColor ?? textColor}>{statusLabel.state}</Text>]
        </Text>
      )}
      {progressLabel && <Text color={textColor}>{progressLabel}</Text>}
    </Box>
  );
};

const TreeList: React.FC<{
  items: FlatTreeItem[];
  selectedIndex: number;
  scrollOffset: number;
  workspaceHeight: number;
}> = (
  {
    items,
    selectedIndex,
    scrollOffset,
    workspaceHeight,
  }: {
    items: FlatTreeItem[];
    selectedIndex: number;
    scrollOffset: number;
    workspaceHeight: number;
  }
) => {
  const visibleCount = Math.max(1, workspaceHeight);
  const visibleItems = items.length > 0 ? items.slice(scrollOffset, scrollOffset + visibleCount) : [];

  if (items.length === 0) {
    return <Text>(Nenhum repositório encontrado)</Text>;
  }

  return (
    <Box flexDirection="column" width="100%">
      {visibleItems.map((item, index) => {
        const absoluteIndex = scrollOffset + index;
        return <TreeRow key={item.id} item={item} selected={absoluteIndex === selectedIndex} />;
      })}
    </Box>
  );
};

export type TuiTreeProgress = {
  updateProgress: (nodeId: string, text: string) => void;
  updateStatus: (nodeId: string, status: RepoSyncStatus) => void;
  clearProgress: (nodeId: string) => void;
};

export const renderRepositoryTree = async (
  nodes: GitLabTreeNode[],
  onToggle: (nodeId: string) => void,
  _session?: TuiSession,
  options?: {
    title?: string;
    footer?: string;
    header?: string;
    onReady?: (handlers: {
      render: () => void;
      progress: TuiTreeProgress;
      log: {
        append: (message: string, level?: "info" | "warn" | "error") => void;
        setOrientation: (message: string) => void;
      };
    }) => void;
  }
): Promise<TuiSelectionResult> => {
  return new Promise((resolve) => {
    const App: React.FC = () => {
      const { stdout } = useStdout();
      const terminalHeight = stdout?.rows ?? 24;
      const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
      const [logMaximized, setLogMaximized] = useState(false);
      const [orientation, setOrientation] = useState(
        options?.footer ??
          "Use ↑/↓ e PgUp/PgDn para navegar | Espaço para selecionar | Enter para sincronizar | Esc para cancelar | Ctrl+F11 para ampliar área de trabalho | Ctrl+F12 para ampliar log"
      );
      const [version, setVersion] = useState(0);
      const progressMapRef = useRef<Map<string, ProgressSnapshot>>(new Map());
      const [selectedIndex, setSelectedIndex] = useState(0);
      const [scrollOffset, setScrollOffset] = useState(0);
      const resolvedRef = useRef(false);

      const { workspaceHeight } = computeMetrics(terminalHeight, logMaximized);
      const visibleCount = Math.max(1, workspaceHeight);

      const items = useMemo(() => flattenTree(nodes, progressMapRef.current), [nodes, version]);

      useEffect(() => {
        if (items.length === 0) {
          setSelectedIndex(0);
          setScrollOffset(0);
          return;
        }
        if (selectedIndex >= items.length) {
          setSelectedIndex(items.length - 1);
        }
        const maxScroll = Math.max(0, items.length - visibleCount);
        if (scrollOffset > maxScroll) {
          setScrollOffset(maxScroll);
        }
      }, [items.length, visibleCount, selectedIndex, scrollOffset]);

      const ensureVisible = useCallback(
        (nextIndex: number) => {
          if (nextIndex < scrollOffset) {
            setScrollOffset(nextIndex);
            return;
          }
          if (nextIndex >= scrollOffset + visibleCount) {
            setScrollOffset(Math.max(0, nextIndex - visibleCount + 1));
          }
        },
        [scrollOffset, visibleCount]
      );

      const commitResolve = useCallback(
        (confirmed: boolean) => {
          if (resolvedRef.current) {
            return;
          }
          resolvedRef.current = true;
          resolve({ confirmed, nodes });
        },
        [nodes]
      );

      const toggleSelected = useCallback(() => {
        const item = items[selectedIndex];
        if (!item) {
          return;
        }
        onToggle(item.id);
        setVersion((value: number) => value + 1);
      }, [items, selectedIndex, onToggle]);

      useInput((input: string, key: Key) => {
        if (key.upArrow) {
          const nextIndex = Math.max(0, selectedIndex - 1);
          setSelectedIndex(nextIndex);
          ensureVisible(nextIndex);
        }
        if (key.downArrow) {
          const nextIndex = Math.min(items.length - 1, selectedIndex + 1);
          setSelectedIndex(nextIndex);
          ensureVisible(nextIndex);
        }
        if (key.pageUp) {
          const nextIndex = Math.max(0, selectedIndex - visibleCount);
          setSelectedIndex(nextIndex);
          ensureVisible(nextIndex);
        }
        if (key.pageDown) {
          const nextIndex = Math.min(items.length - 1, selectedIndex + visibleCount);
          setSelectedIndex(nextIndex);
          ensureVisible(nextIndex);
        }
        if (key.home) {
          setSelectedIndex(0);
          setScrollOffset(0);
        }
        if (key.end) {
          const lastIndex = Math.max(0, items.length - 1);
          setSelectedIndex(lastIndex);
          setScrollOffset(Math.max(0, lastIndex - visibleCount + 1));
        }
        if (input === " ") {
          toggleSelected();
        }
        if (key.return) {
          commitResolve(true);
        }
        if (key.escape) {
          commitResolve(false);
        }
      });

      useEffect(() => {
        options?.onReady?.({
          render: () => setVersion((value: number) => value + 1),
          progress: {
            updateProgress: (nodeId: string, text: string) => {
              progressMapRef.current.set(nodeId, { text });
              setVersion((value: number) => value + 1);
            },
            updateStatus: (nodeId: string, status: RepoSyncStatus) => {
              const visit = (node: GitLabTreeNode): boolean => {
                if (node.id === nodeId) {
                  node.status = status;
                  return true;
                }
                return (node.children ?? []).some((child) => visit(child));
              };
              nodes.some((node) => visit(node));
              setVersion((value: number) => value + 1);
            },
            clearProgress: (nodeId: string) => {
              progressMapRef.current.delete(nodeId);
              setVersion((value: number) => value + 1);
            },
          },
          log: {
            append: (message: string, level: "info" | "warn" | "error" = "info") => {
              setLogEntries((current: LogEntry[]) => [...current, createLogEntry(message, level)]);
            },
            setOrientation: (message: string) => setOrientation(message),
          },
        });
      }, [options, nodes]);

      const headerTitle = options?.header ?? options?.title ?? "PAJÉ - Sincronização Git";

      return (
        <Layout
          title={headerTitle}
          orientation={orientation}
          logEntries={logEntries}
          onEscape={() => commitResolve(false)}
        >
          <TreeList
            items={items}
            selectedIndex={selectedIndex}
            scrollOffset={scrollOffset}
            workspaceHeight={workspaceHeight}
          />
        </Layout>
      );
    };

    render(<App />);
  });
};
