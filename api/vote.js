// api/vote.js
const pusher = require('../lib/pusher');
const { getRoom, setRoom } = require('../lib/store');

function checkWin(room) {
  const alive = Object.values(room.players).filter(p => p.isAlive);
  const impostors = alive.filter(p => p.role === 'impostor');
  const crewmates = alive.filter(p => p.role === 'crewmate');
  if (impostors.length === 0) return 'crewmates';
  if (impostors.length >= crewmates.length) return 'impostors';
  return null;
}

function resolveVotes(room) {
  const counts = {};
  const alive = Object.values(room.players).filter(p => p.isAlive);
  alive.forEach(p => { counts[p.id] = 0; });
  Object.values(room.votes).forEach(tid => {
    if (counts[tid] !== undefined) counts[tid]++;
  });

  let max = 0, eliminated = null, tie = false;
  for (const [id, count] of Object.entries(counts)) {
    if (count > max) { max = count; eliminated = id; tie = false; }
    else if (count === max && max > 0) { tie = true; }
  }
  return tie ? { tie: true, eliminated: null } : { tie: false, eliminated, max };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { roomCode, playerId, targetId } = req.body;
  const room = await getRoom(roomCode);
  if (!room) return res.status(404).json({ error: 'Room introuvable.' });
  if (room.phase !== 'vote') return res.status(400).json({ error: 'Pas en phase vote.' });

  const voter = room.players[playerId];
  const target = room.players[targetId];
  if (!voter?.isAlive || voter.hasVoted) return res.status(400).json({ error: 'Vote invalide.' });
  if (!target?.isAlive) return res.status(400).json({ error: 'Cible invalide.' });

  // Enregistre le vote
  room.votes[playerId] = targetId;
  voter.hasVoted = true;
  await setRoom(roomCode, room);

  // Notifie l'avancement des votes
  const alive = Object.values(room.players).filter(p => p.isAlive);
  const votedCount = alive.filter(p => p.hasVoted).length;

  await pusher.trigger(`room-${roomCode}`, 'vote-update', {
    votedCount,
    total: alive.length,
    players: alive.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar,
      hasVoted: p.hasVoted, isAlive: p.isAlive,
      votedBy: Object.values(room.votes).filter(v => v === p.id).length
    }))
  });

  // Tout le monde a voté → résolution
  if (votedCount === alive.length) {
    const result = resolveVotes(room);

    if (!result.tie && result.eliminated) {
      const elim = room.players[result.eliminated];
      elim.isAlive = false;
      await setRoom(roomCode, room);

      await pusher.trigger(`room-${roomCode}`, 'vote-result', {
        tie: false,
        eliminated: {
          id: elim.id, name: elim.name, avatar: elim.avatar,
          role: elim.role, customRole: elim.customRole
        }
      });
    } else {
      await pusher.trigger(`room-${roomCode}`, 'vote-result', { tie: true, eliminated: null });
    }

    // Vérifie victoire
    const winner = checkWin(room);
    if (winner) {
      room.phase = 'result';
      await setRoom(roomCode, room);
      await pusher.trigger(`room-${roomCode}`, 'game-over', {
        winner,
        players: Object.values(room.players).map(p => ({
          id: p.id, name: p.name, avatar: p.avatar,
          role: p.role, customRole: p.customRole,
          isAlive: p.isAlive
        })),
        hostId: room.hostId
      });
    } else {
      // Retour discussion
      setTimeout(async () => {
        const r = await getRoom(roomCode);
        if (!r || r.phase === 'result') return;
        r.phase = 'discussion';
        r.votes = {};
        Object.values(r.players).forEach(p => { p.hasVoted = false; });
        await setRoom(roomCode, r);
        await pusher.trigger(`room-${roomCode}`, 'phase-change', {
          phase: 'discussion',
          players: Object.values(r.players).map(p => ({
            id: p.id, name: p.name, avatar: p.avatar,
            isAlive: p.isAlive, hasVoted: false,
            isHost: p.id === r.hostId, votedBy: 0
          }))
        });
      }, 4000);
    }
  }

  return res.status(200).json({ ok: true });
};
