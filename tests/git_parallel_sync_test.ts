import assert from "node:assert";
import { resolveConcurrency } from "../src/modules/git/parallelSync.js";

assert.ok(resolveConcurrency({ concurrency: 1 }) === 1, "Concorrência mínima = 1");
assert.ok(resolveConcurrency({ concurrency: 4 }) === 4, "Concorrência customizada");
assert.ok(resolveConcurrency({ concurrency: "auto" }) >= 2, "Concorrência auto >= 2");

console.log("git_parallel_sync_test: OK");
