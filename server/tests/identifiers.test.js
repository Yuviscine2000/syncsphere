import { describe, expect, it } from 'vitest';
import {
  isValidUuid,
  resolveCorrelationId,
  resolveRequestId,
} from '../src/utils/identifiers.js';
import { VALID_CORRELATION_ID, VALID_REQUEST_ID } from './helpers/test-app.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('request identifiers', () => {
  it('accepts valid UUID values', () => {
    expect(isValidUuid(VALID_REQUEST_ID)).toBe(true);
    expect(isValidUuid(`  ${VALID_REQUEST_ID}  `)).toBe(true);
  });

  it.each(['', 'not-a-uuid', '11111111-1111-1111-1111-111111111111', 42, null])(
    'rejects invalid UUID value %s',
    (value) => {
      expect(isValidUuid(value)).toBe(false);
    },
  );

  it('preserves a valid client request ID', () => {
    expect(resolveRequestId(VALID_REQUEST_ID)).toBe(VALID_REQUEST_ID);
  });

  it('generates a UUID when the request ID is missing or invalid', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID_PATTERN);
    expect(resolveRequestId('bad-id')).toMatch(UUID_PATTERN);
  });

  it('preserves a valid correlation ID', () => {
    expect(resolveCorrelationId(VALID_CORRELATION_ID, VALID_REQUEST_ID)).toBe(
      VALID_CORRELATION_ID,
    );
  });

  it('falls back to the request ID for a missing or invalid correlation ID', () => {
    expect(resolveCorrelationId(undefined, VALID_REQUEST_ID)).toBe(VALID_REQUEST_ID);
    expect(resolveCorrelationId('bad-id', VALID_REQUEST_ID)).toBe(VALID_REQUEST_ID);
  });
});
