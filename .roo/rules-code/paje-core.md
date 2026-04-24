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

### Regras de Usabilidade
1. **Esc:** sempre quer for digitado "esc", o sistema tem voltar à tela anterior. Se o usuário estiver digitando algo, então deve perguntar se ele tem certeza que quer desistir da operação.
2. **Parâmetros:** os parâmetros para cada funcionalidade devem ser apresentados em um único formulário de execução, evitando que se espalhe por diversas telas e dificultando a visualização completa dos parâmetros.
3. A aplicação TUI tem 3 quadros: 
3.1 Um barra superior que guarda o título ou a funcioalidade.
3.2 Um barra principal, que apresenta menus e formulários.
3.3 Uma barra inferior para apresentar orientações sensíveis ao que está em tela e em preenchimento pelo usuário, com uma explicação para o usuário do que deve ser feito. Portanto garanta que em todos os locais que o usuário puder colocar o foco (opções de menu, inputs, etc), que seja apresentado uma explicação do que ele deve fazer.

## Estrutura de Tarefas
- Sempre valide dependências antes de iniciar uma funcionalidade.
- Realize o "Health Check" pós-instalação ou pós-configuração.