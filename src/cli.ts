import { Command } from "commander";
import { configureGitSyncCommand, configureSshKeyStoreCommand } from "./modules/git/gitCommand.js";
import { renderMenu, type MenuItem } from "./modules/git/tui/menu.app.js";
import { createSessionForCommand } from "./cliSession.js";

const menuItems: MenuItem[] = [
  {
    label: "Sincronizar repositórios GitLab",
    command: "git-sync",
    shortcut: "S",
    description: "Seleciona grupos e projetos, filtra repositórios e executa clone/pull paralelo.",
  },
  {
    label: "Registrar servidor GitLab",
    command: "git-server-store",
    shortcut: "G",
    description: "Gera chave SSH, grava no ~/.ssh/config, registra no GitLab e salva token.",
  },
];

const runMenu = async () => {
  const selection = await renderMenu(menuItems);
  return { selection };
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
    const { selection } = await runMenu();
    if (!selection) {
      return;
    }
    const program = new Command();
    program
      .name("paje")
      .description("PAJÉ - Plataforma de Apoio à Jornada do Engenheiro")
      .version("0.1.0");
    const session = createSessionForCommand(selection.command);
    configureGitSyncCommand(program, session);
    configureSshKeyStoreCommand(program, session);
    await program.parseAsync(["node", "cli.ts", selection.command]);
    return;
  }

  await baseProgram.parseAsync(process.argv);
};

main();
