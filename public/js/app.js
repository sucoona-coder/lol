// ============================================================
// public/js/app.js — Client Pusher (version Vercel)
// ============================================================

// ─── Config Pusher — chargée depuis /api/config au boot ──────
let PUSHER_KEY     = '';
let PUSHER_CLUSTER = 'eu';

// ─── Avatars ─────────────────────────────────────────────────
const AVATARS = [
  '🧑','👩','👨','🧔','👱','👴','👵','🧒',
  '🦸','🦹','🧙','🧝','🧛','👻','🤖','👾',
  '🐱','🐶','🦊','🐸','🐼','🐧','🦉','🦋',
  '🍎','🍕','🎮','💀','👁️','🌙','⚡','🔥'
];

// ─── État ────────────────────────────────────────────────────
const S = {
  pusher: null,
  roomChannel: null,
  playerChannel: null,
  roomCode: null,
  playerId: generateLocalId(),
  myName: null,
  myAvatar: '🧑',
  myRole: null,
  hostId: null,
  players: [],
  phase: 'lobby',
  config: { impostorCount: 1, timer: 60 },
  hasVoted: false,
  timerInterval: null,
  timerValue: 0,
  avatarTarget: null
};

// ─── ID persistant par onglet ────────────────────────────────
function generateLocalId() {
  let id = sessionStorage.getItem('_pid');
  if (!id) { id = 'p_' + Math.random().toString(36).substring(2, 12); sessionStorage.setItem('_pid', id); }
  return id;
}

// ─── API helper ──────────────────────────────────────────────
async function api(endpoint, body) {
  const r = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

// ─── Pusher init ─────────────────────────────────────────────
async function initPusher() {
  // Charge key/cluster depuis le serveur (évite de hardcoder dans le HTML)
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    PUSHER_KEY     = cfg.pusherKey;
    PUSHER_CLUSTER = cfg.pusherCluster || 'eu';
  } catch(e) {
    console.error('Impossible de charger la config Pusher', e);
    showToast('Erreur de configuration serveur', 'error');
    return;
  }
  if (!PUSHER_KEY) {
    console.error('PUSHER_KEY manquante dans /api/config');
    showToast('Configuration temps réel manquante (PUSHER_KEY)', 'error');
    return false;
  }

  S.pusher = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER });
  return true;
}

function subscribeRoom(code) {
  if (S.roomChannel) S.roomChannel.unbind_all();
  S.roomChannel = S.pusher.subscribe(`room-${code}`);

  S.roomChannel.bind('room-update', data => {
    if (data.players) S.players = data.players;
    if (data.config)  S.config = data.config;
    if (data.hostId)  S.hostId = data.hostId;
    renderLobby();
  });

  S.roomChannel.bind('game-started', data => {
    S.players = data.players;
    S.phase = 'role';
    Sounds.start();
    document.getElementById('lobby-round-badge').textContent = `Manche ${data.round}`;
    document.getElementById('lobby-round-badge').classList.remove('hidden');
  });

  S.roomChannel.bind('phase-change', data => {
    S.phase = data.phase;
    if (data.players) S.players = data.players;
    if (data.phase === 'discussion') {
      showScreen('game');
      updateGamePhase('discussion');
      startClientTimer(S.config.timer);
    } else if (data.phase === 'vote') {
      S.hasVoted = false;
      updateGamePhase('vote');
      stopClientTimer();
      startClientTimer(30);
    }
  });

  S.roomChannel.bind('vote-update', data => {
    S.players = data.players;
    renderGamePlayers();
  });

  S.roomChannel.bind('vote-result', data => {
    showVoteResultOverlay(data.tie, data.eliminated);
    if (data.eliminated) Sounds.eliminate();
    setTimeout(() => document.getElementById('overlay-vote-result').classList.add('hidden'), 4000);
  });

  S.roomChannel.bind('game-over', data => {
    stopClientTimer();
    S.phase = 'result';
    Sounds.win(data.winner);
    showResultScreen(data.winner, data.players, data.hostId);
  });

  S.roomChannel.bind('chat', msg => {
    appendChat(msg);
    if (msg.type !== 'system' && msg.senderId !== S.playerId) Sounds.chat();
  });

  S.roomChannel.bind('player-left', data => {
    S.players = data.players;
    S.hostId = data.hostId;
    if (S.phase === 'lobby') renderLobby();
    else renderGamePlayers();
  });

  S.roomChannel.bind('new-host', data => {
    S.hostId = data.hostId;
    if (S.playerId === data.hostId) showToast('Tu es maintenant l\'hôte !', 'info');
    renderLobby();
  });
}

