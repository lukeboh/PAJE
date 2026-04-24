#!/usr/bin/env bash
# config-paje.sh - Configuração do ambiente de execução JavaScript do PAJÉ (Linux/Bash)
# Objetivo: validar/instalar Node.js 24 (Active LTS) e npm para execução do PAJÉ.
# Arquitetura cross-platform: funções modulares para futura versão .bat.

set -Eeuo pipefail

PAJE_NODE_TARGET_MAJOR_DEFAULT=24
PAJE_NODE_TARGET_MAJOR="${PAJE_NODE_TARGET_MAJOR:-$PAJE_NODE_TARGET_MAJOR_DEFAULT}"
PAJE_NODE_ENFORCE_TARGET="${PAJE_NODE_ENFORCE_TARGET:-0}"

COLOR_GREEN_BOLD="\033[1;32m"
COLOR_GRAY="\033[0;90m"
COLOR_RESET="\033[0m"
NODE_VERSION_LOGGED=0

log_info() {
  printf "[INFO] %s\n" "$*"
}

log_warn() {
  printf "[AVISO] %s\n" "$*" >&2
}

log_error() {
  printf "[ERRO] %s\n" "$*" >&2
}

abort() {
  log_error "$*"
  exit 1
}

check_command() {
  command -v "$1" >/dev/null 2>&1
}

ensure_sudo() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    return 0
  fi

  if ! check_command sudo; then
    abort "sudo não encontrado. Instale sudo ou execute como root."
  fi
}

get_node_version() {
  node --version 2>/dev/null || true
}

get_node_major() {
  local version="${1:-$(get_node_version)}"
  version="${version#v}"
  printf "%s" "${version%%.*}"
}

node_is_target_major() {
  local version_input="${1:-}"
  local major

  if [[ -z "$PAJE_NODE_TARGET_MAJOR" ]]; then
    return 0
  fi

  major="$(get_node_major "$version_input")"
  if [[ -z "$major" ]]; then
    return 0
  fi

  if (( major != PAJE_NODE_TARGET_MAJOR )); then
    return 1
  fi

  return 0
}

install_node_24() {
  ensure_sudo

  if check_command apt-get; then
    log_info "Usando NodeSource (setup_24.x) para instalar Node.js 24 e npm."
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - \
      || abort "Falha ao configurar repositórios NodeSource (deb)."
    sudo apt-get install -y nodejs || abort "Falha ao instalar Node.js via apt-get."
  elif check_command dnf; then
    log_info "Usando NodeSource (setup_24.x) para instalar Node.js 24 e npm."
    curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo -E bash - \
      || abort "Falha ao configurar repositórios NodeSource (rpm)."
    sudo dnf install -y nodejs || abort "Falha ao instalar Node.js via dnf."
  elif check_command yum; then
    log_info "Usando NodeSource (setup_24.x) para instalar Node.js 24 e npm."
    curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo -E bash - \
      || abort "Falha ao configurar repositórios NodeSource (rpm)."
    sudo yum install -y nodejs || abort "Falha ao instalar Node.js via yum."
  elif check_command zypper; then
    log_info "Usando zypper para instalar Node.js e npm (verificando versão 24 após instalação)."
    sudo zypper install -y nodejs npm || abort "Falha ao instalar Node.js/npm via zypper."
  elif check_command pacman; then
    log_info "Usando pacman para instalar Node.js e npm (verificando versão 24 após instalação)."
    sudo pacman -Sy --noconfirm nodejs npm || abort "Falha ao instalar Node.js/npm via pacman."
  else
    abort "Gerenciador de pacotes não identificado. Instale Node.js e npm manualmente."
  fi
}

validate_node_version() {
  local version
  version="$(get_node_version)"

  if [[ -z "$version" ]]; then
    return 0
  fi

  if node_is_target_major "$version"; then
    if [[ "$NODE_VERSION_LOGGED" -ne 1 ]]; then
      log_info "Node.js detectado: $version"
    fi
    return 0
  fi

  log_warn "Node.js ($version) diferente da versão recomendada: $PAJE_NODE_TARGET_MAJOR.x (Active LTS)"
  if [[ "$PAJE_NODE_ENFORCE_TARGET" -eq 1 ]]; then
    abort "Atualize o Node.js para a versão $PAJE_NODE_TARGET_MAJOR.x."
  fi
}

ask_yes_no() {
  local prompt="$1"
  local default_answer="$2"
  local answer
  while true; do
    printf "%s" "$prompt" >&2
    read -r answer
    if [[ -z "$answer" ]]; then
      answer="$default_answer"
    fi
    case "$answer" in
      S|s)
        return 0
        ;;
      N|n)
        return 1
        ;;
      *)
        log_warn "Resposta inválida. Informe S ou N."
        ;;
    esac
  done
}

prompt_upgrade_to_target() {
  local version
  version="$(get_node_version)"
  if [[ -z "$version" ]]; then
    return 0
  fi

  log_info "Node.js detectado: $version"
  NODE_VERSION_LOGGED=1
  if node_is_target_major "$version"; then
    return 1
  fi

  log_warn "Recomendado instalar Node.js $PAJE_NODE_TARGET_MAJOR.x (Active LTS)."
  if ask_yes_no "Deseja instalar/atualizar para Node.js $PAJE_NODE_TARGET_MAJOR.x agora? (S/N) [padrão: S] " "S"; then
    return 0
  fi

  log_warn "Prosseguindo sem atualizar o Node.js."
  return 1
}

ensure_node_runtime() {
  if check_command node && check_command npm; then
    if prompt_upgrade_to_target; then
      install_node_24
      if ! check_command node || ! check_command npm; then
        abort "Node.js/npm ainda não disponíveis após instalação. Verifique o ambiente."
      fi
      validate_node_version
      return 0
    fi

    validate_node_version
    return 0
  fi

  log_warn "Node.js e/ou npm não encontrados. Iniciando instalação..."
  install_node_24

  if ! check_command node || ! check_command npm; then
    abort "Node.js/npm ainda não disponíveis após instalação. Verifique o ambiente."
  fi

  if ! node_is_target_major "$(get_node_version)"; then
    abort "Node.js instalado não é $PAJE_NODE_TARGET_MAJOR.x. Instale a versão correta."
  fi

  validate_node_version
}

health_check() {
  if ! check_command node; then
    abort "Node.js não encontrado após configuração."
  fi

  if ! check_command npm; then
    abort "npm não encontrado após configuração."
  fi

  log_info "Node.js OK: $(node --version)"
  log_info "npm OK: $(npm --version)"
}

summary() {
  printf "\nResumo da configuração:\n"
  printf "%s\n" "- Node.js: $(node --version)"
  printf "%s\n" "- npm:     $(npm --version)"
}

main() {
  log_info "Iniciando configuração do ambiente JavaScript do PAJÉ..."
  ensure_node_runtime
  health_check
  summary
  log_info "Ambiente JavaScript pronto para execução do PAJÉ."
}

if [[ "${BASH_SOURCE[0]}" == "$0" && "${PAJE_SKIP_MAIN:-}" != "1" ]]; then
  main "$@"
fi
