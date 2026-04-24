#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_SCRIPT="$ROOT_DIR/config-paje.sh"

if [[ ! -f "$CONFIG_SCRIPT" ]]; then
  echo "[ERRO] config-paje.sh não encontrado em $ROOT_DIR" >&2
  exit 1
fi

run_get_node_major_tests() {
  PAJE_SKIP_MAIN=1 bash -c 'source "$0" && [[ "$(get_node_major "v18.12.0")" == "18" ]]' "$CONFIG_SCRIPT"
  PAJE_SKIP_MAIN=1 bash -c 'source "$0" && [[ "$(get_node_major "20.0.1")" == "20" ]]' "$CONFIG_SCRIPT"
}

run_node_target_tests() {
  PAJE_NODE_TARGET_MAJOR=24 PAJE_SKIP_MAIN=1 bash -c 'source "$0" && node_is_target_major "v24.0.0"' "$CONFIG_SCRIPT"
  PAJE_NODE_TARGET_MAJOR=24 PAJE_SKIP_MAIN=1 bash -c 'source "$0" && ! node_is_target_major "v22.9.0"' "$CONFIG_SCRIPT"
  PAJE_NODE_TARGET_MAJOR=20 PAJE_SKIP_MAIN=1 bash -c 'source "$0" && node_is_target_major "v20.3.1"' "$CONFIG_SCRIPT"
}

run_get_node_major_tests
run_node_target_tests

echo "[OK] Testes do config-paje.sh executados com sucesso."
