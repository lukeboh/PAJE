import React from "react";
import { Box, Text } from "ink";

export type OrientationBarProps = {
  message: string;
};

export const OrientationBar: React.FC<OrientationBarProps> = ({ message }) => {
  return (
    <Box flexDirection="row" width="100%" height={1}>
      <Text>{message}</Text>
    </Box>
  );
};
