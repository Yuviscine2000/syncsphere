import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config/index.js';
import { createDatabaseManager } from './database/database-manager.js';
import {
  getDatabaseSecrets,
  sanitizeDatabaseError,
} from './database/database-errors.js';
import { createLogger } from './utils/logger.js';
import { createGracefulShutdown } from './utils/graceful-shutdown.js';

function writeStartupFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to start SyncSphere API: ${message}\n`);
}

/**
 * Starts the HTTP server, installs process-level failure handling, and wires
 * graceful shutdown.
 * @returns {Promise<import('node:http').Server | undefined>}
 */
export async function startServer() {
  let config;

  try {
    config = loadConfig();
  } catch (error) {
    writeStartupFailure(error);
    process.exitCode = 1;
    return undefined;
  }

  const logger = createLogger(config);
  const databaseManager = createDatabaseManager({
    databaseConfig: config.database,
    logger,
  });

  try {
    await databaseManager.initialize();
  } catch (error) {
    logger.fatal(
      { err: sanitizeDatabaseError(error, getDatabaseSecrets(config.database)) },
      'Database initialization failed',
    );
    writeStartupFailure(error);
    process.exitCode = 1;
    return undefined;
  }

  const app = createApp({ config, logger, databaseManager });

  const server = app.listen(config.port, () => {
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : config.port;
    logger.info(
      {
        port,
        environment: config.nodeEnv,
        apiPrefix: `${config.apiPrefix}/v1`,
        version: config.version,
        databaseStatus: databaseManager.getStatus(),
      },
      'SyncSphere API started',
    );
  });

  const graceful = createGracefulShutdown({
    server,
    logger,
    timeoutMs: config.shutdownTimeoutMs,
    shutdownResources: () => databaseManager.shutdown(),
    sanitizeError: (error) =>
      sanitizeDatabaseError(error, getDatabaseSecrets(config.database)),
  });

  server.on('error', (error) => {
    logger.fatal({ err: error }, 'HTTP server error');
    void graceful.shutdown('server-error');
  });

  process.once('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    void graceful.shutdown('uncaughtException');
  });

  process.once('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    void graceful.shutdown('unhandledRejection');
  });

  return server;
}

const entryPoint = process.argv[1] === undefined ? '' : pathToFileURL(resolve(process.argv[1])).href;

if (entryPoint === import.meta.url) {
  void startServer();
}
