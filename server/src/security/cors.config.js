import cors from 'cors';
import { CSRF_HEADER_NAME } from '../constants/auth.constants.js';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
} from '../constants/http.constants.js';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';

/**
 * Creates a strict allowlist-based CORS policy. Requests without an Origin
 * header (health probes, server-to-server calls) remain allowed.
 * @param {{ corsOrigins: string[] }} config
 * @returns {import('express').RequestHandler}
 */
export function createCorsMiddleware(config) {
  const allowedOrigins = new Set(config.corsOrigins);

  return cors({
    origin(origin, callback) {
      if (origin === undefined) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new AppError(
          ERROR_CODES.FORBIDDEN,
          `Origin ${origin} is not allowed by the CORS policy.`,
        ),
      );
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      CSRF_HEADER_NAME,
      REQUEST_ID_HEADER,
      CORRELATION_ID_HEADER,
    ],
    exposedHeaders: [REQUEST_ID_HEADER, CORRELATION_ID_HEADER],
    maxAge: 600,
    optionsSuccessStatus: 204,
  });
}
