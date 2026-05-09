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

const LoggerPanelComponent: React.FC<LoggerPanelProps> = ({ entries, height }) => {
  const visibleEntries = useMemo(() => {
    if (height <= 0) {
      return [];
    }
    return entries.slice(-height);
  }, [entries, height]);

  const lines = useMemo(() => {
    return visibleEntries.map((entry) => {
      const line = `[${entry.timestamp}] ${entry.message}`;
      return {
        id: entry.id,
        output: entry.level === "error" ? applyAnsiColor(line, 31) : line,
      };
    });
  }, [visibleEntries]);

  return (
    <Box flexDirection="column" width="100%" height={height}>
      {lines.map((line) => (
        <Text key={line.id}>{line.output}</Text>
      ))}
    </Box>
  );
};

const isSameLogState = (prev: LoggerPanelProps, next: LoggerPanelProps): boolean => {
  if (prev.height !== next.height) {
    return false;
  }
  if (prev.entries.length !== next.entries.length) {
    return false;
  }
  const prevLast = prev.entries[prev.entries.length - 1];
  const nextLast = next.entries[next.entries.length - 1];
  return prevLast?.id === nextLast?.id;
};

export const LoggerPanel = React.memo(LoggerPanelComponent, isSameLogState);
