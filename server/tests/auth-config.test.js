import { describe, expect, it } from 'vitest';
import { loadConfig, parseAuthConfig } from '../src/config/index.js';
import { ConfigurationError } from '../src/config/configuration-error.js';
import { TEST_ENV } from './helpers/test-app.js';

function authEnv(overrides = {}) {
  return { ...TEST_ENV, ...overrides };
}

describe('authentication configuration', () => {
  it('normalizes auth defaults and derives the cookie path', () => {
    const config = loadConfig(authEnv());

    expect(config.auth.accessToken.issuer).toBe('syncsphere-test');
    expect(config.auth.accessToken.audience).toBe('syncsphere-test-client');
    expect(config.auth.accessToken.ttlSeconds).toBe(900);
    expect(config.auth.refreshToken.ttlSeconds).toBe(604_800);
    expect(config.auth.cookie.path).toBe('/api/v1/auth');
    expect(config.auth.csrf.path).toBe('/');
    expect(config.auth.cookie.secure).toBe(false);
    expect(config.auth.password.minLength).toBe(12);
    expect(config.auth.rateLimit.loginMax).toBe(1_000);
  });

  it('allows independent refresh and readable CSRF cookie paths', () => {
    const config = loadConfig(
      authEnv({
        AUTH_REFRESH_COOKIE_PATH: '/api/v1/auth',
        AUTH_CSRF_COOKIE_PATH: '/',
      }),
    );

    expect(config.auth.cookie.path).toBe('/api/v1/auth');
    expect(config.auth.csrf.path).toBe('/');
  });

  it('rejects invalid CSRF cookie paths', () => {
    expect(() =>
      loadConfig(authEnv({ AUTH_CSRF_COOKIE_PATH: 'not-absolute' })),
    ).toThrow(ConfigurationError);
  });

  it('requires both independent auth secrets', () => {
    const withoutAccess = authEnv();
    delete withoutAccess.AUTH_ACCESS_TOKEN_SECRET;

    expect(() => loadConfig(withoutAccess)).toThrow(ConfigurationError);
    expect(() =>
      loadConfig(authEnv({ AUTH_ACCESS_TOKEN_SECRET: 'too-short' })),
    ).toThrow(ConfigurationError);
  });

  it('rejects reuse of the same secret for access tokens and CSRF', () => {
    expect(() =>
      loadConfig(
        authEnv({
          AUTH_CSRF_SECRET: TEST_ENV.AUTH_ACCESS_TOKEN_SECRET,
        }),
      ),
    ).toThrow(ConfigurationError);
  });

  it('requires secure cookies in production', () => {
    expect(() =>
      parseAuthConfig(
        authEnv({
          AUTH_REFRESH_COOKIE_SECURE: 'false',
        }),
        { isProduction: true },
      ),
    ).toThrow(ConfigurationError);
  });

  it('requires secure cookies when SameSite=None', () => {
    expect(() =>
      parseAuthConfig(
        authEnv({
          AUTH_REFRESH_COOKIE_SAME_SITE: 'none',
          AUTH_REFRESH_COOKIE_SECURE: 'false',
        }),
      ),
    ).toThrow(ConfigurationError);
  });

  it('rejects invalid password bounds and cookie names', () => {
    expect(() =>
      loadConfig(
        authEnv({
          AUTH_PASSWORD_MIN_LENGTH: '20',
          AUTH_PASSWORD_MAX_LENGTH: '12',
        }),
      ),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadConfig(authEnv({ AUTH_REFRESH_COOKIE_NAME: 'bad cookie name' })),
    ).toThrow(ConfigurationError);
  });

  it('rejects out-of-range token and Argon2 settings', () => {
    expect(() =>
      loadConfig(authEnv({ AUTH_ACCESS_TOKEN_TTL_SECONDS: '30' })),
    ).toThrow(ConfigurationError);
    expect(() =>
      loadConfig(authEnv({ AUTH_ARGON2_MEMORY_KIB: '1024' })),
    ).toThrow(ConfigurationError);
  });
});
