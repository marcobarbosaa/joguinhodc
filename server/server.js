import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { GameManager } from './gameManager.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' }, maxHttpBufferSize: 1e5 });
const games = new GameManager();
const PORT = process.env.PORT || 3001;
const sockets = new Map();

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(express.static('dist'));

function sendRoom(room) { if (room) io.to(room.code).emit('room_state', games.publicRoom(room)); }
function fail(socket, error) { socket.emit('game_error', error.message || 'Não foi possível concluir essa ação.'); }
function joinSocket(socket, room) { socket.join(room.code); socket.data.roomCode = room.code; socket.data.playerId = socket.id; }

io.on('connection', (socket) => {
  socket.on('create_room', ({ name } = {}) => { try { const room = games.createRoom(name, socket.id); room.hostId = socket.id; joinSocket(socket, room); sockets.set(socket.id, room.code); socket.emit('room_created', { code: room.code, playerId: socket.id }); sendRoom(room); } catch (error) { fail(socket, error); } });
  socket.on('join_room', ({ code, name } = {}) => { try { const room = games.joinRoom(code, name, socket.id); joinSocket(socket, room); sockets.set(socket.id, room.code); socket.emit('room_joined', { code: room.code, playerId: socket.id }); sendRoom(room); } catch (error) { fail(socket, error); } });
  socket.on('reconnect_player', ({ code, playerId } = {}) => { const room = games.reconnect(code, playerId, socket.id); if (!room) return fail(socket, new Error('Não encontramos sua partida.')); joinSocket(socket, room); sockets.set(socket.id, room.code); socket.emit('room_joined', { code: room.code, playerId: socket.id }); sendRoom(room); if (room.phase === 'question') broadcastQuestionTimer(room); });
  socket.on('start_game', (settings) => { try { const room = games.getRoom(socket.data.roomCode); games.start(room, socket.id, settings); sendRoom(room); broadcastQuestionTimer(room); } catch (error) { fail(socket, error); } });
  socket.on('submit_answer', ({ value } = {}) => { try { const room = games.getRoom(socket.data.roomCode); const allAnswered = games.submit(room, socket.id, Number(value)); socket.emit('answer_received'); if (allAnswered) { games.finish(room); sendRoom(room); } } catch (error) { fail(socket, error); } });
  socket.on('next_round', () => { try { const room = games.getRoom(socket.data.roomCode); games.next(room, socket.id); sendRoom(room); if (room.phase === 'question') broadcastQuestionTimer(room); } catch (error) { fail(socket, error); } });
  socket.on('disconnect', () => { const code = sockets.get(socket.id); sockets.delete(socket.id); const room = games.getRoom(code); if (!room) return; const player = room.players.find((item) => item.id === socket.id); if (player) player.connected = false; setTimeout(() => { const current = games.getRoom(code); if (!current || !current.players.some((item) => item.id === socket.id)) return; const updated = games.leave(socket.id); sendRoom(updated); }, 5000); sendRoom(room); });
});

function broadcastQuestionTimer(room) {
  clearTimeout(room.timer);
  room.timer = setTimeout(() => { games.finish(room); sendRoom(room); }, room.seconds * 1000);
}

httpServer.listen(PORT, () => console.log(`Palpiteiro server em http://localhost:${PORT}`));
