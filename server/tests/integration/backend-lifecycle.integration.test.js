import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { createGracefulShutdown } from '../../src/utils/graceful-shutdown.js';
import {
  closeIntegrationDatabase,
  createIntegrationDatabase,
  initializeIntegrationDatabase,
} from './support/integration-database.js';

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (server === undefined || !server.listening) {
      resolve();
      return;
    }

    server.close(() => resolve());
  });
}

describe('real backend lifecycle', () => {
  let context;
  let server;
  let serverClosed = false;

  beforeAll(async () => {
    context = createIntegrationDatabase();
    await initializeIntegrationDatabase(context);
    const app = createApp({
      config: context.config,
      logger: context.logger,
      databaseManager: context.databaseManager,
    });
    server = await listen(app);
  });

  afterAll(async () => {
    if (!serverClosed) {
      await closeServer(server);
    }

    if (context !== undefined) {
      await closeIntegrationDatabase(context);
    }
  });

  it('starts with all dependencies and reports health, liveness, and readiness', async () => {
    const client = supertest(server);

    const health = await client.get('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.body.success).toBe(true);
    expect(health.body.status).toBe('healthy');

    const liveness = await client.get('/api/v1/health/live');
    expect(liveness.status).toBe(200);
    expect(liveness.body.data.status).toBe('alive');

    const readiness = await client.get('/api/v1/health/ready');
    expect(readiness.status).toBe(200);
    expect(readiness.body.data.status).toBe('ready');
    expect(readiness.body.data.dependencies).toEqual({
      mysql: 'connected',
      mongodb: 'connected',
      redis: 'connected',
    });
  });

  it('shuts down HTTP and database resources gracefully', async () => {
    const graceful = createGracefulShutdown({
      server,
      logger: context.logger,
      timeoutMs: 5_000,
      exit: () => {},
      shutdownResources: () => context.databaseManager.shutdown(),
    });

    try {
      const exitCode = await graceful.shutdown('integration-test');
      expect(exitCode).toBe(0);
      expect(server.listening).toBe(false);
      expect(context.databaseManager.getStatus()).toBe('closed');
      serverClosed = true;
    } finally {
      graceful.removeSignalHandlers();
    }
  });
});

describe('real backend dependency failure and recovery', () => {
  it('reports not ready when a required dependency is unavailable, then recovers', async () => {
    const failedContext = createIntegrationDatabase({
      configOverrides: {
        DATABASE_CONNECT_TIMEOUT: '1000',
        MYSQL_CONNECT_TIMEOUT: '1000',
        MYSQL_PORT: '1',
      },
    });

    let failedServer;

    try {
      await expect(failedContext.databaseManager.initialize()).rejects.toMatchObject({
        code: 'DATABASE_INITIALIZATION_FAILED',
      });

      const failedApp = createApp({
        config: failedContext.config,
        logger: failedContext.logger,
        databaseManager: failedContext.databaseManager,
      });
      failedServer = await listen(failedApp);
      const failedClient = supertest(failedServer);

      const liveness = await failedClient.get('/api/v1/health/live');
      expect(liveness.status).toBe(200);

      const readiness = await failedClient.get('/api/v1/health/ready');
      expect(readiness.status).toBe(503);
      expect(readiness.body.error.code).toBe('DATABASE_UNAVAILABLE');
    } finally {
      await closeServer(failedServer);
      await failedContext.databaseManager.shutdown().catch(() => {});
    }

    const recoveredContext = createIntegrationDatabase();

    try {
      await initializeIntegrationDatabase(recoveredContext);
      const readiness = await recoveredContext.databaseManager.checkReadiness();
      expect(readiness.status).toBe('ready');
    } finally {
      await closeIntegrationDatabase(recoveredContext);
    }
  });
});
