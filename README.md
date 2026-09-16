# Palpiteiro

Party game multiplayer de perguntas numéricas para jogar em salas privadas.

## Requisitos

- Node.js 20 ou superior
- npm

## Instalação e execução

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. O servidor Socket.IO roda em `http://localhost:3001`.

Para executar a versão compilada:

```bash
npm run build
npm start
```

Nesse modo, abra `http://localhost:3001`.

## Como jogar

1. Informe seu nome e clique em **Criar uma sala**.
2. Compartilhe o código de seis caracteres com os amigos.
3. Os demais jogadores informam o nome e o código em **Entrar**.
4. O host escolhe rodadas, tempo e categorias e inicia a partida.
5. Cada pessoa envia um único palpite por rodada. A resposta correta só é revelada no resultado.

O servidor mantém salas, respostas, pontuação e perguntas em memória. Salas vazias são removidas automaticamente. O identificador da sessão fica no `localStorage` para tentar reconectar após uma atualização da página.

## Jogar pela mesma rede

Descubra o IP local do computador que está executando o projeto e compartilhe `http://SEU_IP:5173` com os amigos conectados à mesma rede. Libere as portas 5173 e 3001 no firewall se necessário.

## Deploy na internet

O frontend publicado no Cloudflare Pages não executa o servidor Node/Socket.IO deste projeto. É necessário publicar a pasta `server` em um serviço que mantenha um processo Node, como Render, Railway, Fly.io ou um VPS.

Depois de publicar o backend, configure no Cloudflare Pages uma variável de ambiente para o build:

```text
VITE_SOCKET_URL=https://SEU-BACKEND.exemplo.com
```

Faça um novo deploy do Pages depois de salvar a variável. O endereço precisa apontar para o backend Socket.IO, não apenas para a página do frontend. O backend deve permitir CORS para o domínio do Pages e manter suporte a WebSocket.

Sem essa variável, o desenvolvimento local usa `http://localhost:3001`; em produção o navegador tenta a origem do próprio Pages, onde não existe o servidor Socket.IO. Por isso os botões parecem lentos ou não respondem.

## Compartilhar temporariamente pela internet

Use um túnel temporário como Cloudflare Tunnel ou ngrok apontando para a porta 3001 do servidor Socket.IO. Defina `VITE_SOCKET_URL` com a URL pública do servidor antes do build. Como as partidas vivem apenas na memória, reiniciar o processo encerra as salas.

## Testes

```bash
npm test
```

As regras críticas cobertas incluem acerto exato, proximidade empatada e bloqueio de resposta duplicada.
