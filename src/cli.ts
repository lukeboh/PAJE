import { Command } from "commander";
import { buildInitialParameters, configureGitSyncCommand, configureSshKeyStoreCommand } from "./modules/git/gitCommand";
import { renderMenu, type MenuItem } from "./modules/git/tui/menu.app";
import { createSessionForCommand } from "./cliSession";
import { setLocale, t } from "./i18n/index.js";

const menuItems: MenuItem[] = [
  {
    label: t("menu.items.gitSync.label"),
    command: "git-sync",
    shortcut: "S",
    description: t("menu.items.gitSync.description"),
  },
  {
    label: t("menu.items.gitServerStore.label"),
    command: "git-server-store",
    shortcut: "G",
    description: t("menu.items.gitServerStore.description"),
  },
];

const resolveLocaleArg = (args: string[]): string | undefined => {
  const index = args.findIndex((arg) => arg === "--locale" || arg.startsWith("--locale="));
  if (index === -1) {
    return undefined;
  }
  const arg = args[index];
  if (arg.includes("=")) {
    const [, value] = arg.split("=");
    return value?.trim();
  }
  const candidate = args[index + 1];
  if (!candidate || candidate.startsWith("-")) {
    return undefined;
  }
  return candidate.trim();
};

const hasCommandArg = (args: string[]): boolean => args.some((arg) => !arg.startsWith("-"));

const runMenu = async (locale?: string) => {
  const parameters = buildInitialParameters(locale);
  const selection = await renderMenu(menuItems, parameters);
  return { selection };
};

const main = async (): Promise<void> => {
  const baseProgram = new Command();

  baseProgram
    .name("paje")
    .description(t("app.description"))
    .version("0.1.0")
    .option("--locale <locale>", t("cli.command.gitSync.options.locale"));

  configureGitSyncCommand(baseProgram);
  configureSshKeyStoreCommand(baseProgram);

  const args = process.argv.slice(2);
  setLocale(resolveLocaleArg(args));
  if (!hasCommandArg(args)) {
    baseProgram.parseOptions(process.argv);
    const { selection } = await runMenu(resolveLocaleArg(args));
    if (!selection) {
      return;
    }
    const program = new Command();
    program
      .name("paje")
      .description(t("app.description"))
      .version("0.1.0")
      .option("--locale <locale>", t("cli.command.gitSync.options.locale"));
    const session = createSessionForCommand(selection.command);
    configureGitSyncCommand(program, session);
    configureSshKeyStoreCommand(program, session);
    await program.parseAsync(["node", "cli.ts", selection.command]);
    return;
  }

  await baseProgram.parseAsync(process.argv);
};

main();
