# Regra: Help e atalhos

## Obrigatório

Sempre que um novo atalho (tecla ou combinação) for criado, alterado ou removido:

1. Atualize a modal de Help (lista e estados de habilitação por contexto).
2. Atualize os textos de orientação no i18n (`pt_BR` e `en_US`).
3. Atualize a documentação:
   - [`docs/funcionalidades/help-shortcuts.md`](../../docs/funcionalidades/help-shortcuts.md:1)
   - [`docs/TUI-leiaute.md`](../../docs/TUI-leiaute.md:1)
   - [`README.md`](../../README.md:1)

## Sensibilidade ao contexto (referência)

- **Menu principal**: atalhos do menu + globais habilitados; demais exibidos e desabilitados.
- **Árvore de repositórios**: atalhos de árvore + globais habilitados; demais exibidos e desabilitados.
- **Loading**: apenas globais habilitados.

## Garantias

- A modal de Help **sempre** lista todos os atalhos conhecidos.
- Atalhos não aplicáveis devem ficar sombreados.
- Pressionar um atalho dentro da modal deve fechar a modal e delegar a execução para o handler da tela atual.
