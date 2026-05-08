Ao inspecionar storeSshKeyOnly() com a ferramenta de leitura (src/modules/git/gitCommand.ts), fica claro que o objeto credentials ainda tenta acessar cliOptions.password. Esse identificador deixou de existir nesse escopo após a remoção do fluxo legado, e exatamente por isso o ssh_key_store_command_test.ts derruba o git-server-store.

Para seguir:

Incluir password?: string em SshKeyStoreCliOptions na mesma seção do arquivo (linhas 558+).
Trocar o uso de cliOptions.password por algo como resolvedPassword ?? cli?.password ?? credentials.password dentro do bloco de credenciais.
Ajustar o teste para garantir que a senha consolidada continue coberta, e então rodar npm test novamente.