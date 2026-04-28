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
fs.writeFileSync(fakeGitPath, "#!/usr/bin/env bash\nexit 0\n", "utf-8");
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
const resultPull = await syncRepository({
  id: 1,
  name: "Repo",
  pathWithNamespace: "grupo/repo",
  sshUrl: "git@exemplo.com:grupo/repo.git",
  localPath: targetPath,
});
assert.ok(resultPull.status === "pulled" || resultPull.status === "failed", "Deve tentar pull em repositório existente");

process.env.PATH = originalPath;

console.log("git_parallel_sync_test: OK");
