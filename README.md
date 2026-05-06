# PAJ� - Plataforma de Apoio � Jornada do Engenheiro

O PAJ� � um facilitador de ambiente de desenvolvimento. Ele automatiza tarefas repetitivas e configura integra��es de forma harmonizada para o desenvolvedor, com foco inicial em GitLab (CLI/TUI) e organiza��o local de reposit�rios.

## Caracter�sticas do sistema

- **CLI + TUI**: execu��o por comando (`paje`) e interface textual guiada ao iniciar sem par�metros.
- **Sincroniza��o paralela de reposit�rios GitLab**: sele��o de grupos/projetos, clonagem/pull em paralelo e resumo de status.
- **Gerenciamento de SSH**: gera��o ou reaproveitamento de chaves, atualiza��o do `~/.ssh/config`, adi��o em `known_hosts`.
- **Persist�ncia local**: informa��es de servidores GitLab e logs s�o salvos em `~/.paje`.
- **Configura��o por arquivo**: par�metros podem ser definidos via arquivo de ambiente (`~/.paje/env.yaml` por padr�o).

## Requisitos

- Linux com Bash
- Git (o instalador tenta instalar caso n�o esteja dispon�vel)
- Node.js 24.x (Active LTS recomendado) e npm (para execu��o do PAJ�)

## Instala��o e provisionamento inicial

Execute o instalador em uma �nica linha (Linux/Bash):

```bash
curl -fsSL https://raw.githubusercontent.com/lukeboh/paje/main/install-page.sh -o install-page.sh && chmod +x install-page.sh && ./install-page.sh
```

O instalador:

1. Verifica Git e instala se necess�rio.
2. Clona o reposit�rio do PAJ�.
3. Executa health-check.
4. Cria link `paje` apontando para `paje.sh`.
5. (Opcional) adiciona o diret�rio ao `PATH`.
6. (Opcional) inicia o PAJ� ao final.

## Configura��o do runtime JavaScript

Para garantir Node.js e npm corretos:

```bash
./config-paje.sh
```

O script garante Node.js 24.x (Active LTS) e valida a instala��o.

## Como executar

### Execu��o interativa (TUI)

Sem par�metros, o PAJ� abre o menu TUI:

```bash
paje
```

> Observa��o: o `paje.sh` ajusta o diret�rio de trabalho apenas dentro do pr�prio processo para localizar o `package.json`. Isso n�o altera o diret�rio do seu terminal e permite chamar o comando de qualquer local.

### Execu��o via CLI

```bash
paje git-sync [op��es]
paje git-server-store [op��es]
```

### Execu��o via npm (dev)

```bash
npm run dev -- <comando>
```

## Funcionalidades disponíveis

### 1) `git-sync` — sincronizar repositórios GitLab

Sincroniza repositórios em paralelo, com seleção por TUI e status de cada repositório.

> Requisitos detalhados da TUI: consulte [`docs/requisitos-tui-git-sync.md`](docs/requisitos-tui-git-sync.md:1).

**TUI (git-sync):**

- Exibe mensagem de acesso ao servidor durante a listagem.
- Apresenta branch e estado de cada repositório (cores iguais ao CLI).
- Mostra progresso por linha na árvore durante a sincronização.
- Usa `Enter` para sincronizar os itens selecionados.
- Ao finalizar, abre um modal com resumo da sincronização.

**Exemplo (CLI):**

```bash
paje git-sync --base-dir repos --server-name "GitLab" --base-url https://gitlab.com
```

**Parâmetros:**