function subscribePlayer(playerId) {
  if (S.playerChannel) S.playerChannel.unbind_all();
  S.playerChannel = S.pusher.subscribe(`player-${playerId}`);

  S.playerChannel.bind('your-role', data => {
    S.myRole = data.role;
    Sounds.roleReveal(data.isImpostor);
    showRoleOverlay(data.role, data.customRole, data.isImpostor);
  });
}

// ─── Actions utilisateur ─────────────────────────────────────

async function createRoom() {
  const name = getInput('input-name-create'); if (!name) return;
  S.myName = name;
  try {
    const data = await api('create-room', { playerName: name, avatar: S.myAvatar, playerId: S.playerId });
    S.roomCode = data.code;
    S.hostId = data.room.hostId;
    S.players = data.room.players;
    S.config = data.room.config;
    subscribeRoom(data.code);
    subscribePlayer(S.playerId);
    document.getElementById('lobby-code').textContent = data.code;
    showScreen('lobby');
    renderLobby();
  } catch(e) { showToast(e.message, 'error'); }
}

async function joinRoom() {
  const name = getInput('input-name-join'); if (!name) return;
  const code = document.getElementById('input-room-code').value.trim().toUpperCase();
  if (!code || code.length < 4) return showToast('Entre un code valide !', 'error');
  S.myName = name;
  try {
    const data = await api('join-room', { roomCode: code, playerName: name, avatar: S.myAvatar, playerId: S.playerId });
    S.roomCode = data.code;
    S.hostId = data.room.hostId;
    S.players = data.room.players;
    S.config = data.room.config;
    subscribeRoom(data.code);
    subscribePlayer(S.playerId);
    document.getElementById('lobby-code').textContent = data.code;
    showScreen('lobby');
    renderLobby();
  } catch(e) { showToast(e.message, 'error'); }
}

async function startGame() {
  try {
    await api('start-game', { roomCode: S.roomCode, playerId: S.playerId });
  } catch(e) { showToast(e.message, 'error'); }
}

async function sendConfig() {
  try {
    await api('update-config', {
      roomCode: S.roomCode, playerId: S.playerId,
      impostorCount: S.config.impostorCount,
      timer: S.config.timer,
      roles: {
        impostor: document.getElementById('role-impostor').value,
        crewmate: document.getElementById('role-crewmate').value
      }
    });
  } catch(e) {}
}

async function gotoVote() {
  try {
    await api('phase', { roomCode: S.roomCode, playerId: S.playerId, phase: 'vote' });
  } catch(e) {}
}

async function castVote(targetId) {
  if (S.hasVoted) return;
  S.hasVoted = true;
  try {
    await api('vote', { roomCode: S.roomCode, playerId: S.playerId, targetId });
    showToast('Vote enregistré !', 'success');
    Sounds.vote();
  } catch(e) { S.hasVoted = false; showToast(e.message, 'error'); }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    await api('chat', { roomCode: S.roomCode, playerId: S.playerId, text });
  } catch(e) {}
}

async function leaveRoom() {
  if (!confirm('Quitter la room ?')) return;
  try { await api('leave', { roomCode: S.roomCode, playerId: S.playerId }); } catch(e) {}
  location.reload();
}

// ─── Rendu Lobby ─────────────────────────────────────────────

