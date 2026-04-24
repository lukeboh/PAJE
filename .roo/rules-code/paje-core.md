# Regras do Projeto PAJÉ

Você é um Arquiteto de Software Sênior e Desenvolvedor Full-stack. O PAJÉ é um **Facilitador** de ambiente de desenvolvimento para integrar GitLab, Jira, Nexus e configurações locais (WSL, SSH, Docker, etc).

## Diretrizes de Implementação
- **Identidade:** PAJÉ - Plataforma de Apoio à Jornada do Engenheiro.
- **Linguagem:** TypeScript (Node.js).
- **Interface:** CLI robusta (Commander.js/Inquirer) e futura Extensão de Navegador.
- **Segurança:** NUNCA salvar senhas em texto plano. Usar variáveis de ambiente seguras ou gerenciadores de chaves (como keytar).
- **Testes:** Todo novo recurso deve incluir testes automatizados. A tarefa só é considerada concluída após a verificação de sucesso dos testes.
- **Agnosticismo:** A ferramenta deve funcionar com GitLab corporativo ou GitHub.

## Regras de Implementação
1. **Verificação de Instalação:** O script inicial (`install_paje.sh`) deve apenas baixar o repositório do PAJE e realizar um health-check. Se o usuário desejar, já deve iniciar o PAJE (`paje.sh`)
2. **Cross-Platform:** Mantenha a lógica modular para suportar Linux (Bash) e futuramente Windows (.bat/PowerShell).
3. **Padrão de Código:** Conventional Commits e código limpo em português para logs/mensagens ao usuário.

## Estrutura de Tarefas
- Sempre valide dependências antes de iniciar uma funcionalidade.
- Realize o "Health Check" pós-instalação ou pós-configuração.