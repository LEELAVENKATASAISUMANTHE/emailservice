import mongoose from 'mongoose';
import { config } from '../config/index.js';

mongoose.set('strictQuery', true);

export const connectMongo = () => mongoose.connect(config.mongo.uri, { maxPoolSize: 10 });
