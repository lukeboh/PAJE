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

Sem parâmetros, o PAJÉ abre o menu TUI (dashboard com cartões e atalhos F1/F2):

```bash
paje
```

> Observação: o `paje.sh` ajusta o diretório de trabalho apenas dentro do próprio processo para localizar o `package.json`. Isso não altera o diretório do seu terminal e permite chamar o comando de qualquer local.

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

Sincroniza repositórios em paralelo, **agregando todos os servidores configurados** (um único `base-dir` local) e exibindo a árvore consolidada na TUI.

> Requisitos detalhados da TUI: consulte [`docs/requisitos-tui-git-sync.md`](docs/requisitos-tui-git-sync.md:1).

**TUI (git-sync):**

- Exibe mensagem de acesso **aos servidores** durante a listagem (com contador de requisições).
- Renderiza cabeçalho agregado no topo da árvore (ex.: `GitLab (2 servidores): TSE-GIT | DEV-GIT`).
- Agrupa a árvore por servidor, mantendo subgrupos e projetos consolidados em um único `base-dir`.
- Apresenta branch e estado de cada repositório (cores iguais ao CLI).
- Mostra progresso por linha na árvore durante a sincronização.
- Usa `Enter` para sincronizar os itens selecionados.
- Ao finalizar, abre um modal com resumo da sincronização.

**Exemplo (CLI):**

```bash
paje git-sync --base-dir repos
```

**Parâmetros:**

| Parâmetro | Obrigatório | Padrão | Descrição | Valores/Observações |
| --- | --- | --- | --- | --- |
| `-v`, `--verbose` | não | `false` | Exibe logs detalhados | `true`/`false` |
| `--base-dir <dir>` | não | `repos` | Diretório base de clonagem | caminho local (aceita `~`) |
| `--server-name <name>` | não | — | Nome do servidor GitLab | se informado, filtra servidores pelo nome |
| `--base-url <url>` | não | — | URL base do GitLab | se informado, filtra servidores pelo URL |
| `--use-basic-auth` | não | `false` | Usar autenticação básica | requer `--username` |
| `--username <username>` | não | ? | Usuário para autenticação básica | obrigatório se `--use-basic-auth` |
| `--password <password>` | não | ? | Senha para autenticação básica | solicitado se necessário |
| `--user-email <email>` | não | ? | Email do Git para configurar nos repositórios sincronizados | ex: `nome@empresa.com` |
| `--key-label <label>` | não | ? | Nome da chave SSH a gerar | ex: `paje` |
| `--passphrase <passphrase>` | não | ? | Passphrase da chave SSH | opcional |
| `--public-key-path <path>` | não | ? | Caminho para chave pública existente | deve terminar com `.pub` |
| `--env-file <path>` | não | `~/.paje/env.yaml` | Caminho do arquivo de ambiente | YAML |
| `--prepare-local-dirs [value]` | não | `false` | Cria diretórios sem clonar | `true`/`false` |
| `--no-summary [value]` | não | `false` | Oculta resumo final | `true`/`false` |
| `--no-public-repos [value]` | não | `false` | Oculta repositórios públicos | `true`/`false` |
| `--no-archived-repos [value]` | não | `false` | Oculta repositórios arquivados | `true`/`false` |
| `-f`, `--filter <pattern>` | não | ? | Filtro Ant/Glob por caminho (`path_with_namespace`) | separado por `;` |
| `--sync-repos <pattern>` | não | ? | Repositórios/branches para sincronizar | Ant/Glob com branch opcional via `#` |
| `--parallels <value>` | não | `1` | Paralelismo na sincronização | `AUTO`, `0` ou número ≥ 1 |
| `--dry-run` | não | `false` | Simula ações sem persistir | não executa clone/pull/push |
| `--git-show-public-repos` | ? | ? | Removido | Use autenticação ou `--public-repos` para filtros locais. |

**Comportamento relevante:**

- O `git-sync` opera sobre **todos os servidores configurados** quando nenhum filtro (`--server-name`/`--base-url`) é fornecido.
- `--server-name` filtra por nome exato do servidor persistido; `--base-url` filtra por URL normalizada. Se ambos forem informados, **os dois filtros** são aplicados.
- Quando `--server-name`/`--base-url` são informados, a TUI renderiza apenas os servidores correspondentes e atualiza o cabeçalho agregado (`GitLab (N servidores)`), além do contador de requisições.
- Sem autenticação, somente repositórios públicos podem ser listados.
- Se houver associação SSH válida (`~/.ssh/config`), o fluxo prioriza SSH.
- O resumo final mostra estados: `SYNCED`, `BEHIND`, `AHEAD`, `REMOTE`, `EMPTY`, `LOCAL`, `UNCOMMITTED`.
- O filtro suporta padrões Ant/Glob: `?` (um caractere), `*` (qualquer trecho no mesmo diretório), `**` (qualquer profundidade), e múltiplos padrões separados por `;` (com espaços ignorados).
- `--sync-repos` aceita padrões Ant/Glob no formato `path_with_namespace[.git]#branch`. A `#branch` é opcional. Exemplo: `grupo/projeto.git#main`.
- `--parallels` controla o número de workers na sincronização. Use `AUTO` ou `0` para ajuste automático.
- Quando `--server-name` e `--base-url` são informados juntos, o servidor é registrado/atualizado em `~/.paje/git-servers.json`.
- Quando `--dry-run` é usado, o comando apenas informa o que faria (clone/pull/push) sem executar.

