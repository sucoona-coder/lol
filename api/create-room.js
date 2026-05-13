// api/create-room.js
const { generateCode, setRoom } = require('../lib/store');
const { sanitizeRoom } = require('../lib/room-view');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { playerName, avatar, playerId } = req.body;
  if (!playerName || !playerId) return res.status(400).json({ error: 'Champs manquants' });

  const code = await generateCode();
  const player = {
    id: playerId,
    name: playerName.trim().substring(0, 20),
    avatar: avatar || '🧑',
    isAlive: true,
    hasVoted: false,
    role: null,
    customRole: null
  };

  const room = {
    code,
    hostId: playerId,
    players: { [playerId]: player },
    phase: 'lobby',
    config: {
      impostorCount: 1,
      timer: 60,
      roles: { impostor: 'Imposteur', crewmate: 'Équipier' }
    },
    votes: {},
    round: 0,
    timerEnd: null,
    chat: []
  };

  await setRoom(code, room);

  return res.status(200).json({ code, room: sanitizeRoom(room, playerId) });
};

