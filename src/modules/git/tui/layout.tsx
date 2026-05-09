import React, { useMemo } from "react";
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
  const headerLeft = useMemo(() => formatHeaderLeft(title, breadcrumbs), [title, breadcrumbs]);
  const workspaceLegend = workspaceLabel ?? title;

  const layoutMetrics = useMemo(() => {
    const titleHeight = 1;
    const orientationHeight = 1;
    const containerHeight = Math.max(0, terminalHeight - titleHeight);
    const availablePanelsHeight = Math.max(0, containerHeight - orientationHeight);
    const FRAME_DECORATION = 2;
    const FRAME_HEADER_HEIGHT = 1;
    const MIN_CONTENT_HEIGHT = 2;
    const MIN_FRAME_HEIGHT = FRAME_DECORATION + FRAME_HEADER_HEIGHT + MIN_CONTENT_HEIGHT;

    const computeFrameHeight = (total: number): number => {
      if (total <= 0) {
        return 0;
      }
      return Math.min(availablePanelsHeight, Math.max(MIN_FRAME_HEIGHT, total));
    };

    const desiredLogFrame = panelState.logMaximized
      ? availablePanelsHeight
      : panelState.workspaceMaximized
      ? Math.min(FRAME_DECORATION, availablePanelsHeight)
      : Math.max(MIN_FRAME_HEIGHT, Math.round(availablePanelsHeight * 0.2));

    let logFrameHeight = computeFrameHeight(desiredLogFrame);
    let workspaceFrameHeight = panelState.logMaximized ? 0 : availablePanelsHeight - logFrameHeight;

    if (panelState.workspaceMaximized) {
      workspaceFrameHeight = computeFrameHeight(availablePanelsHeight);
      logFrameHeight = Math.max(0, availablePanelsHeight - workspaceFrameHeight);
    }

    if (!panelState.logMaximized && !panelState.workspaceMaximized) {
      if (workspaceFrameHeight > 0 && workspaceFrameHeight < MIN_FRAME_HEIGHT && availablePanelsHeight >= MIN_FRAME_HEIGHT * 2) {
        const deficit = MIN_FRAME_HEIGHT - workspaceFrameHeight;
        workspaceFrameHeight += deficit;
        logFrameHeight = Math.max(0, logFrameHeight - deficit);
      }
      if (logFrameHeight > 0 && logFrameHeight < MIN_FRAME_HEIGHT && availablePanelsHeight >= MIN_FRAME_HEIGHT * 2) {
        const deficit = MIN_FRAME_HEIGHT - logFrameHeight;
        logFrameHeight += deficit;
        workspaceFrameHeight = Math.max(0, workspaceFrameHeight - deficit);
      }
    }

    if (logFrameHeight < 0) {
      logFrameHeight = 0;
    }
    if (workspaceFrameHeight < 0) {
      workspaceFrameHeight = 0;
    }

    const normalize = logFrameHeight + workspaceFrameHeight;
    if (normalize > availablePanelsHeight && normalize > 0) {
      const scale = availablePanelsHeight / normalize;
      logFrameHeight = Math.max(FRAME_DECORATION, Math.floor(logFrameHeight * scale));
      workspaceFrameHeight = Math.max(FRAME_DECORATION, Math.floor(workspaceFrameHeight * scale));
    }

    if (panelState.logMaximized) {
      logFrameHeight = availablePanelsHeight;
      workspaceFrameHeight = 0;
    }
    if (panelState.workspaceMaximized) {
      workspaceFrameHeight = availablePanelsHeight;
      logFrameHeight = 0;
    }

    const computeContentHeight = (frameHeight: number): number => {
      if (frameHeight <= 0) {
        return 0;
      }
      const interiorHeight = frameHeight - (FRAME_DECORATION + FRAME_HEADER_HEIGHT);
      return Math.max(0, interiorHeight);
    };

    const workspaceContentHeight = computeContentHeight(workspaceFrameHeight);
    const logContentHeight = computeContentHeight(logFrameHeight);

    return {
      containerHeight,
      workspaceFrameHeight,
      logFrameHeight,
      workspaceContentHeight,
      logContentHeight,
    };
  }, [terminalHeight, panelState.logMaximized, panelState.workspaceMaximized]);

  useInput((input = "", key) => {
    const lower = typeof input === "string" ? input.toLowerCase() : "";
    const metaKey = (key as { meta?: boolean }).meta ?? false;
    if (key.escape) {
      onEscape?.();
    }
    const isPlainLetter = input.length === 1 && !key.ctrl && !metaKey;
    if (isPlainLetter && lower === "l") {
      panelState.toggleLog();
      return;
    }
    if (isPlainLetter && lower === "w") {
      panelState.toggleWorkspace();
      return;
    }
    if (key.ctrl && input === "c") {
      onCtrlC?.();
      exit();
    }
  });

  return (
    <PanelStateProvider value={panelState}>
      <LayoutMetricsProvider
        value={{
          workspaceHeight: layoutMetrics.workspaceContentHeight,
          logHeight: layoutMetrics.logContentHeight,
        }}
      >
        <Box flexDirection="column" width="100%" height={terminalHeight}>
          <TitleBar left={headerLeft} right="PAJÉ" />
          <Box flexDirection="column" width="100%" height={layoutMetrics.containerHeight}>
            <PanelFrame title={workspaceLegend} height={layoutMetrics.workspaceFrameHeight}>
              <Workspace height={layoutMetrics.workspaceContentHeight}>{children}</Workspace>
            </PanelFrame>
            <OrientationBar message={orientation} />
            <PanelFrame title="Log" height={layoutMetrics.logFrameHeight}>
              <LoggerPanel entries={logEntries} height={layoutMetrics.logContentHeight} />
            </PanelFrame>
          </Box>
        </Box>
      </LayoutMetricsProvider>
    </PanelStateProvider>
  );
};
