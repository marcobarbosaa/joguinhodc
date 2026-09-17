import test from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from '../server/gameManager.js';

function setup() {
  const games = new GameManager();
  const room = games.createRoom('Ana', 'a');
  room.hostId = 'a';
  games.joinRoom(room.code, 'Bia', 'b');
  games.start(room, 'a', { rounds: 5, seconds: 30 });
  return { games, room };
}

test('pontua acerto exato e o mais próximo entre os restantes', () => {
  const { games, room } = setup();
  room.question = { ...room.question, answer: 100 };
  games.submit(room, 'a', 100);
  games.submit(room, 'b', 105);
  games.finish(room);
  assert.deepEqual(room.result.entries.map((entry) => entry.points), [2, 1]);
});

test('divide ponto em empate de distância', () => {
  const { games, room } = setup();
  room.question = { ...room.question, answer: 100 };
  games.submit(room, 'a', 90);
  games.submit(room, 'b', 110);
  games.finish(room);
  assert.deepEqual(room.result.entries.map((entry) => entry.points), [1, 1]);
});

test('rejeita segunda resposta do mesmo jogador', () => {
  const { games, room } = setup();
  games.submit(room, 'a', 100);
  assert.throws(() => games.submit(room, 'a', 101), /já respondeu/);
});

test('permite iniciar uma partida para testar as perguntas sozinho', () => {
  const games = new GameManager();
  const room = games.createRoom('Ana', 'a');
  room.hostId = 'a';

  games.start(room, 'a', { rounds: 5, seconds: 30 });

  assert.equal(room.phase, 'question');
  assert.ok(room.question.question);
});

test('seleciona perguntas únicas durante toda a partida', () => {
  const { room } = setup();
  const selected = room.selectedQuestions.map((question) => question.question);

  assert.equal(new Set(selected).size, selected.length);
});

test('rejeita categorias com perguntas únicas insuficientes', () => {
  const games = new GameManager();
  const room = games.createRoom('Ana', 'a');
  room.hostId = 'a';

  assert.throws(() => games.start(room, 'a', { rounds: 20, seconds: 30, categories: ['Categoria inexistente'] }), /perguntas únicas/);
});

test('volta a sala ao lobby sem remover os jogadores', () => {
  const { games, room } = setup();
  room.phase = 'finished';
  room.result = { answer: 10 };

  games.backToLobby(room);

  assert.equal(room.phase, 'lobby');
  assert.equal(room.players.length, 2);
  assert.equal(room.question, null);
  assert.equal(room.result, undefined);
  assert.equal(room.selectedQuestions.length, 0);
});
