// ============================================================
// server/index.js — Point d'entrée du serveur
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ─── Stockage en mémoire ────────────────────────────────────
// rooms : { [roomCode]: Room }
const rooms = {};

// Structure d'une Room :
// {
//   code: string,
//   hostId: string,
//   players: { [socketId]: Player },
//   phase: 'lobby' | 'role' | 'discussion' | 'vote' | 'result',
//   config: { impostorCount, timer, roles },
//   votes: { [voterId]: targetId },
//   timer: null | intervalRef,
//   timerValue: number,
//   round: number
// }

// ─── Fichiers statiques ────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// Route principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/index.html'));
});

// ─── Utilitaires ────────────────────────────────────────────

/** Génère un code de room à 6 lettres majuscules */
function generateRoomCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (rooms[code]);
  return code;
}

/** Retourne la liste des joueurs publics (sans le rôle) */
function getPublicPlayers(room) {
  return Object.values(room.players).map(p => ({
    id: p.id,
    name: p.name,
    isHost: p.id === room.hostId,
    isAlive: p.isAlive,
    avatar: p.avatar,
    votedBy: Object.entries(room.votes || {})
      .filter(([, target]) => target === p.id)
      .map(([voter]) => voter).length
  }));
}

/** Distribue les rôles de façon aléatoire et anti-doublon */
function assignRoles(room) {
  const playerIds = Object.keys(room.players);
  const { impostorCount, roles } = room.config;

  // Mélange Fisher-Yates
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Attribution : les N premiers sont imposteurs
  shuffled.forEach((id, index) => {
    room.players[id].role = index < impostorCount ? 'impostor' : 'crewmate';
    room.players[id].customRole = index < impostorCount
      ? (roles.impostor || 'Imposteur')
      : (roles.crewmate || 'Équipier');
    room.players[id].isAlive = true;
    room.players[id].hasVoted = false;
  });
}

/** Démarre le timer et émet des événements de tick */
function startTimer(room, seconds, onEnd) {
  if (room.timer) clearInterval(room.timer);
  room.timerValue = seconds;

  io.to(room.code).emit('timer_tick', { value: room.timerValue });

  room.timer = setInterval(() => {
    room.timerValue--;
    io.to(room.code).emit('timer_tick', { value: room.timerValue });
    if (room.timerValue <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      onEnd();
    }
  }, 1000);
}

