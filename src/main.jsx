import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import './styles.css';

const socketUrl = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);
const socket = io(socketUrl, { autoConnect: false, timeout: 5000, reconnectionAttempts: 3, reconnectionDelay: 1000 });
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
      if (!recovering) {
        setError('Servidor da partida indisponível. Configure VITE_SOCKET_URL no deploy.');
        return;
      }
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
    const payload = { name: name.trim(), code: code.trim().toUpperCase() };
    localStorage.setItem('palpiteiro_name', name.trim());
    if (socket.connected) return socket.emit(action, payload);
    socket.once('connect', () => socket.emit(action, payload));
    socket.connect();
  }
  function create() { connect('create_room'); }
  function join() { if (!code.trim()) return setError('Digite o código da sala.'); connect('join_room'); }
  function copyCode() { navigator.clipboard?.writeText(room.code); }
  function submit() { const value = Number(String(guess).replace(',', '.')); if (!Number.isFinite(value)) return setError('Digite um palpite numérico.'); socket.emit('submit_answer', { value }); setError(''); }
  function startGame() { if (!socket.connected) return setError('A conexão com a partida foi perdida.'); setError(''); setStarting(true); socket.emit('start_game', settings); }
  function resetSession() { socket.disconnect(); localStorage.removeItem('palpiteiro_session'); setRecovering(false); setRoom(null); setCode(''); setError(''); setView('home'); }
  function leaveGame() { if (!socket.connected) return resetSession(); socket.emit('leave_room', resetSession); }
  function backToLobby() { if (!socket.connected) return resetSession(); setError(''); socket.emit('back_to_lobby'); }
  function toggleCategory(category) { setSettings((current) => ({ ...current, categories: current.categories.includes(category) ? current.categories.filter((item) => item !== category) : [...current.categories, category] })); }
  const me = room?.players?.find((player) => player.id === socket.id);
  const sortedScores = [...(room?.scores || [])].sort((a, b) => b.score - a.score);

  if (view === 'connecting') return <Shell><div className="loading"><span>Reconectando à sua mesa...</span><button className="secondary" onClick={resetSession}>Voltar ao início</button></div></Shell>;
  if (view === 'home') return <Home name={name} setName={setName} code={code} setCode={setCode} create={create} join={join} error={error} />;
  if (view === 'lobby') return <Lobby room={room} me={me} settings={settings} setSettings={setSettings} toggleCategory={toggleCategory} copyCode={copyCode} start={startGame} starting={starting} exit={leaveGame} error={error} />;
  if (view === 'question') return <Question room={room} me={me} guess={guess} setGuess={setGuess} submit={submit} sent={sent} secondsLeft={secondsLeft} exit={leaveGame} error={error} />;
  if (view === 'result') return <Result room={room} next={() => socket.emit('next_round')} exit={leaveGame} error={error} />;
  if (view === 'finished') return <Finished room={room} scores={sortedScores} backToLobby={backToLobby} exit={leaveGame} />;
  return null;
}

