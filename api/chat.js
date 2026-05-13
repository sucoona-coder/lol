// api/chat.js
const pusher = require('../lib/pusher');
const { getRoom } = require('../lib/store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { roomCode, playerId, text } = req.body;
  const room = getRoom(roomCode);
  if (!room) return res.status(404).json({ error: 'Room introuvable.' });

  const player = room.players[playerId];
  if (!player) return res.status(403).json({ error: 'Joueur inconnu.' });
  if (room.phase === 'role') return res.status(400).json({ error: 'Pas de chat en phase rôle.' });

  const msg = {
    type: 'player',
    senderId: playerId,
    senderName: player.name,
    senderAvatar: player.avatar,
    text: (text || '').trim().substring(0, 200),
    isAlive: player.isAlive,
    timestamp: Date.now()
  };

  await pusher.trigger(`room-${roomCode}`, 'chat', msg);
  return res.status(200).json({ ok: true });
};
