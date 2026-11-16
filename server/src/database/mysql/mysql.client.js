import { DATABASE_STATUS } from '../../constants/database.constants.js';
import { AppError } from '../../errors/app-error.js';
import { ERROR_CODES } from '../../errors/error-codes.js';
import { createDatabaseError, sanitizeDatabaseError } from '../database-errors.js';
import {
  closeMysqlPool,
  createMysqlPool,
  executeMysqlQuery,
} from './mysql.connection.js';
import { checkMysqlHealth } from './mysql.health.js';

/**
 * Creates the independently maintainable MySQL client wrapper.
 * @param {{
 *   config: object|null,
 *   logger: import('pino').Logger,
 *   secrets?: string[],
 *   createPool?: (config: object) => import('mysql2/promise').Pool,
 *   healthCheck?: (pool: import('mysql2/promise').Pool) => Promise<string>,
 * }} options
 * @returns {object}
 */
export function createMysqlClient({
  config,
  logger,
  secrets = [],
  createPool = createMysqlPool,
  healthCheck = checkMysqlHealth,
}) {
  const isConfigured = config !== null && config !== undefined;
  let pool = null;
  let status = isConfigured
    ? DATABASE_STATUS.NOT_INITIALIZED
    : DATABASE_STATUS.NOT_CONFIGURED;
  let initializationPromise = null;
  let closePromise = null;

  function logError(message, error, level = 'error') {
    logger[level](
      { dependency: 'mysql', err: sanitizeDatabaseError(error, secrets) },
      message,
    );
  }

  async function initialize() {
    if (!isConfigured) {
      status = DATABASE_STATUS.NOT_CONFIGURED;
      return status;
    }

    if (pool !== null) {
      return status;
    }

    if (initializationPromise !== null) {
      return initializationPromise;
    }

    initializationPromise = (async () => {
      status = DATABASE_STATUS.INITIALIZING;
      logger.info(
        {
          dependency: 'mysql',
          host: config.host,
          port: config.port,
          database: config.database,
          connectionLimit: config.connectionLimit,
        },
        'MySQL initialization started',
      );

      let candidate = null;

      try {
        candidate = createPool(config);
        candidate.on?.('error', (error) => {
          logError('MySQL pool error', error);
        });
        pool = candidate;

        const connectionStatus = await healthCheck(candidate);

        if (connectionStatus !== DATABASE_STATUS.CONNECTED) {
          throw createDatabaseError(
            ERROR_CODES.DATABASE_CONNECTION_FAILED,
            'MySQL connectivity check failed.',
          );
        }

        status = DATABASE_STATUS.CONNECTED;
        logger.info(
          { dependency: 'mysql', host: config.host, database: config.database },
          'MySQL connection established',
        );
        return status;
      } catch (error) {
        if (candidate !== null) {
          try {
            await closeMysqlPool(candidate);
          } catch (closeError) {
            logError('MySQL cleanup after failed initialization failed', closeError, 'warn');
          }
        }

        pool = null;
        status = DATABASE_STATUS.UNAVAILABLE;
        logError('MySQL connection failed', error);
        throw createDatabaseError(
          ERROR_CODES.DATABASE_CONNECTION_FAILED,
          'MySQL connection failed.',
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

    if (pool === null) {
      return status;
    }

    try {
      status = await healthCheck(pool);
      return status;
    } catch (error) {
      status = DATABASE_STATUS.UNAVAILABLE;
      logError('MySQL health check failed', error, 'warn');
      return status;
    }
  }

  async function query(sql, parameters = [], options = {}) {
    if (pool === null) {
      throw createDatabaseError(
        ERROR_CODES.DATABASE_UNAVAILABLE,
        'MySQL is unavailable.',
      );
    }

    try {
      return await executeMysqlQuery(pool, sql, parameters, {
        timeoutMs: options.timeoutMs ?? config.connectTimeout,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw createDatabaseError(
        ERROR_CODES.DATABASE_OPERATION_FAILED,
        'MySQL query execution failed.',
        error,
      );
    }
  }

  async function withTransaction(work) {
    if (pool === null) {
      throw createDatabaseError(
        ERROR_CODES.DATABASE_UNAVAILABLE,
        'MySQL is unavailable.',
      );
    }

    if (typeof work !== 'function') {
      throw new TypeError('withTransaction requires a callback');
    }

    let connection;

    try {
      connection = await pool.getConnection();
    } catch (error) {
      throw createDatabaseError(
        ERROR_CODES.DATABASE_OPERATION_FAILED,
        'MySQL transaction connection could not be acquired.',
        error,
      );
    }

    try {
      await connection.beginTransaction();

      const transaction = {
        query: async (sql, parameters = [], options = {}) =>
          executeMysqlQuery(connection, sql, parameters, {
            timeoutMs: options.timeoutMs ?? config.connectTimeout,
          }),
      };

      const result = await work(transaction);
      await connection.commit();
      return result;
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        logError('MySQL transaction rollback failed', rollbackError, 'warn');
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw createDatabaseError(
        ERROR_CODES.DATABASE_OPERATION_FAILED,
        'MySQL transaction failed.',
        error,
      );
    } finally {
      connection.release();
    }
  }

  async function close() {
    if (closePromise !== null) {
      return closePromise;
    }

    if (pool === null) {
      if (isConfigured) {
        status = DATABASE_STATUS.CLOSED;
      }

      return;
    }

    closePromise = (async () => {
      const activePool = pool;
      pool = null;

      try {
        await closeMysqlPool(activePool);
        status = DATABASE_STATUS.CLOSED;
        logger.info({ dependency: 'mysql' }, 'MySQL pool closed');
      } catch (error) {
        status = DATABASE_STATUS.UNAVAILABLE;
        logError('MySQL shutdown failed', error);
        throw createDatabaseError(
          ERROR_CODES.DATABASE_OPERATION_FAILED,
          'MySQL shutdown failed.',
          error,
        );
      }
    })();

    return closePromise;
  }

  return {
    name: 'mysql',
    isConfigured,
    initialize,
    checkHealth,
    query,
    withTransaction,
    close,
    getStatus: () => status,
    getDriverClient: () => pool,
  };
}
