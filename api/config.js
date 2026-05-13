// api/config.js — Expose les variables publiques Pusher au frontend
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Evite de renvoyer une ancienne config en cache (ex: clé vide après update env)
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({
    pusherKey:     (process.env.PUSHER_KEY || process.env.PUSHER_APP_KEY || '').trim(),
    pusherCluster: (process.env.PUSHER_CLUSTER || 'eu').trim()
  });
};
