import { AppError } from '../errors/app-error.js';

const REDACTED = '[redacted]';

/**
 * Removes known secrets from free-form diagnostic text.
 * @param {string} value
 * @param {string[]} secrets
 * @returns {string}
 */
export function redactSecrets(value, secrets = []) {
  let result = value;

  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length > 0) {
      result = result.split(secret).join(REDACTED);
    }
  }

  return result;
}

function extractUrlPassword(value) {
  try {
    const parsed = new URL(value);
    return parsed.password.length > 0 ? decodeURIComponent(parsed.password) : null;
  } catch {
    return null;
  }
}

/**
 * Collects secret values that must never appear in logs.
 * @param {object} databaseConfig
 * @returns {string[]}
 */
export function getDatabaseSecrets(databaseConfig) {
  const secrets = [];

  if (databaseConfig.mysql?.password) {
    secrets.push(databaseConfig.mysql.password);
  }

  if (databaseConfig.mongodb?.uri) {
    secrets.push(databaseConfig.mongodb.uri);
    const password = extractUrlPassword(databaseConfig.mongodb.uri);

    if (password !== null) {
      secrets.push(password);
    }
  }

  if (databaseConfig.redis?.url) {
    secrets.push(databaseConfig.redis.url);
    const password = extractUrlPassword(databaseConfig.redis.url);

    if (password !== null) {
      secrets.push(password);
    }
  }

  return [...new Set(secrets)];
}

/**
 * Builds a safe log payload from a driver error without exposing credentials.
 * @param {unknown} error
 * @param {string[]} secrets
 * @returns {{ name: string, code: string|null, message: string, stack?: string }}
 */
export function sanitizeDatabaseError(error, secrets = []) {
  const source = error instanceof Error ? error : new Error(String(error));
  const code = typeof source.code === 'string' ? source.code : null;
  const payload = {
    name: source.name,
    code,
    message: redactSecrets(source.message, secrets),
  };

  if (typeof source.stack === 'string') {
    payload.stack = redactSecrets(source.stack, secrets);
  }

  return payload;
}

/**
 * Wraps a driver failure in the shared application error architecture.
 * @param {string} code
 * @param {string} message
 * @param {unknown} [cause]
 * @returns {AppError}
 */
export function createDatabaseError(code, message, cause) {
  return new AppError(code, message, {
    cause,
    details: null,
  });
}

/**
 * Detects MySQL duplicate-key failures without exposing driver details.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isDuplicateKeyError(error) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if (Reflect.get(error, 'code') === 'ER_DUP_ENTRY') {
    return true;
  }

  const cause = Reflect.get(error, 'cause');
  return typeof cause === 'object' && cause !== null && Reflect.get(cause, 'code') === 'ER_DUP_ENTRY';
}
