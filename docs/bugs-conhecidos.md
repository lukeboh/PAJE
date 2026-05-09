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

## Como registrar novos bugs

1. Descreva o comportamento esperado e o comportamento atual.
2. Registre passos de reprodução.
3. Inclua impacto e workaround (se existir).
4. Atualize o status e, se corrigido, referência ao commit/PR.
