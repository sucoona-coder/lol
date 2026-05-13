const { getRoom, setRoom } = require('../lib/store');
const { sanitizeRoom } = require('../lib/room-view');

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

  if (!room.players[playerId]) {
    room.players[playerId] = { id: playerId, name: playerName.trim().substring(0, 20), avatar: avatar || '🧑', isAlive: true, hasVoted: false, role: null, customRole: null };
    room.chat.push({ type: 'system', text: `${room.players[playerId].name} a rejoint la partie !`, timestamp: Date.now() });
  }

  setRoom(code, room);
  return res.status(200).json({ code, room: sanitizeRoom(room, playerId) });
};
