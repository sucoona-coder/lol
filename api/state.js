const { getRoom } = require('../lib/store');
const { sanitizeRoom } = require('../lib/room-view');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { roomCode, playerId } = req.body;
  const room = await getRoom((roomCode || '').toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room introuvable.' });
  return res.status(200).json({ room: sanitizeRoom(room, playerId) });
};