| Parâmetro | Obrigatório | Padrão | Descrição | Valores/Observações |
| --- | --- | --- | --- | --- |
| `-v`, `--verbose` | não | `false` | Exibe logs detalhados | `true`/`false` |
| `--base-dir <dir>` | não | `repos` | Diretório base de clonagem | caminho local (aceita `~`) |
| `--server-name <name>` | não | — | Nome do servidor GitLab | ex: `GitLab` |
| `--base-url <url>` | não | — | URL base do GitLab | ex: `https://gitlab.com` |
| `--use-basic-auth` | não | `false` | Usar autenticação básica | requer `--username` |
| `--username <username>` | n�o | ? | Usu�rio para autentica��o b�sica | obrigat�rio se `--use-basic-auth` |
| `--password <password>` | n�o | ? | Senha para autentica��o b�sica | solicitado se necess�rio |
| `--user-email <email>` | n�o | ? | Email do Git para configurar nos reposit�rios sincronizados | ex: `nome@empresa.com` |
| `--key-label <label>` | n�o | ? | Nome da chave SSH a gerar | ex: `paje` |
| `--passphrase <passphrase>` | n�o | ? | Passphrase da chave SSH | opcional |
| `--public-key-path <path>` | n�o | ? | Caminho para chave p�blica existente | deve terminar com `.pub` |
| `--env-file <path>` | n�o | `~/.paje/env.yaml` | Caminho do arquivo de ambiente | YAML |
| `--prepare-local-dirs [value]` | n�o | `false` | Cria diret�rios sem clonar | `true`/`false` |
| `--no-summary [value]` | n�o | `false` | Oculta resumo final | `true`/`false` |
| `--no-public-repos [value]` | n�o | `false` | Oculta reposit�rios p�blicos | `true`/`false` |
| `--no-archived-repos [value]` | n�o | `false` | Oculta reposit�rios arquivados | `true`/`false` |
| `-f`, `--filter <pattern>` | n�o | ? | Filtro Ant/Glob por caminho (`path_with_namespace`) | separado por `;` |
| `--sync-repos <pattern>` | n�o | ? | Reposit�rios/branches para sincronizar | Ant/Glob com branch opcional via `#` |
| `--parallels <value>` | n�o | `1` | Paralelismo na sincroniza��o | `AUTO`, `0` ou n�mero ? 1 |
| `--dry-run` | n�o | `false` | Simula a��es sem persistir | n�o executa clone/pull/push |
| `--git-show-public-repos` | ? | ? | Removido | Use autentica��o ou `--public-repos` para filtros locais. |

**Comportamento relevante:**

- Sem autentica��o, somente reposit�rios p�blicos podem ser listados.
- Se houver associa��o SSH v�lida (`~/.ssh/config`), o fluxo prioriza SSH.
- O resumo final mostra estados: `SYNCED`, `BEHIND`, `AHEAD`, `REMOTE`, `EMPTY`, `LOCAL`, `UNCOMMITTED`.
- O filtro suporta padr�es Ant/Glob: `?` (um caractere), `*` (qualquer trecho no mesmo diret�rio), `**` (qualquer profundidade), e m�ltiplos padr�es separados por `;` (com espa�os ignorados).
- `--sync-repos` aceita padr�es Ant/Glob no formato `path_with_namespace[.git]#branch`. A `#branch` � opcional. Exemplo: `grupo/projeto.git#main`.
- `--parallels` controla o n�mero de workers na sincroniza��o. Use `AUTO` ou `0` para ajuste autom�tico.
- Quando `--dry-run` � usado, o comando apenas informa o que faria (clone/pull/push) sem executar.

**Exemplo com filtro:**

```bash
npm run dev -- git-sync --env-file=env-test.yaml --verbose --filter="**/setot/**/*"
```

### 2) `git-server-store` ? registrar SSH e token no GitLab

Gera (ou reutiliza) chave SSH, registra no GitLab e cria/rotaciona token pessoal.

**Exemplo (CLI):**

```bash
paje git-server-store --base-url https://git.tse.jus.br --username usuario --token-name "paje-token"
```

**Par�metros:**

