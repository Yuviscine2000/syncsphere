import { Router } from 'express';
import { AUTH_PERMISSIONS } from '../../constants/auth.constants.js';
import { createAuthenticateMiddleware } from '../../middleware/authenticate.middleware.js';
import { authorize } from '../../middleware/authorize.middleware.js';
import { sendSuccess } from '../../responses/response-builder.js';

/**
 * Exposes a minimal protected endpoint that demonstrates permission-based
 * authorization without implementing unrelated administrative features.
 * @param {{ authService: object }} options
 * @returns {import('express').Router}
 */
export function createAdminRouter({ authService }) {
  const router = Router();
  const authenticate = createAuthenticateMiddleware({ authService });

  router.get(
    '/access',
    authenticate,
    authorize({ permissions: [AUTH_PERMISSIONS.ADMIN_ACCESS] }),
    (request, response) => {
      sendSuccess(response, {
        authorized: true,
        permissions: request.auth.user.permissions,
      });
    },
  );

  return router;
}
