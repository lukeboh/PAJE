import React, { useState } from "react";
import { Box, Text, render, useInput } from "ink";
import type { CommandParameters } from "../core/parameters.js";
import { Layout } from "./layout.js";
import { useModalStateController } from "./layoutContext.js";
import { createLogEntry, type LogEntry } from "./logger.js";

export type MenuItem = {
  label: string;
  command: string;
  description: string;
  shortcut: string;
};

type MenuDashboardProps = {
  items: MenuItem[];
  selectedIndex: number;
};

export const MenuDashboard: React.FC<MenuDashboardProps> = ({ items, selectedIndex }) => {
  const selectedItem = items[selectedIndex];
  const description = selectedItem?.description ?? "";
  const commandHint = selectedItem ? `Comando: paje ${selectedItem.command}` : "";

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="row" width="100%" justifyContent="space-between">
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box
              key={item.command}
              flexDirection="column"
              width="48%"
              borderStyle="round"
              borderColor={isSelected ? "cyan" : "gray"}
              paddingX={1}
            >
              <Text color={isSelected ? "cyan" : undefined}>{`${item.shortcut} — ${item.label}`}</Text>
              <Text dimColor>{`(${item.command})`}</Text>
            </Box>
          );
        })}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">Descrição</Text>
        <Text>{description}</Text>
        {commandHint && <Text dimColor>{commandHint}</Text>}
      </Box>
    </Box>
  );
};

export const MENU_ORIENTATION_MESSAGE =
  "S/G para selecionar | Setas para navegar | Enter para confirmar | Esc para sair | W para ampliar área de trabalho | L para ampliar log";

export const renderMenu = async (items: MenuItem[], parameters: CommandParameters[] = []): Promise<MenuItem | null> => {
  return new Promise((resolve) => {
    const resolveRef = { current: resolve };
    const resolvedRef = { current: false };
    const unmountRef: { current?: () => void } = {};

    const finalize = (result: MenuItem | null): void => {
      if (resolvedRef.current) {
        return;
      }
      resolvedRef.current = true;
      resolveRef.current(result);
      if (unmountRef.current) {
        setTimeout(() => unmountRef.current?.(), 0);
      }
    };

    const App: React.FC = () => {
      const [selectedIndex, setSelectedIndex] = useState(0);
      const [logEntries, setLogEntries] = useState<LogEntry[]>(() => [createLogEntry("Selecione uma funcionalidade")]);
      const modalState = useModalStateController();
      const parametersSnapshot = parameters;

      const appendLog = (message: string): void => {
        setLogEntries((current) => [...current, createLogEntry(message)]);
      };

      const clampIndex = (nextIndex: number): number => {
        if (items.length === 0) {
          return 0;
        }
        return Math.max(0, Math.min(items.length - 1, nextIndex));
      };

      useInput(
        (input, key) => {
          const normalizedInput = input.toLowerCase();
          if (normalizedInput === "p") {
            return;
          }
          if (normalizedInput === "s") {
            const selected = items[0];
            if (selected) {
              appendLog(`Selecionado: ${selected.label}`);
              finalize(selected);
            }
            return;
          }
          if (normalizedInput === "g") {
            const selected = items[clampIndex(1)];
            if (selected) {
              appendLog(`Selecionado: ${selected.label}`);
              finalize(selected);
            }
            return;
          }
          if (key.leftArrow || key.upArrow) {
            setSelectedIndex((value: number) => {
              const nextIndex = clampIndex(value - 1);
              const selected = items[nextIndex];
              if (selected) {
                appendLog(`Selecionado: ${selected.label}`);
              }
              return nextIndex;
            });
          }
          if (key.rightArrow || key.downArrow || key.tab) {
            setSelectedIndex((value: number) => {
              const nextIndex = clampIndex(value + 1);
              const selected = items[nextIndex];
              if (selected) {
                appendLog(`Selecionado: ${selected.label}`);
              }
              return nextIndex;
            });
          }
          if (key.return) {
            finalize(items[clampIndex(selectedIndex)] ?? null);
          }
          if (key.escape) {
            finalize(null);
          }
          if (normalizedInput === "1") {
            setSelectedIndex(0);
            const selected = items[0];
            if (selected) {
              appendLog(`Selecionado: ${selected.label}`);
            }
          }
          if (normalizedInput === "2") {
            setSelectedIndex(clampIndex(1));
            const selected = items[clampIndex(1)];
            if (selected) {
              appendLog(`Selecionado: ${selected.label}`);
            }
          }
        },
        { isActive: !modalState.modalOpen }
      );

      return (
        <Layout
          title="PAJÉ - Menu de Funcionalidades"
          workspaceLabel="Menu de Funcionalidades"
          orientation={MENU_ORIENTATION_MESSAGE}
          logEntries={logEntries}
          parameters={parametersSnapshot}
          modalState={modalState}
          onEscape={() => finalize(null)}
        >
          <MenuDashboard items={items} selectedIndex={selectedIndex} />
        </Layout>
      );
    };

    const { unmount } = render(<App />);
    unmountRef.current = unmount;
  });
};
