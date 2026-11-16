import rateLimit from 'express-rate-limit';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';
import { createAuthRateLimitStore } from './auth-rate-limit.store.js';

/**
 * Creates a dedicated limiter for a single authentication operation.
 * @param {{
 *   windowMs: number,
 *   max: number,
 *   operation: string,
 *   config: object,
 *   logger: import('pino').Logger,
 *   databaseManager?: object|null,
 * }} options
 * @returns {import('express').RequestHandler}
 */
export function createAuthRateLimitMiddleware({
  windowMs,
  max,
  operation,
  config,
  logger,
  databaseManager = null,
}) {
  const store = createAuthRateLimitStore({
    config,
    logger,
    databaseManager,
    operation,
  });

  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: false,
    logger,
    ...(store === null ? {} : { store }),
    handler(_request, _response, next) {
      next(
        new AppError(
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          `Too many ${operation} requests. Please try again later.`,
        ),
      );
    },
  });
}
