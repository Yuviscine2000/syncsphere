import { describe, expect, it, vi } from 'vitest';
import { createAuthCache } from '../src/security/auth-cache.service.js';
import { createRecordingLogger } from './helpers/test-app.js';

function createRedisManager(client, { configured = true } = {}) {
  return {
    getClient: vi.fn().mockReturnValue({
      isConfigured: configured,
      getClient: () => client,
    }),
  };
}

describe('authentication revocation cache', () => {
  it('degrades safely when Redis is unavailable or unconfigured', async () => {
    const { logger } = createRecordingLogger();
    const unavailable = createAuthCache({ databaseManager: null, logger });
    const unconfigured = createAuthCache({
      databaseManager: createRedisManager({}, { configured: false }),
      logger,
    });

    await expect(
      unavailable.markSessionRevoked('session-1', 60),
    ).resolves.toBeUndefined();
    await expect(unavailable.isSessionRevoked('session-1')).resolves.toBe(false);
    await expect(unconfigured.isSessionRevoked('session-1')).resolves.toBe(false);
  });

  it('writes revocation markers with a bounded TTL and reads them back', async () => {
    const redis = {
      set: vi.fn().mockResolvedValue('OK'),
      exists: vi.fn().mockResolvedValue(1),
    };
    const { logger } = createRecordingLogger();
    const cache = createAuthCache({
      databaseManager: createRedisManager(redis),
      logger,
    });

    await cache.markSessionRevoked('session-1', 0);
    await expect(cache.isSessionRevoked('session-1')).resolves.toBe(true);

    expect(redis.set).toHaveBeenCalledWith(
      'auth:revoked-session:session-1',
      '1',
      { EX: 1 },
    );
    expect(redis.exists).toHaveBeenCalledWith(
      'auth:revoked-session:session-1',
    );
  });

  it('expires revocation markers after the configured TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    try {
      const values = new Map();
      const redis = {
        set: vi.fn(async (key, value, { EX }) => {
          values.set(key, {
            value,
            expiresAt: Date.now() + EX * 1_000,
          });
          return 'OK';
        }),
        exists: vi.fn(async (key) => {
          const entry = values.get(key);

          if (entry === undefined) {
            return 0;
          }

          if (entry.expiresAt <= Date.now()) {
            values.delete(key);
            return 0;
          }

          return 1;
        }),
      };
      const { logger } = createRecordingLogger();
      const cache = createAuthCache({
        databaseManager: createRedisManager(redis),
        logger,
      });

      await cache.markSessionRevoked('session-1', 2);
      await expect(cache.isSessionRevoked('session-1')).resolves.toBe(true);

      vi.advanceTimersByTime(2_001);
      await expect(cache.isSessionRevoked('session-1')).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns and falls back to database checks when Redis operations fail', async () => {
    const redis = {
      set: vi.fn().mockRejectedValue(new Error('redis write failed')),
      exists: vi.fn().mockRejectedValue(new Error('redis read failed')),
    };
    const { logger, entries } = createRecordingLogger();
    const cache = createAuthCache({
      databaseManager: createRedisManager(redis),
      logger,
    });

    await expect(
      cache.markSessionRevoked('session-1', 60),
    ).resolves.toBeUndefined();
    await expect(cache.isSessionRevoked('session-1')).resolves.toBe(false);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'warn' }),
        expect.objectContaining({ level: 'warn' }),
      ]),
    );
  });

  it('degrades safely when the managed Redis client cannot be acquired', async () => {
    const { logger } = createRecordingLogger();
    const cache = createAuthCache({
      databaseManager: {
        getClient: vi.fn().mockReturnValue({
          isConfigured: true,
          getClient: () => {
            throw new Error('not initialized');
          },
        }),
      },
      logger,
    });

    await expect(cache.isSessionRevoked('session-1')).resolves.toBe(false);
  });
});
