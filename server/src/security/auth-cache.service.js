import { AUTH_CACHE_KEYS } from '../constants/auth.constants.js';

function buildRevokedKey(sessionId) {
  return `${AUTH_CACHE_KEYS.REVOKED_SESSION_PREFIX}${sessionId}`;
}

/**
 * Uses Redis as a fast revocation cache while MySQL remains the durable source
 * of truth. Cache failures degrade to database checks instead of failing auth.
 * @param {{
 *   databaseManager?: object|null,
 *   logger: import('pino').Logger,
 * }} options
 * @returns {object}
 */
export function createAuthCache({ databaseManager = null, logger }) {
  function getRedis() {
    const redisClient = databaseManager?.getClient?.('redis');

    if (redisClient === null || redisClient === undefined || redisClient.isConfigured !== true) {
      return null;
    }

    try {
      return redisClient.getClient();
    } catch {
      return null;
    }
  }

  async function markSessionRevoked(sessionId, ttlSeconds) {
    const client = getRedis();

    if (client === null) {
      return;
    }

    try {
      await client.set(buildRevokedKey(sessionId), '1', { EX: Math.max(1, ttlSeconds) });
    } catch {
      logger.warn(
        { dependency: 'redis', operation: 'auth-revocation-cache-write' },
        'Authentication revocation cache write failed; MySQL remains authoritative',
      );
    }
  }

  async function isSessionRevoked(sessionId) {
    const client = getRedis();

    if (client === null) {
      return false;
    }

    try {
      return (await client.exists(buildRevokedKey(sessionId))) === 1;
    } catch {
      logger.warn(
        { dependency: 'redis', operation: 'auth-revocation-cache-read' },
        'Authentication revocation cache read failed; falling back to MySQL session state',
      );
      return false;
    }
  }

  return {
    markSessionRevoked,
    isSessionRevoked,
  };
}
