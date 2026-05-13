// lib/pusher.js
const Pusher = require('pusher');

const {
  PUSHER_APP_ID,
  PUSHER_KEY,
  PUSHER_SECRET,
  PUSHER_CLUSTER
} = process.env;

const hasPusherConfig = Boolean(PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET && PUSHER_CLUSTER);

if (!hasPusherConfig) {
  console.warn('[pusher] Missing PUSHER_* environment variables. Realtime events are disabled.');
}

const pusher = hasPusherConfig
  ? new Pusher({
      appId: PUSHER_APP_ID,
      key: PUSHER_KEY,
      secret: PUSHER_SECRET,
      cluster: PUSHER_CLUSTER,
      useTLS: true
    })
  : {
      trigger: async () => null
    };

module.exports = pusher;
