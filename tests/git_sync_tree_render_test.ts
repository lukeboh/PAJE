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
  3: { branch: "behind-branch", state: "BEHIND" as const, delta: "-3" },
};

const localPaths = ["eleitoral/setot/sistemas/ovovovo"];
const localStatuses = {
  "eleitoral/setot/sistemas/ovovovo": { branch: "main", state: "LOCAL" as const },
};
const tree = buildHierarchyTree(projects, statuses, localPaths, localStatuses);
const lines = renderTreeLines("GIT-TSE (https://git.tse.jus.br)", tree);

assert.ok(lines[0].includes("GIT-TSE"), "Deve renderizar header do servidor");
assert.ok(lines.some((line) => line.includes("+ eleitoral")), "Deve conter grupo raiz");
assert.ok(
  lines.some((line) => line.includes("+ eleitoral") && !line.includes("[")),
  "Grupo agregador não deve ter status"
);
assert.ok(lines.some((line) => line.includes("+ secad")), "Deve conter subgrupo secad");
assert.ok(
  lines.some((line) => line.includes("Servico Biometria Clone") && line.includes("[")),
  "Deve renderizar status synced"
);
assert.ok(
  lines.some((line) => line.includes("cadastro-spring-boot") && line.includes("[")),
  "Deve renderizar colchetes de status"
);
assert.ok(
  lines.some((line) => line.includes("sistot") && line.includes("behind -3")),
  "Deve renderizar status behind"
);
assert.ok(
  lines.some((line) => line.includes("ovovovo") && line.includes("local")),
  "Deve renderizar status local"
);

const formatted = formatRepoStatus({ branch: "develop", state: "REMOTE" });
assert.ok(formatted.includes("develop"));

const formattedEmpty = formatRepoStatus({ branch: "main", state: "EMPTY" });
assert.ok(formattedEmpty.includes("empty"));

console.log("git_sync_tree_render_test: OK");
