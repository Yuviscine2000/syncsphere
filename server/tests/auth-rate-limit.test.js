import { describe, expect, it, vi } from 'vitest';
import { ConfigurationError } from '../src/config/configuration-error.js';
import {
  AUTH_RATE_LIMIT_KEY_PREFIX,
  createAuthRateLimitStore,
} from '../src/security/auth-rate-limit.store.js';
import {
  ALLOWED_ORIGIN,
  createRecordingLogger,
  createTestApp,
  createTestConfig,
} from './helpers/test-app.js';
import { request } from './helpers/test-request.js';

function createRedisDriver({ fail = false } = {}) {
  const counters = new Map();
  let scriptCounter = 0;

  const sendCommand = vi.fn(async (command) => {
    if (fail) {
      throw new Error('redis unavailable');
    }

    const [name, ...args] = command;

    if (name === 'SCRIPT') {
      scriptCounter += 1;
      return `script-sha-${scriptCounter}`;
    }

    if (name === 'EVALSHA') {
      const key = args[2];
      const windowMs = Number(args[3] ?? 60_000);
      const now = Date.now();
      const existing = counters.get(key);

      if (existing === undefined || existing.resetAt <= now) {
        counters.set(key, { count: 1, resetAt: now + windowMs });
        return [1, windowMs];
      }

      existing.count += 1;
      return [existing.count, Math.max(1, existing.resetAt - now)];
    }

    if (name === 'DECR') {
      const existing = counters.get(args[0]);
      if (existing !== undefined) {
        existing.count = Math.max(0, existing.count - 1);
        return existing.count;
      }
      return -1;
    }

    if (name === 'DEL') {
      counters.delete(args[0]);
      return 1;
    }

    throw new Error(`unexpected Redis command: ${name}`);
  });

  return { counters, sendCommand };
}

function createRedisManager(driver, { configured = true } = {}) {
  const redisDependency = {
    isConfigured: configured,
    getClient: () => driver,
  };

  return {
    getClient: vi.fn((name) => (name === 'redis' ? redisDependency : null)),
  };
}

function createLoginAuthService() {
  return {
    login: vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      csrfToken: 'csrf-token',
      sessionId: 'session-1',
      refreshToken: 'refresh-token',
      user: {
        id: 1,
        email: 'user@example.com',
        fullName: 'Example User',
        status: 'active',
        roles: ['USER'],
        permissions: [],
      },
    }),
  };
}

function loginRequest(app) {
  return request(app)
    .post('/api/v1/auth/login')
    .set('Origin', ALLOWED_ORIGIN)
    .send({
      email: 'user@example.com',
      password: 'correct horse battery staple',
    });
}

describe('authentication rate limiting', () => {
  it('shares login counters across application instances through the managed Redis client', async () => {
    const driver = createRedisDriver();
    const databaseManager = createRedisManager(driver);
    const authService = createLoginAuthService();
    const configOverrides = { AUTH_LOGIN_RATE_LIMIT_MAX: '1' };
    const firstApp = createTestApp({
      configOverrides,
      databaseManager,
      authService,
    }).app;
    const secondApp = createTestApp({
      configOverrides,
      databaseManager,
      authService,
    }).app;

    const first = await loginRequest(firstApp);
    const second = await loginRequest(secondApp);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(authService.login).toHaveBeenCalledTimes(1);
    expect(
      [...driver.counters.keys()].some((key) =>
        key.startsWith(`${AUTH_RATE_LIMIT_KEY_PREFIX}login:`),
      ),
    ).toBe(true);
  });

  it('fails closed with a service-unavailable response when Redis is unavailable', async () => {
    const driver = createRedisDriver({ fail: true });
    const databaseManager = createRedisManager(driver);
    const authService = createLoginAuthService();
    const app = createTestApp({
      configOverrides: { AUTH_LOGIN_RATE_LIMIT_MAX: '1' },
      databaseManager,
      authService,
    }).app;

    const response = await loginRequest(app);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(authService.login).not.toHaveBeenCalled();
    expect(driver.sendCommand).toHaveBeenCalled();
  });

  it('creates isolated Redis key namespaces per operation without a new client', () => {
    const driver = createRedisDriver();
    const databaseManager = createRedisManager(driver);
    const config = createTestConfig();
    const { logger } = createRecordingLogger();

    const login = createAuthRateLimitStore({
      config,
      logger,
      databaseManager,
      operation: 'login',
    });
    const registration = createAuthRateLimitStore({
      config,
      logger,
      databaseManager,
      operation: 'registration',
    });

    expect(login.prefix).toBe(`${AUTH_RATE_LIMIT_KEY_PREFIX}login:`);
    expect(registration.prefix).toBe(
      `${AUTH_RATE_LIMIT_KEY_PREFIX}registration:`,
    );
    expect(login.localKeys).toBe(false);
    expect(registration.localKeys).toBe(false);
    expect(databaseManager.getClient).toHaveBeenCalledWith('redis');
    expect(driver.sendCommand).not.toHaveBeenCalled();
  });

  it('uses documented in-memory counters outside production when Redis is not configured', () => {
    const config = createTestConfig({ NODE_ENV: 'development' });
    const { logger, entries } = createRecordingLogger();

    const store = createAuthRateLimitStore({
      config,
      logger,
      databaseManager: null,
      operation: 'login',
    });

    expect(store).toBeNull();
    expect(entries).toEqual([
      expect.objectContaining({
        level: 'warn',
        payload: expect.objectContaining({
          dependency: 'redis',
          environment: 'development',
          operation: 'login',
        }),
      }),
    ]);
  });

  it('refuses process-local rate limiting in production without Redis', () => {
    const { logger } = createRecordingLogger();

    expect(() =>
      createAuthRateLimitStore({
        config: { isProduction: true, nodeEnv: 'production' },
        logger,
        databaseManager: null,
        operation: 'login',
      }),
    ).toThrow(ConfigurationError);
  });
});
