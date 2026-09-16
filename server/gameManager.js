import questions from './questions.json' with { type: 'json' };

const MAX_PLAYERS = 10;
const MIN_PLAYERS = 1;
const COLORS = ['#ff6b5f', '#ffd166', '#4ecdc4', '#7c83fd', '#f78fb3', '#6dd47e', '#f7a072', '#a78bfa', '#5dade2', '#e59866'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  let code = '';
  for (let index = 0; index < 6; index += 1) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

function cleanName(name) {
  return String(name ?? '').replace(/[<>]/g, '').trim().slice(0, 18);
}

function validNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15;
}

export class GameManager {
  constructor() { this.rooms = new Map(); }

  createRoom(name, socketId) {
    const playerName = cleanName(name);
    if (!playerName) throw new Error('Digite um nome válido.');
    let code = makeCode();
    while (this.rooms.has(code)) code = makeCode();
    const room = this.newRoom(code);
    room.players.push(this.newPlayer(socketId, playerName, true));
    this.rooms.set(code, room);
    return room;
  }

  newRoom(code) {
    return { code, hostId: null, players: [], phase: 'lobby', round: 0, totalRounds: 5, seconds: 30, categories: [], question: null, answers: new Map(), scores: new Map(), timer: null, selectedQuestions: [] };
  }

  newPlayer(id, name, isHost = false) { return { id, name, isHost, color: COLORS[Math.floor(Math.random() * COLORS.length)], connected: true }; }

  getRoom(code) { return this.rooms.get(String(code ?? '').toUpperCase()); }

  joinRoom(code, name, socketId) {
    const room = this.getRoom(code);
    const playerName = cleanName(name);
    if (!room) throw new Error('Sala não encontrada.');
    if (room.phase !== 'lobby') throw new Error('Essa partida já começou.');
    if (room.players.length >= MAX_PLAYERS) throw new Error('A sala está cheia.');
    if (!playerName) throw new Error('Digite um nome válido.');
    if (room.players.some((player) => player.name.toLocaleLowerCase() === playerName.toLocaleLowerCase())) throw new Error('Esse nome já está sendo usado.');
    room.players.push(this.newPlayer(socketId, playerName));
    return room;
  }

  reconnect(code, playerId, socketId) {
    const room = this.getRoom(code);
    const player = room?.players.find((item) => item.id === playerId);
    if (!room || !player) return null;
    const previousId = player.id;
    player.id = socketId; player.connected = true;
    if (room.hostId === playerId) room.hostId = socketId;
    if (room.scores.has(previousId)) { const score = room.scores.get(previousId); room.scores.delete(previousId); room.scores.set(socketId, score); }
    if (room.answers.has(playerId)) { const answer = room.answers.get(playerId); room.answers.delete(playerId); room.answers.set(socketId, answer); }
    return room;
  }

  start(room, socketId, settings) {
    if (!room) throw new Error('Essa sala não está mais disponível.');
    if (room.hostId !== socketId) throw new Error('Apenas o host pode iniciar.');
    if (room.players.length < MIN_PLAYERS) throw new Error(`É preciso ter pelo menos ${MIN_PLAYERS} jogador.`);
    room.totalRounds = [5, 10, 15, 20].includes(Number(settings?.rounds)) ? Number(settings.rounds) : 5;
    room.seconds = [15, 30, 45, 60].includes(Number(settings?.seconds)) ? Number(settings.seconds) : 30;
    room.categories = Array.isArray(settings?.categories) ? settings.categories.filter(Boolean) : [];
    room.selectedQuestions = this.pickQuestions(room);
    room.round = 0;
    room.scores = new Map(room.players.map((player) => [player.id, 0]));
    return this.beginRound(room);
  }

  pickQuestions(room) {
    const pool = room.categories.length ? questions.filter((item) => room.categories.includes(item.category)) : questions;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return Array.from({ length: room.totalRounds }, (_item, index) => shuffled[index % shuffled.length]);
  }

  beginRound(room) {
    room.round += 1; room.phase = 'question'; room.answers = new Map(); room.question = room.selectedQuestions[room.round - 1];
    return room;
  }

  submit(room, socketId, value) {
    if (room.phase !== 'question') throw new Error('A rodada não está aceitando respostas.');
    if (!validNumber(value)) throw new Error('Envie um número válido.');
    if (!room.players.some((player) => player.id === socketId)) throw new Error('Jogador inválido.');
    if (room.answers.has(socketId)) throw new Error('Você já respondeu.');
    room.answers.set(socketId, value);
    return room.answers.size === room.players.length;
  }

  finish(room) {
    if (room.phase !== 'question') return;
    clearTimeout(room.timer); room.timer = null; room.phase = 'result';
    const answer = room.question.answer;
    const entries = room.players.map((player) => {
      const guess = room.answers.get(player.id);
      return { id: player.id, name: player.name, color: player.color, guess: guess ?? null, distance: guess == null ? null : Math.abs(guess - answer), points: 0 };
    });
    const answered = entries.filter((entry) => entry.distance !== null);
    const exact = answered.filter((entry) => entry.distance === 0);
    if (exact.length) exact.forEach((entry) => { entry.points = 2; });
    const candidates = exact.length ? answered.filter((entry) => entry.distance > 0) : answered;
    const closestDistance = candidates.length ? Math.min(...candidates.map((entry) => entry.distance)) : null;
    candidates.filter((entry) => entry.distance === closestDistance).forEach((entry) => { entry.points = 1; });
    entries.forEach((entry) => { this.addScore(room, entry.id, entry.points); });
    room.result = { answer, unit: room.question.unit, category: room.question.category, question: room.question.question, entries: entries.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)) };
  }

  addScore(room, id, points) { room.scores.set(id, (room.scores.get(id) ?? 0) + points); }

  next(room, socketId) {
    if (room.hostId !== socketId) throw new Error('Apenas o host pode avançar.');
    if (room.phase !== 'result') throw new Error('A rodada ainda não terminou.');
    if (room.round >= room.totalRounds) { room.phase = 'finished'; return room; }
    return this.beginRound(room);
  }

  leave(socketId) {
    for (const [code, room] of this.rooms) {
      const index = room.players.findIndex((player) => player.id === socketId);
      if (index < 0) continue;
      room.players.splice(index, 1); room.answers.delete(socketId); room.scores.delete(socketId);
      if (!room.players.length) { clearTimeout(room.timer); this.rooms.delete(code); return null; }
      if (room.hostId === socketId) { room.hostId = room.players[0].id; room.players[0].isHost = true; }
      return room;
    }
    return null;
  }

  publicRoom(room) {
    return { code: room.code, phase: room.phase, round: room.round, totalRounds: room.totalRounds, seconds: room.seconds, question: room.phase === 'question' ? { question: room.question.question, unit: room.question.unit, category: room.question.category } : null, players: room.players.map(({ id, name, isHost, color, connected }) => ({ id, name, isHost: id === room.hostId, color, connected })), scores: [...room.scores.entries()].map(([id, score]) => ({ id, score })), result: room.result ?? null };
  }
}