/** Stoppe le timer courant */
function stopTimer(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

/** Calcule et retourne le résultat du vote */
function computeVoteResult(room) {
  const counts = {};
  const alivePlayers = Object.values(room.players).filter(p => p.isAlive);

  alivePlayers.forEach(p => { counts[p.id] = 0; });
  Object.values(room.votes || {}).forEach(targetId => {
    if (counts[targetId] !== undefined) counts[targetId]++;
  });

  // Trouve le joueur avec le plus de votes
  let maxVotes = 0;
  let eliminated = null;
  let tie = false;

  for (const [id, count] of Object.entries(counts)) {
    if (count > maxVotes) { maxVotes = count; eliminated = id; tie = false; }
    else if (count === maxVotes && maxVotes > 0) { tie = true; }
  }

  if (tie) return { tie: true, eliminated: null };
  return { tie: false, eliminated, maxVotes };
}

/** Vérifie si la partie est terminée */
function checkWinCondition(room) {
  const alive = Object.values(room.players).filter(p => p.isAlive);
  const aliveImpostors = alive.filter(p => p.role === 'impostor');
  const aliveCrewmates = alive.filter(p => p.role === 'crewmate');

  if (aliveImpostors.length === 0) return { winner: 'crewmates' };
  if (aliveImpostors.length >= aliveCrewmates.length) return { winner: 'impostors' };
  return null;
}

// ─── Socket.IO ──────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connexion : ${socket.id}`);

  // ── Créer une room ─────────────────────────────────────
  socket.on('create_room', ({ playerName, avatar }) => {
    const code = generateRoomCode();
    const player = {
      id: socket.id,
      name: playerName.trim().substring(0, 20),
      avatar: avatar || '🧑',
      role: null,
      customRole: null,
      isAlive: true,
      hasVoted: false
    };

    rooms[code] = {
      code,
      hostId: socket.id,
      players: { [socket.id]: player },
      phase: 'lobby',
      config: {
        impostorCount: 1,
        timer: 60,
        roles: { impostor: 'Imposteur', crewmate: 'Équipier' }
      },
      votes: {},
      timer: null,
      timerValue: 0,
      round: 0
    };

    socket.join(code);
    socket.data.roomCode = code;

    socket.emit('room_created', { code, playerId: socket.id });
    socket.emit('room_update', {
      code,
      hostId: rooms[code].hostId,
      players: getPublicPlayers(rooms[code]),
      phase: 'lobby',
      config: rooms[code].config
    });

    console.log(`[ROOM] Créée : ${code} par ${playerName}`);
  });

  // ── Rejoindre une room ─────────────────────────────────
  socket.on('join_room', ({ roomCode, playerName, avatar }) => {
    const code = roomCode.toUpperCase().trim();
    const room = rooms[code];

    if (!room) return socket.emit('error', { message: 'Room introuvable.' });
    if (room.phase !== 'lobby') return socket.emit('error', { message: 'Partie déjà en cours.' });
    if (Object.keys(room.players).length >= 15) return socket.emit('error', { message: 'Room pleine (max 15).' });

    const player = {
      id: socket.id,
      name: playerName.trim().substring(0, 20),
      avatar: avatar || '🧑',
      role: null,
      customRole: null,
      isAlive: true,
      hasVoted: false
    };

    room.players[socket.id] = player;
    socket.join(code);
    socket.data.roomCode = code;

    socket.emit('room_joined', { code, playerId: socket.id, hostId: room.hostId });

    // Notifie tout le monde
    io.to(code).emit('room_update', {
      code,
      hostId: room.hostId,
      players: getPublicPlayers(room),
      phase: 'lobby',
      config: room.config
    });

    io.to(code).emit('chat_message', {
      type: 'system',
      text: `${player.name} a rejoint la partie !`,
      timestamp: Date.now()
    });

    console.log(`[ROOM] ${playerName} a rejoint ${code}`);
  });

  // ── Mise à jour de la config (host seulement) ──────────
  socket.on('update_config', ({ impostorCount, timer, roles }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== 'lobby') return;

    room.config.impostorCount = Math.max(1, Math.min(impostorCount, Math.floor(Object.keys(room.players).length / 2)));
    room.config.timer = Math.max(10, Math.min(timer, 300));
    if (roles?.impostor) room.config.roles.impostor = roles.impostor.substring(0, 30);
    if (roles?.crewmate) room.config.roles.crewmate = roles.crewmate.substring(0, 30);

    io.to(room.code).emit('room_update', {
      code: room.code,
      hostId: room.hostId,
      players: getPublicPlayers(room),
      phase: room.phase,
      config: room.config
    });
  });

  // ── Lancer la partie (host seulement) ─────────────────
  socket.on('start_game', () => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostId !== socket.id) return;
    if (room.phase !== 'lobby' && room.phase !== 'result') return;

    const playerCount = Object.keys(room.players).length;
    if (playerCount < 2) return socket.emit('error', { message: 'Il faut au moins 2 joueurs.' });

    // Réinitialise les votes et rôles
    room.votes = {};
    room.round++;
    assignRoles(room);
    room.phase = 'role';

    // Envoie à chaque joueur son rôle privé
    Object.values(room.players).forEach(player => {
      io.to(player.id).emit('your_role', {
        role: player.role,
        customRole: player.customRole,
        isImpostor: player.role === 'impostor'
      });
    });

    io.to(room.code).emit('game_started', {
      phase: 'role',
      round: room.round,
      players: getPublicPlayers(room)
    });

    // Après 5 secondes d'affichage du rôle → discussion
    setTimeout(() => {
      if (!rooms[room.code] || rooms[room.code].phase !== 'role') return;
      room.phase = 'discussion';

      io.to(room.code).emit('phase_change', { phase: 'discussion' });

      // Démarre le timer de discussion
      startTimer(room, room.config.timer, () => {
        if (!rooms[room.code]) return;
        room.phase = 'vote';
        room.votes = {};
        Object.values(room.players).forEach(p => { p.hasVoted = false; });
        io.to(room.code).emit('phase_change', { phase: 'vote', players: getPublicPlayers(room) });

        // Timer de vote
        startTimer(room, 30, () => {
          if (!rooms[room.code]) return;
          resolveVote(room);
        });
      });
    }, 5000);
  });

  // ── Chat message ───────────────────────────────────────
  socket.on('chat_message', ({ text }) => {
    const room = rooms[socket.data.roomCode];
    if (!room) return;
    const player = room.players[socket.id];
    if (!player) return;

    // Filtre : pas de chat en phase rôle
    if (room.phase === 'role') return;

    const msg = {
      type: 'player',
      senderId: socket.id,
      senderName: player.name,
      senderAvatar: player.avatar,
      text: text.trim().substring(0, 200),
      timestamp: Date.now(),
      isAlive: player.isAlive
    };

    io.to(room.code).emit('chat_message', msg);
  });

  // ── Vote ───────────────────────────────────────────────
  socket.on('cast_vote', ({ targetId }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.phase !== 'vote') return;

    const voter = room.players[socket.id];
    if (!voter || !voter.isAlive || voter.hasVoted) return;

    const target = room.players[targetId];
    if (!target || !target.isAlive) return;

    room.votes[socket.id] = targetId;
    voter.hasVoted = true;

    io.to(room.code).emit('vote_cast', {
      voterId: socket.id,
      players: getPublicPlayers(room)
    });

    // Vérifie si tout le monde a voté
    const alivePlayers = Object.values(room.players).filter(p => p.isAlive);
    const votedCount = alivePlayers.filter(p => p.hasVoted).length;

    if (votedCount === alivePlayers.length) {
      stopTimer(room);
      resolveVote(room);
    }
  });

  // ── Déconnexion ─────────────────────────────────────────
  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;

    const player = room.players[socket.id];
    const name = player?.name || 'Inconnu';
    delete room.players[socket.id];

    console.log(`[-] Déconnexion : ${name} de ${code}`);

    // Si la room est vide, on la supprime
    if (Object.keys(room.players).length === 0) {
      stopTimer(room);
      delete rooms[code];
      console.log(`[ROOM] Supprimée : ${code}`);
      return;
    }

    // Si c'était l'host, on transfert le rôle
    if (room.hostId === socket.id) {
      room.hostId = Object.keys(room.players)[0];
      io.to(room.code).emit('new_host', { hostId: room.hostId });
    }

    io.to(room.code).emit('player_left', {
      playerId: socket.id,
      playerName: name,
      players: getPublicPlayers(room),
      hostId: room.hostId
    });

    io.to(room.code).emit('chat_message', {
      type: 'system',
      text: `${name} a quitté la partie.`,
      timestamp: Date.now()
    });

    // Vérifie condition de victoire si en jeu
    if (room.phase === 'discussion' || room.phase === 'vote') {
      const winCondition = checkWinCondition(room);
      if (winCondition) {
        stopTimer(room);
        endGame(room, winCondition.winner);
      }
    }
  });
});

