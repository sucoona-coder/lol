// api/phase.js — Appelé par le client host pour changer de phase
const pusher = require('../lib/pusher');
const { getRoom, setRoom } = require('../lib/store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { roomCode, playerId, phase } = req.body;
  const room = getRoom(roomCode);

  if (!room) return res.status(404).json({ error: 'Room introuvable.' });
  if (room.hostId !== playerId) return res.status(403).json({ error: 'Pas l\'hôte.' });

  room.phase = phase;

  if (phase === 'vote') {
    // Réinitialise les votes
    room.votes = {};
    Object.values(room.players).forEach(p => { p.hasVoted = false; });
  }

  setRoom(roomCode, room);

  await pusher.trigger(`room-${roomCode}`, 'phase-change', {
    phase,
    players: Object.values(room.players).map(p => ({
      id: p.id, name: p.name, avatar: p.avatar,
      isAlive: p.isAlive, hasVoted: p.hasVoted,
      isHost: p.id === room.hostId,
      votedBy: Object.values(room.votes).filter(v => v === p.id).length
    }))
  });

  return res.status(200).json({ ok: true });
};
