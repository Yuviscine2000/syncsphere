import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeIntegrationDatabase,
  createIntegrationDatabase,
  initializeIntegrationDatabase,
} from './support/integration-database.js';

const FAILURE_TIMEOUT_ENV = {
  DATABASE_CONNECT_TIMEOUT: '1000',
  MYSQL_CONNECT_TIMEOUT: '1000',
  MONGODB_SERVER_SELECTION_TIMEOUT: '1000',
  REDIS_CONNECT_TIMEOUT: '1000',
  REDIS_MAX_RETRIES: '0',
};

describe('real database connections', () => {
  let context;

  beforeAll(async () => {
    context = createIntegrationDatabase();
    await initializeIntegrationDatabase(context);
  });

  afterAll(async () => {
    if (context !== undefined) {
      await closeIntegrationDatabase(context);
    }
  });

  it('reports all three configured dependencies as connected', () => {
    const summary = context.databaseManager.getSummary();

    expect(summary.status).toBe('connected');
    expect(summary.dependencies).toEqual({
      mysql: 'connected',
      mongodb: 'connected',
      redis: 'connected',
    });
  });

  it('executes a real MySQL query', async () => {
    const mysql = context.databaseManager.getClient('mysql');
    const result = await mysql.query('SELECT 1 AS healthy, VERSION() AS version');

    expect(result.rows[0].healthy).toBe(1);
    expect(typeof result.rows[0].version).toBe('string');
    expect(result.rows[0].version.length).toBeGreaterThan(0);
  });

  it('executes a real MongoDB ping and database selection', async () => {
    const mongodb = context.databaseManager.getClient('mongodb');
    const database = mongodb.getDatabase();
    const ping = await database.command({ ping: 1 });

    expect(ping.ok).toBe(1);
    expect(database.databaseName).toBe(context.config.database.mongodb.database);
  });

  it('executes a real Redis PING', async () => {
    const redis = context.databaseManager.getClient('redis');
    const client = redis.getClient();

    await expect(client.ping()).resolves.toBe('PONG');
  });

  it('reports readiness from live dependency checks', async () => {
    const readiness = await context.databaseManager.checkReadiness();

    expect(readiness.status).toBe('ready');
    expect(readiness.dependencies).toEqual({
      mysql: 'connected',
      mongodb: 'connected',
      redis: 'connected',
    });
  });
});

describe('real dependency connection failures', () => {
  async function expectFailure(overrides) {
    const context = createIntegrationDatabase({ configOverrides: overrides });

    try {
      await expect(context.databaseManager.initialize()).rejects.toMatchObject({
        code: 'DATABASE_INITIALIZATION_FAILED',
      });
    } finally {
      await context.databaseManager.shutdown().catch(() => {});
    }
  }

  it('fails required startup when MySQL is unreachable', async () => {
    await expectFailure({
      ...FAILURE_TIMEOUT_ENV,
      MYSQL_PORT: '1',
    });
  });

  it('fails required startup when MongoDB is unreachable', async () => {
    await expectFailure({
      ...FAILURE_TIMEOUT_ENV,
      MONGODB_URI: 'mongodb://127.0.0.1:1',
    });
  });

  it('fails required startup when Redis is unreachable', async () => {
    await expectFailure({
      ...FAILURE_TIMEOUT_ENV,
      REDIS_URL: 'redis://127.0.0.1:1',
    });
  });
});
