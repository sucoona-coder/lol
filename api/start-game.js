// api/start-game.js
const pusher = require('../lib/pusher');
const { getRoom, setRoom } = require('../lib/store');

// Mélange Fisher-Yates
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { roomCode, playerId } = req.body;
  const room = await getRoom(roomCode);

  if (!room) return res.status(404).json({ error: 'Room introuvable.' });
  if (room.hostId !== playerId) return res.status(403).json({ error: 'Pas l\'hôte.' });
  if (Object.keys(room.players).length < 2) return res.status(400).json({ error: 'Il faut au moins 2 joueurs.' });

  // Réinitialise
  room.round++;
  room.phase = 'role';
  room.votes = {};

  // Distribution des rôles
  const playerIds = shuffle(Object.keys(room.players));
  const { impostorCount, roles } = room.config;

  playerIds.forEach((id, index) => {
    const p = room.players[id];
    p.role = index < impostorCount ? 'impostor' : 'crewmate';
    p.customRole = index < impostorCount ? (roles.impostor || 'Imposteur') : (roles.crewmate || 'Équipier');
    p.isAlive = true;
    p.hasVoted = false;
  });

  await setRoom(roomCode, room);

  // 1. Annonce que la partie commence (sans rôles)
  await pusher.trigger(`room-${roomCode}`, 'game-started', {
    round: room.round,
    players: Object.values(room.players).map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, isAlive: true, hasVoted: false,
      isHost: p.id === room.hostId
    }))
  });

  // 2. Envoie le rôle privé à chaque joueur sur son canal personnel
  const triggers = Object.values(room.players).map(p =>
    pusher.trigger(`player-${p.id}`, 'your-role', {
      role: p.role,
      customRole: p.customRole,
      isImpostor: p.role === 'impostor'
    })
  );
  await Promise.all(triggers);

  return res.status(200).json({ ok: true, round: room.round });
};
