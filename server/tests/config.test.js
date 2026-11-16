import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  loadConfig,
  readPackageVersion,
} from '../src/config/index.js';
import { TEST_ENV } from './helpers/test-app.js';

function withoutCorsOrigin() {
  const env = { ...TEST_ENV };
  delete env.CORS_ORIGIN;
  return env;
}

describe('configuration', () => {
  it('applies development defaults and normalizes values', () => {
    const config = loadConfig({
      ...TEST_ENV,
      NODE_ENV: 'development',
      PORT: '3000',
      API_PREFIX: 'api/',
      CORS_ORIGIN: 'http://localhost:4200/',
      BODY_LIMIT: '1 MB',
      LOG_LEVEL: 'debug',
    });

    expect(config.nodeEnv).toBe('development');
    expect(config.isProduction).toBe(false);
    expect(config.apiPrefix).toBe('/api');
    expect(config.corsOrigins).toEqual(['http://localhost:4200']);
    expect(config.bodyLimit).toBe('1mb');
    expect(config.logLevel).toBe('debug');
    expect(config.version).toBe(readPackageVersion());
  });

  it('uses the local Angular origin when development CORS is omitted', () => {
    expect(loadConfig({ ...TEST_ENV, NODE_ENV: 'development' }).corsOrigins).toEqual([
      'http://localhost:4200',
    ]);
  });

  it('requires explicit production CORS origins', () => {
    expect(() => loadConfig({ ...withoutCorsOrigin(), NODE_ENV: 'production' })).toThrow(
      ConfigurationError,
    );
  });

  it.each(['*', 'https://example.com/path', 'ftp://example.com', 'not-a-url'])(
    'rejects unsafe CORS origin %s',
    (origin) => {
      expect(() => loadConfig({ ...TEST_ENV, CORS_ORIGIN: origin })).toThrow(
        ConfigurationError,
      );
    },
  );

  it('deduplicates multiple CORS origins', () => {
    const config = loadConfig({
      ...TEST_ENV,
      CORS_ORIGIN: 'http://localhost:4200, https://app.example.com,http://localhost:4200',
    });

    expect(config.corsOrigins).toEqual(['http://localhost:4200', 'https://app.example.com']);
  });

  it.each([
    ['PORT', 'not-a-port'],
    ['PORT', '70000'],
    ['TRUST_PROXY', 'true'],
    ['TRUST_PROXY', '11'],
    ['BODY_LIMIT', 'one-megabyte'],
    ['LOG_LEVEL', 'verbose'],
    ['SHUTDOWN_TIMEOUT_MS', '10'],
  ])('rejects invalid %s values', (key, value) => {
    expect(() => loadConfig({ ...TEST_ENV, [key]: value })).toThrow(ConfigurationError);
  });

  it('rejects relative API prefix segments', () => {
    expect(() => loadConfig({ ...TEST_ENV, API_PREFIX: '/api/../admin' })).toThrow(
      ConfigurationError,
    );
  });

  it('accepts a numeric trusted proxy hop count', () => {
    expect(loadConfig({ ...TEST_ENV, TRUST_PROXY: '2' }).trustProxy).toBe(2);
  });

  it('reads the application version from package metadata', () => {
    expect(readPackageVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
