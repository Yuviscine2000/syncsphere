import { RedisStore } from 'rate-limit-redis';
import { ConfigurationError } from '../config/configuration-error.js';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';

export const AUTH_RATE_LIMIT_KEY_PREFIX = 'syncsphere:auth-rate-limit:';

/**
 * Wraps the Redis store so every store failure is converted into a stable
 * service-unavailable error instead of falling through as an unknown 500.
 */
class AuthRateLimitStore {
  constructor({ store, logger, operation }) {
    this.store = store;
    this.logger = logger;
    this.operation = operation;
    this.localKeys = false;
    this.prefix = store.prefix;
  }

  logFailure(action, error) {
    this.logger?.error(
      {
        dependency: 'redis',
        operation: `auth-rate-limit-${action}`,
        rateLimitOperation: this.operation,
        err: error,
      },
      'Authentication rate-limit store operation failed',
    );
  }

  async init(options) {
    return this.store.init(options);
  }

  async increment(key) {
    try {
      return await this.store.increment(key);
    } catch (error) {
      this.logFailure('increment', error);
      throw new AppError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Authentication rate limiting is temporarily unavailable.',
        { cause: error },
      );
    }
  }

  async decrement(key) {
    try {
      return await this.store.decrement(key);
    } catch (error) {
      this.logFailure('decrement', error);
      throw new AppError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Authentication rate limiting is temporarily unavailable.',
        { cause: error },
      );
    }
  }

  async resetKey(key) {
    try {
      return await this.store.resetKey(key);
    } catch (error) {
      this.logFailure('reset', error);
      throw new AppError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Authentication rate limiting is temporarily unavailable.',
        { cause: error },
      );
    }
  }

  async get(key) {
    try {
      return await this.store.get(key);
    } catch (error) {
      this.logFailure('read', error);
      throw new AppError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Authentication rate limiting is temporarily unavailable.',
        { cause: error },
      );
    }
  }
}

/**
 * Builds an operation-scoped Redis rate-limit store using the managed Redis
 * client. Each operation gets its own store instance and key namespace, while
 * all instances share the same Redis connection and counters.
 * @param {{
 *   config: object,
 *   logger: import('pino').Logger,
 *   databaseManager?: object|null,
 *   operation: string,
 * }} options
 * @returns {AuthRateLimitStore|null}
 */
export function createAuthRateLimitStore({
  config,
  logger,
  databaseManager = null,
  operation,
}) {
  const redisDependency = databaseManager?.getClient?.('redis') ?? null;
  const redisConfigured = redisDependency?.isConfigured === true;

  if (!redisConfigured) {
    if (config?.isProduction === true) {
      throw new ConfigurationError(
        'Redis is required for authentication rate limiting in production.',
      );
    }

    logger?.warn(
      {
        dependency: 'redis',
        environment: config?.nodeEnv ?? 'unknown',
        operation,
      },
      'Redis is not configured; authentication rate limiting uses process-local in-memory counters',
    );
    return null;
  }

  const store = new RedisStore({
    prefix: `${AUTH_RATE_LIMIT_KEY_PREFIX}${operation}:`,
    sendCommand: async (...command) => {
      const client = redisDependency.getClient();
      return client.sendCommand(command);
    },
  });

  return new AuthRateLimitStore({ store, logger, operation });
}
