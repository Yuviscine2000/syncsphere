import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors/app-error.js';
import { ERROR_CODES, getHttpStatusForErrorCode } from '../src/errors/error-codes.js';
import { normalizeError, serializeError } from '../src/errors/error-response.js';

describe('error contract', () => {
  it('maps every stable error code to an HTTP status', () => {
    expect(getHttpStatusForErrorCode(ERROR_CODES.VALIDATION_ERROR)).toBe(400);
    expect(getHttpStatusForErrorCode(ERROR_CODES.BAD_REQUEST)).toBe(400);
    expect(getHttpStatusForErrorCode(ERROR_CODES.UNAUTHORIZED)).toBe(401);
    expect(getHttpStatusForErrorCode(ERROR_CODES.FORBIDDEN)).toBe(403);
    expect(getHttpStatusForErrorCode(ERROR_CODES.RESOURCE_NOT_FOUND)).toBe(404);
    expect(getHttpStatusForErrorCode(ERROR_CODES.RESOURCE_CONFLICT)).toBe(409);
    expect(getHttpStatusForErrorCode(ERROR_CODES.PAYLOAD_TOO_LARGE)).toBe(413);
    expect(getHttpStatusForErrorCode(ERROR_CODES.RATE_LIMIT_EXCEEDED)).toBe(429);
    expect(getHttpStatusForErrorCode(ERROR_CODES.INTERNAL_SERVER_ERROR)).toBe(500);
    expect(getHttpStatusForErrorCode(ERROR_CODES.SERVICE_UNAVAILABLE)).toBe(503);
  });

  it('preserves operational error details in development', () => {
    const error = AppError.validation([{ field: 'email', message: 'Required' }]);
    const normalized = normalizeError(error, { isProduction: false });

    expect(normalized.statusCode).toBe(400);
    expect(normalized.error).toEqual({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'The request contains invalid fields.',
      details: [{ field: 'email', message: 'Required' }],
    });
  });

  it('preserves validation details in production because they are safe', () => {
    const error = AppError.validation([{ field: 'email', message: 'Required' }]);
    const normalized = normalizeError(error, { isProduction: true });

    expect(normalized.error.details).toEqual([{ field: 'email', message: 'Required' }]);
  });

  it('sanitizes internal errors in production', () => {
    const error = new Error('database password was leaked');
    error.stack = 'stack with secret';
    const normalized = normalizeError(error, { isProduction: true });

    expect(normalized.statusCode).toBe(500);
    expect(normalized.error).toEqual({
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred.',
      details: null,
    });
  });

  it('exposes non-production internal error context', () => {
    const error = new Error('boom');
    error.stack = 'stack trace';
    const serialized = serializeError(error, { isProduction: false });

    expect(serialized.message).toBe('boom');
    expect(serialized.details).toEqual({ stack: 'stack trace' });
  });

  it('maps malformed JSON parser errors to BAD_REQUEST', () => {
    const error = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    const normalized = normalizeError(error, { isProduction: true });

    expect(normalized.statusCode).toBe(400);
    expect(normalized.error.code).toBe(ERROR_CODES.BAD_REQUEST);
    expect(normalized.error.message).toBe('Malformed JSON payload.');
  });

  it('maps oversized payload parser errors to PAYLOAD_TOO_LARGE', () => {
    const error = Object.assign(new Error('too large'), {
      status: 413,
      type: 'entity.too.large',
    });
    const normalized = normalizeError(error, { isProduction: true });

    expect(normalized.statusCode).toBe(413);
    expect(normalized.error.code).toBe(ERROR_CODES.PAYLOAD_TOO_LARGE);
  });
});
