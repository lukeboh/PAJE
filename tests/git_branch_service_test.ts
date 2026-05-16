import assert from "node:assert";
import { createBranchAndPush, checkoutBranch, listLocalBranches, resolveRepoStatus } from "../src/modules/git/core/gitBranchService.js";
import { runGit } from "../src/modules/git/parallelSync.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paje-branch-test-"));
const repoPath = path.join(tempDir, "repo");
fs.mkdirSync(repoPath, { recursive: true });

const initRepo = async (): Promise<void> => {
  await runGit(["-C", repoPath, "init"]);
  await runGit(["-C", repoPath, "config", "user.email", "test@example.com"]);
  await runGit(["-C", repoPath, "config", "user.name", "Test User"]);
  fs.writeFileSync(path.join(repoPath, "README.md"), "branch test");
  await runGit(["-C", repoPath, "add", "."]);
  await runGit(["-C", repoPath, "commit", "-m", "init"]);
};

const run = async (): Promise<void> => {
  await initRepo();
  const branches = await listLocalBranches(repoPath);
  assert.ok(branches.includes("master") || branches.includes("main"), "Deve listar branch inicial");

  await runGit(["-C", repoPath, "checkout", "-b", "test-branch"]);
};

run()
  .then(async () => {
    const branches = await listLocalBranches(repoPath);
    assert.ok(branches.includes("test-branch"), "Deve listar nova branch local");

    await checkoutBranch(repoPath, branches[0]);
    const status = await resolveRepoStatus({ targetPath: repoPath, defaultBranch: branches[0], fetch: false });
    assert.ok(status.branch.length > 0, "Status deve retornar branch atual");

    console.log("git_branch_service_test: OK");
  })
  .catch((error) => {
    console.error("git_branch_service_test: FAILED", error);
    process.exitCode = 1;
  });
