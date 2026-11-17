import { createDatabaseManager } from '../../../src/database/database-manager.js';
import { runMigrations } from '../../../src/database/migrations/migration-runner.js';
import {
  createIntegrationConfig,
  createIntegrationLogger,
} from './integration-environment.js';

/**
 * Creates a real database manager for integration tests. No clients are
 * substituted; the manager connects to the services configured by the shell.
 * @param {{ configOverrides?: Record<string, string> }} [options]
 */
export function createIntegrationDatabase({ configOverrides = {} } = {}) {
  const config = createIntegrationConfig(configOverrides);
  const logger = createIntegrationLogger();
  const databaseManager = createDatabaseManager({
    databaseConfig: config.database,
    logger,
  });

  return { config, logger, databaseManager };
}

/**
 * Initializes every configured dependency and applies MySQL migrations when
 * requested. Failures are intentionally allowed to bubble up so integration
 * tests fail instead of silently skipping real database checks.
 * @param {{
 *   config: object,
 *   logger: object,
 *   databaseManager: object,
 * }} context
 * @param {{ migrate?: boolean }} [options]
 */
export async function initializeIntegrationDatabase(context, { migrate = false } = {}) {
  try {
    await context.databaseManager.initialize();
  } catch (error) {
    const summary = context.databaseManager.getSummary();
    throw new Error(
      `Integration database initialization failed. Check that MySQL, MongoDB, and Redis are running and that MYSQL_*, MONGODB_*, and REDIS_URL are set correctly. Status: ${JSON.stringify(summary)}`,
      { cause: error },
    );
  }

  if (!migrate) {
    return;
  }

  const mysqlClient = context.databaseManager.getClient('mysql');

  if (mysqlClient === null || mysqlClient.isConfigured !== true) {
    throw new Error('MySQL must be configured before integration migrations run.');
  }

  await runMigrations({
    mysqlClient,
    logger: context.logger,
  });
}

/**
 * @param {{ databaseManager: object }} context
 */
export async function closeIntegrationDatabase(context) {
  await context.databaseManager.shutdown();
}
