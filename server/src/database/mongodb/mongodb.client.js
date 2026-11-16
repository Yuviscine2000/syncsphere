import { DATABASE_STATUS } from '../../constants/database.constants.js';
import { ERROR_CODES } from '../../errors/error-codes.js';
import { createDatabaseError, sanitizeDatabaseError } from '../database-errors.js';
import {
  closeMongodbClient,
  createMongodbClientInstance,
  getMongodbDatabase,
} from './mongodb.connection.js';
import { checkMongodbHealth } from './mongodb.health.js';

/**
 * Creates the independently maintainable MongoDB client wrapper.
 * @param {{
 *   config: object|null,
 *   logger: import('pino').Logger,
 *   secrets?: string[],
 *   createClient?: (config: object) => import('mongodb').MongoClient,
 *   healthCheck?: (client: import('mongodb').MongoClient) => Promise<string>,
 * }} options
 * @returns {object}
 */
export function createMongodbClient({
  config,
  logger,
  secrets = [],
  createClient = createMongodbClientInstance,
  healthCheck = checkMongodbHealth,
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
      { dependency: 'mongodb', err: sanitizeDatabaseError(error, secrets) },
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
      logger.info(
        {
          dependency: 'mongodb',
          database: config.database,
          maxPoolSize: config.maxPoolSize,
        },
        'MongoDB initialization started',
      );

      let candidate = null;

      try {
        candidate = createClient(config);
        client = candidate;
        await candidate.connect();

        const connectionStatus = await healthCheck(candidate);

        if (connectionStatus !== DATABASE_STATUS.CONNECTED) {
          throw createDatabaseError(
            ERROR_CODES.DATABASE_CONNECTION_FAILED,
            'MongoDB connectivity check failed.',
          );
        }

        status = DATABASE_STATUS.CONNECTED;
        logger.info(
          { dependency: 'mongodb', database: config.database },
          'MongoDB connection established',
        );
        return status;
      } catch (error) {
        if (candidate !== null) {
          try {
            await closeMongodbClient(candidate);
          } catch (closeError) {
            logError('MongoDB cleanup after failed initialization failed', closeError, 'warn');
          }
        }

        client = null;
        status = DATABASE_STATUS.UNAVAILABLE;
        logError('MongoDB connection failed', error);
        throw createDatabaseError(
          ERROR_CODES.DATABASE_CONNECTION_FAILED,
          'MongoDB connection failed.',
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
      logError('MongoDB health check failed', error, 'warn');
      return status;
    }
  }

  function getDatabase() {
    if (client === null) {
      throw createDatabaseError(
        ERROR_CODES.DATABASE_UNAVAILABLE,
        'MongoDB is unavailable.',
      );
    }

    return getMongodbDatabase(client, config.database);
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
        await closeMongodbClient(activeClient);
        status = DATABASE_STATUS.CLOSED;
        logger.info({ dependency: 'mongodb' }, 'MongoDB client closed');
      } catch (error) {
        status = DATABASE_STATUS.UNAVAILABLE;
        logError('MongoDB shutdown failed', error);
        throw createDatabaseError(
          ERROR_CODES.DATABASE_OPERATION_FAILED,
          'MongoDB shutdown failed.',
          error,
        );
      }
    })();

    return closePromise;
  }

  return {
    name: 'mongodb',
    isConfigured,
    initialize,
    checkHealth,
    getDatabase,
    close,
    getStatus: () => status,
    getDriverClient: () => client,
  };
}