function renderLobby() {
  const isHost = S.playerId === S.hostId;
  document.getElementById('player-count').textContent = S.players.length;
  document.getElementById('lobby-config').classList.toggle('hidden', !isHost);
  document.getElementById('lobby-waiting').classList.toggle('hidden', isHost);
  document.getElementById('host-controls').classList.toggle('hidden', !isHost);

  if (isHost) {
    document.getElementById('impostor-count-val').textContent = S.config.impostorCount;
    document.getElementById('timer-val').textContent = S.config.timer;
  }

  const grid = document.getElementById('players-grid');
  grid.innerHTML = '';
  S.players.forEach(p => {
    const el = document.createElement('div');
    el.className = `player-card${p.isHost ? ' is-host' : ''}`;
    el.innerHTML = `
      <span class="player-avatar">${p.avatar}</span>
      <div class="player-info">
        <div class="player-name">${esc(p.name)}${p.id === S.playerId ? ' <span style="color:var(--cyan);font-size:.7rem">(toi)</span>' : ''}</div>
        ${p.isHost ? '<div class="player-badge">👑 Hôte</div>' : ''}
      </div>`;
    grid.appendChild(el);
  });
}

// ─── Rendu joueurs en jeu ────────────────────────────────────

function renderGamePlayers() {
  const list = document.getElementById('game-players-list');
  list.innerHTML = '';
  const isVote = S.phase === 'vote';
  const meAlive = S.players.find(p => p.id === S.playerId)?.isAlive;

  S.players.forEach(p => {
    const el = document.createElement('div');
    el.className = `game-player-item${!p.isAlive ? ' dead' : ''}`;
    const canVote = isVote && meAlive && p.isAlive && p.id !== S.playerId && !S.hasVoted;
    if (canVote) el.classList.add('vote-target');

    el.innerHTML = `
      <span class="p-avatar">${p.avatar}</span>
      <span class="p-name">${esc(p.name)}</span>
      ${p.id === S.playerId ? '<span class="p-you">MOI</span>' : ''}
      ${!p.isAlive ? '<span class="dead-icon">💀</span>' : ''}
      ${isVote && p.votedBy > 0 ? `<span class="vote-count">${p.votedBy}✗</span>` : ''}
    `;
    if (canVote) el.addEventListener('click', () => {
      castVote(p.id);
      el.classList.add('voted-for');
      document.querySelectorAll('.vote-target').forEach(e => e.classList.remove('vote-target'));
    });
    list.appendChild(el);
  });
}

function updateGamePhase(phase) {
  const badge = document.getElementById('game-phase-badge');
  badge.textContent = phase === 'discussion' ? 'Discussion' : 'Vote';
  badge.className = `game-phase-badge${phase === 'vote' ? ' vote' : ''}`;
  // Bouton vote visible en discussion pour l'hôte
  const hostCtrl = document.getElementById('host-controls');
  if (S.playerId === S.hostId) {
    hostCtrl.classList.toggle('hidden', phase !== 'discussion');
  }
  renderGamePlayers();
}

// ─── Timer client ────────────────────────────────────────────

function startClientTimer(seconds) {
  stopClientTimer();
  S.timerValue = seconds;
  updateTimerUI(seconds, seconds);

  S.timerInterval = setInterval(() => {
    S.timerValue--;
    updateTimerUI(S.timerValue, seconds);
    if (S.timerValue <= 10 && S.timerValue > 0) Sounds.tick();
    if (S.timerValue <= 0) {
      stopClientTimer();
      // Si on est en discussion → l'hôte déclenche le vote
      if (S.phase === 'discussion' && S.playerId === S.hostId) {
        gotoVote();
      }
    }
  }, 1000);
}

function stopClientTimer() {
  if (S.timerInterval) { clearInterval(S.timerInterval); S.timerInterval = null; }
}

function updateTimerUI(value, max) {
  document.getElementById('timer-display').textContent = value <= 0 ? '0' : value;
  const circle = document.getElementById('timer-circle');
  if (!circle) return;
  const circ = 94.2;
  circle.style.strokeDashoffset = circ * (1 - Math.max(0, value) / max);
  const urgent = value <= 10;
  circle.style.stroke = urgent ? 'var(--gold)' : 'var(--accent)';
  document.getElementById('timer-display').style.color = urgent ? 'var(--gold)' : 'var(--accent)';
}

// ─── Overlay rôle ────────────────────────────────────────────

