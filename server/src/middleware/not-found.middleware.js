import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';

/**
 * Converts unmatched routes into the centralized not-found error contract.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next
 */
export function notFoundMiddleware(request, _response, next) {
  next(
    new AppError(
      ERROR_CODES.RESOURCE_NOT_FOUND,
      `Route ${request.method} ${request.path} was not found.`,
    ),
  );
}
