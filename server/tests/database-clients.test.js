import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { DATABASE_STATUS } from '../src/constants/database.constants.js';
import { createMongodbClient } from '../src/database/mongodb/mongodb.client.js';
import { createMysqlClient } from '../src/database/mysql/mysql.client.js';
import { executeMysqlQuery } from '../src/database/mysql/mysql.connection.js';
import { createRedisClient } from '../src/database/redis/redis.client.js';
import {
  createRedisReconnectStrategy,
  describeRedisTarget,
} from '../src/database/redis/redis.connection.js';
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

const MONGODB_CONFIG = Object.freeze({
  uri: 'mongodb://localhost:27017',
  database: 'syncsphere',
  maxPoolSize: 10,
  serverSelectionTimeout: 1_000,
});

const REDIS_CONFIG = Object.freeze({
  url: 'redis://localhost:6379',
  connectTimeout: 1_000,
  maxRetries: 2,
});

function createMysqlPool(overrides = {}) {
  return {
    on: vi.fn(),
    query: vi.fn().mockResolvedValue([[{ healthy: 1 }]]),
    execute: vi.fn().mockResolvedValue([[{ id: 1 }], []]),
    end: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMongodbDriver(overrides = {}) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    db: vi.fn().mockReturnValue({
      command: vi.fn().mockResolvedValue({ ok: 1 }),
    }),
    ...overrides,
  };
}

function createRedisDriver(overrides = {}) {
  const driver = new EventEmitter();
  driver.connect = vi.fn().mockResolvedValue(undefined);
  driver.ping = vi.fn().mockResolvedValue('PONG');
  driver.quit = vi.fn().mockResolvedValue(undefined);
  driver.destroy = vi.fn();
  driver.isOpen = true;

  return Object.assign(driver, overrides);
}

describe('managed database clients', () => {
  it('initializes, queries, and closes MySQL through the pool', async () => {
    const pool = createMysqlPool();
    const { logger } = createRecordingLogger();
    const client = createMysqlClient({
      config: MYSQL_CONFIG,
      logger,
      createPool: () => pool,
    });

    await expect(client.initialize()).resolves.toBe(DATABASE_STATUS.CONNECTED);
    await expect(
      client.query('SELECT * FROM users WHERE id = ?', [7], { timeoutMs: 500 }),
    ).resolves.toEqual({ rows: [{ id: 1 }], fields: [] });
    expect(pool.execute).toHaveBeenCalledWith({ sql: 'SELECT * FROM users WHERE id = ?', timeout: 500 }, [7]);

    await client.close();
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(client.getStatus()).toBe(DATABASE_STATUS.CLOSED);
  });

  it('redacts MySQL secrets when initialization fails', async () => {
    const pool = createMysqlPool({
      query: vi.fn().mockRejectedValue(new Error('failed with mysql-secret')),
    });
    const { logger, entries } = createRecordingLogger();
    const client = createMysqlClient({
      config: MYSQL_CONFIG,
      logger,
      secrets: ['mysql-secret'],
      createPool: () => pool,
    });

    await expect(client.initialize()).rejects.toMatchObject({
      code: 'DATABASE_CONNECTION_FAILED',
    });
    expect(JSON.stringify(entries)).not.toContain('mysql-secret');
    expect(client.getStatus()).toBe(DATABASE_STATUS.UNAVAILABLE);
    expect(pool.end).toHaveBeenCalled();
  });

  it('validates MySQL query inputs before execution', async () => {
    const pool = createMysqlPool();

    await expect(executeMysqlQuery(pool, '', [])).rejects.toMatchObject({
      code: 'DATABASE_OPERATION_FAILED',
    });
    await expect(executeMysqlQuery(pool, 'SELECT 1', null)).rejects.toMatchObject({
      code: 'DATABASE_OPERATION_FAILED',
    });
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it('initializes, exposes, and closes MongoDB', async () => {
    const driver = createMongodbDriver();
    const { logger } = createRecordingLogger();
    const client = createMongodbClient({
      config: MONGODB_CONFIG,
      logger,
      createClient: () => driver,
    });

    await expect(client.initialize()).resolves.toBe(DATABASE_STATUS.CONNECTED);
    const database = client.getDatabase();
    expect(driver.db).toHaveBeenCalledWith('syncsphere');
    expect(database.command).toEqual(expect.any(Function));

    await client.close();
    expect(driver.close).toHaveBeenCalledTimes(1);
    expect(client.getStatus()).toBe(DATABASE_STATUS.CLOSED);
  });

  it('reports MongoDB initialization failures safely', async () => {
    const driver = createMongodbDriver({
      connect: vi.fn().mockRejectedValue(new Error('cannot reach mongodb://secret-host')),
    });
    const { logger, entries } = createRecordingLogger();
    const client = createMongodbClient({
      config: MONGODB_CONFIG,
      logger,
      secrets: [MONGODB_CONFIG.uri],
      createClient: () => driver,
    });

    await expect(client.initialize()).rejects.toMatchObject({
      code: 'DATABASE_CONNECTION_FAILED',
    });
    expect(JSON.stringify(entries)).not.toContain(MONGODB_CONFIG.uri);
    expect(client.getStatus()).toBe(DATABASE_STATUS.UNAVAILABLE);
    expect(driver.close).toHaveBeenCalled();
  });

  it('initializes, pings, and closes Redis', async () => {
    const driver = createRedisDriver();
    const { logger } = createRecordingLogger();
    const client = createRedisClient({
      config: REDIS_CONFIG,
      logger,
      createClient: () => driver,
    });

    await expect(client.initialize()).resolves.toBe(DATABASE_STATUS.CONNECTED);
    expect(driver.ping).toHaveBeenCalledTimes(1);

    await client.close();
    expect(driver.quit).toHaveBeenCalledTimes(1);
    expect(client.getStatus()).toBe(DATABASE_STATUS.CLOSED);
  });

  it('rejects a Redis connection without a PONG response', async () => {
    const driver = createRedisDriver({
      ping: vi.fn().mockResolvedValue('NOT_PONG'),
    });
    const { logger } = createRecordingLogger();
    const client = createRedisClient({
      config: REDIS_CONFIG,
      logger,
      createClient: () => driver,
    });

    await expect(client.initialize()).rejects.toMatchObject({
      code: 'DATABASE_CONNECTION_FAILED',
    });
    expect(client.getStatus()).toBe(DATABASE_STATUS.UNAVAILABLE);
    expect(driver.quit).toHaveBeenCalled();
  });

  it('uses bounded Redis reconnect backoff', () => {
    const strategy = createRedisReconnectStrategy(2);

    expect(strategy(1)).toBe(100);
    expect(strategy(2)).toBe(200);
    expect(strategy(3)).toBeInstanceOf(Error);
  });

  it('describes Redis targets without credentials', () => {
    expect(describeRedisTarget('rediss://user:secret@redis.example.com:6380/2')).toEqual({
      host: 'redis.example.com',
      port: 6380,
      database: '2',
      tls: true,
    });
    expect(describeRedisTarget('not a url')).toEqual({
      host: 'unknown',
      port: 6379,
      database: '0',
      tls: false,
    });
  });
});
