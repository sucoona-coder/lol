// api/join-room.js
const pusher = require('../lib/pusher');
const { getRoom, setRoom } = require('../lib/store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { roomCode, playerName, avatar, playerId } = req.body;
  const code = (roomCode || '').toUpperCase().trim();
  const room = getRoom(code);

  if (!room) return res.status(404).json({ error: 'Room introuvable.' });
  if (room.phase !== 'lobby') return res.status(400).json({ error: 'Partie déjà en cours.' });
  if (Object.keys(room.players).length >= 15) return res.status(400).json({ error: 'Room pleine (max 15).' });

  // Si le joueur est déjà dans la room (reconnexion)
  if (!room.players[playerId]) {
    room.players[playerId] = {
      id: playerId,
      name: playerName.trim().substring(0, 20),
      avatar: avatar || '🧑',
      isAlive: true,
      hasVoted: false,
      role: null,
      customRole: null
    };
  }

  setRoom(code, room);

  // Notifie les autres joueurs
  await pusher.trigger(`room-${code}`, 'room-update', sanitizeRoom(room, null));
  await pusher.trigger(`room-${code}`, 'chat', {
    type: 'system',
    text: `${room.players[playerId].name} a rejoint la partie !`,
    timestamp: Date.now()
  });

  return res.status(200).json({ code, room: sanitizeRoom(room, playerId) });
};

function sanitizeRoom(room, playerId) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    config: room.config,
    players: Object.values(room.players).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isAlive: p.isAlive,
      hasVoted: p.hasVoted,
      isHost: p.id === room.hostId,
      role: (playerId && p.id === playerId) || room.phase === 'result' ? p.role : null,
      customRole: (playerId && p.id === playerId) || room.phase === 'result' ? p.customRole : null,
      votedBy: Object.values(room.votes).filter(v => v === p.id).length
    }))
  };
}
