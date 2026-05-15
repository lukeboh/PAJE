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
Ao selecionar S para sincronizar na primeira tela no menu de funcionalidades, uma mensagem genérica "yyyy-mm-dd hh:mm:ss] Mensagem informativa" era apresentada no painel de log e o texto abaixo era apresentado na área de trabalho:

> GitLab
> Acessando servidores e carregando repositórios - requisições: 2

A mensagem informativa não era útil e o "Acessando servidores e carregando repositórios - requisições: 2" estava estático e não dava ideia do progresso no acesso ao servidor. A TUI também não espelhava as mesmas mensagens do CLI.

**Impacto:**
Falta de coerência quanto aos feedbacks que o sistema dá ao usuário para acompanhar a operação do sistema.

**Como reproduzir:**
1. Executar `paje` e selecionar S para sincronizar.
3. Observar as mensagens na área de trabalho e painel de log.

**Status:**
Corrigido.

**Solução aplicada:**
- Direcionado o log de carregamento/HTTP e progresso do sync para o painel TUI com o mesmo texto e ordem do CLI.
- Removidas mensagens genéricas que não existem no CLI.
- Logs verbose da API passam a ser exibidos no painel TUI.
- A duração de listagem de repositórios é registrada no painel sem formatação ANSI para manter equivalência com o CLI.

**Validação sugerida:**
- Executar `./paje.sh git-sync --locale=en-US --dry-run --verbose` e comparar a saída do CLI com o painel TUI usando os mesmos parâmetros.

---

## Como registrar novos bugs

1. Descreva o comportamento esperado e o comportamento atual.
2. Registre passos de reprodução.
3. Inclua impacto e workaround (se existir).
4. Atualize o status e, se corrigido, referência ao commit/PR.