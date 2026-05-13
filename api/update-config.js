// api/update-config.js
const pusher = require('../lib/pusher');
const { getRoom, setRoom } = require('../lib/store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { roomCode, playerId, impostorCount, timer, roles } = req.body;
  const room = await getRoom(roomCode);

  if (!room) return res.status(404).json({ error: 'Room introuvable.' });
  if (room.hostId !== playerId) return res.status(403).json({ error: 'Pas l\'hôte.' });
  if (room.phase !== 'lobby') return res.status(400).json({ error: 'Partie en cours.' });

  const maxImpostors = Math.max(1, Math.floor(Object.keys(room.players).length / 2));
  room.config.impostorCount = Math.max(1, Math.min(parseInt(impostorCount) || 1, maxImpostors));
  room.config.timer = Math.max(10, Math.min(parseInt(timer) || 60, 300));
  if (roles?.impostor) room.config.roles.impostor = roles.impostor.substring(0, 30);
  if (roles?.crewmate) room.config.roles.crewmate = roles.crewmate.substring(0, 30);

  await setRoom(roomCode, room);

  await pusher.trigger(`room-${roomCode}`, 'room-update', {
    config: room.config,
    players: Object.values(room.players).map(p => ({
      id: p.id, name: p.name, avatar: p.avatar,
      isHost: p.id === room.hostId, isAlive: p.isAlive
    }))
  });

  return res.status(200).json({ ok: true, config: room.config });
};
