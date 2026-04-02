import mongoose from 'mongoose';
import { config } from '../config/index.js';

mongoose.set('strictQuery', true);

let connectionPromise;

export const connectMongo = async () => {
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose.connect(config.mongo.uri, {
    autoIndex: false,
    maxPoolSize: 10
  });

  try {
    return await connectionPromise;
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
};

export const disconnectMongo = async () => mongoose.connection.close();