// ─── Fonctions de jeu ──────────────────────────────────────

/** Résout le vote et élimine un joueur */
function resolveVote(room) {
  stopTimer(room);
  const result = computeVoteResult(room);

  if (result.tie || !result.eliminated) {
    io.to(room.code).emit('vote_result', {
      tie: true,
      eliminated: null,
      players: getPublicPlayers(room)
    });
  } else {
    const eliminated = room.players[result.eliminated];
    if (eliminated) {
      eliminated.isAlive = false;
      io.to(room.code).emit('vote_result', {
        tie: false,
        eliminated: {
          id: eliminated.id,
          name: eliminated.name,
          role: eliminated.role,
          customRole: eliminated.customRole
        },
        players: getPublicPlayers(room)
      });
    }
  }

  // Vérifie victoire
  setTimeout(() => {
    if (!rooms[room.code]) return;
    const winCondition = checkWinCondition(room);
    if (winCondition) {
      endGame(room, winCondition.winner);
    } else {
      // Retour en discussion
      room.phase = 'discussion';
      room.votes = {};
      Object.values(room.players).forEach(p => { p.hasVoted = false; });
      io.to(room.code).emit('phase_change', { phase: 'discussion' });

      startTimer(room, room.config.timer, () => {
        if (!rooms[room.code]) return;
        room.phase = 'vote';
        room.votes = {};
        Object.values(room.players).forEach(p => { p.hasVoted = false; });
        io.to(room.code).emit('phase_change', { phase: 'vote', players: getPublicPlayers(room) });

        startTimer(room, 30, () => {
          if (!rooms[room.code]) return;
          resolveVote(room);
        });
      });
    }
  }, 4000);
}

/** Termine la partie */
function endGame(room, winner) {
  stopTimer(room);
  room.phase = 'result';

  // Révèle tous les rôles
  const revealedPlayers = Object.values(room.players).map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    role: p.role,
    customRole: p.customRole,
    isAlive: p.isAlive
  }));

  io.to(room.code).emit('game_over', {
    winner,
    players: revealedPlayers,
    hostId: room.hostId
  });
}

// ─── Démarrage ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮 Impostor Game lancé sur http://localhost:${PORT}\n`);
});
