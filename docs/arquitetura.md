# Arquitetura do PAJÉ

## Visão geral

O PAJÉ é uma plataforma CLI/TUI escrita em TypeScript (Node.js) que automatiza tarefas de ambiente para engenharia, com foco inicial em integrações GitLab. A base é composta por comandos CLI, serviços de integração Git/GitLab e uma camada TUI em Ink.

## Organização do código

```
src/
  cli.ts                 # Entrada principal (CLI/TUI)
  modules/
    git/                 # Domínio Git/GitLab
      gitCommand.ts      # Definição de comandos e orquestração
      gitlabApi.ts       # API GitLab
      gitRepoScanner.ts  # Leitura de estado local
      parallelSync.ts    # Sincronização paralela
      persistence.ts     # Persistência local (~/.paje)
      sshManager.ts      # SSH, tokens e autenticação
      tui/               # Layout e componentes Ink
      tui.app.tsx        # Renderização da árvore de repositórios
      tuiSession.tsx     # Prompts interativos (Ink)
      types.ts           # Tipos do domínio
```

## Fluxos principais

### CLI

1. [`cli.ts`](../src/cli.ts:1) inicializa o programa e registra comandos.
2. [`gitCommand.ts`](../src/modules/git/gitCommand.ts:1) resolve parâmetros (CLI + env), valida dependências e executa serviços.
3. Logs e persistência são gravados em `~/.paje`.

### TUI

1. TUI é iniciada pelo menu Ink em [`menu.app.tsx`](../src/modules/git/tui/menu.app.tsx:1).
2. Para `git-sync`, a árvore é renderizada em [`tui.app.tsx`](../src/modules/git/tui.app.tsx:1).
3. Prompts interativos (formulários, listas, confirmações) são fornecidos em [`tuiSession.tsx`](../src/modules/git/tuiSession.tsx:1) usando [`Layout`](../src/modules/git/tui/layout.tsx:1).

## Persistência e configuração

- Configurações e logs locais ficam em `~/.paje`.
- Parâmetros podem vir do arquivo `~/.paje/env.yaml` ou de `--env-file`.
- Tokens e chaves nunca são persistidos em texto plano no repositório.

## Componentes de TUI

O layout padrão em Ink é composto por:

- Barra de título (`TitleBar`).
- Área de trabalho (`Workspace`).
- Barra de orientação (`OrientationBar`).
- Painel de log (`LoggerPanel`).

## Testes

Testes estão em `tests/` e são executados com:

```bash
npm test
```

Os testes de TUI validam rendering e padrões de layout.

## Dependências principais

- Ink/React para TUI.
- Commander para CLI.
- Cheerio para fluxos web.
- Tough-cookie para sessões.
