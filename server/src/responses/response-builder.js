import { normalizeError } from '../errors/error-response.js';
import { HTTP_STATUS } from './response-codes.js';

function resolveVersion(request) {
  const version = request?.app?.locals?.appConfig?.version;
  return typeof version === 'string' ? version : null;
}

function resolveIsProduction(request, explicitValue) {
  if (typeof explicitValue === 'boolean') {
    return explicitValue;
  }

  return request?.app?.locals?.appConfig?.isProduction === true;
}

/**
 * Builds the metadata block shared by REST and Socket.IO responses.
 * @param {import('express').Request} request
 * @param {string} [timestamp]
 * @returns {{ requestId: string|null, correlationId: string|null, timestamp: string, version: string|null }}
 */
export function buildResponseMetadata(request, timestamp = new Date().toISOString()) {
  const requestId = request?.requestId ?? null;
  const correlationId = request?.correlationId ?? requestId;

  return {
    requestId,
    correlationId,
    timestamp,
    version: resolveVersion(request),
  };
}

/**
 * @param {{ data?: unknown, request: import('express').Request, timestamp?: string }} options
 * @returns {object}
 */
export function buildSuccessResponse({ data = null, request, timestamp }) {
  return {
    success: true,
    data: data ?? null,
    error: null,
    metadata: buildResponseMetadata(request, timestamp),
  };
}

/**
 * @param {import('express').Response} response
 * @param {unknown} data
 * @param {number} [statusCode]
 * @returns {import('express').Response}
 */
export function sendSuccess(response, data, statusCode = HTTP_STATUS.OK) {
  return response.status(statusCode).json(
    buildSuccessResponse({
      data,
      request: response.req,
    }),
  );
}

/**
 * @param {{
 *   error: unknown,
 *   request: import('express').Request,
 *   isProduction?: boolean,
 *   timestamp?: string,
 * }} options
 * @returns {{ statusCode: number, body: object }}
 */
export function buildErrorResponse({ error, request, isProduction, timestamp }) {
  const normalized = normalizeError(error, {
    isProduction: resolveIsProduction(request, isProduction),
  });

  return {
    statusCode: normalized.statusCode,
    body: {
      success: false,
      data: null,
      error: normalized.error,
      metadata: buildResponseMetadata(request, timestamp),
    },
  };
}

/**
 * @param {import('express').Response} response
 * @param {unknown} error
 * @param {{ isProduction?: boolean }} [options]
 * @returns {import('express').Response}
 */
export function sendError(response, error, options = {}) {
  const { statusCode, body } = buildErrorResponse({
    error,
    request: response.req,
    isProduction: options.isProduction,
  });

  return response.status(statusCode).json(body);
}
