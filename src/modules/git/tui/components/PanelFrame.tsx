import React from "react";
import { Box, Text } from "ink";

export type PanelFrameProps = {
  title: string;
  height: number;
  children: React.ReactNode;
};

export const PanelFrame: React.FC<PanelFrameProps> = ({ title, height, children }) => {
  if (height <= 0) {
    return null;
  }

  return (
    <Box flexDirection="column" width="100%" height={height} borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="cyan">{title}</Text>
      <Box flexDirection="column" width="100%" flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
};
