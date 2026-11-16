import { buildErrorResponse } from '../responses/response-builder.js';

/**
 * Centralized error boundary. Every failure leaves the application through
 * this handler using the shared response envelope.
 * @param {unknown} error
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next
 */
export function errorHandlerMiddleware(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  const logger = request.app.locals.logger;
  const { statusCode, body } = buildErrorResponse({ error, request });

  const logPayload = {
    requestId: request.requestId,
    correlationId: request.correlationId,
    method: request.method,
    path: request.originalUrl,
    statusCode,
    errorCode: body.error.code,
  };

  if (statusCode >= 500) {
    logger.error({ ...logPayload, err: error }, 'Request failed with server error');
  } else {
    logger.warn(logPayload, 'Request failed with client error');
  }

  response.status(statusCode).json(body);
}
