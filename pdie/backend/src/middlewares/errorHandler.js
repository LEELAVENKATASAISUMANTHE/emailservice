import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Assign a unique request ID to every incoming request.
 * Available as `req.id` and returned in the `X-Request-Id` response header.
 */
export const requestIdMiddleware = (req, res, next) => {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
};

export const notFoundHandler = (_req, res, _next) => {
  res.status(404).json({ message: 'Resource not found' });
};

export const errorHandler = (err, req, res, _next) => {
  const status = err.statusCode || 500;
  const payload = {
    message: err.message || 'Internal server error',
    requestId: req.id
  };

  if (err.details) {
    payload.details = err.details;
  }

  if (status >= 500) {
    logger.error({ err, requestId: req.id }, 'Unhandled server error');
  } else {
    logger.warn({ err: err.message, requestId: req.id }, 'Request failed');
  }

  res.status(status).json(payload);
};
