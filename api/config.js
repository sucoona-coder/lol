// api/config.js — Expose les variables publiques Pusher au frontend
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({
    pusherKey:     process.env.PUSHER_KEY,
    pusherCluster: process.env.PUSHER_CLUSTER
  });
};
