# 🖥️ Conexão do Visual Studio Code a Servidor Remoto via SSH

Este documento registra a experiência completa de conexão do **Visual Studio Code (VS Code)** a um **servidor remoto Linux** utilizando a extensão **Remote – SSH**, incluindo os problemas encontrados e as soluções aplicadas.

---

## 🎯 Objetivo

Utilizar o VS Code instalado **na máquina local (Windows)** para desenvolver código diretamente em um **servidor remoto Linux**, sem instalar interface gráfica ou o VS Code completo no servidor.

---

## 🧩 Ambiente

- **Máquina local:** Windows (corporativo, domínio)
- **IDE:** Visual Studio Code (`1.117.0`)
- **Extensão:** Remote – SSH (`0.122.0`)
- **Servidor remoto:** Linux (Ubuntu x86_64)
- **Autenticação:** SSH por senha (inicialmente)

---

## ✅ Passo a passo de configuração

### 1️⃣ Instalar a extensão Remote – SSH

No VS Code local:

- Abrir **Extensões** (`Ctrl + Shift + X`)
- Instalar:
  - **Remote – SSH** (Microsoft)
  - (Opcional) **Remote Development**

---

### 2️⃣ Iniciar a conexão SSH

No VS Code local:

```text
Ctrl + Shift + P
Remote-SSH: Connect to Host...
```

- Informar o host:

```text
ssh usuario@host
```

Na primeira tentativa, o VS Code pergunta:

> **Select the platform of the remote host**

➡️ **Selecionar: Linux** ✅

---

## ❌ Problemas encontrados e soluções

### 🚨 Problema 1 — `code` não encontrado no servidor

**Sintoma:**

```bash
code .
Comando 'code' não encontrado
```

✅ **Explicação:**  
O VS Code **não deve ser iniciado no servidor remoto**. Todo o processo começa localmente.

✅ **Solução:**  
Sempre abrir o VS Code **na máquina local** e usar a extensão **Remote – SSH** para conectar.

---

### 🚨 Problema 2 — Falha ao estabelecer conexão com o host

**Mensagem chave no log:**

```text
Bad owner or permissions on C:\Users\nome.usuario\.ssh\config
```

**Causa:**  
O arquivo `~/.ssh/config` no Windows possuía permissões herdadas, permitindo acesso a outro usuário do domínio.

✅ **Solução aplicada:**  
Remover permissões de outros usuários para atender às exigências do OpenSSH.

**Via interface gráfica:

- Propriedades → Segurança → Avançado
- Desabilitar herança
- Remover usuários externos
- Manter apenas o próprio usuário

---

### 🚨 Problema 3 — Terminal ainda local após conectar

**Mensagem exibida:**

```text
Este shell está sendo executado em sua máquina LOCAL,
NÃO na máquina remota conectada
```

✅ **Explicação:**  
Durante a instalação inicial do **VS Code Server**, o terminal ainda é local.

✅ **Solução:**  
Aguardar o término do processo ou forçar:

```text
Ctrl + Shift + P
Developer: Reload Window
```

Depois disso, abrir um **novo terminal**, que já será remoto.

---

## ✅ Resultado final (conexão bem-sucedida)

O log confirmou:

- ✅ Autenticação SSH concluída
- ✅ VS Code Server instalado em `~/.vscode-server`
- ✅ Túnel SSH ativo
- ✅ Exec server criado e reutilizado
- ✅ Extensões sincronizadas no servidor

No rodapé do VS Code apareceu:

```text
SSH: nome-host
```

E no terminal remoto:

```bash
hostname
whoami
pwd
```

Saída esperada:

```text
nome_host
nome-usuario
/home/nome-usuario
```

---

## 🚀 Recomendações finais

- ✅ Configurar **autenticação por chave SSH**, evitando digitar senha
- ✅ Manter o `.ssh/config` com permissões restritas no Windows
- ✅ Abrir sempre o VS Code **na máquina local**
- ✅ Usar **Remote – SSH** para todo desenvolvimento em servidor
- ✅ Em ambientes corporativos, sempre validar permissões NTFS do diretório `.ssh`

---

## 📝 Conclusão

O processo de conexão do VS Code a um servidor remoto via SSH funcionou conforme esperado após ajustes de segurança no ambiente Windows (especialmente permissões NTFS nos arquivos SSH).

Com o **VS Code Server corretamente instalado e em execução**, o desenvolvimento remoto torna-se transparente, seguro e estável, mesmo em ambientes corporativos restritivos, dispensando instalação de interface gráfica ou do VS Code no servidor.