> Os filtros podem vir do `env.yaml` ou da CLI. A TUI aplica as mesmas regras de filtragem e exibe apenas os servidores correspondentes.

**Exemplos multi-servidor (CLI):**

```bash
# Agrega todos os servidores persistidos
paje git-sync --base-dir repos

# Filtra por nome do servidor
paje git-sync --server-name TSE-GIT --base-dir repos

# Filtra por URL do servidor
paje git-sync --base-url https://gitlab.dev.local --base-dir repos

# Combina filtros de servidor (nome + URL)
paje git-sync --server-name DEV-GIT --base-url https://gitlab.dev.local --base-dir repos
```

**Exemplo com filtros de conteúdo:**

```bash
# Aplica filtros de conteúdo apenas aos servidores já selecionados
npm run dev -- git-sync --env-file=env-test.yaml --verbose --server-name DEV-GIT --filter="DEV-GIT/devops/*" --no-public-repos=true
```

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
| `--server-name <name>` | não | `GitLab` | Nome do servidor | ? |
| `--base-url <url>` | não | `https://git.tse.jus.br` | URL base do GitLab | ? |
| `--username <username>` | sim | ? | Usuário do GitLab | obrigatório |
| `--key-label <label>` | não | `paje` | Nome da chave SSH | ? |
| `--passphrase <passphrase>` | não | ? | Passphrase da chave | opcional |
| `--public-key-path <path>` | não | ? | Chave pública existente | `.pub` |
| `--key-overwrite` | não | `false` | Sobrescrever chave existente | gera `.bak` |
| `--retry-delay-ms <ms>` | não | ? | Intervalo entre tentativas | número em ms |
| `--max-attempts <count>` | não | ? | Número máximo de tentativas | número |
| `--env-file <path>` | não | `~/.paje/env.yaml` | Caminho do arquivo de credenciais | YAML |
| `--token-name <name>` | sim | ? | Nome do token pessoal | obrigatório |
| `--token-scopes <scopes>` | não | padrão interno | Escopos do token | `read_repository,read_api,...` |
| `--token-expires-at <date>` | não | +1 ano | Data expiração | `YYYY-MM-DD` |

### 3) `ssh-key-store` (obsoleto)

Comando legado. Use `git-server-store`.

## Configuração por arquivo (env.yaml)

O PAJÉ lê parâmetros de `~/.paje/env.yaml` (padrão), ou de um arquivo informado via `--env-file`.

**Exemplo de `~/.paje/env.yaml`:**

```yaml
baseDir: ~/repos
serverName: GitLab
baseUrl: https://gitlab.com
useBasicAuth: false
username: meu.usuario
password: "**********"
userEmail: "nome@empresa.com"
keyLabel: paje
passphrase: ""
publicKeyPath: /home/user/.ssh/paje.pub
prepareLocalDirs: false
noSummary: false
noPublicRepos: false
noArchivedRepos: false
syncRepos: "grupo/projeto.git#main;grupo/outro-projeto"
parallels: "1"
dryRun: false
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

A TUI segue o padrão de quatro quadros:

1. **Barra de título**: 1 linha no topo com o nome da funcionalidade.
2. **Área de trabalho**: região central com menus, formulários e árvore de repositórios.
3. **Barra de orientações** (1 linha) com comandos possíveis.
4. **Painel de log**: ~15% da tela na parte inferior, com timestamp por linha e erros em vermelho.

Atalho `F12` alterna o log em tela cheia e retorna ao layout padrão. `Esc` retorna à tela anterior e `Ctrl+C` encerra a aplicação.

Consulte o layout detalhado em [docs/TUI_LAYOUT.md](docs/TUI_LAYOUT.md).

## Testes

```bash
npm test
```

## Regras do projeto (leitura obrigatória)

Este repositório usa o arquivo [`.roo/rules-code/paje-core.md`](.roo/rules-code/paje-core.md) como fonte oficial de regras e contexto.
