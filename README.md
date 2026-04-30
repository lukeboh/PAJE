# PAJÉ - Plataforma de Apoio à Jornada do Engenheiro

O PAJÉ é um facilitador de ambiente de desenvolvimento. Ele automatiza tarefas repetitivas e configura integrações de forma harmonizada para o desenvolvedor, com foco inicial em GitLab (CLI/TUI) e organização local de repositórios.

## Características do sistema

- **CLI + TUI**: execução por comando (`paje`) e interface textual guiada ao iniciar sem parâmetros.
- **Sincronização paralela de repositórios GitLab**: seleção de grupos/projetos, clonagem/pull em paralelo e resumo de status.
- **Gerenciamento de SSH**: geração ou reaproveitamento de chaves, atualização do `~/.ssh/config`, adição em `known_hosts`.
- **Persistência local**: informações de servidores GitLab e logs são salvos em `~/.paje`.
- **Configuração por arquivo**: parâmetros podem ser definidos via arquivo de ambiente (`~/.paje/env.yaml` por padrão).

## Requisitos

- Linux com Bash
- Git (o instalador tenta instalar caso não esteja disponível)
- Node.js 24.x (Active LTS recomendado) e npm (para execução do PAJÉ)

## Instalação e provisionamento inicial

Execute o instalador em uma única linha (Linux/Bash):

```bash
curl -fsSL https://raw.githubusercontent.com/lukeboh/paje/main/install-page.sh -o install-page.sh && chmod +x install-page.sh && ./install-page.sh
```

O instalador:

1. Verifica Git e instala se necessário.
2. Clona o repositório do PAJÉ.
3. Executa health-check.
4. Cria link `paje` apontando para `paje.sh`.
5. (Opcional) adiciona o diretório ao `PATH`.
6. (Opcional) inicia o PAJÉ ao final.

## Configuração do runtime JavaScript

Para garantir Node.js e npm corretos:

```bash
./config-paje.sh
```

O script garante Node.js 24.x (Active LTS) e valida a instalação.

## Como executar

### Execução interativa (TUI)

Sem parâmetros, o PAJÉ abre o menu TUI:

```bash
paje
```

### Execução via CLI

```bash
paje git-sync [opções]
paje git-server-store [opções]
```

### Execução via npm (dev)

```bash
npm run dev -- <comando>
```

## Funcionalidades disponíveis

### 1) `git-sync` — sincronizar repositórios GitLab

Sincroniza repositórios em paralelo, com seleção por TUI e status de cada repositório.

**Exemplo (CLI):**

```bash
paje git-sync --base-dir repos --server-name "GitLab" --base-url https://gitlab.com
```

**Parâmetros:**

| Parâmetro | Obrigatório | Padrão | Descrição | Valores/Observações |
| --- | --- | --- | --- | --- |
| `-v`, `--verbose` | não | `false` | Exibe logs detalhados | `true`/`false` |
| `--base-dir <dir>` | não | `repos` | Diretório base de clonagem | caminho local |
| `--server-name <name>` | não | — | Nome do servidor GitLab | ex: `GitLab` |
| `--base-url <url>` | não | — | URL base do GitLab | ex: `https://gitlab.com` |
| `--use-basic-auth` | não | `false` | Usar autenticação básica | requer `--username` |
| `--username <username>` | não | — | Usuário para autenticação básica | obrigatório se `--use-basic-auth` |
| `--password <password>` | não | — | Senha para autenticação básica | solicitado se necessário |
| `--key-label <label>` | não | — | Nome da chave SSH a gerar | ex: `paje` |
| `--passphrase <passphrase>` | não | — | Passphrase da chave SSH | opcional |
| `--public-key-path <path>` | não | — | Caminho para chave pública existente | deve terminar com `.pub` |
| `--env-file <path>` | não | `~/.paje/env.yaml` | Caminho do arquivo de ambiente | YAML |
| `--prepare-local-dirs [value]` | não | `false` | Cria diretórios sem clonar | `true`/`false` |
| `--no-summary [value]` | não | `false` | Oculta resumo final | `true`/`false` |
| `--no-public-repos [value]` | não | `false` | Oculta repositórios públicos | `true`/`false` |
| `--no-archived-repos [value]` | não | `false` | Oculta repositórios arquivados | `true`/`false` |
| `--git-show-public-repos` | — | — | Removido | Use autenticação ou `--public-repos` para filtros locais. |

**Comportamento relevante:**

- Sem autenticação, somente repositórios públicos podem ser listados.
- Se houver associação SSH válida (`~/.ssh/config`), o fluxo prioriza SSH.
- O resumo final mostra estados: `SYNCED`, `BEHIND`, `AHEAD`, `REMOTE`, `EMPTY`, `LOCAL`, `UNCOMMITTED`.

