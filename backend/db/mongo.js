import mongoose from "mongoose";
import { env } from "../config/env.js";

export async function connectMongo() {
  await mongoose.connect(env.MONGO_URI, {
    dbName: env.MONGO_DB_NAME
  });
  console.log(`[mongo] connected to ${env.MONGO_DB_NAME}`);
}

export async function disconnectMongo() {
  await mongoose.disconnect();
  console.log("[mongo] disconnected");
}
