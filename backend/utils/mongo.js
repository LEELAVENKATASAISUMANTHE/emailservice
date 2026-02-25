const mongoose = require("mongoose");
const { env } = require("../config/env");

async function connectMongo() {
  await mongoose.connect(env.MONGO_URI, {
    dbName: env.MONGO_DB_NAME
  });
  console.log(`[mongo] connected to ${env.MONGO_DB_NAME}`);
}

async function disconnectMongo() {
  await mongoose.disconnect();
  console.log("[mongo] disconnected");
}

module.exports = {
  connectMongo,
  disconnectMongo
};
