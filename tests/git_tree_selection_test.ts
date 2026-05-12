import assert from "node:assert";
import {
  applyInitialSelectionFromStatusMap,
  buildGitLabTree,
  buildGitLabTreeFromProjects,
  collectSelectedProjects,
  recomputeTreeSelection,
  toggleTreeNode,
} from "../src/modules/git/treeBuilder.js";
import { GitLabGroup, GitLabProject } from "../src/modules/git/types.js";

const groups: GitLabGroup[] = [
  { id: 1, name: "Grupo A", full_path: "grupo-a", parent_id: null },
  { id: 2, name: "Subgrupo A1", full_path: "grupo-a/sub-a1", parent_id: 1 },
];

const projects: GitLabProject[] = [
  {
    id: 10,
    name: "Projeto 1",
    path_with_namespace: "grupo-a/projeto-1",
    ssh_url_to_repo: "git@gitlab.com:grupo-a/projeto-1.git",
    http_url_to_repo: "https://gitlab.com/grupo-a/projeto-1.git",
    namespace: { id: 1, full_path: "grupo-a" },
  },
  {
    id: 11,
    name: "Projeto 2",
    path_with_namespace: "grupo-a/sub-a1/projeto-2",
    ssh_url_to_repo: "git@gitlab.com:grupo-a/sub-a1/projeto-2.git",
    http_url_to_repo: "https://gitlab.com/grupo-a/sub-a1/projeto-2.git",
    namespace: { id: 2, full_path: "grupo-a/sub-a1" },
  },
];

const tree = buildGitLabTree(groups, projects);
assert.strictEqual(tree.length, 1, "Deve ter um grupo raiz");

const rootGroup = tree[0];
toggleTreeNode(rootGroup, true);
recomputeTreeSelection(rootGroup);

const selectedProjects = collectSelectedProjects(tree);
assert.strictEqual(selectedProjects.length, 2, "Todos os projetos do grupo devem estar selecionados");

toggleTreeNode(rootGroup, false);
recomputeTreeSelection(rootGroup);
assert.strictEqual(collectSelectedProjects(tree).length, 0, "Nenhum projeto selecionado");

const statusMap = {
  10: { branch: "main", state: "SYNCED" as const },
  11: { branch: "main", state: "BEHIND" as const, delta: "-1" },
};
applyInitialSelectionFromStatusMap(tree, statusMap);
const initialSelected = collectSelectedProjects(tree);
assert.strictEqual(initialSelected.length, 2, "Pré-seleção deve marcar projetos clonados");
assert.strictEqual(tree[0].selected, true, "Grupo raiz deve ficar selecionado quando todos os filhos estão marcados");

const hierarchyTree = buildGitLabTreeFromProjects(projects);
const hierarchyProjects = collectSelectedProjects(hierarchyTree);
assert.strictEqual(hierarchyProjects.length, 0, "Árvore hierárquica inicia sem seleção");
assert.ok(
  hierarchyTree.some((node) => node.type === "group" && node.label === "grupo-a"),
  "Árvore hierárquica deve criar grupos a partir do path"
);
assert.ok(
  hierarchyTree.some((node) => node.type === "group" && node.children?.some((child) => child.label === "projeto-1")),
  "Árvore hierárquica deve conter projetos como folhas"
);

console.log("git_tree_selection_test: OK");
