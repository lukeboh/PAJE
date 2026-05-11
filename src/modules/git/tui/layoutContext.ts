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

export type ModalState = {
  modalOpen: boolean;
  toggleModal: () => void;
  closeModal: () => void;
};

export const useModalStateController = (): ModalState => {
  const [modalOpen, setModalOpen] = useState(false);

  const toggleModal = (): void => {
    setModalOpen((current) => !current);
  };

  const closeModal = (): void => {
    setModalOpen(false);
  };

  return useMemo(
    () => ({
      modalOpen,
      toggleModal,
      closeModal,
    }),
    [modalOpen]
  );
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

const ModalStateContext = createContext<ModalState>({
  modalOpen: false,
  toggleModal: () => undefined,
  closeModal: () => undefined,
});

export const LayoutMetricsProvider = LayoutMetricsContext.Provider;
export const PanelStateProvider = PanelStateContext.Provider;
export const ModalStateProvider = ModalStateContext.Provider;

export const useLayoutMetrics = (): LayoutMetrics => {
  return useContext(LayoutMetricsContext);
};

export const usePanelState = (): PanelState => {
  return useContext(PanelStateContext);
};

export const useLayoutModal = (): ModalState => {
  return useContext(ModalStateContext);
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
