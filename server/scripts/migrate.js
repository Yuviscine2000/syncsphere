import { loadConfig } from '../src/config/index.js';
import { createDatabaseManager } from '../src/database/database-manager.js';
import {
  getDatabaseSecrets,
  sanitizeDatabaseError,
} from '../src/database/database-errors.js';
import { runMigrations } from '../src/database/migrations/migration-runner.js';
import { createLogger } from '../src/utils/logger.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const databaseManager = createDatabaseManager({
    databaseConfig: config.database,
    logger,
  });
  const direction = process.argv[2] ?? 'up';

  try {
    await databaseManager.initialize();
    const mysqlClient = databaseManager.getClient('mysql');

    if (mysqlClient === null || mysqlClient.isConfigured !== true) {
      throw new Error('MySQL must be configured before running migrations.');
    }

    const result = await runMigrations({
      mysqlClient,
      logger,
      direction,
    });

    logger.info(result, 'Database migration command completed');
  } catch (error) {
    logger.fatal(
      { err: sanitizeDatabaseError(error, getDatabaseSecrets(config.database)) },
      'Database migration command failed',
    );
    process.exitCode = 1;
  } finally {
    try {
      await databaseManager.shutdown();
    } catch (error) {
      logger.warn(
        { err: sanitizeDatabaseError(error, getDatabaseSecrets(config.database)) },
        'Database shutdown after migration failed',
      );
    }
  }
}

void main();
