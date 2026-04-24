# PAJÉ - Plataforma de Apoio à Jornada do Engenheiro

O PAJÉ é um facilitador de ambiente de desenvolvimento. Ele automatiza tarefas repetitivas e configura integrações (GitLab/GitHub, Jira, Nexus, etc.) de forma harmonizada para o desenvolvedor.

## Instalação e provisionamento inicial

Execute o instalador em uma única linha (Linux/Bash):

```bash
curl -fsSL https://raw.githubusercontent.com/lukeboh/paje/main/install_paje.sh -o install_paje.sh && chmod +x install_paje.sh && ./install_paje.sh
```

## Requisitos

- Linux com Bash
- Git (o instalador tenta instalar caso não esteja disponível)

## Regras do projeto (leitura obrigatória)

Este repositório usa o arquivo [`.clinerules`](.clinerules) como fonte oficial de regras e contexto. Para garantir que ele seja sempre lido por quem trabalha no projeto:

- Sempre revise e siga o conteúdo em [`.clinerules`](.clinerules) antes de iniciar tarefas.
- Em revisões e PRs, valide se novas mudanças continuam aderentes às regras em [`.clinerules`](.clinerules).
- Em automações locais (scripts, prompts ou assistentes), adicione uma etapa explícita de leitura de [`.clinerules`](.clinerules).
