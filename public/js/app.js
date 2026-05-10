// ============================================================
// public/js/app.js — Logique cliente principale
// ============================================================

// ─── Avatars disponibles ───────────────────────────────────
const AVATARS = [
  '🧑','👩','👨','🧔','👱','👴','👵','🧒',
  '🦸','🦹','🧙','🧝','🧛','👻','🤖','👾',
  '🐱','🐶','🦊','🐸','🐼','🐧','🦉','🦋',
  '🍎','🍕','🎮','💀','👁️','🌙','⚡','🔥'
];

// ─── État local ─────────────────────────────────────────────
const state = {
  socket: null,
  roomCode: null,
  playerId: null,
  hostId: null,
  myName: null,
  myAvatar: '🧑',
  myRole: null,
  players: [],
  phase: 'lobby',
  config: { impostorCount: 1, timer: 60 },
  hasVoted: false,
  soundsEnabled: true,
  // Avatar sélectionné temporairement dans le picker
  activeAvatarTarget: null, // 'create' | 'join'
  timerMax: 60,
  timerValue: 60
};

// ─── Connexion Socket.IO ────────────────────────────────────
function initSocket() {
  state.socket = io();
  const s = state.socket;

  s.on('connect', () => {
    console.log('[Socket] Connecté :', s.id);
  });

  // ── Événements reçus du serveur ──────────────────────────

  s.on('room_created', ({ code, playerId }) => {
    state.roomCode = code;
    state.playerId = playerId;
    showScreen('lobby');
    document.getElementById('lobby-code').textContent = code;
  });

  s.on('room_joined', ({ code, playerId, hostId }) => {
    state.roomCode = code;
    state.playerId = playerId;
    state.hostId = hostId;
    showScreen('lobby');
    document.getElementById('lobby-code').textContent = code;
  });

  s.on('room_update', ({ code, hostId, players, phase, config }) => {
    state.hostId = hostId;
    state.players = players;
    state.phase = phase;
    state.config = config;
    renderLobby();
  });

  s.on('error', ({ message }) => {
    showToast(message, 'error');
  });

  s.on('new_host', ({ hostId }) => {
    state.hostId = hostId;
    renderLobby();
    if (hostId === state.playerId) showToast('Tu es maintenant l\'hôte !', 'info');
  });

  s.on('player_left', ({ playerName, players, hostId }) => {
    state.players = players;
    state.hostId = hostId;
    if (state.phase === 'lobby') renderLobby();
    else renderGamePlayers();
    showToast(`${playerName} a quitté la partie`, 'info');
  });

  s.on('game_started', ({ phase, round, players }) => {
    state.phase = phase;
    state.players = players;
    state.hasVoted = false;
    Sounds.init();
    Sounds.start();
    document.getElementById('lobby-round-badge').textContent = `Manche ${round}`;
  });

  s.on('your_role', ({ role, customRole, isImpostor }) => {
    state.myRole = role;
    Sounds.roleReveal(isImpostor);
    showRoleOverlay(role, customRole, isImpostor);
  });

  s.on('phase_change', ({ phase, players }) => {
    state.phase = phase;
    if (players) state.players = players;

    if (phase === 'discussion') {
      showScreen('game');
      updateGamePhaseBadge('discussion');
    } else if (phase === 'vote') {
      updateGamePhaseBadge('vote');
      renderGamePlayers();
      showToast('🗳️ Phase de vote ! Choisissez un suspect.', 'info');
    }
  });

  s.on('timer_tick', ({ value }) => {
    state.timerValue = value;
    updateTimerDisplay(value);
    if (value <= 10 && value > 0 && state.phase === 'discussion') {
      Sounds.tick();
    }
  });

  s.on('chat_message', (msg) => {
    appendChatMessage(msg);
    if (msg.type !== 'system' && msg.senderId !== state.playerId) {
      Sounds.chat();
    }
  });

  s.on('vote_cast', ({ voterId, players }) => {
    state.players = players;
    renderGamePlayers();
    Sounds.vote();
  });

  s.on('vote_result', ({ tie, eliminated, players }) => {
    state.players = players;
    showVoteResultOverlay(tie, eliminated);
    if (eliminated) Sounds.eliminate();
    setTimeout(() => hideOverlay('overlay-vote-result'), 4000);
  });

  s.on('game_over', ({ winner, players, hostId }) => {
    state.hostId = hostId;
    state.phase = 'result';
    stopTimerDisplay();
    Sounds.win(winner);
    showResultScreen(winner, players);
  });
}

// ─── Utilitaires d'affichage ────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
}

function showToast(message, type = 'default') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function hideOverlay(id) {
  document.getElementById(id).classList.add('hidden');
}

// ─── Lobby ──────────────────────────────────────────────────

