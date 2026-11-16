import rateLimit from 'express-rate-limit';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';

/**
 * Creates a configurable rate limiter that reports through the shared error
 * envelope instead of the library's default response body.
 * @param {{ rateLimit: { windowMs: number, max: number } }} config
 * @returns {import('express').RequestHandler}
 */
export function createRateLimitMiddleware(config) {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler(_request, _response, next) {
      next(
        new AppError(
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          'Too many requests. Please try again later.',
        ),
      );
    },
  });
}
