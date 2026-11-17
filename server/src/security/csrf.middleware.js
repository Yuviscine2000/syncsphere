import { CSRF_HEADER_NAME } from '../constants/auth.constants.js';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';
import { readCsrfCookieValues } from '../modules/auth/auth.cookies.js';

/**
 * Enforces the double-submit portion of CSRF protection. Session binding is
 * verified by the auth service after the refresh token is resolved.
 * @param {{ config: object, csrfService: object }} options
 * @returns {import('express').RequestHandler}
 */
export function createCsrfMiddleware({ config, csrfService }) {
  return function csrfMiddleware(request, _response, next) {
    const cookieTokens = readCsrfCookieValues(request, config);
    const headerToken = request.get(CSRF_HEADER_NAME);

    if (
      headerToken === undefined ||
      !cookieTokens.some((cookieToken) =>
        csrfService.safeCompare(cookieToken, headerToken),
      )
    ) {
      next(new AppError(ERROR_CODES.CSRF_VALIDATION_FAILED));
      return;
    }

    request.csrfToken = headerToken;
    next();
  };
}
