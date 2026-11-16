import { ACCESS_TOKEN_BEARER_PREFIX } from '../constants/auth.constants.js';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';

const AUTHORIZATION_PATTERN = new RegExp(
  `^${ACCESS_TOKEN_BEARER_PREFIX}\\s+(\\S+)$`,
  'i',
);

/**
 * Verifies the bearer access token, active refresh session, account status, and
 * current roles/permissions before exposing trusted request auth context.
 * @param {{ authService: object }} options
 * @returns {import('express').RequestHandler}
 */
export function createAuthenticateMiddleware({ authService }) {
  return async function authenticateMiddleware(request, _response, next) {
    try {
      const authorization = request.get('Authorization');

      if (typeof authorization !== 'string') {
        throw new AppError(ERROR_CODES.AUTHENTICATION_REQUIRED);
      }

      const match = AUTHORIZATION_PATTERN.exec(authorization);

      if (match === null) {
        throw new AppError(ERROR_CODES.AUTHENTICATION_REQUIRED);
      }

      request.auth = await authService.authenticateAccessToken(match[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}
