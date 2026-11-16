import { DATABASE_STATUS } from '../../constants/database.constants.js';
import { ERROR_CODES } from '../../errors/error-codes.js';
import { createDatabaseError, sanitizeDatabaseError } from '../database-errors.js';
import {
  checkRedisHealth,
  closeRedisClient,
  createRedisClientInstance,
  describeRedisTarget,
} from './redis.connection.js';

/**
 * Creates the independently maintainable Redis client wrapper.
 * @param {{
 *   config: object|null,
 *   logger: import('pino').Logger,
 *   secrets?: string[],
 *   createClient?: (config: object) => import('redis').RedisClientType,
 *   healthCheck?: (client: import('redis').RedisClientType) => Promise<string>,
 * }} options
 * @returns {object}
 */
export function createRedisClient({
  config,
  logger,
  secrets = [],
  createClient = createRedisClientInstance,
  healthCheck = checkRedisHealth,
}) {
  const isConfigured = config !== null && config !== undefined;
  let client = null;
  let status = isConfigured
    ? DATABASE_STATUS.NOT_INITIALIZED
    : DATABASE_STATUS.NOT_CONFIGURED;
  let initializationPromise = null;
  let closePromise = null;

  function logError(message, error, level = 'error') {
    logger[level](
      { dependency: 'redis', err: sanitizeDatabaseError(error, secrets) },
      message,
    );
  }

  async function initialize() {
    if (!isConfigured) {
      status = DATABASE_STATUS.NOT_CONFIGURED;
      return status;
    }

    if (client !== null) {
      return status;
    }

    if (initializationPromise !== null) {
      return initializationPromise;
    }

    initializationPromise = (async () => {
      status = DATABASE_STATUS.INITIALIZING;
      const target = describeRedisTarget(config.url);
      logger.info(
        {
          dependency: 'redis',
          host: target.host,
          port: target.port,
          database: target.database,
          tls: target.tls,
          maxRetries: config.maxRetries,
        },
        'Redis initialization started',
      );

      let candidate = null;

      try {
        candidate = createClient(config);
        client = candidate;

        candidate.on('error', (error) => {
          logError('Redis client error', error);
        });
        candidate.on('reconnecting', () => {
          logger.warn({ dependency: 'redis' }, 'Redis reconnection attempt');
        });

        await candidate.connect();

        const connectionStatus = await healthCheck(candidate);

        if (connectionStatus !== DATABASE_STATUS.CONNECTED) {
          throw createDatabaseError(
            ERROR_CODES.DATABASE_CONNECTION_FAILED,
            'Redis connectivity check failed.',
          );
        }

        status = DATABASE_STATUS.CONNECTED;
        logger.info(
          {
            dependency: 'redis',
            host: target.host,
            port: target.port,
            database: target.database,
          },
          'Redis connection established',
        );
        return status;
      } catch (error) {
        if (candidate !== null) {
          try {
            await closeRedisClient(candidate);
          } catch (closeError) {
            logError('Redis cleanup after failed initialization failed', closeError, 'warn');
          }
        }

        client = null;
        status = DATABASE_STATUS.UNAVAILABLE;
        logError('Redis connection failed', error);
        throw createDatabaseError(
          ERROR_CODES.DATABASE_CONNECTION_FAILED,
          'Redis connection failed.',
          error,
        );
      }
    })();

    try {
      return await initializationPromise;
    } finally {
      initializationPromise = null;
    }
  }

  async function checkHealth() {
    if (!isConfigured) {
      status = DATABASE_STATUS.NOT_CONFIGURED;
      return status;
    }

    if (client === null) {
      return status;
    }

    try {
      status = await healthCheck(client);
      return status;
    } catch (error) {
      status = DATABASE_STATUS.UNAVAILABLE;
      logError('Redis health check failed', error, 'warn');
      return status;
    }
  }

  function getClient() {
    if (client === null) {
      throw createDatabaseError(
        ERROR_CODES.DATABASE_UNAVAILABLE,
        'Redis is unavailable.',
      );
    }

    return client;
  }

  async function close() {
    if (closePromise !== null) {
      return closePromise;
    }

    if (client === null) {
      if (isConfigured) {
        status = DATABASE_STATUS.CLOSED;
      }

      return;
    }

    closePromise = (async () => {
      const activeClient = client;
      client = null;

      try {
        await closeRedisClient(activeClient);
        status = DATABASE_STATUS.CLOSED;
        logger.info({ dependency: 'redis' }, 'Redis client closed');
      } catch (error) {
        status = DATABASE_STATUS.UNAVAILABLE;
        logError('Redis shutdown failed', error);
        throw createDatabaseError(
          ERROR_CODES.DATABASE_OPERATION_FAILED,
          'Redis shutdown failed.',
          error,
        );
      }
    })();

    return closePromise;
  }

  return {
    name: 'redis',
    isConfigured,
    initialize,
    checkHealth,
    getClient,
    close,
    getStatus: () => status,
    getDriverClient: () => client,
  };
}
