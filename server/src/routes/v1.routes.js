import { Router } from 'express';
import { createAdminRouter } from '../modules/admin/admin.routes.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';

/**
 * Builds the versioned API router for one application instance.
 * @param {{
 *   config: object,
 *   authService: object,
 *   logger: import('pino').Logger,
 *   databaseManager?: object|null,
 * }} options
 * @returns {import('express').Router}
 */
export function createV1Router({
  config,
  authService,
  logger,
  databaseManager = null,
}) {
  const router = Router();

  router.use('/health', healthRouter);
  router.use(
    '/auth',
    createAuthRouter({ config, authService, logger, databaseManager }),
  );
  router.use('/admin', createAdminRouter({ authService }));

  return router;
}
