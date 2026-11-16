import { APP_NAME } from '../../constants/app.constants.js';
import { AppError } from '../../errors/app-error.js';
import { ERROR_CODES } from '../../errors/error-codes.js';
import { sendError, sendSuccess } from '../../responses/response-builder.js';

/**
 * Returns the legacy-compatible health payload. This endpoint intentionally
 * does not use the shared response envelope.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 */
export function healthController(request, response) {
  const config = request.app.locals.appConfig;

  response.status(200).json({
    success: true,
    application: config.appName ?? APP_NAME,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: config.version,
  });
}

/**
 * Reports process liveness without checking dependencies.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 */
export function livenessController(request, response) {
  sendSuccess(response, {
    status: 'alive',
    uptimeSeconds: Math.floor(process.uptime()),
  });
}

/**
 * Reports dependency readiness using the shared response envelope.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 */
export async function readinessController(request, response) {
  const databaseManager = request.app.locals.databaseManager;

  if (databaseManager === null || databaseManager === undefined) {
    sendError(
      response,
      new AppError(
        ERROR_CODES.DATABASE_UNAVAILABLE,
        'Database readiness information is unavailable.',
      ),
    );
    return;
  }

  const readiness = await databaseManager.checkReadiness();

  if (readiness.status === 'ready') {
    sendSuccess(response, readiness);
    return;
  }

  sendError(
    response,
    new AppError(
      ERROR_CODES.DATABASE_UNAVAILABLE,
      'One or more required database dependencies are unavailable.',
      { details: readiness },
    ),
  );
}
