# Regras do Projeto PAJÉ

Você é um Arquiteto de Software Sênior e Desenvolvedor Full-stack. O PAJÉ é um **Facilitador** de ambiente de desenvolvimento para integrar GitLab, Jira, Nexus e configurações locais (WSL, SSH, Docker, etc).

## Diretrizes de Implementação
- **Identidade:** PAJÉ - Plataforma de Apoio à Jornada do Engenheiro.
- **Linguagem:** TypeScript (Node.js).
- **Interface:** O PAJE poderá ser usado de três formas:
-- via CLI, robusta e que permita testes uso indivisual e automatizações dos processos;
-- via TUI - Terminal de Usuário Textua - que deve servir para uso completo de todas as funcionalidades, sem necessidade de memorização de todos os parâmetros;
-- via GUI - como extensão de navegador ou mesmo uma aplicação completa para usuários que não tem experiência com prompts de comando.
-- Em todos os casos, o sistema deve procurar persistir os parâmetros de configuração do diretório ~/.paje. E deve ser possível armazenar os parâmetros em um arquivo de ambiente (default: ~/.paje/env.yaml) que pode ser passado de parâmetro.
- **Segurança:** NUNCA salvar senhas em texto plano. Usar variáveis de ambiente seguras ou gerenciadores de chaves (como keytar).
- **Testes:** Todo novo recurso deve incluir testes automatizados. A tarefa só é considerada concluída após a verificação de sucesso dos testes.
- **Agnosticismo:** A ferramenta deve funcionar com GitLab corporativo ou GitHub.
- **Logging:** Centralizar logs no LoggerBroker, com transports e níveis mínimos configuráveis por destino (console, painel TUI, arquivo).
- **Documentação:** A cada criação ou mudança de comportamento de funcionalidade, criação ou mudanças em parâmetros e comportamentos, deve ser atualizado o arquivo [README.md](../../README.md)

## Regras de Implementação
1. **Verificação de Instalação:** O script inicial (`install_paje.sh`) deve apenas baixar o repositório do PAJE e realizar um health-check. Se o usuário desejar, já deve iniciar o PAJE (`paje.sh`)
2. **Cross-Platform:** Mantenha a lógica modular para suportar Linux (Bash) e futuramente Windows (.bat/PowerShell).
3. **Padrão de Código:** Conventional Commits e código limpo em português para logs/mensagens ao usuário.

### Regras de Usabilidade
1. **Esc:** ao pressionar "Esc", o sistema deve voltar à tela anterior sem confirmação adicional.
2. **Parâmetros:** os parâmetros para cada funcionalidade devem ser apresentados em um único formulário de execução, evitando que se espalhe por diversas telas e dificultando a visualização completa dos parâmetros.
3. A aplicação TUI tem 4 quadros:
3.1 Uma barra superior que guarda o título da funcionalidade.
3.2 Uma barra principal, que apresenta menus e formulários.
3.3 Uma barra inferior de orientação (1 linha) para explicar o que deve ser feito conforme o foco atual.
3.4 Um painel de log na parte inferior com ~15% da altura (com logs e erros em vermelho).
4. O atalho **F12** alterna o log em tela cheia e retorna ao layout padrão.
5. **Ctrl+C** encerra a aplicação.

## Estrutura de Tarefas
- Sempre valide dependências antes de iniciar uma funcionalidade.
- Realize o "Health Check" pós-instalação ou pós-configuração.