function Shell({ children, eyebrow = 'TÃO JOGANDO AINDA?', exit, hideHeader = false }) {
  return (
    <main className="app">
      <div className="grain" />

      <div className="game-texture" aria-hidden="true">
        <span>???</span>
        <span>+1</span>
        <span>≈</span>
        <span>42</span>
      </div>

      {!hideHeader && (
        <header className="topbar">
          <span className="brand">
            <i />
            {eyebrow}
          </span>

          <div className="topbar-actions">
            {exit && (
              <button className="quit" onClick={exit}>
                Sair do jogo <b>×</b>
              </button>
            )}

            <span className="live-dot">● AO VIVO</span>
          </div>
        </header>
      )}

      {children}
    </main>
  );
}
function Home({ name, setName, code, setCode, create, join, error }) {
  const showcase = [
    { name: 'MATEUS', value: '200.000', status: 'MANDOU LONGE', tone: 'violet' },
    { name: 'MARCO', value: '12.500', status: 'PALPITE TRAVADO', tone: 'coral' },
    { name: 'JÃO', value: '84.320', status: 'RESPOSTA TRAVADA', tone: 'blue', featured: true },
    { name: 'ATOS', value: '???', status: 'PENSANDO...', tone: 'green' },
    { name: 'WERYDY', value: '42', status: 'NA MOSCA!  +2', tone: 'yellow' }
  ];

  return <Shell hideHeader>
    <section className="home-stage">
      <div className="home-hero">
        <p className="kicker">PARTY GAME DE PALPITES</p>
        <h1>TÃO JOGANDO<br /><em>AINDA?</em></h1>
        <p className="lede">The planet enet enenet.</p>

        <div className="home-actions">
          <label className="nickname-field">
            <span>SEU APELIDO</span>
            <input value={name} maxLength="18" onChange={(event) => setName(event.target.value)} placeholder="Como te chamam?" />
          </label>
          <button className="primary create-room" onClick={create}>Criar sala <b>→</b></button>
          <div className="existing-room">
            <span>JÁ TEM UMA SALA?</span>
            <div className="home-join-row">
              <input aria-label="Código da sala" value={code} maxLength="6" onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC123" />
              <button className="secondary" onClick={join}>Entrar <b>→</b></button>
            </div>
          </div>
          {error && <p className="error home-error">{error}</p>}
        </div>
      </div>

      <div className="guess-showcase" aria-hidden="true">
        <div className="cards-glow" />
        {showcase.map((card, index) => <article className={`guess-card card-${index + 1} tone-${card.tone} ${card.featured ? 'featured' : ''}`} key={card.name}>
          <div className="guess-card-head"><strong>{card.name}</strong><span>{card.featured ? '●' : '?'}</span></div>
          <div className="guess-card-value">{card.value}</div>
          <div className="guess-card-foot"><span>{card.status}</span><b>{index === 2 ? '≈' : index === 4 ? '+2' : '↗'}</b></div>
        </article>)}
      </div>
    </section>
  </Shell>;
}
function Lobby({
  room,
  me,
  settings,
  setSettings,
  toggleCategory,
  copyCode,
  start,
  starting,
  exit,
  error
}) {
  const isHost = me?.isHost;
  const playerCount = room.players.length;
  const emptySlots = Math.max(0, Math.min(2, 10 - playerCount));

  return (
    <Shell exit={exit} hideHeader>
      <section className="lobby-v2">

        <div className="lobby-room-bar">
          <div className="room-identity">
            <p className="kicker">SUA SALA</p>

            <button
              className="room-code-v2"
              onClick={copyCode}
              title="Copiar código"
            >
              {room.code}
              <span className="copy-icon">⧉</span>
            </button>

            <p>
              Manda esse código pra galera.
              <span> É só entrar e jogar.</span>
            </p>
          </div>

          <div className="lobby-live-status">
            <span className="pulse" />
            <div>
              <b>{playerCount}/10</b>
              <small>JOGADORES NA SALA</small>
            </div>
          </div>
        </div>

        <div className="lobby-v2-grid">

          {/* JOGADORES */}
          <section className="players-v2">
            <div className="lobby-section-title">
              <div>
                <span>QUEM TÁ JOGANDO?</span>
                <small>A mesa já está sendo montada.</small>
              </div>

              <strong>{String(playerCount).padStart(2, "0")}</strong>
            </div>

            <div className="player-grid-v2">
              {room.players.map((player, index) => (
                <article
                  className={`player-ticket player-ticket-${(index % 5) + 1}`}
                  key={player.id}
                >
                  <div
                    className="player-avatar-v2"
                    style={{ background: player.color }}
                  >
                    {player.name.slice(0, 1).toUpperCase()}
                  </div>

                  <div className="player-ticket-info">
                    <h3>{player.name}</h3>

                    <div>
                      {player.id === me?.id && (
                        <span className="player-you">VOCÊ</span>
                      )}

                      {player.isHost && (
                        <span className="player-host">★ HOST</span>
                      )}
                    </div>
                  </div>

                  <span className="player-online">●</span>
                </article>
              ))}

              {Array.from({ length: emptySlots }).map((_, index) => (
                <article className="player-ticket empty" key={`empty-${index}`}>
                  <div className="waiting-avatar">?</div>

                  <div className="player-ticket-info">
                    <h3>Esperando...</h3>
                    <span>manda o código pra alguém</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="lobby-tip">
              <span>?</span>
              <p>
                Quanto mais gente, mais absurdo fica o palpite.
              </p>
            </div>
          </section>

          {/* CONFIGURAÇÕES */}
          {isHost ? (
            <section className="settings-v2">

              <div className="lobby-section-title settings-heading">
                <div>
                  <span>COMO VAI SER?</span>
                  <small>Você manda nessa partida.</small>
                </div>

                <em>HOST</em>
              </div>

              <div className="setting-v2">
                <div className="setting-v2-label">
                  <span>RODADAS</span>
                  <small>quantas perguntas?</small>
                </div>

                <div className="segmented-v2">
                  {[5, 10, 15, 20].map((value) => (
                    <button
                      key={value}
                      className={settings.rounds === value ? "active" : ""}
                      onClick={() =>
                        setSettings({ ...settings, rounds: value })
                      }
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-v2">
                <div className="setting-v2-label">
                  <span>TEMPO PRA CHUTAR</span>
                  <small>por pergunta</small>
                </div>

                <div className="segmented-v2">
                  {[15, 30, 45, 60].map((value) => (
                    <button
                      key={value}
                      className={settings.seconds === value ? "active" : ""}
                      onClick={() =>
                        setSettings({ ...settings, seconds: value })
                      }
                    >
                      {value}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-v2 categories-v2">
                <div className="setting-v2-label category-heading">
                  <div>
                    <span>CATEGORIAS</span>
                    <small>nenhuma selecionada = vale tudo</small>
                  </div>

                  {settings.categories.length > 0 && (
                    <button
                      className="clear-categories"
                      onClick={() =>
                        setSettings({ ...settings, categories: [] })
                      }
                    >
                      LIMPAR
                    </button>
                  )}
                </div>

                <div className="category-chips-v2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      className={
                        settings.categories.includes(category)
                          ? "selected"
                          : ""
                      }
                      onClick={() => toggleCategory(category)}
                    >
                      <i />
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              <div className="scoring-rule">
                <div>
                  <small>PONTUAÇÃO</small>
                  <span>ACERTO EXATO</span>
                  <strong>+2</strong>
                </div>

                <i />

                <div>
                  <small>PONTUAÇÃO</small>
                  <span>MAIS PRÓXIMO</span>
                  <strong>+1</strong>
                </div>
              </div>

              <button
                className="primary start-v2"
                disabled={starting}
                onClick={start}
              >
                <span>
                  {starting ? "INICIANDO..." : "COMEÇAR PARTIDA"}
                  {!starting && (
                    <small>
                      {playerCount} {playerCount === 1 ? "jogador" : "jogadores"}
                    </small>
                  )}
                </span>

                <b>→</b>
              </button>
            </section>
          ) : (
            <section className="guest-v2">
              <div className="guest-question">?</div>

              <p>O HOST TÁ ARRUMANDO A BAGUNÇA</p>

              <h2>
                Só falta ele
                <br />
                apertar o botão.
              </h2>

              <span>
                Enquanto isso, chama mais alguém.
              </span>
            </section>
          )}
        </div>

        {error && <p className="error centered">{error}</p>}
      </section>
    </Shell>
  );
}
function Question({
  room,
  me,
  guess,
  setGuess,
  submit,
  sent,
  secondsLeft,
  exit,
  error
}) {
  const connectedPlayers = room.players.filter(
    (player) => player.connected
  ).length;

  const questionLength = room.question.question.length;

  const questionSize =
    questionLength > 100
      ? 'question-long'
      : questionLength > 65
        ? 'question-medium'
        : '';

  const timePercent = Math.max(
    0,
    Math.min(100, (secondsLeft / room.seconds) * 100)
  );

  return (
    <Shell hideHeader>

      <section className="question-stage">

        {/* TOPO */}
        <div className="question-topbar">

          <div className="round-info">
            <span className="round-dot" />

            <div>
              <small>RODADA</small>

              <strong>
                {String(room.round).padStart(2, '0')}
                <span>
                  {' / '}
                  {String(room.totalRounds).padStart(2, '0')}
                </span>
              </strong>
            </div>
          </div>

          <button
            className="question-exit"
            onClick={exit}
          >
            SAIR
            <b>×</b>
          </button>

          <div
            className={`round-timer ${
              secondsLeft <= 10 ? 'warning' : ''
            } ${secondsLeft <= 5 ? 'danger' : ''}`}
          >
            <div className="timer-copy">
              <small>TEMPO</small>

              <strong>
                00:{String(secondsLeft).padStart(2, '0')}
              </strong>
            </div>

            <span className="timer-dot" />
          </div>

        </div>

        {/* PROGRESSO DO TEMPO */}
        <div className="timer-track">
          <div
            className="timer-progress"
            style={{ width: `${timePercent}%` }}
          />
        </div>

        {/* CONTEÚDO */}
        <main className="question-main">

          <div className="question-meta-v2">

            <span className="category-badge">
              {room.question.category}
            </span>

            <span className="question-points">
              <b>+2</b>
              <small>SE ACERTAR NA MOSCA</small>
            </span>

          </div>

          <h1 className={`question-title ${questionSize}`}>
            {room.question.question}
          </h1>

          {!sent && (
            <p className="guess-call">
              CHUTA UM NÚMERO
              <span>↓</span>
            </p>
          )}

          {/* AINDA NÃO RESPONDEU */}
          {!sent ? (

            <div className="guess-area">

              <label>SEU PALPITE</label>

              <div className="guess-input-wrap">

                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={guess}
                  onChange={(event) =>
                    setGuess(event.target.value)
                  }
                  onKeyDown={(event) =>
                    event.key === 'Enter' && submit()
                  }
                  placeholder="???"
                />

                <span className="guess-unit">
                  {room.question.unit}
                </span>

              </div>

              <button
                className="primary lock-guess"
                onClick={submit}
                disabled={!guess.trim()}
              >
                <span>TRAVAR PALPITE</span>
                <b>→</b>
              </button>

            </div>

          ) : (

            /* JÁ RESPONDEU */
            <div className="guess-locked">

              <div className="locked-check">
                ✓
              </div>

              <small>PALPITE TRAVADO</small>

              <strong>
                {guess}

                <span>
                  {room.question.unit}
                </span>
              </strong>

              <p>
                Agora aguenta aí.
                <br />
                Ninguém consegue ver sua resposta.
              </p>

            </div>

          )}

          {error && (
            <p className="error centered question-error">
              {error}
            </p>
          )}

        </main>

        {/* STATUS INFERIOR */}
        <footer className="question-players-status">

          <div className="table-status">
            <span className="pulse" />

            <strong>{connectedPlayers}</strong>

            <small>
              {connectedPlayers === 1
                ? 'JOGADOR NA MESA'
                : 'JOGADORES NA MESA'}
            </small>
          </div>

          <div className="secret-status">
            {sent
              ? '✓ SUA RESPOSTA ESTÁ GUARDADA'
              : 'NINGUÉM VÊ SEU PALPITE'}
          </div>

        </footer>

        {/* DECORAÇÃO */}
        <span
          className="question-bg-number"
          aria-hidden="true"
        >
          {String(room.round).padStart(2, '0')}
        </span>

        <span
          className="question-bg-symbol question-symbol-one"
          aria-hidden="true"
        >
          ???
        </span>

        <span
          className="question-bg-symbol question-symbol-two"
          aria-hidden="true"
        >
          +2
        </span>

      </section>

    </Shell>
  );
}
function Result({ room, next, exit, error }) { const result = room.result; return <Shell eyebrow={`RESULTADO · ${room.round} / ${room.totalRounds}`} exit={exit}><section className="result-wrap"><p className="kicker">RESPOSTA CORRETA · {result.category}</p><h1>{number.format(result.answer)} <small>{result.unit}</small></h1><div className="results-list">{result.entries.map((entry, index) => <div className={`result-row ${entry.points ? 'winner' : ''}`} key={entry.id}><b className="rank">{index + 1}</b><span className="avatar mini" style={{ background: entry.color }}>{entry.name.slice(0, 1)}</span><div className="result-name"><strong>{entry.name}</strong>{entry.distance === 0 && <em>ACERTO EXATO</em>}{entry.guess === null && <em>SEM RESPOSTA</em>}</div><span className="guess">{entry.guess === null ? '—' : number.format(entry.guess)}</span><span className="distance">{entry.distance === null ? '—' : `dif. ${number.format(entry.distance)}`}</span><strong className="points">{entry.points ? `+${entry.points}` : ''}</strong></div>)}</div><div className="result-footer"><p>O próximo jogador a fazer história?</p><button className="primary" onClick={next}>{room.round >= room.totalRounds ? 'Ver resultado final' : 'Próxima rodada'} <b>→</b></button></div>{error && <p className="error centered">{error}</p>}</section></Shell>; }
function Finished({ room, scores, backToLobby, exit }) { const top = scores[0]?.score ?? 0; const winners = scores.filter((entry) => entry.score === top); return <Shell exit={exit} eyebrow="FIM DA PARTIDA"><section className="finished"><p className="kicker">{winners.length > 1 ? 'EMPATE NO TOPO' : 'A MESA TEM UM CAMPEÃO'}</p><div className="trophy">✦</div><h1>{winners.map((entry) => room.players.find((player) => player.id === entry.id)?.name).join(' & ')}</h1><p className="champion-score">{top} <span>pontos</span></p><div className="final-ranking">{scores.map((entry, index) => <div key={entry.id}><b>{String(index + 1).padStart(2, '0')}</b><span>{room.players.find((player) => player.id === entry.id)?.name}</span><strong>{entry.score}</strong></div>)}</div><button className="secondary" onClick={backToLobby}>Voltar ao lobby</button></section></Shell>; }

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