function renderLobby() {
  const isHost = state.playerId === state.hostId;
  const grid = document.getElementById('players-grid');
  const countEl = document.getElementById('player-count');
  const configEl = document.getElementById('lobby-config');
  const waitingEl = document.getElementById('lobby-waiting');

  countEl.textContent = state.players.length;

  // Affiche config ou waiting selon le rôle
  if (isHost) {
    configEl.classList.remove('hidden');
    waitingEl.classList.add('hidden');
    // Sync config affichée
    document.getElementById('impostor-count-val').textContent = state.config.impostorCount;
    document.getElementById('timer-val').textContent = state.config.timer;
  } else {
    configEl.classList.add('hidden');
    waitingEl.classList.remove('hidden');
  }

  // Rendu des joueurs
  grid.innerHTML = '';
  state.players.forEach(p => {
    const card = document.createElement('div');
    card.className = `player-card${p.isHost ? ' is-host' : ''}`;
    card.innerHTML = `
      <span class="player-avatar">${p.avatar}</span>
      <div class="player-info">
        <div class="player-name">${escHtml(p.name)}${p.id === state.playerId ? ' <span style="color:var(--cyan);font-size:0.7rem;">(toi)</span>' : ''}</div>
        ${p.isHost ? '<div class="player-badge">👑 Hôte</div>' : ''}
      </div>
    `;
    grid.appendChild(card);
  });

  // Son de nouveau joueur si on est déjà dans le lobby
  Sounds.join();
}

// ─── Phase de jeu ────────────────────────────────────────────

function renderGamePlayers() {
  const list = document.getElementById('game-players-list');
  list.innerHTML = '';
  const isVotePhase = state.phase === 'vote';

  state.players.forEach(p => {
    const isMe = p.id === state.playerId;
    const meAlive = state.players.find(x => x.id === state.playerId)?.isAlive;

    const item = document.createElement('div');
    item.className = `game-player-item${!p.isAlive ? ' dead' : ''}`;

    // Peut-on voter sur ce joueur ?
    const canVote = isVotePhase && meAlive && p.isAlive && !isMe && !state.hasVoted;
    if (canVote) item.classList.add('vote-target');

    item.innerHTML = `
      <span class="p-avatar">${p.avatar}</span>
      <span class="p-name">${escHtml(p.name)}</span>
      ${isMe ? '<span class="p-you">MOI</span>' : ''}
      ${!p.isAlive ? '<span class="dead-icon">💀</span>' : ''}
      ${isVotePhase && p.votedBy > 0 ? `<span class="vote-count">${p.votedBy} ✗</span>` : ''}
    `;

    if (canVote) {
      item.addEventListener('click', () => castVote(p.id, item));
    }
    list.appendChild(item);
  });
}

function castVote(targetId, el) {
  if (state.hasVoted) return;
  state.hasVoted = true;
  state.socket.emit('cast_vote', { targetId });
  el.classList.add('voted-for');
  // Désactive tous les boutons de vote
  document.querySelectorAll('.vote-target').forEach(e => {
    e.classList.remove('vote-target');
  });
  showToast('Vote enregistré !', 'success');
}

function updateGamePhaseBadge(phase) {
  const badge = document.getElementById('game-phase-badge');
  badge.textContent = phase === 'discussion' ? 'Discussion' : 'Vote';
  badge.className = `game-phase-badge ${phase === 'vote' ? 'vote' : ''}`;
  renderGamePlayers();

  // Si on était sur le lobby, on switch
  if (!document.getElementById('screen-game').classList.contains('active')) {
    showScreen('game');
    clearChat();
  }
}

// ─── Timer UI ─────────────────────────────────────────────

function updateTimerDisplay(value) {
  document.getElementById('timer-display').textContent = value;
  const circle = document.getElementById('timer-circle');
  if (!circle) return;

  // Met à jour le cercle SVG
  const max = state.phase === 'vote' ? 30 : state.config.timer;
  const circumference = 94.2;
  const offset = circumference * (1 - value / max);
  circle.style.strokeDashoffset = offset;

  // Change la couleur si urgent
  if (value <= 10) {
    circle.style.stroke = 'var(--gold)';
    document.getElementById('timer-display').style.color = 'var(--gold)';
  } else {
    circle.style.stroke = 'var(--accent)';
    document.getElementById('timer-display').style.color = 'var(--accent)';
  }
}

function stopTimerDisplay() {
  document.getElementById('timer-display').textContent = '—';
  const circle = document.getElementById('timer-circle');
  if (circle) circle.style.strokeDashoffset = 94.2;
}

// ─── Overlay rôle ──────────────────────────────────────────

