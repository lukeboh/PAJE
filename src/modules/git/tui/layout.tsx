import React from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import type { LogEntry } from "./logger.js";
import { LayoutMetricsProvider } from "./layoutContext.js";
import { LoggerPanel } from "./components/LoggerPanel.js";
import { OrientationBar } from "./components/OrientationBar.js";
import { TitleBar } from "./components/TitleBar.js";
import { Workspace } from "./components/Workspace.js";

export type LayoutProps = {
  title: string;
  breadcrumbs?: string[];
  orientation: string;
  logEntries: LogEntry[];
  logMaximized: boolean;
  onToggleLog: () => void;
  onEscape?: () => void;
  onCtrlC?: () => void;
  children: React.ReactNode;
};

const formatHeaderLeft = (title: string, breadcrumbs?: string[]): string => {
  if (!breadcrumbs || breadcrumbs.length === 0) {
    return title;
  }
  return `${title} > ${breadcrumbs.join(" > ")}`;
};

export const Layout: React.FC<LayoutProps> = ({
  title,
  breadcrumbs,
  orientation,
  logEntries,
  logMaximized,
  onToggleLog,
  onEscape,
  onCtrlC,
  children,
}) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;
  const logHeight = logMaximized ? Math.max(3, terminalHeight - 2) : Math.max(3, Math.floor(terminalHeight * 0.15));
  const workspaceHeight = logMaximized ? 0 : Math.max(4, terminalHeight - 2 - logHeight);

  useInput((_input, key) => {
    if (key.escape) {
      onEscape?.();
    }
    if (key.f12) {
      onToggleLog();
    }
    if (key.ctrl && key.c) {
      onCtrlC?.();
      exit();
    }
  });

  const headerLeft = formatHeaderLeft(title, breadcrumbs);

  return (
    <LayoutMetricsProvider value={{ workspaceHeight, logHeight }}>
      <Box flexDirection="column" width="100%" height={terminalHeight}>
        <TitleBar left={headerLeft} right="PAJÉ" />
        <Box flexDirection="column" width="100%" height={terminalHeight - 1}>
          <Workspace height={workspaceHeight}>{children}</Workspace>
          <OrientationBar message={orientation} />
          <LoggerPanel entries={logEntries} height={logHeight} />
        </Box>
      </Box>
    </LayoutMetricsProvider>
  );
};
