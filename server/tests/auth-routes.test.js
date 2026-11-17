import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/errors/app-error.js';
import { ERROR_CODES } from '../src/errors/error-codes.js';
import { createCsrfService } from '../src/security/csrf.service.js';
import {
  ALLOWED_ORIGIN,
  createRecordingLogger,
  createTestApp,
  createTestConfig,
} from './helpers/test-app.js';
import { request } from './helpers/test-request.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SESSION_ID = '22222222-2222-4222-8222-222222222222';
const ACCESS_TOKEN = 'access-token-value';
const REFRESH_TOKEN = 'refresh-token-value';
const NEW_REFRESH_TOKEN = 'new-refresh-token-value';

const USER = {
  id: 1,
  email: 'user@example.com',
  fullName: 'Example User',
  status: 'active',
  roles: ['USER'],
  permissions: ['dashboard:read'],
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function createAuthHarness({ configOverrides = {}, authOverrides = {} } = {}) {
  const config = createTestConfig(configOverrides);
  const csrfService = createCsrfService(config);
  const csrfToken = csrfService.issueToken(SESSION_ID);
  const authContext = {
    user: USER,
    userId: USER.id,
    sessionId: SESSION_ID,
    tokenId: 'token-id',
  };
  const authService = {
    register: vi.fn().mockResolvedValue({ user: USER }),
    login: vi.fn().mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      tokenType: 'Bearer',
      expiresIn: 900,
      csrfToken,
      sessionId: SESSION_ID,
      refreshToken: REFRESH_TOKEN,
      user: USER,
    }),
    refresh: vi.fn().mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      tokenType: 'Bearer',
      expiresIn: 900,
      csrfToken,
      sessionId: SESSION_ID,
      refreshToken: NEW_REFRESH_TOKEN,
      user: USER,
    }),
    logout: vi.fn().mockResolvedValue({ loggedOut: true, revoked: true }),
    listSessions: vi.fn().mockResolvedValue({
      sessions: [
        {
          id: SESSION_ID,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastUsedAt: '2026-01-02T00:00:00.000Z',
          expiresAt: '2026-01-09T00:00:00.000Z',
          current: true,
        },
      ],
    }),
    revokeSession: vi.fn().mockResolvedValue({ revoked: true, current: true }),
    authenticateAccessToken: vi.fn(async (token) => {
      if (token !== ACCESS_TOKEN) {
        throw new AppError(ERROR_CODES.AUTHENTICATION_REQUIRED);
      }
      return authContext;
    }),
    getCurrentUser: vi.fn().mockResolvedValue({ user: USER }),
    ...authOverrides,
  };
  const { app, logger } = createTestApp({ configOverrides, authService });

  return { app, config, logger, csrfToken, authService, authContext };
}

function cookiePath(cookie) {
  return /;\s*Path=([^;]*)/i.exec(cookie)?.[1];
}

function findSetCookies(response, name, path) {
  return response.headers['set-cookie'].filter(
    (cookie) =>
      cookie.startsWith(`${name}=`) &&
      (path === undefined || cookiePath(cookie) === path),
  );
}

function findSetCookie(response, name, path) {
  return findSetCookies(response, name, path)[0];
}

function loginRequest(app, body = {}) {
  return request(app)
    .post('/api/v1/auth/login')
    .set('Origin', ALLOWED_ORIGIN)
    .send({
      email: 'user@example.com',
      password: 'correct horse battery staple',
      ...body,
    });
}

function refreshRequest(app, { csrfToken, cookieToken = csrfToken, headerToken = csrfToken } = {}) {
  const cookies = [`syncsphere_refresh=${REFRESH_TOKEN}`];
  if (cookieToken !== null) {
    cookies.push(`syncsphere_csrf=${cookieToken}`);
  }

  const pending = request(app)
    .post('/api/v1/auth/refresh')
    .set('Origin', ALLOWED_ORIGIN)
    .set('Cookie', cookies.join('; '));

  if (headerToken !== null) {
    pending.set('X-CSRF-Token', headerToken);
  }

  return pending;
}