function showRoleOverlay(role, customRole, isImpostor) {
  const overlay = document.getElementById('overlay-role');
  const card = document.getElementById('role-card');
  const nameEl = document.getElementById('role-name-display');
  const descEl = document.getElementById('role-desc-display');
  const countdown = document.getElementById('role-countdown-val');

  card.className = `role-card ${role}`;
  nameEl.textContent = customRole;
  descEl.textContent = isImpostor
    ? '🔪 Ne te fais pas démasquer !'
    : '🔍 Trouve et vote contre l\'imposteur !';

  overlay.classList.remove('hidden');

  // Countdown 5s
  let n = 5;
  countdown.textContent = n;
  const iv = setInterval(() => {
    n--;
    countdown.textContent = n;
    if (n <= 0) {
      clearInterval(iv);
      overlay.classList.add('hidden');
    }
  }, 1000);
}

// ─── Overlay résultat vote ─────────────────────────────────

function showVoteResultOverlay(tie, eliminated) {
  const overlay = document.getElementById('overlay-vote-result');
  const body = document.getElementById('vote-result-body');

  if (tie || !eliminated) {
    body.innerHTML = '<p class="vote-tie">🤝 Égalité — personne n\'est éliminé !</p>';
  } else {
    body.innerHTML = `
      <div class="role-eye">${state.players.find(p => p.id === eliminated.id)?.avatar || '👤'}</div>
      <div class="vote-elim-name">${escHtml(eliminated.name)}</div>
      <div class="vote-elim-role">était : ${escHtml(eliminated.customRole)}</div>
      <div class="vote-elim-role" style="margin-top:4px;opacity:0.6;">
        ${eliminated.role === 'impostor' ? '🔴 C\'était un IMPOSTEUR !' : '🔵 Ce n\'était pas l\'imposteur.'}
      </div>
    `;
  }

  overlay.classList.remove('hidden');
}

// ─── Écran résultat ────────────────────────────────────────

function showResultScreen(winner, players) {
  const titleEl = document.getElementById('result-title');
  const subtitleEl = document.getElementById('result-subtitle');
  const badgeEl = document.getElementById('result-winner-badge');
  const playersEl = document.getElementById('result-players');
  const actionsEl = document.getElementById('result-actions');

  if (winner === 'crewmates') {
    titleEl.textContent = 'Victoire !';
    titleEl.className = 'result-title crewmates-win';
    subtitleEl.textContent = 'Les équipiers ont éliminé tous les imposteurs !';
    badgeEl.textContent = '🎉';
  } else {
    titleEl.textContent = 'Défaite !';
    titleEl.className = 'result-title impostors-win';
    subtitleEl.textContent = 'Les imposteurs ont semé la discorde !';
    badgeEl.textContent = '🔪';
  }

  // Carte de chaque joueur avec rôle révélé
  playersEl.innerHTML = '';
  players.forEach(p => {
    const card = document.createElement('div');
    card.className = `result-player-card ${p.role}${!p.isAlive ? ' dead-player' : ''}`;
    card.innerHTML = `
      <span class="r-avatar">${p.avatar}</span>
      <span class="r-name">${escHtml(p.name)}</span>
      <span class="r-role">${escHtml(p.customRole)}</span>
      ${!p.isAlive ? '<span style="font-size:0.8rem">💀</span>' : ''}
    `;
    playersEl.appendChild(card);
  });

  // Bouton rejouer si on est host
  const restartBtn = document.getElementById('btn-restart');
  if (state.playerId === state.hostId) {
    restartBtn.classList.remove('hidden');
  } else {
    restartBtn.classList.add('hidden');
  }

  showScreen('result');
}

// ─── Chat ───────────────────────────────────────────────────

function appendChatMessage(msg) {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');

  if (msg.type === 'system') {
    el.className = 'chat-msg system';
    el.innerHTML = `<div class="msg-bubble">${escHtml(msg.text)}</div>`;
  } else {
    const isMe = msg.senderId === state.playerId;
    el.className = `chat-msg${isMe ? ' mine' : ''}${!msg.isAlive ? ' dead-msg' : ''}`;
    el.innerHTML = `
      ${!isMe ? `<span class="msg-avatar">${msg.senderAvatar || '🧑'}</span>` : ''}
      <div class="msg-content">
        ${!isMe ? `<span class="msg-sender">${escHtml(msg.senderName)}</span>` : ''}
        <div class="msg-bubble">${escHtml(msg.text)}</div>
      </div>
    `;
  }

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function clearChat() {
  document.getElementById('chat-messages').innerHTML = '';
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  state.socket.emit('chat_message', { text });
  input.value = '';
}

// ─── Avatar picker ──────────────────────────────────────────

function openAvatarModal(target) {
  state.activeAvatarTarget = target;
  const grid = document.getElementById('avatar-grid');
  grid.innerHTML = '';
  AVATARS.forEach(emoji => {
    const btn = document.createElement('div');
    btn.className = `avatar-option${emoji === state.myAvatar ? ' selected' : ''}`;
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      state.myAvatar = emoji;
      document.getElementById(`avatar-${target}`).textContent = emoji;
      // Met à jour la sélection visuelle
      grid.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('avatar-modal').classList.add('hidden');
    });
    grid.appendChild(btn);
  });
  document.getElementById('avatar-modal').classList.remove('hidden');
}