| Par�metro | Obrigat�rio | Padr�o | Descri��o | Valores/Observa��es |
| --- | --- | --- | --- | --- |
| `-v`, `--verbose` | n�o | `false` | Exibe logs detalhados | `true`/`false` |
| `--server-name <name>` | n�o | `GitLab` | Nome do servidor | ? |
| `--base-url <url>` | n�o | `https://git.tse.jus.br` | URL base do GitLab | ? |
| `--username <username>` | sim | ? | Usu�rio do GitLab | obrigat�rio |
| `--key-label <label>` | n�o | `paje` | Nome da chave SSH | ? |
| `--passphrase <passphrase>` | n�o | ? | Passphrase da chave | opcional |
| `--public-key-path <path>` | n�o | ? | Chave p�blica existente | `.pub` |
| `--key-overwrite` | n�o | `false` | Sobrescrever chave existente | gera `.bak` |
| `--retry-delay-ms <ms>` | n�o | ? | Intervalo entre tentativas | n�mero em ms |
| `--max-attempts <count>` | n�o | ? | N�mero m�ximo de tentativas | n�mero |
| `--env-file <path>` | n�o | `~/.paje/env.yaml` | Caminho do arquivo de credenciais | YAML |
| `--token-name <name>` | sim | ? | Nome do token pessoal | obrigat�rio |
| `--token-scopes <scopes>` | n�o | padr�o interno | Escopos do token | `read_repository,read_api,...` |
| `--token-expires-at <date>` | n�o | +1 ano | Data expira��o | `YYYY-MM-DD` |

### 3) `ssh-key-store` (obsoleto)

Comando legado. Use `git-server-store`.

## Configura��o por arquivo (env.yaml)

O PAJ� l� par�metros de `~/.paje/env.yaml` (padr�o), ou de um arquivo informado via `--env-file`.

**Exemplo de `~/.paje/env.yaml`:**

```yaml
baseDir: ~/repos
serverName: GitLab
baseUrl: https://gitlab.com
useBasicAuth: false
username: meu.usuario
password: "minha-senha"
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

> Senhas e tokens **n�o devem ser versionados**. Use arquivos locais com permiss�es restritas.

## Persist�ncia de dados

O PAJ� salva dados locais em:

- `~/.paje/logs` ? logs de execu��o.
- `~/.paje/git-servers.json` ? servidores GitLab e tokens.

## Integra��o SSH

Durante os fluxos `git-sync` e `git-server-store`, o PAJ�:

1. Gera ou reutiliza chave SSH (`ed25519`) em `~/.ssh`.
2. Atualiza `~/.ssh/config` com o host do GitLab.
3. (Opcional) Adiciona o host em `~/.ssh/known_hosts` via `ssh-keyscan`.
4. Registra a chave no GitLab via fluxo web autenticado.

Se a chave j� existe, o PAJ� reutiliza e evita sobrescrever, a menos que `--key-overwrite` seja usado.

## Integra��o Git/GitLab

- **GitLab**: autentica��o por SSH e/ou autentica��o b�sica para cria��o de token.
- **Tokens pessoais**: o PAJ� valida, reutiliza ou rotaciona tokens existentes quando poss�vel.
- **GitHub**: suporte ainda n�o implementado na CLI/TUI atual.

## Estrutura TUI

A TUI segue o padr�o de tr�s �reas:

1. **Barra superior**: t�tulo/funcionalidade atual.
2. **�rea principal**: menus e formul�rios.
3. **Barra inferior**: instru��es contextuais para cada campo.

## Testes

```bash
npm test
```

## Regras do projeto (leitura obrigat�ria)

Este reposit�rio usa o arquivo [`.clinerules`](.clinerules) como fonte oficial de regras e contexto. Para garantir que ele seja sempre lido por quem trabalha no projeto:

- Sempre revise e siga o conte�do em [`.clinerules`](.clinerules) antes de iniciar tarefas.
- Em revis�es e PRs, valide se novas mudan�as continuam aderentes �s regras em [`.clinerules`](.clinerules).
- Em automa��es locais (scripts, prompts ou assistentes), adicione uma etapa expl�cita de leitura de [`.clinerules`](.clinerules).
