import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthCache } from '../../src/security/auth-cache.service.js';
import {
  AUTH_RATE_LIMIT_KEY_PREFIX,
  createAuthRateLimitStore,
} from '../../src/security/auth-rate-limit.store.js';
import {
  closeIntegrationDatabase,
  createIntegrationDatabase,
  initializeIntegrationDatabase,
} from './support/integration-database.js';
import { createRedisProxy } from './support/redis-proxy.js';
import { uniqueKey } from './support/unique-values.js';
import { waitFor } from './support/wait-for.js';

const REDIS_ONLY_OVERRIDES = {
  DATABASE_STARTUP_POLICY: 'optional',
  MYSQL_HOST: '',
  MYSQL_PORT: '',
  MYSQL_USER: '',
  MYSQL_PASSWORD: '',
  MYSQL_DATABASE: '',
  MYSQL_CONNECTION_LIMIT: '',
  MYSQL_CONNECT_TIMEOUT: '',
  MYSQL_SSL: '',
  MONGODB_URI: '',
  MONGODB_DATABASE: '',
  MONGODB_MAX_POOL_SIZE: '',
  MONGODB_SERVER_SELECTION_TIMEOUT: '',
  REDIS_CONNECT_TIMEOUT: '2000',
  REDIS_MAX_RETRIES: '10',
};

describe('real Redis integration', () => {
  let context;
  let redis;
  let client;
  const keys = new Set();

  beforeAll(async () => {
    context = createIntegrationDatabase();
    await initializeIntegrationDatabase(context);
    redis = context.databaseManager.getClient('redis');
    client = redis.getClient();
  });

  afterAll(async () => {
    if (client !== undefined) {
      for (const key of keys) {
        await client.del(key).catch(() => {});
      }
    }

    if (context !== undefined) {
      await closeIntegrationDatabase(context);
    }
  });

  it('performs PING, SET, GET, DELETE, and TTL operations', async () => {
    const key = uniqueKey('redis-basic');
    keys.add(key);

    await expect(client.ping()).resolves.toBe('PONG');
    await client.set(key, 'value', { EX: 60 });
    await expect(client.get(key)).resolves.toBe('value');

    const ttl = await client.ttl(key);
    expect(ttl).toBeGreaterThan(0);

    await client.del(key);
    keys.delete(key);
    await expect(client.exists(key)).resolves.toBe(0);
  });

  it('expires keys after the requested TTL', async () => {
    const key = uniqueKey('redis-expiry');
    keys.add(key);

    await client.set(key, 'short-lived', { PX: 100 });
    await new Promise((resolve) => setTimeout(resolve, 250));

    await expect(client.exists(key)).resolves.toBe(0);
    keys.delete(key);
  });

  it('stores and reads auth revocation cache entries', async () => {
    const sessionId = uniqueKey('redis-session');
    const cacheKey = `auth:revoked-session:${sessionId}`;
    keys.add(cacheKey);
    const cache = createAuthCache({ databaseManager: context.databaseManager, logger: context.logger });

    await expect(cache.isSessionRevoked(sessionId)).resolves.toBe(false);
    await cache.markSessionRevoked(sessionId, 60);
    await expect(cache.isSessionRevoked(sessionId)).resolves.toBe(true);
    await expect(client.exists(cacheKey)).resolves.toBe(1);

    await client.del(cacheKey);
    keys.delete(cacheKey);
  });

  it('increments, reads, decrements, and resets the Redis rate-limit store', async () => {
    const store = createAuthRateLimitStore({
      config: context.config,
      logger: context.logger,
      databaseManager: context.databaseManager,
      operation: 'integration-test',
    });
    const key = uniqueKey('rate-limit');
    const redisKey = `${AUTH_RATE_LIMIT_KEY_PREFIX}integration-test:${key}`;
    keys.add(redisKey);

    expect(store).not.toBeNull();
    await store.init({ windowMs: 60_000 });
    const first = await store.increment(key);
    const second = await store.increment(key);
    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);

    const read = await store.get(key);
    expect(read.totalHits).toBe(2);

    await store.decrement(key);
    const decremented = await store.get(key);
    expect(decremented.totalHits).toBe(1);

    await store.resetKey(key);
    await expect(client.exists(redisKey)).resolves.toBe(0);
    keys.delete(redisKey);
  });

  it('reconnects after a real network interruption', async () => {
    const target = new URL(context.config.database.redis.url);
    const targetPort = Number(target.port.length > 0 ? target.port : 6379);
    const proxy = await createRedisProxy({ targetPort });
    const proxyContext = createIntegrationDatabase({
      configOverrides: {
        ...REDIS_ONLY_OVERRIDES,
        REDIS_URL: proxy.url,
      },
    });

    try {
      await proxyContext.databaseManager.initialize();
      const proxiedRedis = proxyContext.databaseManager.getClient('redis');
      await expect(proxiedRedis.getClient().ping()).resolves.toBe('PONG');

      await proxy.close();
      await waitFor(() => proxiedRedis.getDriverClient()?.isReady === false, {
        description: 'Redis connection loss',
      });

      const restartedProxy = await createRedisProxy({
        targetPort,
        port: proxy.port,
      });

      try {
        await waitFor(() => proxiedRedis.getDriverClient()?.isReady === true, {
          timeoutMs: 20_000,
          description: 'Redis reconnect',
        });
        await expect(proxiedRedis.getClient().ping()).resolves.toBe('PONG');
      } finally {
        await restartedProxy.close();
      }
    } finally {
      await closeIntegrationDatabase(proxyContext);
    }
  });

  it('fails closed for rate limiting and falls back for revocation when Redis is unavailable', async () => {
    const unavailableContext = createIntegrationDatabase({
      configOverrides: {
        ...REDIS_ONLY_OVERRIDES,
        DATABASE_STARTUP_POLICY: 'optional',
        REDIS_URL: 'redis://127.0.0.1:1',
        REDIS_CONNECT_TIMEOUT: '1000',
        REDIS_MAX_RETRIES: '0',
      },
    });

    try {
      await unavailableContext.databaseManager.initialize();
      const summary = unavailableContext.databaseManager.getSummary();
      expect(summary.dependencies.redis).toBe('unavailable');

      const cache = createAuthCache({
        databaseManager: unavailableContext.databaseManager,
        logger: unavailableContext.logger,
      });
      await expect(cache.isSessionRevoked('unavailable-session')).resolves.toBe(false);
      await expect(cache.markSessionRevoked('unavailable-session', 60)).resolves.toBeUndefined();

      const store = createAuthRateLimitStore({
        config: unavailableContext.config,
        logger: unavailableContext.logger,
        databaseManager: unavailableContext.databaseManager,
        operation: 'integration-unavailable',
      });
      expect(store).not.toBeNull();
      await expect(store.increment('unavailable-key')).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
      });
    } finally {
      await closeIntegrationDatabase(unavailableContext);
    }
  });
});
