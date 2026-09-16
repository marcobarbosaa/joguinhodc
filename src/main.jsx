import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './styles.css';

const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', { autoConnect: false });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const categories = ['Corpo humano', 'Ciência', 'Espaço', 'Geografia', 'História', 'Esportes', 'Tecnologia', 'Animais', 'Curiosidades', 'Dinheiro', 'Mundo', 'Cultura'];
function readSavedSession() {
  try {
    return JSON.parse(localStorage.getItem('palpiteiro_session') || 'null');
  } catch {
    localStorage.removeItem('palpiteiro_session');
    return null;
  }
}

const saved = readSavedSession();

function App() {
  const [view, setView] = useState(saved ? 'connecting' : 'home');
  const [room, setRoom] = useState(null);
  const [name, setName] = useState(localStorage.getItem('palpiteiro_name') || '');
  const [code, setCode] = useState(saved?.code || '');
  const [error, setError] = useState('');
  const [settings, setSettings] = useState({ rounds: 5, seconds: 30, categories: [] });
  const [guess, setGuess] = useState('');
  const [sent, setSent] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [starting, setStarting] = useState(false);
  const [recovering, setRecovering] = useState(Boolean(saved));

  useEffect(() => {
    const state = (next) => { setRecovering(false); setRoom(next); setView(next.phase); setError(''); setStarting(false); setSent(false); setGuess(''); setSecondsLeft(next.seconds); };
    const onError = (message) => {
      setStarting(false);
      if (recovering) {
        socket.disconnect();
        localStorage.removeItem('palpiteiro_session');
        setRecovering(false);
        setCode('');
        setView('home');
        setError('Sua sessão anterior não está mais disponível.');
        return;
      }
      setError(message);
    };
    const onConnectionError = () => {
      if (!recovering) return;
      socket.disconnect();
      localStorage.removeItem('palpiteiro_session');
      setRecovering(false);
      setCode('');
      setView('home');
      setError('Não foi possível reconectar. Entre novamente na partida.');
    };
    const onAnswerReceived = () => setSent(true);
    socket.on('room_state', state); socket.on('game_error', onError); socket.on('connect_error', onConnectionError); socket.on('answer_received', onAnswerReceived);
    socket.on('room_created', ({ code, playerId }) => localStorage.setItem('palpiteiro_session', JSON.stringify({ code, playerId })));
    socket.on('room_joined', ({ code, playerId }) => localStorage.setItem('palpiteiro_session', JSON.stringify({ code, playerId })));
    const reconnectTimer = saved ? setTimeout(onConnectionError, 5000) : null;
    socket.on('connect', () => { if (saved) socket.emit('reconnect_player', saved); });
    if (saved) socket.connect();
    return () => { if (reconnectTimer) clearTimeout(reconnectTimer); socket.off('room_state', state); socket.off('game_error', onError); socket.off('connect_error', onConnectionError); socket.off('answer_received', onAnswerReceived); };
  }, [recovering]);

  useEffect(() => {
    if (room?.phase !== 'question') return undefined;
    setSecondsLeft(room.seconds);
    const timer = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [room?.round, room?.phase, room?.seconds]);

  function connect(action) {
    setError('');
    if (!name.trim()) return setError('Escolha um nome para jogar.');
    localStorage.setItem('palpiteiro_name', name.trim()); socket.connect();
    socket.once('connect', () => socket.emit(action, { name: name.trim(), code: code.trim().toUpperCase() }));
  }
  function create() { connect('create_room'); }
  function join() { if (!code.trim()) return setError('Digite o código da sala.'); connect('join_room'); }
  function copyCode() { navigator.clipboard?.writeText(room.code); }
  function submit() { const value = Number(String(guess).replace(',', '.')); if (!Number.isFinite(value)) return setError('Digite um palpite numérico.'); socket.emit('submit_answer', { value }); setError(''); }
  function startGame() { if (!socket.connected) return setError('A conexão com a partida foi perdida.'); setError(''); setStarting(true); socket.emit('start_game', settings); }
  function resetSession() { socket.disconnect(); localStorage.removeItem('palpiteiro_session'); setRecovering(false); setRoom(null); setCode(''); setError(''); setView('home'); }
  function toggleCategory(category) { setSettings((current) => ({ ...current, categories: current.categories.includes(category) ? current.categories.filter((item) => item !== category) : [...current.categories, category] })); }
  const me = room?.players?.find((player) => player.id === socket.id);
  const sortedScores = [...(room?.scores || [])].sort((a, b) => b.score - a.score);

  if (view === 'connecting') return <Shell><div className="loading"><span>Reconectando à sua mesa...</span><button className="secondary" onClick={resetSession}>Voltar ao início</button></div></Shell>;
  if (view === 'home') return <Home name={name} setName={setName} code={code} setCode={setCode} create={create} join={join} error={error} />;
  if (view === 'lobby') return <Lobby room={room} me={me} settings={settings} setSettings={setSettings} toggleCategory={toggleCategory} copyCode={copyCode} start={startGame} starting={starting} error={error} />;
  if (view === 'question') return <Question room={room} me={me} guess={guess} setGuess={setGuess} submit={submit} sent={sent} secondsLeft={secondsLeft} error={error} />;
  if (view === 'result') return <Result room={room} next={() => socket.emit('next_round')} error={error} />;
  if (view === 'finished') return <Finished room={room} scores={sortedScores} again={() => setView('lobby')} />;
  return null;
}

function Shell({ children, eyebrow = 'PALPITEIRO' }) { return <main className="app"><div className="grain" /><header className="topbar"><span className="brand"><i />{eyebrow}</span><span className="live-dot">● AO VIVO</span></header>{children}</main>; }
function Home({ name, setName, code, setCode, create, join, error }) { return <Shell><section className="home-grid"><div className="intro"><p className="kicker">PARTY GAME DE NÚMEROS</p><h1>Chute.<br /><em>Compare.</em><br />Domine.</h1><p className="lede">Perguntas improváveis, palpites ousados e uma única missão: chegar mais perto.</p><div className="stat-row"><span><b>01–10</b> jogadores</span><span><b>∞</b> palpites</span></div></div><div className="panel entrance"><span className="panel-label">ENTRAR NA MESA</span><h2>Pronto para a rodada?</h2><label>SEU NOME<input value={name} maxLength="18" onChange={(event) => setName(event.target.value)} placeholder="Como te chamam?" /></label><button className="primary" onClick={create}>Criar uma sala <b>↗</b></button><div className="or"><span>ou entre com um código</span></div><div className="join-row"><input value={code} maxLength="6" onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC123" /><button className="secondary" onClick={join}>Entrar</button></div>{error && <p className="error">{error}</p>}</div></section><footer>Uma sala privada para quem está por perto <span>•</span> sem cadastro, sem complicação</footer></Shell>; }
function Lobby({ room, me, settings, setSettings, toggleCategory, copyCode, start, starting, error }) { const isHost = me?.isHost; return <Shell><section className="lobby-head"><div><p className="kicker">SUA MESA ESTÁ PRONTA</p><h1>Sala <strong>{room.code}</strong></h1><button className="copy" onClick={copyCode}>▣ Copiar código</button></div><div className="waiting"><span className="pulse" /> aguardando jogadores</div></section><section className="lobby-layout"><div className="panel players-panel"><div className="panel-title"><span>JOGADORES</span><b>{room.players.length}<small>/10</small></b></div><div className="player-list">{room.players.map((player) => <div className="player" key={player.id}><span className="avatar" style={{ background: player.color }}>{player.name.slice(0, 1).toUpperCase()}</span><span>{player.name}{player.id === me?.id && <small> você</small>}</span>{player.isHost && <em>HOST</em>}</div>)}</div><p className="hint">Compartilhe o código com seus amigos para começar.</p></div>{isHost ? <div className="panel config"><div className="panel-title"><span>CONFIGURAÇÕES</span><b>HOST</b></div><div className="option"><span>Rodadas</span><div className="segmented">{[5, 10, 15, 20].map((value) => <button className={settings.rounds === value ? 'active' : ''} onClick={() => setSettings({ ...settings, rounds: value })} key={value}>{value}</button>)}</div></div><div className="option"><span>Tempo por pergunta</span><div className="segmented">{[15, 30, 45, 60].map((value) => <button className={settings.seconds === value ? 'active' : ''} onClick={() => setSettings({ ...settings, seconds: value })} key={value}>{value}s</button>)}</div></div><div className="option categories"><span>Categorias <small>(vazio = todas)</small></span><div className="chips">{categories.map((category) => <button className={settings.categories.includes(category) ? 'selected' : ''} onClick={() => toggleCategory(category)} key={category}>{category}</button>)}</div></div><button className="primary start" disabled={starting} onClick={start}>{starting ? 'Iniciando...' : 'Começar partida'} <b>→</b></button></div> : <div className="panel guest-wait"><div className="orbit">?</div><h2>O host está<br />preparando tudo.</h2><p>Assim que a partida começar, a primeira pergunta aparece aqui.</p></div>}</section>{error && <p className="error centered">{error}</p>}</Shell>; }
function Question({ room, me, guess, setGuess, submit, sent, secondsLeft, error }) { return <Shell eyebrow={`RODADA ${room.round} / ${room.totalRounds}`}><section className="question-wrap"><div className="question-meta"><span>{room.question.category}</span><div className={`timer ${secondsLeft <= 5 ? 'urgent' : ''}`}><i />00:{String(secondsLeft).padStart(2, '0')}</div></div><h1>{room.question.question}</h1><p className="unit">responda em {room.question.unit}</p><div className="answer-box">{sent ? <div className="sent"><b>✓</b><span>Palpite enviado</span><small>Agora é só torcer.</small></div> : <><div className="guess-input"><input autoFocus type="text" inputMode="decimal" value={guess} onChange={(event) => setGuess(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="Seu palpite" /><span>{room.question.unit}</span></div><button className="primary" onClick={submit}>Confirmar resposta <b>↗</b></button></>} </div><div className="answer-status"><span>{room.players.filter((player) => player.connected).length} jogadores na mesa</span><span>{sent ? 'Sua resposta está guardada em segredo' : 'Você só pode responder uma vez'}</span></div>{error && <p className="error centered">{error}</p>}</section></Shell>; }
function Result({ room, next, error }) { const result = room.result; return <Shell eyebrow={`RESULTADO · ${room.round} / ${room.totalRounds}`}><section className="result-wrap"><p className="kicker">RESPOSTA CORRETA · {result.category}</p><h1>{number.format(result.answer)} <small>{result.unit}</small></h1><div className="results-list">{result.entries.map((entry, index) => <div className={`result-row ${entry.points ? 'winner' : ''}`} key={entry.id}><b className="rank">{index + 1}</b><span className="avatar mini" style={{ background: entry.color }}>{entry.name.slice(0, 1)}</span><div className="result-name"><strong>{entry.name}</strong>{entry.distance === 0 && <em>ACERTO EXATO</em>}{entry.guess === null && <em>SEM RESPOSTA</em>}</div><span className="guess">{entry.guess === null ? '—' : number.format(entry.guess)}</span><span className="distance">{entry.distance === null ? '—' : `dif. ${number.format(entry.distance)}`}</span><strong className="points">{entry.points ? `+${entry.points}` : ''}</strong></div>)}</div><div className="result-footer"><p>O próximo palpiteiro a fazer história?</p><button className="primary" onClick={next}>{room.round >= room.totalRounds ? 'Ver resultado final' : 'Próxima rodada'} <b>→</b></button></div>{error && <p className="error centered">{error}</p>}</section></Shell>; }
function Finished({ room, scores, again }) { const top = scores[0]?.score ?? 0; const winners = scores.filter((entry) => entry.score === top); return <Shell eyebrow="FIM DA PARTIDA"><section className="finished"><p className="kicker">{winners.length > 1 ? 'EMPATE NO TOPO' : 'A MESA TEM UM CAMPEÃO'}</p><div className="trophy">✦</div><h1>{winners.map((entry) => room.players.find((player) => player.id === entry.id)?.name).join(' & ')}</h1><p className="champion-score">{top} <span>pontos</span></p><div className="final-ranking">{scores.map((entry, index) => <div key={entry.id}><b>{String(index + 1).padStart(2, '0')}</b><span>{room.players.find((player) => player.id === entry.id)?.name}</span><strong>{entry.score}</strong></div>)}</div><button className="secondary" onClick={again}>Voltar ao lobby</button></section></Shell>; }

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
