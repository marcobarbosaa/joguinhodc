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

## Compartilhar temporariamente pela internet

Use um túnel temporário como Cloudflare Tunnel ou ngrok apontando para a porta 5173. Para clientes em outra origem, defina `VITE_SOCKET_URL` com a URL pública do servidor Socket.IO antes do build. Como as partidas vivem apenas na memória, reiniciar o processo encerra as salas.

## Testes

```bash
npm test
```

As regras críticas cobertas incluem acerto exato, proximidade empatada e bloqueio de resposta duplicada.
