import assert from "node:assert/strict";
import { buildHierarchyTree, formatRepoStatus, renderTreeLines } from "../src/modules/git/gitCommand.js";
import type { GitLabProject } from "../src/modules/git/types.js";

const projects: GitLabProject[] = [
  {
    id: 1,
    name: "Servico Biometria Clone",
    path_with_namespace: "eleitoral/secad/Servico Biometria Clone",
    ssh_url_to_repo: "git@git.tse.jus.br:eleitoral/secad/servico.git",
    http_url_to_repo: "https://git.tse.jus.br/eleitoral/secad/servico.git",
  },
  {
    id: 2,
    name: "cadastro-spring-boot",
    path_with_namespace: "eleitoral/secad/cadastro-spring-boot",
    ssh_url_to_repo: "git@git.tse.jus.br:eleitoral/secad/cadastro.git",
    http_url_to_repo: "https://git.tse.jus.br/eleitoral/secad/cadastro.git",
  },
  {
    id: 3,
    name: "sistot",
    path_with_namespace: "eleitoral/setot/sistemas/sistot",
    ssh_url_to_repo: "git@git.tse.jus.br:eleitoral/setot/sistemas/sistot.git",
    http_url_to_repo: "https://git.tse.jus.br/eleitoral/setot/sistemas/sistot.git",
  },
];

const statuses = {
  1: { branch: "main", state: "SYNCED" as const },
  2: { branch: "main", state: "AHEAD" as const, delta: "+5" },
  3: { branch: "main", state: "BEHIND" as const, delta: "-3" },
};

const tree = buildHierarchyTree(projects, statuses);
const lines = renderTreeLines("GIT-TSE (https://git.tse.jus.br)", tree);

assert.ok(lines[0].includes("GIT-TSE"), "Deve renderizar header do servidor");
assert.ok(lines.some((line) => line.includes("+ eleitoral")), "Deve conter grupo raiz");
assert.ok(
  lines.some((line) => line.includes("+ secad") && line.includes("|")),
  "Deve conter subgrupo secad"
);
assert.ok(
  lines.some((line) => line.includes("Servico Biometria Clone") && line.includes("[main, synced]")),
  "Deve renderizar status synced"
);
assert.ok(
  lines.some((line) => line.includes("cadastro-spring-boot") && line.includes("[main, ahead +5]")),
  "Deve renderizar status ahead"
);
assert.ok(
  lines.some((line) => line.includes("sistot") && line.includes("[main, behind -3]")),
  "Deve renderizar status behind"
);

const formatted = formatRepoStatus({ branch: "develop", state: "REMOTE" });
assert.strictEqual(formatted, "[develop, remote]");

console.log("git_sync_tree_render_test: OK");
