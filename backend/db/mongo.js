import mongoose from "mongoose";

export async function connectMongo() {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB_NAME
  });
  console.log(`[mongo] connected to ${process.env.MONGO_DB_NAME}`);
}

export async function disconnectMongo() {
  await mongoose.disconnect();
  console.log("[mongo] disconnected");
}

