import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { LogEntry } from "../logger.js";

export type LoggerPanelProps = {
  entries: LogEntry[];
  height: number;
};

const applyAnsiColor = (text: string, colorCode: number): string => {
  return `\u001b[${colorCode}m${text}\u001b[0m`;
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
      {visibleEntries.map((entry) => {
        const line = `[${entry.timestamp}] ${entry.message}`;
        const output = entry.level === "error" ? applyAnsiColor(line, 31) : line;
        return (
          <Text key={entry.id}>
            {output}
          </Text>
        );
      })}
    </Box>
  );
};
