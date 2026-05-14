# Bugs conhecidos

## BUG-001 — Senha ausente no fluxo `git-server-store`

**Descrição:**
O fluxo `storeSshKeyOnly()` acessa `cliOptions.password`, que pode não existir após remoção de fluxo legado, causando falha em `ssh_key_store_command_test.ts`.

**Impacto:**
Impede execução correta do `git-server-store` quando a senha só está no env ou em prompt.

**Como reproduzir:**
1. Executar `npm test`.
2. O teste `ssh_key_store_command_test.ts` falha na etapa de credenciais.

**Status:**
Aberto.

**Solução planejada:**
- Incluir `password?: string` em `SshKeyStoreCliOptions`.
- Usar fallback `resolvedPassword ?? cli?.password ?? credentials.password`.
- Ajustar teste para cobrir senha consolidada e executar `npm test`.

---

## BUG-002 — Comportamento do Esc não está consistente

**Descrição:**

O Esc deveria "retornar":
1. Sair de uma modal;
2. Restaurar um painel maximizado;
3. Retornar para uma tela anterior, até chegar no menu principal.
4. Se estiver no menu principal, sair da aplicação.

**Impacto:**
Prejudica a usabilidade da aplicação.

**Como reproduzir:**
1. Executar `paje`.
2. Selecione qualquer menu, por exemplo o S - Sincronizar.
3. Clique em Esc. Deveria voltar para o menu mas não volta.

E em qualquer situação que está descrita na descrição.

**Status:**
Corrigido.

**Solução planejada:**
- Centralizar o tratamento do Esc no layout para priorizar: fechar modal -> restaurar painel maximizado -> voltar tela anterior -> sair no menu principal.
- Garantir que o retorno das telas internas (S/G) ao menu passe pelo handler global do layout.
- Reforçar esse comportamento na documentação.

---

## BUG-003 — Mensagens e Logs da funcionalidade de sincronização não estão dentro do padrão

**Descrição:**
Ao selecionar S para sincronizar na primeira tela no menu de funcionalidades, uma mensagem genérica "yyyy-mm-dd hh:mm:ss] Mensagem informativa" é apresentada no painel de log e o texto abaixo é apresentado na área de trabalho:

> GitLab
> Acessando servidores e carregando repositórios - requisições: 2

A mensagem informativa na verdade não informa nada e o "Acessando servidores e carregando repositórios - requisições: 2" está estático e não dá ideia do progresso no acesso ao servidor.

**Impacto:**
Falta de coerência quanto aos feedbacks que o sistema dá ao usuário para acompanhar a operação do sistema.

**Como reproduzir:**
1. Executar `paje` e selecionar S para sincronizar.
3. Observar as mensagens na área de trabalho e painel de log.

**Status:**
Aberto.

**Solução planejada:**
- Apresentar um spinner centralizado na área de trabalho durante a execução.
- Garantir que o painel de log está usando o mesmo modulo e operação para fazer a sincronização pela TUI e, desta forma, ter certeza que as mesmas mensagens que saiam console quando a sincronização é feita por CLI saiam no painel de acompanhamento quando executada pela TUI. Por exemplo, quando executo "./paje.sh git-sync --locale=en-US --dry-run --verbose" quero que a saída abaixo seja registrada em ambos os casos como logs e, portanto que saiam no painel de acompanhamento da seguinte forma:

HTTP GET https://git.tse.jus.br/api/v4/groups?all_available=true&per_page=100&page=1
Headers: {"Content-Type":"application/json","PRIVATE-TOKEN":"<REDACTED>"}
HTTP GET https://git.tse.jus.br/api/v4/projects?membership=true&per_page=100&page=1
Headers: {"Content-Type":"application/json","PRIVATE-TOKEN":"<REDACTED>"}
HTTP 200 https://git.tse.jus.br/api/v4/groups?all_available=true&per_page=100&page=1
HTTP 200 https://git.tse.jus.br/api/v4/projects?membership=true&per_page=100&page=1
HTTP GET https://git.tse.jus.br/api/v4/projects?membership=true&per_page=100&page=2
Headers: {"Content-Type":"application/json","PRIVATE-TOKEN":"<REDACTED>"}
HTTP 200 https://git.tse.jus.br/api/v4/projects?membership=true&per_page=100&page=2
HTTP GET https://git.tse.jus.br/api/v4/projects?membership=true&per_page=100&page=3
Headers: {"Content-Type":"application/json","PRIVATE-TOKEN":"<REDACTED>"}
HTTP 200 https://git.tse.jus.br/api/v4/projects?membership=true&per_page=100&page=3
Tempo 4.69s

- Reforçar regras de log, principalmente que todas as saídas para o usuário sejam por meio de log, de forma a garantir que tudo que saia na console saia no painel de acompanhamento e saia no arquivo de log.

---

## Como registrar novos bugs

1. Descreva o comportamento esperado e o comportamento atual.
2. Registre passos de reprodução.
3. Inclua impacto e workaround (se existir).
4. Atualize o status e, se corrigido, referência ao commit/PR.