import React from "react";
import { Box, Text } from "ink";

export type TitleBarProps = {
  left: string;
  right: string;
};

const TitleBarComponent: React.FC<TitleBarProps> = ({ left, right }) => {
  return (
    <Box flexDirection="row" height={1} width="100%" justifyContent="space-between">
      <Text>{left}</Text>
      <Text>{right}</Text>
    </Box>
  );
};

export const TitleBar = React.memo(TitleBarComponent);
