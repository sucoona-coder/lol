function sanitizeRoom(room, playerId) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    round: room.round,
    config: room.config,
    players: Object.values(room.players).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isAlive: p.isAlive,
      hasVoted: p.hasVoted,
      isHost: p.id === room.hostId,
      role: (p.id === playerId || room.phase === 'result') ? p.role : null,
      customRole: (p.id === playerId || room.phase === 'result') ? p.customRole : null,
      votedBy: Object.values(room.votes || {}).filter(v => v === p.id).length
    })),
    chat: room.chat || []
  };
}

module.exports = { sanitizeRoom };
