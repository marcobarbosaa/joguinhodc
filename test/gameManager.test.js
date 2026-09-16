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
