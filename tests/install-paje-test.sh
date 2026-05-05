#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_SCRIPT="$ROOT_DIR/install-page.sh"

if [[ ! -f "$INSTALL_SCRIPT" ]]; then
  echo "[ERRO] install-page.sh não encontrado em $ROOT_DIR" >&2
  exit 1
fi

run_final_verification_success() {
  local temp_dir
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' RETURN

  cp "$INSTALL_SCRIPT" "$temp_dir/install-page.sh"
  cp "$ROOT_DIR/paje.sh" "$temp_dir/paje.sh"
  chmod +x "$temp_dir/install-page.sh" "$temp_dir/paje.sh"
  ln -s "paje.sh" "$temp_dir/paje"
  chmod +x "$temp_dir/paje"

  PATH="$temp_dir:$PATH" \
    PAJE_SKIP_MAIN=1 \
    bash -c 'source "$0" && final_verification "$1"' \
    "$INSTALL_SCRIPT" "$temp_dir"
}

run_final_verification_success
echo "[OK] final_verification passou com binários no PATH e permissões corretas."

run_paje_from_outside_dir() {
  local temp_dir
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' RETURN

  local original_dir
  original_dir="$PWD"

  cp "$ROOT_DIR/paje.sh" "$temp_dir/paje.sh"
  cp "$ROOT_DIR/package.json" "$temp_dir/package.json"
  chmod +x "$temp_dir/paje.sh"

  cd /tmp

  local output
  if output="$(PATH="$temp_dir:$PATH" bash "$temp_dir/paje.sh" --help 2>&1)"; then
    :
  fi

  cd "$original_dir"

  if grep -q "package.json nao encontrado" <<<"$output"; then
    echo "[ERRO] paje.sh falhou ao executar fora do diretório raiz" >&2
    echo "$output" >&2
    exit 1
  fi

  echo "[OK] paje.sh executou fora do diretório raiz sem erro de package.json."
}

run_paje_from_outside_dir
