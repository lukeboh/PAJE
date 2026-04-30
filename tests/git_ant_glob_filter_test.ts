import assert from "node:assert/strict";
import {
  antPatternToRegex,
  compileAntPatterns,
  matchesAntPatterns,
  splitFilterPatterns,
} from "../src/modules/git/patternFilter.js";

const patterns = splitFilterPatterns(" eleitoral/secad/* ; eleitoral/setot/bd/rec-arquivos-urna-bd ");
assert.deepEqual(patterns, ["eleitoral/secad/*", "eleitoral/setot/bd/rec-arquivos-urna-bd"]);

assert.ok(
  antPatternToRegex("/eleitoral//*").test("eleitoral/setot/bd/rec-arquivos-urna-bd"),
  "Deve aceitar recursivo total em eleitoral"
);

assert.ok(
  antPatternToRegex("/eleitoral/setot/*").test("eleitoral/setot/gestao-convocacao"),
  "Deve aceitar apenas o primeiro nível dentro de setot"
);
assert.ok(
  !antPatternToRegex("/eleitoral/setot/*").test("eleitoral/setot/bd/rec-arquivos-urna-bd"),
  "Não deve aceitar níveis profundos com apenas *"
);

assert.ok(
  antPatternToRegex("/eleitoral/secad/cad*").test("eleitoral/secad/cadastro"),
  "Deve aceitar prefixo cad dentro de secad"
);

const multi = compileAntPatterns("**/setot/**/*");
assert.ok(
  matchesAntPatterns("eleitoral/setot/bd/rec-arquivos-urna-bd", multi),
  "Deve aceitar caminhos que contenham setot"
);
assert.ok(
  !matchesAntPatterns("eleitoral/secad/cadastro", multi),
  "Nao deve aceitar caminhos sem setot"
);

const question = antPatternToRegex("eleitoral/s?cad/*");
assert.ok(
  question.test("eleitoral/secad/projeto"),
  "Deve aceitar ? como um caractere"
);
assert.ok(
  !question.test("eleitoral/seccad/projeto"),
  "Nao deve aceitar mais de um caractere para ?"
);

console.log("git_ant_glob_filter_test: OK");
