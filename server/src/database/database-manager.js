import {
  DATABASE_DEPENDENCY_NAMES,
  DATABASE_STATUS,
} from '../constants/database.constants.js';
import { ERROR_CODES } from '../errors/error-codes.js';
import { createDatabaseError, getDatabaseSecrets, sanitizeDatabaseError } from './database-errors.js';
import { checkDatabaseReadiness } from './database-health.js';
import { createMongodbClient } from './mongodb/mongodb.client.js';
import { createMysqlClient } from './mysql/mysql.client.js';
import { createRedisClient } from './redis/redis.client.js';

const SHUTDOWN_ORDER = Object.freeze([...DATABASE_DEPENDENCY_NAMES].reverse());

/**
 * Creates the default independently managed dependency clients.
 * @param {{
 *   databaseConfig: object,
 *   logger: import('pino').Logger,
 *   secrets: string[],
 * }} options
 * @returns {Record<string, object>}
 */
export function createDatabaseClients({ databaseConfig, logger, secrets }) {
  return {
    mysql: createMysqlClient({
      config: databaseConfig.mysql,
      logger,
      secrets,
    }),
    mongodb: createMongodbClient({
      config: databaseConfig.mongodb,
      logger,
      secrets,
    }),
    redis: createRedisClient({
      config: databaseConfig.redis,
      logger,
      secrets,
    }),
  };
}

/**
 * Coordinates database startup, readiness, access, and shutdown.
 * @param {{
 *   databaseConfig: object,
 *   logger: import('pino').Logger,
 *   clients?: Record<string, object>,
 * }} options
 * @returns {object}
 */
export function createDatabaseManager({ databaseConfig, logger, clients = null }) {
  if (databaseConfig === undefined || logger === undefined) {
    throw new TypeError('createDatabaseManager requires databaseConfig and logger');
  }

  const secrets = getDatabaseSecrets(databaseConfig);
  const dependencyClients =
    clients ?? createDatabaseClients({ databaseConfig, logger, secrets });
  let initialized = false;
  let closed = false;
  let status = DATABASE_STATUS.NOT_INITIALIZED;
  let initializationPromise = null;
  let shutdownPromise = null;

  function logFailure(message, error, level = 'error') {
    logger[level](
      { err: sanitizeDatabaseError(error, secrets) },
      message,
    );
  }

  function getDependencyStatuses() {
    return Object.fromEntries(
      DATABASE_DEPENDENCY_NAMES.map((name) => [
        name,
        dependencyClients[name]?.getStatus?.() ?? DATABASE_STATUS.NOT_CONFIGURED,
      ]),
    );
  }

  function getConnectedAggregateStatus() {
    const configuredNames = DATABASE_DEPENDENCY_NAMES.filter(
      (name) => dependencyClients[name]?.isConfigured === true,
    );

    if (configuredNames.length === 0) {
      return DATABASE_STATUS.NOT_CONFIGURED;
    }

    return configuredNames.every(
      (name) => dependencyClients[name].getStatus() === DATABASE_STATUS.CONNECTED,
    )
      ? DATABASE_STATUS.CONNECTED
      : DATABASE_STATUS.UNAVAILABLE;
  }

  function getAggregateStatus() {
    if (closed) {
      return DATABASE_STATUS.CLOSED;
    }

    if (initializationPromise !== null) {
      return DATABASE_STATUS.INITIALIZING;
    }

    if (!initialized) {
      return status;
    }

    return getConnectedAggregateStatus();
  }

  async function closeDependencies() {
    const failures = [];

    for (const name of SHUTDOWN_ORDER) {
      const client = dependencyClients[name];

      if (client === null || client === undefined) {
        continue;
      }

      try {
        await client.close();
      } catch (error) {
        failures.push({ name, error });
        logFailure(`${name} shutdown failed`, error);
      }
    }

    return failures;
  }

  async function initialize() {
    if (initialized) {
      return getSummary();
    }

    if (initializationPromise !== null) {
      return initializationPromise;
    }

    if (closed) {
      throw createDatabaseError(
        ERROR_CODES.DATABASE_INITIALIZATION_FAILED,
        'Database manager is closed.',
      );
    }

    initializationPromise = (async () => {
      status = DATABASE_STATUS.INITIALIZING;
      logger.info(
        {
          startupPolicy: databaseConfig.startupPolicy,
          requiredDependencies: databaseConfig.requiredDependencies,
          optionalDependencies: databaseConfig.optionalDependencies,
        },
        'Database initialization started',
      );

      const failures = [];

      for (const name of DATABASE_DEPENDENCY_NAMES) {
        const client = dependencyClients[name];

        if (client === null || client === undefined || client.isConfigured !== true) {
          logger.info({ dependency: name }, 'Database dependency is not configured');
          continue;
        }

        try {
          await client.initialize();
          logger.info(
            { dependency: name, status: client.getStatus() },
            'Database dependency initialized',
          );
        } catch (error) {
          failures.push({ name, error });
          logFailure(`${name} initialization failed`, error);
        }
      }

      if (failures.length > 0 && databaseConfig.startupPolicy === 'required') {
        await closeDependencies();
        closed = true;
        status = DATABASE_STATUS.UNAVAILABLE;
        logger.error(
          {
            startupPolicy: databaseConfig.startupPolicy,
            failedDependencies: failures.map((failure) => failure.name),
          },
          'Required database initialization failed',
        );
        throw createDatabaseError(
          ERROR_CODES.DATABASE_INITIALIZATION_FAILED,
          'One or more required database dependencies failed to initialize.',
          failures[0].error,
        );
      }

      initialized = true;
      status = getConnectedAggregateStatus();
      logger.info(
        {
          status,
          dependencies: getDependencyStatuses(),
          failedDependencies: failures.map((failure) => failure.name),
        },
        'Database initialization completed',
      );
    })();

    try {
      await initializationPromise;
    } finally {
      initializationPromise = null;
    }

    return getSummary();
  }

  async function checkReadiness() {
    return checkDatabaseReadiness({
      clients: dependencyClients,
      names: DATABASE_DEPENDENCY_NAMES,
      requiredDependencies: databaseConfig.requiredDependencies,
      optionalDependencies: databaseConfig.optionalDependencies,
      timeoutMs: databaseConfig.connectTimeoutMs,
    });
  }

  function getClient(name) {
    return dependencyClients[name] ?? null;
  }

  function getSummary() {
    return {
      status: getAggregateStatus(),
      startupPolicy: databaseConfig.startupPolicy,
      dependencies: getDependencyStatuses(),
    };
  }

  async function shutdown() {
    if (shutdownPromise !== null) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      logger.info({ order: SHUTDOWN_ORDER }, 'Database shutdown started');
      const failures = await closeDependencies();
      initialized = false;
      closed = true;
      status = DATABASE_STATUS.CLOSED;
      logger.info(
        {
          status,
          failedDependencies: failures.map((failure) => failure.name),
        },
        'Database shutdown completed',
      );

      if (failures.length > 0) {
        throw createDatabaseError(
          ERROR_CODES.DATABASE_OPERATION_FAILED,
          'One or more database dependencies failed to shut down.',
          failures[0].error,
        );
      }
    })();

    return shutdownPromise;
  }

  return {
    initialize,
    checkReadiness,
    shutdown,
    getClient,
    getClients: () => dependencyClients,
    getStatus: getAggregateStatus,
    getSummary,
  };
}
