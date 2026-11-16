import express from 'express';
import { API_VERSION } from './constants/app.constants.js';
import { errorHandlerMiddleware } from './middleware/error-handler.middleware.js';
import { notFoundMiddleware } from './middleware/not-found.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware.js';
import { createDefaultAuthService } from './modules/auth/auth.factory.js';
import { createV1Router } from './routes/v1.routes.js';
import { createSecurityMiddleware } from './security/security.config.js';

/**
 * Builds an Express application without binding a port. Tests and the runtime
 * entry point share this factory so behavior cannot drift.
 * @param {{
 *   config: object,
 *   logger: import('pino').Logger,
 *   databaseManager?: object|null,
 *   authService?: object|null,
 * }} dependencies
 * @returns {import('express').Express}
 */
export function createApp({
  config,
  logger,
  databaseManager = null,
  authService = null,
}) {
  if (config === undefined || logger === undefined) {
    throw new TypeError('createApp requires config and logger');
  }

  const app = express();
  const security = createSecurityMiddleware(config);
  const resolvedAuthService =
    authService ?? createDefaultAuthService({ config, logger, databaseManager });
  const v1Router = createV1Router({
    config,
    authService: resolvedAuthService,
    logger,
    databaseManager,
  });

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.locals.appConfig = config;
  app.locals.logger = logger;
  app.locals.databaseManager = databaseManager;
  app.locals.authService = resolvedAuthService;

  app.use(requestIdMiddleware);
  app.use(security.helmet);
  app.use(security.cors);
  app.use(requestLoggerMiddleware);
  app.use(express.json({ limit: config.bodyLimit, strict: true }));
  app.use(express.urlencoded({ extended: false, limit: config.bodyLimit }));
  app.use(`${config.apiPrefix}/${API_VERSION}`, security.rateLimiter, v1Router);
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
