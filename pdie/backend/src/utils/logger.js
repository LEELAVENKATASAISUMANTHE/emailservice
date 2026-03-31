import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.app.nodeEnv === 'development' ? 'debug' : 'info',
  transport: config.app.nodeEnv === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard'
        }
      }
    : undefined
});
