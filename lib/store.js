// lib/store.js
// Stockage : utilise Upstash Redis en production si configuré, sinon fallback mémoire.
// Les handlers API appellent désormais les fonctions asynchrones.

let RedisClient = null;
let Redis = null;
try {
  Redis = require('@upstash/redis').Redis;
} catch (err) {
  Redis = null;
}

const useRedis = !!(Redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
let redis = null;
if (useRedis) {
  redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
}

const mem = global._gameStore || (global._gameStore = { rooms: {} });

async function getRoom(code) {
  if (!code) return null;
  const c = (code || '').toUpperCase();
  if (useRedis) {
    const v = await redis.get(`room:${c}`);
    return v ? JSON.parse(v) : null;
  }
  return mem.rooms[c] || null;
}

async function setRoom(code, room) {
  const c = (code || '').toUpperCase();
  if (useRedis) {
    await redis.set(`room:${c}`, JSON.stringify(room));
    return;
  }
  mem.rooms[c] = room;
}

async function deleteRoom(code) {
  const c = (code || '').toUpperCase();
  if (useRedis) {
    await redis.del(`room:${c}`);
    return;
  }
  delete mem.rooms[c];
}

async function generateCode() {
  let code;
  let exists = null;
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    if (useRedis) exists = await redis.get(`room:${code}`);
    else exists = mem.rooms[code];
  } while (exists);
  return code;
}

module.exports = { getRoom, setRoom, deleteRoom, generateCode };
