import { createTuiSession } from "./modules/git/tuiSession.js";

export const createSessionForCommand = (command: string) => {
  if (command === "git-sync" || command === "git-server-store") {
    return createTuiSession("PAJÉ");
  }
  return undefined;
};
