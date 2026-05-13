// api/leave.js
const pusher = require('../lib/pusher');
const { getRoom, setRoom, deleteRoom } = require('../lib/store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { roomCode, playerId } = req.body;
  const room = getRoom(roomCode);
  if (!room) return res.status(200).json({ ok: true });

  const player = room.players[playerId];
  const name = player?.name || 'Inconnu';
  delete room.players[playerId];

  if (Object.keys(room.players).length === 0) {
    deleteRoom(roomCode);
    return res.status(200).json({ ok: true });
  }

  // Transfert d'hôte
  if (room.hostId === playerId) {
    room.hostId = Object.keys(room.players)[0];
    await pusher.trigger(`room-${roomCode}`, 'new-host', { hostId: room.hostId });
  }

  setRoom(roomCode, room);

  await pusher.trigger(`room-${roomCode}`, 'player-left', {
    playerId,
    playerName: name,
    players: Object.values(room.players).map(p => ({
      id: p.id, name: p.name, avatar: p.avatar,
      isAlive: p.isAlive, isHost: p.id === room.hostId
    })),
    hostId: room.hostId
  });

  await pusher.trigger(`room-${roomCode}`, 'chat', {
    type: 'system',
    text: `${name} a quitté la partie.`,
    timestamp: Date.now()
  });

  return res.status(200).json({ ok: true });
};
