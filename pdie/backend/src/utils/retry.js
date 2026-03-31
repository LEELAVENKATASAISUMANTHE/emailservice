import { logger } from './logger.js';

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export const retryStartupStep = async (label, operation, { attempts, delayMs }) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      logger.warn(
        { err, dependency: label, attempt, attempts, delayMs },
        'Startup dependency unavailable'
      );

      if (attempt === attempts) {
        throw err;
      }

      await sleep(delayMs);
    }
  }

  throw new Error(`Failed to initialize ${label}`);
};