// ─── Helpers ────────────────────────────────────────────────

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function getPlayerName(inputId) {
  const val = document.getElementById(inputId).value.trim();
  if (!val) { showToast('Entre un pseudo !', 'error'); return null; }
  if (val.length < 2) { showToast('Pseudo trop court (min 2 car.)', 'error'); return null; }
  return val;
}

function emitConfigUpdate() {
  state.socket.emit('update_config', {
    impostorCount: state.config.impostorCount,
    timer: state.config.timer,
    roles: {
      impostor: document.getElementById('role-impostor').value,
      crewmate: document.getElementById('role-crewmate').value
    }
  });
}

// ─── Événements UI ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initSocket();

  // Init son au premier clic
  document.addEventListener('click', () => Sounds.init(), { once: true });

  // ── Home ──────────────────────────────────────────────

  document.getElementById('btn-create').addEventListener('click', () => {
    const name = getPlayerName('input-name-create');
    if (!name) return;
    state.myName = name;
    state.socket.emit('create_room', { playerName: name, avatar: state.myAvatar });
  });

  document.getElementById('btn-join').addEventListener('click', () => {
    const name = getPlayerName('input-name-join');
    if (!name) return;
    const code = document.getElementById('input-room-code').value.trim();
    if (!code || code.length < 4) { showToast('Entre un code valide !', 'error'); return; }
    state.myName = name;
    state.socket.emit('join_room', { roomCode: code, playerName: name, avatar: state.myAvatar });
  });

  // Enter key pour rejoindre
  document.getElementById('input-room-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-join').click();
  });
  document.getElementById('input-name-create').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-create').click();
  });

  // Avatar pickers
  document.getElementById('avatar-create').addEventListener('click', () => openAvatarModal('create'));
  document.getElementById('avatar-join').addEventListener('click', () => openAvatarModal('join'));
  document.getElementById('avatar-close').addEventListener('click', () => {
    document.getElementById('avatar-modal').classList.add('hidden');
  });

  // ── Lobby ──────────────────────────────────────────────

  document.getElementById('btn-leave-lobby').addEventListener('click', () => {
    if (confirm('Quitter la room ?')) {
      location.reload();
    }
  });

  document.getElementById('btn-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(state.roomCode || '').then(() => {
      showToast('Code copié !', 'success');
    });
  });

  document.getElementById('btn-start-game').addEventListener('click', () => {
    state.socket.emit('start_game');
  });

  // Steppers imposteurs
  document.getElementById('impostor-minus').addEventListener('click', () => {
    if (state.config.impostorCount > 1) {
      state.config.impostorCount--;
      document.getElementById('impostor-count-val').textContent = state.config.impostorCount;
      emitConfigUpdate();
    }
  });
  document.getElementById('impostor-plus').addEventListener('click', () => {
    const maxImpostors = Math.max(1, Math.floor((state.players.length) / 2));
    if (state.config.impostorCount < maxImpostors) {
      state.config.impostorCount++;
      document.getElementById('impostor-count-val').textContent = state.config.impostorCount;
      emitConfigUpdate();
    }
  });

  // Steppers timer
  document.getElementById('timer-minus').addEventListener('click', () => {
    if (state.config.timer > 10) {
      state.config.timer = Math.max(10, state.config.timer - 10);
      document.getElementById('timer-val').textContent = state.config.timer;
      emitConfigUpdate();
    }
  });
  document.getElementById('timer-plus').addEventListener('click', () => {
    if (state.config.timer < 300) {
      state.config.timer = Math.min(300, state.config.timer + 10);
      document.getElementById('timer-val').textContent = state.config.timer;
      emitConfigUpdate();
    }
  });

  // Rôles personnalisés (debounce léger)
  let roleTimeout;
  ['role-impostor', 'role-crewmate'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      clearTimeout(roleTimeout);
      roleTimeout = setTimeout(emitConfigUpdate, 500);
    });
  });

  // ── Chat ──────────────────────────────────────────────

  document.getElementById('btn-send-chat').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendChatMessage();
  });

  // ── Résultat ──────────────────────────────────────────

  document.getElementById('btn-restart').addEventListener('click', () => {
    state.phase = 'lobby';
    clearChat();
    showScreen('lobby');
    state.socket.emit('start_game');
  });

  document.getElementById('btn-home-result').addEventListener('click', () => {
    location.reload();
  });
});