### 2) `git-server-store` — registrar SSH e token no GitLab

Gera (ou reutiliza) chave SSH, registra no GitLab e cria/rotaciona token pessoal.

**Exemplo (CLI):**

```bash
paje git-server-store --base-url https://git.tse.jus.br --username usuario --token-name "paje-token"
```

**Parâmetros:**

| Parâmetro | Obrigatório | Padrão | Descrição | Valores/Observações |
| --- | --- | --- | --- | --- |
| `-v`, `--verbose` | não | `false` | Exibe logs detalhados | `true`/`false` |
| `--server-name <name>` | não | `GitLab` | Nome do servidor | — |
| `--base-url <url>` | não | `https://git.tse.jus.br` | URL base do GitLab | — |
| `--username <username>` | sim | — | Usuário do GitLab | obrigatório |
| `--key-label <label>` | não | `paje` | Nome da chave SSH | — |
| `--passphrase <passphrase>` | não | — | Passphrase da chave | opcional |
| `--public-key-path <path>` | não | — | Chave pública existente | `.pub` |
| `--key-overwrite` | não | `false` | Sobrescrever chave existente | gera `.bak` |
| `--retry-delay-ms <ms>` | não | — | Intervalo entre tentativas | número em ms |
| `--max-attempts <count>` | não | — | Número máximo de tentativas | número |
| `--env-file <path>` | não | `~/.paje/env.yaml` | Caminho do arquivo de credenciais | YAML |
| `--token-name <name>` | sim | — | Nome do token pessoal | obrigatório |
| `--token-scopes <scopes>` | não | padrão interno | Escopos do token | `read_repository,read_api,...` |
| `--token-expires-at <date>` | não | +1 ano | Data expiração | `YYYY-MM-DD` |

### 3) `ssh-key-store` (obsoleto)

Comando legado. Use `git-server-store`.

## Configuração por arquivo (env.yaml)

O PAJÉ lê parâmetros de `~/.paje/env.yaml` (padrão), ou de um arquivo informado via `--env-file`.

**Exemplo de `~/.paje/env.yaml`:**

```yaml
baseDir: repos
serverName: GitLab
baseUrl: https://gitlab.com
useBasicAuth: false
username: meu.usuario
password: "minha-senha"
keyLabel: paje
passphrase: ""
publicKeyPath: /home/user/.ssh/paje.pub
prepareLocalDirs: false
noSummary: false
publicRepos: false
archivedRepos: false
gitShowPublicRepos: false
tokenName: paje-token
tokenScopes: [read_repository, read_api, read_virtual_registry, self_rotate]
tokenExpiresAt: 2026-04-30
retryDelayMs: 4000
maxAttempts: 3
verbose: false
```

> Senhas e tokens **não devem ser versionados**. Use arquivos locais com permissões restritas.

## Persistência de dados

O PAJÉ salva dados locais em:

- `~/.paje/logs` — logs de execução.
- `~/.paje/git-servers.json` — servidores GitLab e tokens.

## Integração SSH

Durante os fluxos `git-sync` e `git-server-store`, o PAJÉ:

1. Gera ou reutiliza chave SSH (`ed25519`) em `~/.ssh`.
2. Atualiza `~/.ssh/config` com o host do GitLab.
3. (Opcional) Adiciona o host em `~/.ssh/known_hosts` via `ssh-keyscan`.
4. Registra a chave no GitLab via fluxo web autenticado.

Se a chave já existe, o PAJÉ reutiliza e evita sobrescrever, a menos que `--key-overwrite` seja usado.

## Integração Git/GitLab

- **GitLab**: autenticação por SSH e/ou autenticação básica para criação de token.
- **Tokens pessoais**: o PAJÉ valida, reutiliza ou rotaciona tokens existentes quando possível.
- **GitHub**: suporte ainda não implementado na CLI/TUI atual.

## Estrutura TUI

A TUI segue o padrão de três áreas:

1. **Barra superior**: título/funcionalidade atual.
2. **Área principal**: menus e formulários.
3. **Barra inferior**: instruções contextuais para cada campo.

## Testes

```bash
npm test
```

## Regras do projeto (leitura obrigatória)

Este repositório usa o arquivo [`.clinerules`](.clinerules) como fonte oficial de regras e contexto. Para garantir que ele seja sempre lido por quem trabalha no projeto:

- Sempre revise e siga o conteúdo em [`.clinerules`](.clinerules) antes de iniciar tarefas.
- Em revisões e PRs, valide se novas mudanças continuam aderentes às regras em [`.clinerules`](.clinerules).
- Em automações locais (scripts, prompts ou assistentes), adicione uma etapa explícita de leitura de [`.clinerules`](.clinerules).
