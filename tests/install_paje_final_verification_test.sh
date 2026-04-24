#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_SCRIPT="$ROOT_DIR/install_paje.sh"

if [[ ! -f "$INSTALL_SCRIPT" ]]; then
  echo "[ERRO] install_paje.sh não encontrado em $ROOT_DIR" >&2
  exit 1
fi

run_final_verification_success() {
  local temp_dir
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' RETURN

  cp "$INSTALL_SCRIPT" "$temp_dir/install_paje.sh"
  cp "$ROOT_DIR/paje.sh" "$temp_dir/paje.sh"
  chmod +x "$temp_dir/install_paje.sh" "$temp_dir/paje.sh"
  ln -s "paje.sh" "$temp_dir/paje"
  chmod +x "$temp_dir/paje"

  PATH="$temp_dir:$PATH" \
    PAJE_SKIP_MAIN=1 \
    bash -c 'source "$0" && final_verification "$1"' \
    "$INSTALL_SCRIPT" "$temp_dir"
}

run_final_verification_success
echo "[OK] final_verification passou com binários no PATH e permissões corretas."