describe('authentication HTTP routes', () => {
  it('registers a user with the shared response envelope', async () => {
    const { app, config, authService } = createAuthHarness();
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', ALLOWED_ORIGIN)
      .send({
        email: 'New.User@Example.com',
        password: 'correct horse battery staple',
        fullName: 'New User',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: { user: { email: 'user@example.com' } },
      metadata: { requestId: expect.any(String), version: config.version },
    });
    expect(authService.register).toHaveBeenCalledWith(
      {
        email: 'new.user@example.com',
        password: 'correct horse battery staple',
        fullName: 'New User',
      },
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  it('rejects invalid registration payloads before calling the service', async () => {
    const { app, authService } = createAuthHarness();
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ email: 'not-an-email', password: 'short', fullName: 'A' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('logs in, sets secure cookies, and never returns the refresh token in the body', async () => {
    const { app, authService } = createAuthHarness({
      configOverrides: { AUTH_REFRESH_COOKIE_SECURE: 'true' },
    });
    const response = await loginRequest(app);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      accessToken: ACCESS_TOKEN,
      tokenType: 'Bearer',
      expiresIn: 900,
      csrfToken: expect.any(String),
      sessionId: SESSION_ID,
      user: { email: 'user@example.com' },
    });
    expect(response.body.data).not.toHaveProperty('refreshToken');
    expect(response.body.data).not.toHaveProperty('password');
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(authService.login).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        password: 'correct horse battery staple',
      },
      expect.objectContaining({ requestId: expect.any(String) }),
    );

    const refreshCookie = findSetCookie(
      response,
      'syncsphere_refresh',
      '/api/v1/auth',
    );
    const csrfCookie = findSetCookie(response, 'syncsphere_csrf', '/');
    const legacyCsrfCookie = findSetCookie(
      response,
      'syncsphere_csrf',
      '/api/v1/auth',
    );

    expect(refreshCookie).toContain('syncsphere_refresh=refresh-token-value');
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('Secure');
    expect(refreshCookie).toContain('SameSite=Strict');

    expect(csrfCookie).toContain(
      `syncsphere_csrf=${response.body.data.csrfToken}`,
    );
    expect(csrfCookie).not.toContain('HttpOnly');
    expect(csrfCookie).toContain('Secure');
    expect(csrfCookie).toContain('SameSite=Strict');
    expect(legacyCsrfCookie).toContain('syncsphere_csrf=;');
  });

  it('uses an explicitly configured CSRF cookie path', async () => {
    const { app } = createAuthHarness({
      configOverrides: { AUTH_CSRF_COOKIE_PATH: '/app' },
    });
    const response = await loginRequest(app);
    const csrfCookie = findSetCookie(response, 'syncsphere_csrf', '/app');
    const legacyCsrfCookie = findSetCookie(
      response,
      'syncsphere_csrf',
      '/api/v1/auth',
    );

    expect(response.status).toBe(200);
    expect(csrfCookie).toContain('Path=/app');
    expect(legacyCsrfCookie).toContain('syncsphere_csrf=;');
  });

  it('ignores privileged roles supplied by the client', async () => {
    const { app, authService } = createAuthHarness();
    await loginRequest(app, { role: 'SUPER_ADMIN', permissions: ['admin:access'] });

    expect(authService.login).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        password: 'correct horse battery staple',
      },
      expect.any(Object),
    );
  });

  it('rejects disallowed origins and cross-site requests before authentication', async () => {
    const { app, authService } = createAuthHarness();
    const disallowedOrigin = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'user@example.com', password: 'correct horse battery staple' });
    const crossSite = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ email: 'user@example.com', password: 'correct horse battery staple' });

    expect(disallowedOrigin.status).toBe(403);
    expect(crossSite.status).toBe(403);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('requires matching CSRF cookie and header for refresh', async () => {
    const { app, authService, csrfToken } = createAuthHarness();
    const missingHeader = await refreshRequest(app, {
      csrfToken,
      headerToken: null,
    });
    const mismatched = await refreshRequest(app, {
      csrfToken,
      headerToken: 'different-token',
    });
    const success = await refreshRequest(app, { csrfToken });

    expect(missingHeader.status).toBe(403);
    expect(missingHeader.body.error.code).toBe('CSRF_VALIDATION_FAILED');
    expect(mismatched.status).toBe(403);
    expect(success.status).toBe(200);
    expect(authService.refresh).toHaveBeenCalledWith(
      { refreshToken: REFRESH_TOKEN, csrfToken },
      expect.objectContaining({ requestId: expect.any(String) }),
    );
    expect(success.body.data).not.toHaveProperty('refreshToken');
  });

  it('selects the matching CSRF value when duplicate cookie names include a stale legacy token', async () => {
    const { app, authService, csrfToken } = createAuthHarness();
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', ALLOWED_ORIGIN)
      .set(
        'Cookie',
        `syncsphere_refresh=${REFRESH_TOKEN}; syncsphere_csrf=stale-legacy-token; syncsphere_csrf=${csrfToken}`,
      )
      .set('X-CSRF-Token', csrfToken);

    expect(response.status).toBe(200);
    expect(authService.refresh).toHaveBeenCalledWith(
      { refreshToken: REFRESH_TOKEN, csrfToken },
      expect.objectContaining({ requestId: expect.any(String) }),
    );
  });

  it('refreshes cookies with current paths and clears the legacy CSRF cookie', async () => {
    const { app, csrfToken } = createAuthHarness();
    const response = await refreshRequest(app, { csrfToken });
    const refreshCookie = findSetCookie(
      response,
      'syncsphere_refresh',
      '/api/v1/auth',
    );
    const csrfCookie = findSetCookie(response, 'syncsphere_csrf', '/');
    const legacyCsrfCookie = findSetCookie(
      response,
      'syncsphere_csrf',
      '/api/v1/auth',
    );

    expect(response.status).toBe(200);
    expect(refreshCookie).toContain(
      `syncsphere_refresh=${NEW_REFRESH_TOKEN}`,
    );
    expect(refreshCookie).toContain('HttpOnly');
    expect(csrfCookie).toContain(`syncsphere_csrf=${csrfToken}`);
    expect(csrfCookie).not.toContain('HttpOnly');
    expect(legacyCsrfCookie).toContain('syncsphere_csrf=;');
  });

  it('logs out and clears both auth cookies', async () => {
    const { app, authService, csrfToken } = createAuthHarness();
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .set(
        'Cookie',
        `syncsphere_refresh=${REFRESH_TOKEN}; syncsphere_csrf=${csrfToken}`,
      )
      .set('X-CSRF-Token', csrfToken);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ loggedOut: true, revoked: true });
    expect(authService.logout).toHaveBeenCalledWith(
      { refreshToken: REFRESH_TOKEN, csrfToken },
      expect.any(Object),
    );
    const refreshCookie = findSetCookie(
      response,
      'syncsphere_refresh',
      '/api/v1/auth',
    );
    const csrfCookie = findSetCookie(response, 'syncsphere_csrf', '/');
    const legacyCsrfCookie = findSetCookie(
      response,
      'syncsphere_csrf',
      '/api/v1/auth',
    );

    expect(refreshCookie).toContain('syncsphere_refresh=;');
    expect(refreshCookie).toContain('HttpOnly');
    expect(csrfCookie).toContain('syncsphere_csrf=;');
    expect(legacyCsrfCookie).toContain('syncsphere_csrf=;');
  });

  it('requires a valid bearer token for protected routes', async () => {
    const { app, authService } = createAuthHarness();
    const missing = await request(app).get('/api/v1/auth/me');
    const malformed = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Basic abc');
    const invalid = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid');

    expect(missing.status).toBe(401);
    expect(malformed.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(missing.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(authService.authenticateAccessToken).toHaveBeenCalledWith('invalid');
  });

  it('returns the current user and session list for authenticated requests', async () => {
    const { app, authService } = createAuthHarness();
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`);
    const sessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    expect(me.status).toBe(200);
    expect(me.body.data.user).toMatchObject({ email: 'user@example.com' });
    expect(sessions.status).toBe(200);
    expect(sessions.body.data.sessions[0]).toMatchObject({
      id: SESSION_ID,
      current: true,
    });
    expect(authService.authenticateAccessToken).toHaveBeenCalledWith(ACCESS_TOKEN);
  });

  it('revokes a session and clears cookies only for the current session', async () => {
    const { app, authService } = createAuthHarness();
    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${SESSION_ID}`)
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ revoked: true, current: true });
    expect(authService.revokeSession).toHaveBeenCalledWith(
      {
        userId: USER.id,
        sessionId: SESSION_ID,
        currentSessionId: SESSION_ID,
      },
      expect.any(Object),
    );
    expect(response.headers['set-cookie'].join('\n')).toContain(
      'syncsphere_refresh=;',
    );
  });

  it('validates session IDs and surfaces authorization failures', async () => {
    const validSessionHarness = createAuthHarness();
    const forbidden = createAuthHarness({
      authOverrides: {
        authenticateAccessToken: vi.fn().mockResolvedValue({
          user: { ...USER, permissions: [] },
          userId: USER.id,
          sessionId: OTHER_SESSION_ID,
          tokenId: 'token-id',
        }),
      },
    });

    const invalidSession = await request(validSessionHarness.app)
      .delete('/api/v1/auth/sessions/not-a-uuid')
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`);
    const deniedAdmin = await request(forbidden.app)
      .get('/api/v1/admin/access')
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    expect(invalidSession.status).toBe(400);
    expect(invalidSession.body.error.code).toBe('VALIDATION_ERROR');
    expect(deniedAdmin.status).toBe(403);
    expect(deniedAdmin.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('allows the protected admin probe only with admin:access', async () => {
    const allowed = createAuthHarness({
      authOverrides: {
        authenticateAccessToken: vi.fn().mockResolvedValue({
          user: { ...USER, roles: ['ADMIN'], permissions: ['admin:access'] },
          userId: USER.id,
          sessionId: SESSION_ID,
          tokenId: 'token-id',
        }),
      },
    });
    const response = await request(allowed.app)
      .get('/api/v1/admin/access')
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      authorized: true,
      permissions: ['admin:access'],
    });
  });

  it('rate limits login attempts independently of the global limiter', async () => {
    const { app, authService } = createAuthHarness({
      configOverrides: { AUTH_LOGIN_RATE_LIMIT_MAX: '1' },
    });

    const first = await loginRequest(app);
    const second = await loginRequest(app);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(authService.login).toHaveBeenCalledTimes(1);
  });

  it('does not log passwords, tokens, cookies, or authorization headers', async () => {
    const { logger, entries } = createRecordingLogger();
    const config = createTestConfig();
    const csrfService = createCsrfService(config);
    const authService = {
      login: vi.fn().mockResolvedValue({
        accessToken: ACCESS_TOKEN,
        tokenType: 'Bearer',
        expiresIn: 900,
        csrfToken: csrfService.issueToken(SESSION_ID),
        sessionId: SESSION_ID,
        refreshToken: REFRESH_TOKEN,
        user: USER,
      }),
    };
    const { app } = createTestApp({ logger, authService });

    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Authorization', 'Bearer request-secret')
      .send({
        email: 'user@example.com',
        password: 'correct horse battery staple',
      });

    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain('correct horse battery staple');
    expect(serialized).not.toContain(ACCESS_TOKEN);
    expect(serialized).not.toContain(REFRESH_TOKEN);
    expect(serialized).not.toContain('request-secret');
  });
});
