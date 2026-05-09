import React from "react";
import { Box } from "ink";

export type WorkspaceProps = {
  height: number;
  children: React.ReactNode;
};

export const Workspace: React.FC<WorkspaceProps> = ({ height, children }) => {
  if (height <= 0) {
    return null;
  }
  return (
    <Box flexDirection="column" width="100%" height={height} flexGrow={1}>
      {children}
    </Box>
  );
};