function showRoleOverlay(role, customRole, isImpostor) {
  const overlay = document.getElementById('overlay-role');
  const card = document.getElementById('role-card');
  document.getElementById('role-name-display').textContent = customRole;
  document.getElementById('role-desc-display').textContent = isImpostor
    ? '🔪 Ne te fais pas démasquer !'
    : '🔍 Trouve et vote contre l\'imposteur !';
  card.className = `role-card ${role}`;
  overlay.classList.remove('hidden');

  let n = 5;
  document.getElementById('role-countdown-val').textContent = n;
  const iv = setInterval(() => {
    n--;
    document.getElementById('role-countdown-val').textContent = n;
    if (n <= 0) {
      clearInterval(iv);
      overlay.classList.add('hidden');
      // Passe en discussion
      showScreen('game');
      S.phase = 'discussion';
      updateGamePhase('discussion');
      startClientTimer(S.config.timer);
      clearChat();
    }
  }, 1000);
}

// ─── Overlay résultat vote ────────────────────────────────────

function showVoteResultOverlay(tie, eliminated) {
  const body = document.getElementById('vote-result-body');
  if (tie || !eliminated) {
    body.innerHTML = '<p class="vote-tie">🤝 Égalité — personne n\'est éliminé !</p>';
  } else {
    const p = S.players.find(x => x.id === eliminated.id);
    body.innerHTML = `
      <div class="role-eye">${p?.avatar || '👤'}</div>
      <div class="vote-elim-name">${esc(eliminated.name)}</div>
      <div class="vote-elim-role">était : ${esc(eliminated.customRole)}</div>
      <div class="vote-elim-role" style="opacity:.6;margin-top:4px">
        ${eliminated.role === 'impostor' ? '🔴 C\'était un IMPOSTEUR !' : '🔵 Ce n\'était pas l\'imposteur.'}
      </div>`;
  }
  document.getElementById('overlay-vote-result').classList.remove('hidden');
}

// ─── Écran résultat ───────────────────────────────────────────

function showResultScreen(winner, players, hostId) {
  S.hostId = hostId;
  document.getElementById('result-winner-badge').textContent = winner === 'crewmates' ? '🎉' : '🔪';
  const title = document.getElementById('result-title');
  title.textContent = winner === 'crewmates' ? 'Victoire !' : 'Défaite !';
  title.className = `result-title ${winner === 'crewmates' ? 'crewmates-win' : 'impostors-win'}`;
  document.getElementById('result-subtitle').textContent = winner === 'crewmates'
    ? 'Les équipiers ont éliminé tous les imposteurs !'
    : 'Les imposteurs ont semé la discorde !';

  const container = document.getElementById('result-players');
  container.innerHTML = '';
  players.forEach(p => {
    const el = document.createElement('div');
    el.className = `result-player-card ${p.role}${!p.isAlive ? ' dead-player' : ''}`;
    el.innerHTML = `
      <span class="r-avatar">${p.avatar}</span>
      <span class="r-name">${esc(p.name)}</span>
      <span class="r-role">${esc(p.customRole)}</span>
      ${!p.isAlive ? '<span style="font-size:.8rem">💀</span>' : ''}`;
    container.appendChild(el);
  });

  document.getElementById('btn-restart').classList.toggle('hidden', S.playerId !== hostId);
  showScreen('result');
}

// ─── Chat ─────────────────────────────────────────────────────

