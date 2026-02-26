import { createClient } from "redis";
import { env } from "../config/env.js";

let redisClient;

export async function connectRedis() {
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

export function getRedisClient() {
  if (!redisClient) {
    throw new Error("Redis client not initialized. Call connectRedis() first.");
  }
  return redisClient;
}

export async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit();
    console.log("[redis] disconnected");
    redisClient = null;
  }
}
