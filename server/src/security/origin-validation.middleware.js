import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function resolveOrigin(request) {
  const origin = request.get('Origin');

  if (typeof origin === 'string' && origin.length > 0) {
    return origin;
  }

  const referer = request.get('Referer');

  if (typeof referer !== 'string' || referer.length === 0) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return 'invalid';
  }
}

/**
 * Validates browser origin metadata on state-changing authentication requests.
 * Missing Origin/Referer is allowed for non-browser API clients; CSRF remains
 * mandatory on cookie-authenticated operations.
 * @param {{ corsOrigins: string[] }} config
 * @returns {import('express').RequestHandler}
 */
export function createOriginValidationMiddleware(config) {
  const allowedOrigins = new Set(config.corsOrigins);

  return function originValidationMiddleware(request, _response, next) {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }

    if (request.get('Sec-Fetch-Site') === 'cross-site') {
      next(
        new AppError(
          ERROR_CODES.FORBIDDEN,
          'Cross-site authentication requests are not allowed.',
        ),
      );
      return;
    }

    const origin = resolveOrigin(request);

    if (origin !== null && !allowedOrigins.has(origin)) {
      next(new AppError(ERROR_CODES.FORBIDDEN, 'The request origin is not allowed.'));
      return;
    }

    next();
  };
}
