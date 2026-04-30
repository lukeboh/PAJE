import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureParentDir, resolveConcurrency, syncRepository } from "../src/modules/git/parallelSync.js";

assert.ok(resolveConcurrency({ concurrency: 1 }) === 1, "Concorrência mínima = 1");
assert.ok(resolveConcurrency({ concurrency: 4 }) === 4, "Concorrência customizada");
assert.ok(resolveConcurrency({ concurrency: "auto" }) >= 2, "Concorrência auto >= 2");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paje-parallel-"));
const targetPath = path.join(tempDir, "grupo", "repo");
const binDir = path.join(tempDir, "bin");
fs.mkdirSync(binDir, { recursive: true });
const fakeGitPath = path.join(binDir, "git");
fs.writeFileSync(
  fakeGitPath,
  "#!/usr/bin/env bash\n" +
    "args=\"$*\"\n" +
    "if [[ \"$args\" == *\"remote get-url origin\"* ]]; then\n" +
    "  if [[ -n \"$NO_REMOTE\" ]]; then\n" +
    "    exit 1\n" +
    "  fi\n" +
    "  echo \"git@exemplo.com:grupo/repo.git\"\n" +
    "  exit 0\n" +
    "fi\n" +
    "if [[ \"$args\" == *\"rev-parse --abbrev-ref HEAD\"* ]]; then\n" +
    "  echo \"${CURRENT_BRANCH:-main}\"\n" +
    "  exit 0\n" +
    "fi\n" +
    "if [[ \"$args\" == *\"rev-list --left-right --count\"* ]]; then\n" +
    "  echo \"${REV_LIST_OUTPUT:-0 0}\"\n" +
    "  exit 0\n" +
    "fi\n" +
    "exit 0\n",
  "utf-8"
);
fs.chmodSync(fakeGitPath, 0o755);
const originalPath = process.env.PATH;
process.env.PATH = `${binDir}:${originalPath}`;
await ensureParentDir(targetPath);
assert.ok(fs.existsSync(path.dirname(targetPath)), "Deve criar diretório pai");

const result = await syncRepository({
  id: 1,
  name: "Repo",
  pathWithNamespace: "grupo/repo",
  sshUrl: "git@exemplo.com:grupo/repo.git",
  localPath: targetPath,
});
assert.ok(result.status === "cloned" || result.status === "failed", "Deve tentar clonar repositório");

const gitDir = path.join(targetPath, ".git");
fs.mkdirSync(gitDir, { recursive: true });
process.env.NO_REMOTE = "1";
const resultSkip = await syncRepository({
  id: 1,
  name: "Repo",
  pathWithNamespace: "grupo/repo",
  sshUrl: "git@exemplo.com:grupo/repo.git",
  localPath: targetPath,
});
assert.ok(resultSkip.status === "skipped", "Deve ignorar repositório sem remoto configurado");

delete process.env.NO_REMOTE;
process.env.REV_LIST_OUTPUT = "2 0";
const resultBehind = await syncRepository({
  id: 1,
  name: "Repo",
  pathWithNamespace: "grupo/repo",
  sshUrl: "git@exemplo.com:grupo/repo.git",
  localPath: targetPath,
});
assert.ok(resultBehind.status === "pulled", "Deve realizar pull quando repositório está BEHIND");

process.env.REV_LIST_OUTPUT = "0 3";
const resultAhead = await syncRepository({
  id: 1,
  name: "Repo",
  pathWithNamespace: "grupo/repo",
  sshUrl: "git@exemplo.com:grupo/repo.git",
  localPath: targetPath,
});
assert.ok(resultAhead.status === "pushed", "Deve realizar push quando repositório está AHEAD");

process.env.REV_LIST_OUTPUT = "0 0";
const resultSynced = await syncRepository({
  id: 1,
  name: "Repo",
  pathWithNamespace: "grupo/repo",
  sshUrl: "git@exemplo.com:grupo/repo.git",
  localPath: targetPath,
});
assert.ok(resultSynced.status === "skipped", "Deve ignorar quando não há diferenças");

process.env.PATH = originalPath;
delete process.env.NO_REMOTE;
delete process.env.REV_LIST_OUTPUT;
delete process.env.CURRENT_BRANCH;

console.log("git_parallel_sync_test: OK");
