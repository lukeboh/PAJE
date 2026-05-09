import React from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import type { LogEntry } from "./logger.js";
import { LayoutMetricsProvider, PanelStateProvider, usePanelStateController } from "./layoutContext.js";
import { LoggerPanel } from "./components/LoggerPanel.js";
import { OrientationBar } from "./components/OrientationBar.js";
import { TitleBar } from "./components/TitleBar.js";
import { Workspace } from "./components/Workspace.js";
import { PanelFrame } from "./components/PanelFrame.js";

export type LayoutProps = {
  title: string;
  breadcrumbs?: string[];
  orientation: string;
  logEntries: LogEntry[];
  workspaceLabel?: string;
  initialLogMaximized?: boolean;
  initialWorkspaceMaximized?: boolean;
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
  workspaceLabel,
  initialLogMaximized,
  initialWorkspaceMaximized,
  onEscape,
  onCtrlC,
  children,
}) => {
  const panelState = usePanelStateController({
    logMaximized: initialLogMaximized,
    workspaceMaximized: initialWorkspaceMaximized,
  });
  const { exit } = useApp();
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;
  const headerLeft = formatHeaderLeft(title, breadcrumbs);
  const workspaceLegend = workspaceLabel ?? title;

  const reservedRows = 2;
  const contentRows = Math.max(4, terminalHeight - reservedRows);
  const logPanelHeight = panelState.logMaximized
    ? contentRows
    : Math.max(5, Math.floor(contentRows * 0.15));
  const workspacePanelHeight = panelState.logMaximized
    ? 0
    : panelState.workspaceMaximized
    ? contentRows
    : Math.max(6, contentRows - logPanelHeight);

  const logHeight = logPanelHeight;
  const workspaceHeight = workspacePanelHeight;

  useInput((input, key) => {
    const keyPress = key as { f11?: boolean; f12?: boolean };
    if (key.escape) {
      onEscape?.();
    }
    if (key.ctrl && keyPress.f12) {
      panelState.toggleLog();
    }
    if (key.ctrl && keyPress.f11) {
      panelState.toggleWorkspace();
    }
    if (key.ctrl && input === "c") {
      onCtrlC?.();
      exit();
    }
  });

  return (
    <PanelStateProvider value={panelState}>
      <LayoutMetricsProvider value={{ workspaceHeight, logHeight }}>
        <Box flexDirection="column" width="100%" height={terminalHeight}>
          <TitleBar left={headerLeft} right="PAJÉ" />
          <Box flexDirection="column" width="100%" height={terminalHeight - 1}>
            <PanelFrame title={workspaceLegend} height={workspaceHeight}>
              <Workspace height={Math.max(0, workspaceHeight - 3)}>{children}</Workspace>
            </PanelFrame>
            <OrientationBar message={orientation} />
            <PanelFrame title="Log" height={logHeight}>
              <LoggerPanel entries={logEntries} height={Math.max(0, logHeight - 3)} />
            </PanelFrame>
          </Box>
        </Box>
      </LayoutMetricsProvider>
    </PanelStateProvider>
  );
};
