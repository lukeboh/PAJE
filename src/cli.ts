import blessed from "blessed";
import { Command } from "commander";
import { configureGitSyncCommand, configureSshKeyStoreCommand } from "./modules/git/gitCommand.js";
import { createTuiSession } from "./modules/git/tuiSession.js";

type MenuItem = {
  label: string;
  command: string;
  description: string;
};

const menuItems: MenuItem[] = [
  {
    label: "Sincronizar repositórios GitLab (git-sync)",
    command: "git-sync",
    description: "Seleciona grupos e projetos via TUI e executa clone/pull paralelo.",
  },
  {
    label: "Gerar e armazenar chave SSH (ssh-key-store)",
    command: "ssh-key-store",
    description: "Gera chave SSH, grava no ~/.ssh/config e envia ao GitLab.",
  },
];

const runMenu = async () => {
  const session = createTuiSession("PAJÉ");
  const selection = await session.promptList({
    title: "PAJÉ - Menu de Funcionalidades",
    message: "Selecione uma opção",
    choices: menuItems.map((item) => ({
      label: item.label,
      value: item,
      description: `${item.description}\nConfirme a opção com Enter para iniciar a funcionalidade.`,
    })),
  });

  return { session, selection };
};

const main = async (): Promise<void> => {
  const baseProgram = new Command();

  baseProgram
    .name("paje")
    .description("PAJÉ - Plataforma de Apoio à Jornada do Engenheiro")
    .version("0.1.0");

  configureGitSyncCommand(baseProgram);
  configureSshKeyStoreCommand(baseProgram);

  const args = process.argv.slice(2);
  if (args.length === 0) {
    const { session, selection } = await runMenu();
    if (!selection) {
      session.destroy();
      return;
    }
    const program = new Command();
    program
      .name("paje")
      .description("PAJÉ - Plataforma de Apoio à Jornada do Engenheiro")
      .version("0.1.0");
    configureGitSyncCommand(program, session);
    configureSshKeyStoreCommand(program, session);
    program.configureOutput({
      writeOut: async (str) => {
        await session.showMessage({ title: "PAJÉ", message: str });
      },
      writeErr: async (str) => {
        await session.showMessage({ title: "PAJÉ - Erro", message: str });
      },
    });
    await program.parseAsync(["node", "cli.ts", selection.command]);
    session.destroy();
    return;
  }

  await baseProgram.parseAsync(process.argv);
};

main();
