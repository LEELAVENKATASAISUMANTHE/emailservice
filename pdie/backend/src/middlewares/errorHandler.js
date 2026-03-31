import { logger } from '../utils/logger.js';

export class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const notFoundHandler = (_req, res, _next) => {
  res.status(404).json({ message: 'Resource not found' });
};

export const errorHandler = (err, _req, res, _next) => {
  const status = err.statusCode || 500;
  const payload = {
    message: err.message || 'Internal server error'
  };

  if (err.details) {
    payload.details = err.details;
  }

  if (status >= 500) {
    logger.error({ err }, 'Unhandled server error');
  } else {
    logger.warn({ err }, 'Request failed');
  }

  res.status(status).json(payload);
};
