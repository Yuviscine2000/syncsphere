import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';

/**
 * Enforces backend authorization from trusted request auth context. Permissions
 * are all required; roles are any-of. Never read roles or permissions from the
 * request body, query string, or token payload.
 * @param {{ permissions?: string[], roles?: string[] }} requirements
 * @returns {import('express').RequestHandler}
 */
export function authorize({ permissions = [], roles = [] } = {}) {
  if (!Array.isArray(permissions) || !Array.isArray(roles)) {
    throw new TypeError('authorize requires permission and role arrays');
  }

  return function authorizeMiddleware(request, _response, next) {
    const auth = request.auth;

    if (auth === undefined || auth === null) {
      next(new AppError(ERROR_CODES.AUTHENTICATION_REQUIRED));
      return;
    }

    const userPermissions = new Set(auth.user?.permissions ?? []);
    const userRoles = new Set(auth.user?.roles ?? []);

    const hasAllPermissions = permissions.every((permission) =>
      userPermissions.has(permission),
    );
    const hasRequiredRole =
      roles.length === 0 || roles.some((role) => userRoles.has(role));

    if (!hasAllPermissions || !hasRequiredRole) {
      next(new AppError(ERROR_CODES.INSUFFICIENT_PERMISSIONS));
      return;
    }

    next();
  };
}
