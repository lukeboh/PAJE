# Requisitos — TUI Git Sync (PAJÉ)

Este documento define os requisitos da funcionalidade **Sincronizar repositórios GitLab (git-sync)** na TUI.

## Identificação

- **Código da tela:** `TUI-GIT-SYNC`
- **Título:** PAJÉ - Sincronização Git

## Fluxo principal

1. Usuário seleciona `git-sync` no menu principal.
2. Sistema apresenta feedback de acesso ao servidor e inicia a listagem de repositórios.
3. Árvore de repositórios é exibida com estados e branchs.
4. Usuário seleciona itens (grupos/projetos) via checkbox.
5. Usuário confirma com **Enter** para sincronizar.
6. Sistema sincroniza respeitando paralelismo configurado.
7. Progresso aparece na linha de cada repositório.
8. Ao final, modal de resumo é exibido.

## Requisitos funcionais

### RF-01 — Feedback de acesso ao servidor

- Ao iniciar o `git-sync` na TUI, deve haver feedback imediato de acesso ao servidor.
- A mensagem deve indicar **quantidade de requisições realizadas**.
- Deve exibir um **spinner textual** (sequência `/-\|`).
- Exemplo de mensagem:
  - `Acessando servidor e carregando repositórios / requisições: 1`
  - `Acessando servidor e carregando repositórios - requisições: 2`

### RF-02 — Filtros e parâmetros aplicados

- A árvore deve respeitar todos os filtros definidos por arquivo de configuração e CLI:
  - `filter` (Ant/Glob)
  - `noPublicRepos`
  - `noArchivedRepos`
  - `prepareLocalDirs`
- Apenas projetos filtrados podem aparecer na árvore.

### RF-03 — Exibição de branch e status

- Cada repositório deve exibir **branch** e **status** à direita da linha.
- As cores devem seguir o mesmo padrão da CLI.
- Branchs conhecidas devem ter destaque (ex.: `main`, `master`, `develop`, `desenvolvimento`, `feature-*`).

### RF-04 — Seleção por checkbox

- Cada nó exibido deve ter checkbox (`[ ]`, `[~]`, `[x]`).
- Selecionar/desselecionar **não pode** alterar o scroll.
- Apenas o estado do checkbox deve ser alterado.

### RF-05 — Navegação e foco

- A barra azul de seleção deve acompanhar a navegação (↑/↓).
- A tela **só rola** quando a barra azul atinge o limite superior ou inferior visível.
- Não deve haver salto para topo ao selecionar itens.

### RF-06 — Confirmação e execução

- O texto de orientação deve indicar `Enter para sincronizar`.
- Ao confirmar, a sincronização deve se comportar como CLI:
  - Respeitar paralelismo configurado.
  - Respeitar `dry-run` quando definido.

### RF-07 — Progresso por linha

- Durante a sincronização, cada linha de repositório deve exibir progresso.
- As informações devem seguir o mesmo padrão visual da CLI.

### RF-08 — Resumo final

- Ao final da sincronização, exibir modal com resumo:
  - Tempo total
  - Contagem de ações (clone/pull/push/sem ação/falhas)
  - Lista ordenada de repositórios com métricas (objetos/volume/velocidade)

## Requisitos de usabilidade

### RU-01 — Orientações

- Barra inferior deve sempre conter instruções contextuais.
- Deve indicar ações básicas: navegar, selecionar, sincronizar, cancelar.

### RU-02 — Esc

- `Esc` retorna à tela anterior.
- Se o usuário estiver digitando, confirmar desistência.

## Requisitos não funcionais

### RNF-01 — UTF-8

- Todos os textos exibidos devem estar corretamente codificados em UTF-8.

### RNF-02 — Testes

- Todo ajuste deve incluir testes automatizados cobrindo comportamento da TUI.

