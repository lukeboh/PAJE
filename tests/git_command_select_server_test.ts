import assert from "node:assert/strict";
import inquirer from "inquirer";
import { promptBasicAuthPassword } from "../src/modules/git/gitCommand.js";

const originalPrompt = inquirer.prompt;

inquirer.prompt = (async () => ({ password: "segredo" })) as unknown as typeof inquirer.prompt;

const presetPassword = await promptBasicAuthPassword("usuario", undefined, "preset");
assert.strictEqual(presetPassword, "preset");

const promptedPassword = await promptBasicAuthPassword("usuario", undefined, undefined);
assert.strictEqual(promptedPassword, "segredo");

inquirer.prompt = originalPrompt;

console.log("git_command_select_server_test: OK");
