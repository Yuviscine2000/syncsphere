import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
} from '../constants/http.constants.js';
import {
  resolveCorrelationId,
  resolveRequestId,
} from '../utils/identifiers.js';

/**
 * Establishes trusted request and correlation identifiers before any other
 * middleware runs, and exposes them through request, response, and headers.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} next
 */
export function requestIdMiddleware(request, response, next) {
  const requestId = resolveRequestId(request.get(REQUEST_ID_HEADER));
  const correlationId = resolveCorrelationId(
    request.get(CORRELATION_ID_HEADER),
    requestId,
  );

  request.requestId = requestId;
  request.correlationId = correlationId;
  request.id = requestId;

  response.locals.requestId = requestId;
  response.locals.correlationId = correlationId;

  response.setHeader(REQUEST_ID_HEADER, requestId);
  response.setHeader(CORRELATION_ID_HEADER, correlationId);

  next();
}
