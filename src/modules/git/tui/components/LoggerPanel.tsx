import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { LogEntry } from "../logger.js";

export type LoggerPanelProps = {
  entries: LogEntry[];
  height: number;
};

export const LoggerPanel: React.FC<LoggerPanelProps> = ({ entries, height }) => {
  const visibleEntries = useMemo(() => {
    if (height <= 0) {
      return [];
    }
    return entries.slice(Math.max(0, entries.length - height));
  }, [entries, height]);

  return (
    <Box flexDirection="column" width="100%" height={height}>
      {visibleEntries.map((entry) => (
        <Text key={entry.id} color={entry.level === "error" ? "red" : undefined}>
          [{entry.timestamp}] {entry.message}
        </Text>
      ))}
    </Box>
  );
};
