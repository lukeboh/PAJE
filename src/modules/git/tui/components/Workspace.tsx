import React from "react";
import { Box } from "ink";

export type WorkspaceProps = {
  height: number;
  children: React.ReactNode;
};

const WorkspaceComponent: React.FC<WorkspaceProps> = ({ height, children }) => {
  if (height <= 0) {
    return null;
  }
  return (
    <Box flexDirection="column" width="100%" height={height} flexGrow={1}>
      {children}
    </Box>
  );
};

export const Workspace = React.memo(
  WorkspaceComponent,
  (prev, next) => prev.height === next.height && prev.children === next.children
);
