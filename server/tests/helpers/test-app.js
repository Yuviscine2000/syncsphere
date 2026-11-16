import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/utils/logger.js';

export const ALLOWED_ORIGIN = 'http://localhost:4200';

export const TEST_ENV = Object.freeze({
  NODE_ENV: 'test',
  PORT: '0',
  API_PREFIX: '/api',
  CORS_ORIGIN: ALLOWED_ORIGIN,
  TRUST_PROXY: 'false',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX: '1000',
  BODY_LIMIT: '1mb',
  SHUTDOWN_TIMEOUT_MS: '1000',
  LOG_LEVEL: 'silent',
  AUTH_ACCESS_TOKEN_SECRET: 'test-access-token-secret-that-is-long-enough',
  AUTH_CSRF_SECRET: 'test-csrf-secret-that-is-different-and-long-enough',
  AUTH_ACCESS_TOKEN_ISSUER: 'syncsphere-test',
  AUTH_ACCESS_TOKEN_AUDIENCE: 'syncsphere-test-client',
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  AUTH_REFRESH_TOKEN_TTL_SECONDS: '604800',
  AUTH_REFRESH_COOKIE_SECURE: 'false',
  AUTH_REFRESH_COOKIE_SAME_SITE: 'strict',
  AUTH_PASSWORD_MIN_LENGTH: '12',
  AUTH_PASSWORD_MAX_LENGTH: '128',
  AUTH_ARGON2_MEMORY_KIB: '8192',
  AUTH_ARGON2_TIME_COST: '2',
  AUTH_ARGON2_PARALLELISM: '1',
  AUTH_RATE_LIMIT_WINDOW_MS: '60000',
  AUTH_LOGIN_RATE_LIMIT_MAX: '1000',
  AUTH_REGISTER_RATE_LIMIT_MAX: '1000',
  AUTH_REFRESH_RATE_LIMIT_MAX: '1000',
});

export const VALID_REQUEST_ID = '11111111-1111-4111-8111-111111111111';
export const VALID_CORRELATION_ID = '22222222-2222-4222-8222-222222222222';

export function createTestConfig(overrides = {}) {
  return loadConfig({ ...TEST_ENV, ...overrides });
}

export function createTestLogger() {
  return createLogger({ logLevel: 'silent', nodeEnv: 'test' });
}

export function createRecordingLogger() {
  const entries = [];
  const record = (level) => (first, second) => {
    entries.push({
      level,
      payload: typeof first === 'object' && first !== null ? first : null,
      message: typeof first === 'string' ? first : second,
    });
  };

  return {
    entries,
    logger: {
      fatal: record('fatal'),
      error: record('error'),
      warn: record('warn'),
      info: record('info'),
      debug: record('debug'),
      trace: record('trace'),
    },
  };
}

export function createTestApp({
  configOverrides = {},
  logger = createTestLogger(),
  databaseManager = null,
  authService = null,
} = {}) {
  const config = createTestConfig(configOverrides);
  const app = createApp({ config, logger, databaseManager, authService });

  return { app, config, logger };
}
