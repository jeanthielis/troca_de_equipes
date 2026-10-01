# Troca de escala — versão simples

Aplicação web para celular e computador. Organiza o revezamento de escala e gera o formulário **UN-FO-SPE-023** preenchido.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página. Carrega o visual, as bibliotecas e o script. |
| `estilo.css` | Todo o visual (celular e computador). As cores ficam no início do arquivo. |
| `script.js` | Toda a lógica. **A configuração do Firebase fica no início do arquivo.** |
| `modelo-un-fo-spe-023.pdf` | O formulário oficial em branco, que recebe as informações. |
| `firestore.rules` | As regras de segurança do banco de dados. |
| `iniciar.bat` + `servidor.ps1` | Abrem o app no seu computador em `http://localhost:8080` (Windows). |
| `firebase.json` | Só é usado se você publicar pelo Firebase Hosting. |

O `script.js` está dividido em partes numeradas, cada uma com um comentário no topo: configuração, utilitários, banco de dados, PDF, interface, telas e início.

## Como funciona

1. O **colaborador** entra com a matrícula, cria um revezamento com o dia da folga dele e envia o link ao colega pelo WhatsApp.
2. O **colega** abre o link, entra, aceita e escolhe o dia da folga dele. Em cada uma das datas, um folga e o outro trabalha no lugar.
3. O **gestor** aprova ou recusa. Se os dois forem de equipes diferentes, os dois gestores precisam aprovar.
4. O gestor ou o RH gera o **PDF**, com uma folha do formulário para cada colaborador.

Cada perfil tem um acesso diferente:
- **Gestor:** vê e cadastra só a própria equipe.
- **RH:** vê e cadastra todos.

Essas restrições estão nas regras do banco, não só na tela.

## Colocar no ar

### 1. Firebase (gratuito)

1. Em <https://console.firebase.google.com>, crie um projeto.
2. **Authentication** → *Vamos começar* → ative **E-mail/senha**.
3. **Firestore Database** → *Criar banco de dados* → modo **produção** → região **southamerica-east1 (São Paulo)**.
4. Ainda no Firestore, abra a aba **Regras**. Apague o que estiver lá, cole todo o conteúdo do arquivo `firestore.rules` e clique em **Publicar**.
5. **Configurações do projeto** (engrenagem) → *Seus apps* → ícone **Web** (`</>`) → registre o app.

### 2. Configurar

No passo 5, o Firebase mostra um código parecido com este:

```js
import { initializeApp } from "firebase/app";      // ← NÃO copie
const firebaseConfig = {                             // ← copie daqui...
  apiKey: "AIza...",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};                                                   // ← ...até aqui
const app = initializeApp(firebaseConfig);           // ← NÃO copie
```

Abra o `script.js` num editor de texto, como o Bloco de Notas ou o VS Code. No início do arquivo há um bloco `const firebaseConfig = { ... };` com os campos vazios. **Substitua esse bloco** pelo bloco que você copiou do Firebase e salve.

### 3. Hospedar

Os arquivos precisam estar num servidor web. **Abrir o `index.html` com duplo clique não funciona**, porque o login do Firebase exige um endereço `http(s)`. Se você abrir assim, o próprio app avisa.

- **Testar no seu computador (Windows):** dê dois cliques em **`iniciar.bat`**. Uma janela preta se abre e o navegador abre o app em `http://localhost:8080`. Deixe a janela aberta enquanto usa o app; para parar, é só fechá-la. Não precisa instalar nada.
- **Firebase Hosting** (gratuito): instale o Node.js e rode, nesta pasta:
  ```bash
  npm install -g firebase-tools
  firebase login
  firebase init hosting    # escolha o projeto; diretório público: .  (ponto); não sobrescreva o index.html
  firebase deploy --only hosting
  ```
  O endereço fica parecido com `https://seu-projeto.web.app`.
- **Servidor da empresa** (intranet, IIS, Apache): copie os arquivos para uma pasta publicada. Depois, inclua o endereço do servidor em **Authentication → Configurações → Domínios autorizados**.

### 4. Primeiro acesso

1. Abra o endereço e toque em **Configurar o sistema pela primeira vez**. Essa tela só funciona uma vez, então faça isso logo após publicar.
2. Cadastre o usuário do RH.
3. Em **Usuários**, cadastre primeiro os **gestores** e depois os **colaboradores**.
4. Envie a cada pessoa a matrícula e a senha provisória que o app mostra. No primeiro acesso, ela cria a própria senha.

## Ajustes comuns

| O que mudar | Onde |
|---|---|
| Cores | Variáveis no início do `estilo.css` |
| Lista de empresas | `EMPRESAS`, no início do `script.js` |
| Texto da justificativa no PDF | `folhas(troca)`, na parte 4 do `script.js` |
| Posição de um campo no PDF | `layout(f)`, na parte 4 do `script.js` |

## Limitações desta versão

- **Senha esquecida:** não há recuperação pelo app. Quem esquecer a senha precisa de ajuda do administrador do Firebase. Isso pode ser resolvido com Cloud Functions, que exigem o plano pago Blaze.
- **Endereço do app:** quem souber o endereço consegue criar uma conta de login avulsa, mas ela **não acessa nenhum dado**, porque as regras exigem um cadastro feito pelo RH ou por um gestor.
- **Descanso entre jornadas:** o app ainda não confere o descanso de 11 horas entre jornadas.

## Erros comuns

| Mensagem | Causa e solução |
|---|---|
| `firebaseConfig is not defined` ou `Identifier 'firebaseConfig' has already been declared` | O bloco de configuração foi colado pela metade ou ficou duplicado. Deve existir **um único** `const firebaseConfig = { ... };` no início do `script.js`. |
| `Cannot use import statement outside a module` | Foram coladas as linhas `import ...` do Firebase. Apague-as e deixe só o bloco `firebaseConfig`. |
| `Unsafe attempt to load URL file:///...` | O app foi aberto com duplo clique. Use o `iniciar.bat` ou um servidor. |
| "Sem conexão" ao abrir | A rede bloqueia `www.gstatic.com` (Firebase) ou `cdnjs.cloudflare.com` (PDF). Peça a liberação à TI. |
| "Matrícula ou senha incorretas" no primeiro login do RH | Confira se o login por **E-mail/senha** está ativado em Authentication. |
| "Você não tem permissão para essa ação" | As regras (`firestore.rules`) não foram publicadas na aba **Regras** do Firestore. |
