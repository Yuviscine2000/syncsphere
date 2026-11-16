import { createCorsMiddleware } from './cors.config.js';
import { createHelmetMiddleware } from './helmet.config.js';
import { createRateLimitMiddleware } from './rate-limit.config.js';

export { createCorsMiddleware, createHelmetMiddleware, createRateLimitMiddleware };

/**
 * Builds all security middleware for one application instance.
 * @param {{ corsOrigins: string[], rateLimit: { windowMs: number, max: number } }} config
 * @returns {{ helmet: import('express').RequestHandler, cors: import('express').RequestHandler, rateLimiter: import('express').RequestHandler }}
 */
export function createSecurityMiddleware(config) {
  return {
    helmet: createHelmetMiddleware(),
    cors: createCorsMiddleware(config),
    rateLimiter: createRateLimitMiddleware(config),
  };
}
