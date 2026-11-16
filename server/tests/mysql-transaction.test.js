import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/errors/app-error.js';
import { createMysqlClient } from '../src/database/mysql/mysql.client.js';
import { createRecordingLogger } from './helpers/test-app.js';

const MYSQL_CONFIG = Object.freeze({
  host: 'localhost',
  port: 3306,
  user: 'syncsphere',
  password: 'mysql-secret',
  database: 'syncsphere',
  connectionLimit: 10,
  connectTimeout: 1_000,
  ssl: false,
});

function createConnection(overrides = {}) {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn().mockResolvedValue([[{ id: 1 }], []]),
    ...overrides,
  };
}

async function createInitializedClient(connection) {
  const pool = {
    on: vi.fn(),
    query: vi.fn().mockResolvedValue([[{ healthy: 1 }]]),
    execute: vi.fn().mockResolvedValue([[{ id: 1 }], []]),
    getConnection: vi.fn().mockResolvedValue(connection),
    end: vi.fn().mockResolvedValue(undefined),
  };
  const { logger, entries } = createRecordingLogger();
  const client = createMysqlClient({
    config: MYSQL_CONFIG,
    logger,
    secrets: ['mysql-secret'],
    createPool: () => pool,
  });

  await client.initialize();

  return { client, pool, entries };
}

describe('MySQL transaction support', () => {
  it('commits successful work and always releases the connection', async () => {
    const connection = createConnection();
    const { client } = await createInitializedClient(connection);

    const result = await client.withTransaction(async (transaction) => {
      const queryResult = await transaction.query('SELECT ?', [7], {
        timeoutMs: 250,
      });
      expect(queryResult).toEqual({ rows: [{ id: 1 }], fields: [] });
      return 'result';
    });

    expect(result).toBe('result');
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.execute).toHaveBeenCalledWith(
      { sql: 'SELECT ?', timeout: 250 },
      [7],
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back unexpected failures and wraps driver details', async () => {
    const connection = createConnection();
    const { client, entries } = await createInitializedClient(connection);

    await expect(
      client.withTransaction(async () => {
        throw new Error('driver failure mysql-secret');
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_OPERATION_FAILED' });

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(entries)).not.toContain('mysql-secret');
  });

  it('preserves application errors after rollback', async () => {
    const connection = createConnection();
    const { client } = await createInitializedClient(connection);
    const applicationError = new AppError('INVALID_CREDENTIALS');

    await expect(
      client.withTransaction(async () => {
        throw applicationError;
      }),
    ).rejects.toBe(applicationError);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('reports connection acquisition failures safely', async () => {
    const connection = createConnection();
    const { client, pool, entries } = await createInitializedClient(connection);
    pool.getConnection.mockRejectedValueOnce(
      new Error('pool exhausted mysql-secret'),
    );

    await expect(client.withTransaction(async () => 'never')).rejects.toMatchObject({
      code: 'DATABASE_OPERATION_FAILED',
    });
    expect(connection.release).not.toHaveBeenCalled();
    expect(JSON.stringify(entries)).not.toContain('mysql-secret');
  });

  it('rejects missing transaction callbacks and unavailable pools', async () => {
    const connection = createConnection();
    const { client } = await createInitializedClient(connection);
    const unavailable = createMysqlClient({
      config: MYSQL_CONFIG,
      logger: createRecordingLogger().logger,
      createPool: () => ({ on: vi.fn() }),
    });

    await expect(client.withTransaction(null)).rejects.toThrow(TypeError);
    await expect(unavailable.withTransaction(async () => null)).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
    });
  });
});
