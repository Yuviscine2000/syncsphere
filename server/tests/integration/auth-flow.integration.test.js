import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { CSRF_HEADER_NAME } from '../../src/constants/auth.constants.js';
import { AUTH_RATE_LIMIT_KEY_PREFIX } from '../../src/security/auth-rate-limit.store.js';
import { ALLOWED_ORIGIN } from '../helpers/test-app.js';
import {
  buildCookieHeader,
  readCookie,
} from './support/integration-cookies.js';
import {
  closeIntegrationDatabase,
  createIntegrationDatabase,
  initializeIntegrationDatabase,
} from './support/integration-database.js';
import { uniqueEmail } from './support/unique-values.js';

const PASSWORD = 'Integration-Password-123!';

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (server === undefined || !server.listening) {
      resolve();
      return;
    }

    server.close(() => resolve());
  });
}

describe('real authentication flow', () => {
  let context;
  let server;
  let client;
  let mysql;
  let redisClient;
  let userEmail;
  let userId;
  const sessionIds = new Set();

  function cookies(response) {
    return {
      refresh: readCookie(response, context.config.auth.cookie.refreshName),
      csrf: readCookie(response, context.config.auth.csrf.cookieName),
    };
  }

  function cookieHeader(cookiesToSend) {
    return buildCookieHeader({
      [context.config.auth.cookie.refreshName]: cookiesToSend.refresh,
      [context.config.auth.csrf.cookieName]: cookiesToSend.csrf,
    });
  }

  async function resetAuthRateLimits() {
    if (redisClient === undefined) {
      return;
    }

    for (const operation of ['registration', 'login', 'session']) {
      await redisClient
        .del(`${AUTH_RATE_LIMIT_KEY_PREFIX}${operation}:127.0.0.1`)
        .catch(() => {});
    }
  }

  async function login() {
    const response = await client
      .post('/api/v1/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ email: userEmail, password: PASSWORD });

    expect(response.status).toBe(200);

    const loginCookies = cookies(response);
    expect(loginCookies.refresh).toBeDefined();
    expect(loginCookies.csrf).toBeDefined();
    expect(response.body.data.csrfToken).toBe(loginCookies.csrf);
    sessionIds.add(response.body.data.sessionId);

    return {
      response,
      ...loginCookies,
      accessToken: response.body.data.accessToken,
      sessionId: response.body.data.sessionId,
    };
  }

  beforeAll(async () => {
    context = createIntegrationDatabase();
    await initializeIntegrationDatabase(context, { migrate: true });
    mysql = context.databaseManager.getClient('mysql');
    redisClient = context.databaseManager.getClient('redis').getClient();
    await resetAuthRateLimits();
    userEmail = uniqueEmail('auth-flow');

    const app = createApp({
      config: context.config,
      logger: context.logger,
      databaseManager: context.databaseManager,
    });
    server = await listen(app);
    client = supertest(server);
  });

  afterAll(async () => {
    if (mysql !== undefined && userEmail !== undefined) {
      await mysql.query('DELETE FROM users WHERE email = ?', [userEmail]).catch(() => {});
    }

    if (redisClient !== undefined) {
      for (const sessionId of sessionIds) {
        await redisClient.del(`auth:revoked-session:${sessionId}`).catch(() => {});
      }
    }

    await resetAuthRateLimits();
    await closeServer(server);

    if (context !== undefined) {
      await closeIntegrationDatabase(context);
    }
  });

  it('registers a disposable user and persists it in MySQL', async () => {
    const response = await client
      .post('/api/v1/auth/register')
      .set('Origin', ALLOWED_ORIGIN)
      .send({
        email: userEmail,
        password: PASSWORD,
        fullName: 'Integration Auth User',
      });

    expect(response.status).toBe(201);
    userId = response.body.data.user.id;
    expect(userId).toBeGreaterThan(0);

    const persisted = await mysql.query(
      `SELECT u.id, u.email, u.full_name, u.status, r.name AS role_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.email = ?
       LIMIT 1`,
      [userEmail],
    );

    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].email).toBe(userEmail);
    expect(persisted.rows[0].full_name).toBe('Integration Auth User');
    expect(persisted.rows[0].status).toBe('active');
    expect(persisted.rows[0].role_name).toBe('USER');
  });

  it('logs in, authenticates an access token, and lists the current session', async () => {
    const session = await login();

    const me = await client
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(userEmail);

    const sessions = await client
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(sessions.status).toBe(200);

    const current = sessions.body.data.sessions.find(
      (entry) => entry.id === session.sessionId,
    );
    expect(current).toBeDefined();
    expect(current.current).toBe(true);

    const logout = await client
      .post('/api/v1/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieHeader(session))
      .set(CSRF_HEADER_NAME, session.csrf);
    expect(logout.status).toBe(200);
  });

  it('revokes a separate session and rejects its access token', async () => {
    const firstSession = await login();
    const secondSession = await login();

    const sessions = await client
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${firstSession.accessToken}`);
    expect(sessions.body.data.sessions.some((entry) => entry.id === secondSession.sessionId)).toBe(
      true,
    );

    const revoke = await client
      .delete(`/api/v1/auth/sessions/${secondSession.sessionId}`)
      .set('Authorization', `Bearer ${firstSession.accessToken}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.data).toMatchObject({ revoked: true, current: false });

    const revokedMe = await client
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${secondSession.accessToken}`);
    expect(revokedMe.status).toBe(401);
    expect(revokedMe.body.error.code).toBe('SESSION_REVOKED');

    const persisted = await mysql.query(
      'SELECT revoked_at FROM refresh_sessions WHERE token_family_id = ?',
      [secondSession.sessionId],
    );
    expect(persisted.rows.length).toBeGreaterThan(0);
    expect(persisted.rows.every((row) => row.revoked_at !== null)).toBe(true);

    const logout = await client
      .post('/api/v1/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieHeader(firstSession))
      .set(CSRF_HEADER_NAME, firstSession.csrf);
    expect(logout.status).toBe(200);
  });

  it('rotates refresh tokens, detects reuse, and revokes the token family', async () => {
    const session = await login();

    const refreshed = await client
      .post('/api/v1/auth/refresh')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieHeader(session))
      .set(CSRF_HEADER_NAME, session.csrf);
    expect(refreshed.status).toBe(200);

    const rotatedCookies = cookies(refreshed);
    expect(rotatedCookies.refresh).toBeDefined();
    expect(rotatedCookies.refresh).not.toBe(session.refresh);
    expect(rotatedCookies.csrf).toBeDefined();

    const reused = await client
      .post('/api/v1/auth/refresh')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieHeader(session))
      .set(CSRF_HEADER_NAME, session.csrf);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    const revokedMe = await client
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.data.accessToken}`);
    expect(revokedMe.status).toBe(401);
    expect(revokedMe.body.error.code).toBe('SESSION_REVOKED');
  });

  it('logs out, revokes the session, and rejects the revoked access token', async () => {
    const session = await login();

    const logout = await client
      .post('/api/v1/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookieHeader(session))
      .set(CSRF_HEADER_NAME, session.csrf);
    expect(logout.status).toBe(200);
    expect(logout.body.data).toMatchObject({ loggedOut: true, revoked: true });

    const revokedMe = await client
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(revokedMe.status).toBe(401);
    expect(revokedMe.body.error.code).toBe('SESSION_REVOKED');

    const persisted = await mysql.query(
      'SELECT revoked_at FROM refresh_sessions WHERE token_family_id = ?',
      [session.sessionId],
    );
    expect(persisted.rows.length).toBeGreaterThan(0);
    expect(persisted.rows.every((row) => row.revoked_at !== null)).toBe(true);
  });

  it('leaves no active refresh sessions for the disposable user', async () => {
    const active = await mysql.query(
      'SELECT COUNT(*) AS count FROM refresh_sessions WHERE user_id = ? AND revoked_at IS NULL',
      [userId],
    );

    expect(Number(active.rows[0].count)).toBe(0);
  });
});
