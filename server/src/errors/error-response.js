import { AppError } from './app-error.js';
import { ERROR_CODES, ERROR_MESSAGES } from './error-codes.js';

const INTERNAL_ERROR_MESSAGE = ERROR_MESSAGES[ERROR_CODES.INTERNAL_SERVER_ERROR];

function getProperty(source, key) {
  if (typeof source !== 'object' || source === null) {
    return undefined;
  }

  return Reflect.get(source, key);
}

function getStatus(source) {
  const status = getProperty(source, 'status') ?? getProperty(source, 'statusCode');

  if (
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
  ) {
    return status;
  }

  return undefined;
}

function getErrorMessage(source) {
  if (source instanceof Error && source.message.length > 0) {
    return source.message;
  }

  const message = getProperty(source, 'message');
  return typeof message === 'string' && message.length > 0
    ? message
    : INTERNAL_ERROR_MESSAGE;
}

function getStack(source) {
  return source instanceof Error && typeof source.stack === 'string'
    ? source.stack
    : undefined;
}

function isMalformedJson(error, status) {
  return (
    getProperty(error, 'type') === 'entity.parse.failed' ||
    (error instanceof SyntaxError && status === 400)
  );
}

function isPayloadTooLarge(error, status) {
  return getProperty(error, 'type') === 'entity.too.large' || status === 413;
}

/**
 * Resolves the HTTP status for any thrown value.
 * @param {unknown} error
 * @returns {number}
 */
export function resolveErrorStatus(error) {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  const status = getStatus(error);

  if (isMalformedJson(error, status)) {
    return 400;
  }

  if (isPayloadTooLarge(error, status)) {
    return 413;
  }

  if (status !== undefined && status < 500) {
    return status;
  }

  return 500;
}

/**
 * Serializes any thrown value into the shared, production-safe error payload.
 * @param {unknown} error
 * @param {{ isProduction?: boolean }} [options]
 * @returns {{ code: string, message: string, details: unknown }}
 */
export function serializeError(error, { isProduction = false } = {}) {
  if (error instanceof AppError) {
    const includeDetails = !isProduction || error.statusCode < 500;
    return {
      code: error.code,
      message: error.message,
      details: includeDetails ? (error.details ?? null) : null,
    };
  }

  const status = getStatus(error);

  if (isMalformedJson(error, status)) {
    return {
      code: ERROR_CODES.BAD_REQUEST,
      message: 'Malformed JSON payload.',
      details: null,
    };
  }

  if (isPayloadTooLarge(error, status)) {
    return {
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      message: ERROR_MESSAGES[ERROR_CODES.PAYLOAD_TOO_LARGE],
      details: null,
    };
  }

  if (status !== undefined && status < 500) {
    return {
      code: ERROR_CODES.BAD_REQUEST,
      message: isProduction ? ERROR_MESSAGES[ERROR_CODES.BAD_REQUEST] : getErrorMessage(error),
      details: null,
    };
  }

  const stack = getStack(error);

  return {
    code: ERROR_CODES.INTERNAL_SERVER_ERROR,
    message: isProduction ? INTERNAL_ERROR_MESSAGE : getErrorMessage(error),
    details: !isProduction && stack !== undefined ? { stack } : null,
  };
}

/**
 * @param {unknown} error
 * @param {{ isProduction?: boolean }} [options]
 * @returns {{ statusCode: number, error: { code: string, message: string, details: unknown } }}
 */
export function normalizeError(error, options = {}) {
  return {
    statusCode: resolveErrorStatus(error),
    error: serializeError(error, options),
  };
}
