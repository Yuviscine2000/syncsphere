import { randomUUID } from 'node:crypto';
import { UUID_PATTERN } from '../constants/http.constants.js';

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return undefined;
  }

  return typeof value === 'string' ? value.trim() : undefined;
}

/**
 * Validates an externally supplied identifier before accepting it.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidUuid(value) {
  const normalized = normalizeHeaderValue(value);
  return normalized !== undefined && UUID_PATTERN.test(normalized);
}

/**
 * Uses a valid client-supplied request ID or generates a new UUID.
 * @param {unknown} candidate
 * @returns {string}
 */
export function resolveRequestId(candidate) {
  const normalized = normalizeHeaderValue(candidate);
  return normalized !== undefined && UUID_PATTERN.test(normalized) ? normalized : randomUUID();
}

/**
 * Uses a valid client-supplied correlation ID or falls back to the request ID.
 * @param {unknown} candidate
 * @param {string} requestId
 * @returns {string}
 */
export function resolveCorrelationId(candidate, requestId) {
  const normalized = normalizeHeaderValue(candidate);
  return normalized !== undefined && UUID_PATTERN.test(normalized) ? normalized : requestId;
}