function appendChat(msg) {
  const box = document.getElementById('chat-messages');
  const el = document.createElement('div');
  if (msg.type === 'system') {
    el.className = 'chat-msg system';
    el.innerHTML = `<div class="msg-bubble">${esc(msg.text)}</div>`;
  } else {
    const isMe = msg.senderId === S.playerId;
    el.className = `chat-msg${isMe ? ' mine' : ''}${!msg.isAlive ? ' dead-msg' : ''}`;
    el.innerHTML = `
      ${!isMe ? `<span class="msg-avatar">${msg.senderAvatar || '🧑'}</span>` : ''}
      <div class="msg-content">
        ${!isMe ? `<span class="msg-sender">${esc(msg.senderName)}</span>` : ''}
        <div class="msg-bubble">${esc(msg.text)}</div>
      </div>`;
  }
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function clearChat() { document.getElementById('chat-messages').innerHTML = ''; }

// ─── Avatar picker ────────────────────────────────────────────

function openAvatarModal(target) {
  S.avatarTarget = target;
  const grid = document.getElementById('avatar-grid');
  grid.innerHTML = '';
  AVATARS.forEach(emoji => {
    const btn = document.createElement('div');
    btn.className = `avatar-option${emoji === S.myAvatar ? ' selected' : ''}`;
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      S.myAvatar = emoji;
      document.getElementById(`avatar-${target}`).textContent = emoji;
      grid.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('avatar-modal').classList.add('hidden');
    });
    grid.appendChild(btn);
  });
  document.getElementById('avatar-modal').classList.remove('hidden');
}

// ─── Utilitaires UI ──────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
}

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function getInput(id) {
  const v = document.getElementById(id).value.trim();
  if (!v) { showToast('Entre un pseudo !', 'error'); return null; }
  if (v.length < 2) { showToast('Pseudo trop court (min 2 car.)', 'error'); return null; }
  return v;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ─── Boot ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const pusherReady = await initPusher();
  if (!pusherReady) return;
  document.addEventListener('click', () => Sounds.init(), { once: true });

  // Home
  document.getElementById('btn-create').addEventListener('click', createRoom);
  document.getElementById('btn-join').addEventListener('click', joinRoom);
  document.getElementById('input-room-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  document.getElementById('input-name-create').addEventListener('keydown', e => { if (e.key === 'Enter') createRoom(); });
  document.getElementById('input-name-join').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  document.getElementById('avatar-create').addEventListener('click', () => openAvatarModal('create'));
  document.getElementById('avatar-join').addEventListener('click', () => openAvatarModal('join'));
  document.getElementById('avatar-close').addEventListener('click', () => {
    document.getElementById('avatar-modal').classList.add('hidden');
  });

  // Lobby
  document.getElementById('btn-leave-lobby').addEventListener('click', leaveRoom);
  document.getElementById('btn-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(S.roomCode || '').then(() => showToast('Code copié !', 'success'));
  });
  document.getElementById('btn-start-game').addEventListener('click', startGame);

  // Steppers
  document.getElementById('impostor-minus').addEventListener('click', () => {
    if (S.config.impostorCount > 1) { S.config.impostorCount--; document.getElementById('impostor-count-val').textContent = S.config.impostorCount; sendConfig(); }
  });
  document.getElementById('impostor-plus').addEventListener('click', () => {
    const max = Math.max(1, Math.floor(S.players.length / 2));
    if (S.config.impostorCount < max) { S.config.impostorCount++; document.getElementById('impostor-count-val').textContent = S.config.impostorCount; sendConfig(); }
  });
  document.getElementById('timer-minus').addEventListener('click', () => {
    if (S.config.timer > 10) { S.config.timer = Math.max(10, S.config.timer - 10); document.getElementById('timer-val').textContent = S.config.timer; sendConfig(); }
  });
  document.getElementById('timer-plus').addEventListener('click', () => {
    if (S.config.timer < 300) { S.config.timer = Math.min(300, S.config.timer + 10); document.getElementById('timer-val').textContent = S.config.timer; sendConfig(); }
  });

  let roleTimeout;
  ['role-impostor', 'role-crewmate'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      clearTimeout(roleTimeout);
      roleTimeout = setTimeout(sendConfig, 600);
    });
  });

  // Bouton vote host
  document.getElementById('btn-goto-vote').addEventListener('click', gotoVote);

  // Chat
  document.getElementById('btn-send-chat').addEventListener('click', sendChat);
  document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

  // Résultat
  document.getElementById('btn-restart').addEventListener('click', startGame);
  document.getElementById('btn-home-result').addEventListener('click', () => location.reload());

  // Quitter proprement
  window.addEventListener('beforeunload', () => {
    if (S.roomCode) navigator.sendBeacon('/api/leave', JSON.stringify({ roomCode: S.roomCode, playerId: S.playerId }));
  });
});
