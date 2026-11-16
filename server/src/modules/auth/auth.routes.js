import { Router } from 'express';
import { createAuthenticateMiddleware } from '../../middleware/authenticate.middleware.js';
import { validateRequest } from '../../middleware/validate-request.middleware.js';
import { createAuthRateLimitMiddleware } from '../../security/auth-rate-limit.config.js';
import { createCsrfMiddleware } from '../../security/csrf.middleware.js';
import { createCsrfService } from '../../security/csrf.service.js';
import { createOriginValidationMiddleware } from '../../security/origin-validation.middleware.js';
import {
  loginController,
  logoutController,
  meController,
  refreshController,
  registerController,
  revokeSessionController,
  sessionsController,
} from './auth.controller.js';
import { createAuthValidators } from './auth.validators.js';

/**
 * Builds the versioned authentication router.
 * @param {{
 *   config: object,
 *   authService: object,
 *   logger: import('pino').Logger,
 *   databaseManager?: object|null,
 * }} options
 * @returns {import('express').Router}
 */
export function createAuthRouter({
  config,
  authService,
  logger,
  databaseManager = null,
}) {
  const router = Router();
  const validators = createAuthValidators(config);
  const authenticate = createAuthenticateMiddleware({ authService });
  const originValidation = createOriginValidationMiddleware(config);
  const csrfService = createCsrfService(config);
  const csrf = createCsrfMiddleware({ config, csrfService });
  const rateLimitOptions = {
    windowMs: config.auth.rateLimit.windowMs,
    config,
    logger,
    databaseManager,
  };
  const registerLimiter = createAuthRateLimitMiddleware({
    ...rateLimitOptions,
    max: config.auth.rateLimit.registerMax,
    operation: 'registration',
  });
  const loginLimiter = createAuthRateLimitMiddleware({
    ...rateLimitOptions,
    max: config.auth.rateLimit.loginMax,
    operation: 'login',
  });
  const refreshLimiter = createAuthRateLimitMiddleware({
    ...rateLimitOptions,
    max: config.auth.rateLimit.refreshMax,
    operation: 'session',
  });

  router.post(
    '/register',
    originValidation,
    registerLimiter,
    validateRequest(validators.register),
    registerController,
  );
  router.post(
    '/login',
    originValidation,
    loginLimiter,
    validateRequest(validators.login),
    loginController,
  );
  router.post('/refresh', originValidation, refreshLimiter, csrf, refreshController);
  router.post('/logout', originValidation, refreshLimiter, csrf, logoutController);
  router.get('/me', authenticate, meController);
  router.get('/sessions', authenticate, sessionsController);
  router.delete(
    '/sessions/:sessionId',
    authenticate,
    validateRequest(validators.sessionParams),
    revokeSessionController,
  );

  return router;
}
