#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$ROOT_DIR/package.json" ]]; then
  echo "[ERRO] package.json nao encontrado. Execute o PAJE a partir do diretorio raiz."
  exit 1
fi

cd "$ROOT_DIR"

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "[INFO] Instalando dependencias..."
  npm install
fi

echo "[INFO] Executando PAJE..."
npm run dev -- "$@"
