# Notas iniciais

- Documentação principal já afirma agregação de servidores, porém falta detalhamento do fluxo multi-servidor e uso de filtros na CLI e TUI.
- README precisa refletir exemplos de uso com múltiplos servidores e esclarecer comportamento dos filtros `--server-name`/`--base-url`.
- docs/requisitos-tui-git-sync.md precisa descrever explicitamente como a TUI atua com múltiplos servidores (agrupamentos, contadores, feedback, filtros aplicados).

## Lacunas observadas

- README lista parâmetros, mas não explica cenários multi-servidor com exemplos encadeando dados persistidos, filtros, e comportamento da TUI.
- README não mostra exemplo real de filtros combinando `--server-name` e `--base-url` ou integração com `--filter`, `--no-public-repos` etc.
- README não descreve como TUI apresenta banner consolidado com contagem de servidores, nem como filtros impactam a árvore.
- docs/requisitos-tui-git-sync.md cita filtros, porém não detalha efeitos do multi-servidor na árvore, spinner, orientação ou modal final.
- Documento de requisitos não define cenários alternativos como: nenhum servidor filtrado, uso de filtros contraditórios, operação com apenas subset de servidores.
- Falta referência explícita à persistência de `git-servers.json` e reuso de credenciais multi-servidor.

## Objetivos da atualização

1. README
   - Inserir visão geral do suporte multi-servidor, destacando agregação automática quando nenhum filtro é informado.
   - Documentar exemplos de CLI cobrindo:
     - Execução agregada padrão (`paje git-sync` listando múltiplos servidores).
     - Filtragem por nome (`--server-name`) e por URL (`--base-url`), incluindo comportamento combinado.
     - Exemplo com `--filter` e `--no-public-repos` destacando impacto nos servidores filtrados.
     - Uso da TUI acompanhando esses filtros (fluxo de seleção de servidores, mensagens de requisições).
   - Detalhar o relacionamento entre configuração persistida (`~/.paje/git-servers.json`), arquivo `env.yaml` e filtros CLI.
   - Documentar mensagens e comportamento da TUI (banner com `GitLab (N servidores)` e árvore agrupada por servidor).

2. docs/requisitos-tui-git-sync.md
   - Revisar fluxo principal para explicitar múltiplos servidores: listar, agrupar e sincronizar.
   - Adicionar requisitos específicos para header agregado, contagem de servidores, e feedback de requisições por servidor.
   - Documentar comportamento quando filtros `serverName`/`baseUrl` são aplicados: ocultar servidores não correspondentes, atualizar contadores.
   - Adicionar cenários alternativos (exemplo: nenhum servidor correspondente) incluindo mensagens esperadas.
   - Expandir RF-02 para refletir aplicação conjunta de filtros CLI/arquivo e indicar que a árvore apresenta tags dos servidores.
   - Documentar como o modal de resumo apresenta dados segmentados por servidor (quando aplicável).
   - Incluir notas sobre persistência e reutilização de servidores (pede credenciais apenas quando necessário) para alinhar TUI com CLI.

## Considerações adicionais

- Garantir consistência terminológica: “servidor”, “base URL”, “nome do servidor”.
- Validar que exemplos utilizem hosts reais do repositório (TSE-GIT, DEV-GIT) para coerência com testes existentes.
- Sincronizar README e requisitos com layout descrito em [`docs/TUI_LAYOUT.md`](docs/TUI_LAYOUT.md:1).
