const { createClient } = require("redis");
const { env } = require("../config/env");

let redisClient;

async function connectRedis() {
  redisClient = createClient({
    url: env.REDIS_URL
  });

  redisClient.on("error", (error) => {
    console.error("[redis] error", error);
  });

  await redisClient.connect();
  console.log("[redis] connected");
  return redisClient;
}

function getRedisClient() {
  if (!redisClient) {
    throw new Error("Redis client not initialized. Call connectRedis() first.");
  }
  return redisClient;
}

async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit();
    console.log("[redis] disconnected");
    redisClient = null;
  }
}

module.exports = {
  connectRedis,
  getRedisClient,
  disconnectRedis
};
