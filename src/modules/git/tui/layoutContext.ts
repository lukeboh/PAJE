import React, { createContext, useContext, useMemo, useState } from "react";

export type LayoutMetrics = {
  workspaceHeight: number;
  logHeight: number;
};

export type PanelState = {
  logMaximized: boolean;
  workspaceMaximized: boolean;
  toggleLog: () => void;
  toggleWorkspace: () => void;
  resetPanels: () => void;
};

const LayoutMetricsContext = createContext<LayoutMetrics>({
  workspaceHeight: 0,
  logHeight: 0,
});

const PanelStateContext = createContext<PanelState>({
  logMaximized: false,
  workspaceMaximized: false,
  toggleLog: () => undefined,
  toggleWorkspace: () => undefined,
  resetPanels: () => undefined,
});

export const LayoutMetricsProvider = LayoutMetricsContext.Provider;
export const PanelStateProvider = PanelStateContext.Provider;

export const useLayoutMetrics = (): LayoutMetrics => {
  return useContext(LayoutMetricsContext);
};

export const usePanelState = (): PanelState => {
  return useContext(PanelStateContext);
};

export type PanelStateInitial = {
  logMaximized?: boolean;
  workspaceMaximized?: boolean;
};

export const usePanelStateController = (initial?: PanelStateInitial): PanelState => {
  const [logMaximized, setLogMaximized] = useState(Boolean(initial?.logMaximized));
  const [workspaceMaximized, setWorkspaceMaximized] = useState(Boolean(initial?.workspaceMaximized));

  const toggleLog = (): void => {
    setLogMaximized((current) => {
      const next = !current;
      if (next) {
        setWorkspaceMaximized(false);
      }
      return next;
    });
  };

  const toggleWorkspace = (): void => {
    setWorkspaceMaximized((current) => {
      const next = !current;
      if (next) {
        setLogMaximized(false);
      }
      return next;
    });
  };

  const resetPanels = (): void => {
    setLogMaximized(false);
    setWorkspaceMaximized(false);
  };

  return useMemo(
    () => ({
      logMaximized,
      workspaceMaximized,
      toggleLog,
      toggleWorkspace,
      resetPanels,
    }),
    [logMaximized, workspaceMaximized]
  );
};
