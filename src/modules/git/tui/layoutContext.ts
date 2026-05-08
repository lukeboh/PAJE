import React, { createContext, useContext } from "react";

export type LayoutMetrics = {
  workspaceHeight: number;
  logHeight: number;
};

const LayoutMetricsContext = createContext<LayoutMetrics>({
  workspaceHeight: 0,
  logHeight: 0,
});

export const LayoutMetricsProvider = LayoutMetricsContext.Provider;

export const useLayoutMetrics = (): LayoutMetrics => {
  return useContext(LayoutMetricsContext);
};
