import { describe, expect, it, vi } from 'vitest';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createAuthCache } from '../src/security/auth-cache.service.js';
import { createCsrfService } from '../src/security/csrf.service.js';
import { createTokenService } from '../src/security/token.service.js';
import {
  createRecordingLogger,
  createTestConfig,
} from './helpers/test-app.js';

const NOW = new Date('2026-01-15T10:00:00.000Z');

function activeUser(overrides = {}) {
  return {
    id: 1,
    email: 'user@example.com',
    fullName: 'Example User',
    status: 'active',
    roles: ['USER'],
    permissions: ['dashboard:read'],
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createHarness({
  user = activeUser(),
  configOverrides = {},
  cache: providedCache = null,
} = {}) {
  const config = createTestConfig(configOverrides);
  const users = new Map();
  const userRows = new Map();
  const sessions = new Map();
  const audit = vi.fn();
  const verifyDummy = vi.fn().mockResolvedValue(false);
  let nextUserId = 2;
  let nextSessionRowId = 1;
  let tokenCounter = 0;
  let sessionCounter = 0;

  userRows.set(user.email, {
    ...user,
    passwordHash: 'hash:correct-password',
  });

  const userRepository = {
    findByEmail: vi.fn(async (email) => userRows.get(email) ?? null),
    findByIdWithAuthorization: vi.fn(async (userId) => {
      const found = [...userRows.values()].find((row) => row.id === userId);
      return found === undefined ? null : found;
    }),
    createUser: vi.fn(async ({ email, passwordHash, fullName }) => {
      if (userRows.has(email)) {
        throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      }

      const userId = nextUserId;
      nextUserId += 1;
      const created = {
        ...activeUser({ id: userId, email, fullName }),
        passwordHash,
        lastLoginAt: null,
        createdAt: NOW.toISOString(),
      };
      userRows.set(email, created);
      users.set(userId, created);
      return { userId };
    }),
    updateLastLogin: vi.fn(async (userId) => {
      const found = users.get(userId) ?? [...userRows.values()].find((row) => row.id === userId);
      if (found) {
        found.lastLoginAt = NOW.toISOString();
      }
    }),
  };

  const sessionRepository = {
    createSession: vi.fn(async ({ userId, tokenHash, tokenFamilyId, expiresAt }) => {
      const id = nextSessionRowId;
      nextSessionRowId += 1;
      sessions.set(tokenHash, {
        id,
        userId,
        tokenHash,
        tokenFamilyId,
        expiresAt: new Date(expiresAt).toISOString(),
        revokedAt: null,
        createdAt: NOW.toISOString(),
        lastUsedAt: NOW.toISOString(),
      });
    }),
    findByTokenHashForUpdate: vi.fn(async (tokenHash) => sessions.get(tokenHash) ?? null),
    revokeSessionRow: vi.fn(async (sessionId) => {
      for (const session of sessions.values()) {
        if (session.id === sessionId) {
          session.revokedAt = NOW.toISOString();
        }
      }
    }),
    revokeFamily: vi.fn(async ({ userId, tokenFamilyId }) => {
      let affected = 0;
      for (const session of sessions.values()) {
        if (
          session.userId === userId &&
          session.tokenFamilyId === tokenFamilyId &&
          session.revokedAt === null
        ) {
          session.revokedAt = NOW.toISOString();
          affected += 1;
        }
      }
      return affected;
    }),
    findActiveFamily: vi.fn(async ({ userId, tokenFamilyId }) => {
      return (
        [...sessions.values()].find(
          (session) =>
            session.userId === userId &&
            session.tokenFamilyId === tokenFamilyId &&
            session.revokedAt === null &&
            new Date(session.expiresAt).getTime() > NOW.getTime(),
        ) ?? null
      );
    }),
    findFamilyForUser: vi.fn(async ({ userId, tokenFamilyId }) =>
      [...sessions.values()].some(
        (session) =>
          session.userId === userId && session.tokenFamilyId === tokenFamilyId,
      ),
    ),
    listActiveFamilies: vi.fn(async (userId) => {
      const families = new Map();
      for (const session of sessions.values()) {
        if (
          session.userId === userId &&
          session.revokedAt === null &&
          new Date(session.expiresAt).getTime() > NOW.getTime()
        ) {
          families.set(session.tokenFamilyId, {
            id: session.tokenFamilyId,
            createdAt: session.createdAt,
            lastUsedAt: session.lastUsedAt,
            expiresAt: session.expiresAt,
          });
        }
      }
      return [...families.values()];
    }),
  };

  const passwordService = {
    hashPassword: vi.fn(async (password) => `hash:${password}`),
    verifyPassword: vi.fn(async (hash, password) => hash === `hash:${password}`),
    verifyDummy,
  };
  const cache =
    providedCache ??
    {
      markSessionRevoked: vi.fn().mockResolvedValue(undefined),
      isSessionRevoked: vi.fn().mockResolvedValue(false),
    };
  const service = createAuthService({
    config,
    userRepository,
    sessionRepository,
    passwordService,
    tokenService: createTokenService(config),
    csrfService: createCsrfService(config),
    audit,
    cache,
    runInTransaction: async (work) => work({ query: vi.fn() }),
    now: () => NOW,
    generateRefreshToken: () => `refresh-token-${(tokenCounter += 1)}`,
    generateSessionId: () => `session-${(sessionCounter += 1)}`,
  });

  return {
    service,
    config,
    users,
    userRows,
    sessions,
    audit,
    userRepository,
    sessionRepository,
    passwordService,
    cache,
  };
}

describe('authentication service', () => {
  it('registers a user with the default role and no password hash exposure', async () => {
    const harness = createHarness();
    const result = await harness.service.register(
      {
        email: '  New.User@Example.com ',
        password: 'correct horse battery staple',
        fullName: ' New User ',
      },
      { requestId: 'req-1', correlationId: 'corr-1' },
    );

    expect(result.user).toMatchObject({
      email: 'new.user@example.com',
      fullName: 'New User',
      roles: ['USER'],
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(harness.passwordService.hashPassword).toHaveBeenCalledWith(
      'correct horse battery staple',
    );
    expect(harness.userRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ roleName: 'USER' }),
    );
    expect(harness.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'USER_REGISTERED',
        outcome: 'success',
        requestId: 'req-1',
        correlationId: 'corr-1',
      }),
    );
  });

  it('rejects duplicate registration without hashing the password', async () => {
    const harness = createHarness();

    await expect(
      harness.service.register({
        email: 'user@example.com',
        password: 'correct horse battery staple',
        fullName: 'Example User',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
    expect(harness.passwordService.hashPassword).not.toHaveBeenCalled();
  });

  it('converts a duplicate-key race into the same safe registration error', async () => {
    const harness = createHarness();
    harness.userRepository.findByEmail.mockResolvedValueOnce(null);
    harness.userRepository.createUser.mockRejectedValueOnce(
      Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }),
    );

    await expect(
      harness.service.register({
        email: 'race@example.com',
        password: 'correct horse battery staple',
        fullName: 'Race User',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
  });

  it('logs in with valid credentials and creates a refresh session', async () => {
    const harness = createHarness();
    const result = await harness.service.login(
      { email: 'USER@example.com', password: 'correct-password' },
      {},
    );

    expect(result).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      sessionId: 'session-1',
      refreshToken: 'refresh-token-1',
      user: { email: 'user@example.com' },
    });
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.csrfToken).toEqual(expect.any(String));
    expect(harness.sessions.size).toBe(1);
    expect(harness.userRepository.updateLastLogin).toHaveBeenCalledWith(1);
  });

  it('uses generic credentials errors and dummy verification for unknown emails', async () => {
    const harness = createHarness();

    await expect(
      harness.service.login({ email: 'missing@example.com', password: 'anything' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(harness.passwordService.verifyDummy).toHaveBeenCalledWith('anything');

    await expect(
      harness.service.login({ email: 'user@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('rejects disabled accounts after password verification', async () => {
    const harness = createHarness({
      user: activeUser({ status: 'disabled' }),
    });

    await expect(
      harness.service.login({
        email: 'user@example.com',
        password: 'correct-password',
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });

  it('rotates refresh tokens and detects reuse of the rotated token', async () => {
    const harness = createHarness();
    const login = await harness.service.login({
      email: 'user@example.com',
      password: 'correct-password',
    });
    const refreshed = await harness.service.refresh({
      refreshToken: login.refreshToken,
      csrfToken: login.csrfToken,
    });

    expect(refreshed.refreshToken).toBe('refresh-token-2');
    expect(refreshed.sessionId).toBe(login.sessionId);
    expect(refreshed.csrfToken).not.toBe(login.csrfToken);

    await expect(
      harness.service.refresh({
        refreshToken: login.refreshToken,
        csrfToken: login.csrfToken,
      }),
    ).rejects.toMatchObject({ code: 'TOKEN_REUSE_DETECTED' });
    expect(harness.cache.markSessionRevoked).toHaveBeenCalledWith(
      login.sessionId,
      expect.any(Number),
    );
    expect(harness.audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'TOKEN_REUSE_DETECTED', outcome: 'failure' }),
    );

    await expect(
      harness.service.refresh({
        refreshToken: refreshed.refreshToken,
        csrfToken: refreshed.csrfToken,
      }),
    ).rejects.toMatchObject({ code: 'TOKEN_REUSE_DETECTED' });
  });

  it('rejects refresh without a valid CSRF token', async () => {
    const harness = createHarness();
    const login = await harness.service.login({
      email: 'user@example.com',
      password: 'correct-password',
    });

    await expect(
      harness.service.refresh({
        refreshToken: login.refreshToken,
        csrfToken: 'tampered',
      }),
    ).rejects.toMatchObject({ code: 'CSRF_VALIDATION_FAILED' });
  });

  it('revokes the session family on logout and rejects its access token', async () => {
    const harness = createHarness();
    const login = await harness.service.login({
      email: 'user@example.com',
      password: 'correct-password',
    });
    const authenticated = await harness.service.authenticateAccessToken(login.accessToken);

    expect(authenticated).toMatchObject({
      userId: 1,
      sessionId: login.sessionId,
    });
    expect(harness.cache.isSessionRevoked).toHaveBeenCalledWith(login.sessionId);

    await expect(
      harness.service.logout({
        refreshToken: login.refreshToken,
        csrfToken: login.csrfToken,
      }),
    ).resolves.toEqual({ loggedOut: true, revoked: true });
    expect(harness.cache.markSessionRevoked).toHaveBeenCalledWith(
      login.sessionId,
      harness.config.auth.accessToken.ttlSeconds +
        harness.config.auth.accessToken.clockToleranceSeconds +
        60,
    );

    await expect(
      harness.service.authenticateAccessToken(login.accessToken),
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });

  it('rejects access tokens when the Redis revocation marker is present', async () => {
    const harness = createHarness();
    const login = await harness.service.login({
      email: 'user@example.com',
      password: 'correct-password',
    });
    harness.cache.isSessionRevoked.mockResolvedValueOnce(true);

    await expect(
      harness.service.authenticateAccessToken(login.accessToken),
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(harness.sessionRepository.findActiveFamily).not.toHaveBeenCalled();
  });

  it('rejects access tokens after an explicit session revocation', async () => {
    const harness = createHarness();
    const login = await harness.service.login({
      email: 'user@example.com',
      password: 'correct-password',
    });

    await expect(
      harness.service.revokeSession({
        userId: 1,
        sessionId: login.sessionId,
        currentSessionId: null,
      }),
    ).resolves.toEqual({ revoked: true, current: false });
    expect(harness.cache.markSessionRevoked).toHaveBeenCalledWith(
      login.sessionId,
      harness.config.auth.accessToken.ttlSeconds +
        harness.config.auth.accessToken.clockToleranceSeconds +
        60,
    );

    await expect(
      harness.service.authenticateAccessToken(login.accessToken),
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });

  it('rejects access tokens after refresh-token reuse revokes the family', async () => {
    const harness = createHarness();
    const login = await harness.service.login({
      email: 'user@example.com',
      password: 'correct-password',
    });
    const refreshed = await harness.service.refresh({
      refreshToken: login.refreshToken,
      csrfToken: login.csrfToken,
    });

    await expect(
      harness.service.refresh({
        refreshToken: login.refreshToken,
        csrfToken: login.csrfToken,
      }),
    ).rejects.toMatchObject({ code: 'TOKEN_REUSE_DETECTED' });
    expect(harness.cache.markSessionRevoked).toHaveBeenCalledWith(
      login.sessionId,
      harness.config.auth.accessToken.ttlSeconds +
        harness.config.auth.accessToken.clockToleranceSeconds +
        60,
    );

    await expect(
      harness.service.authenticateAccessToken(refreshed.accessToken),
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });

  it('rejects revoked access tokens when Redis is unavailable during revocation checks', async () => {
    const redis = {
      set: vi.fn().mockRejectedValue(new Error('redis write failed')),
      exists: vi.fn().mockRejectedValue(new Error('redis read failed')),
    };
    const { logger, entries } = createRecordingLogger();
    const cache = createAuthCache({
      databaseManager: {
        getClient: vi.fn().mockReturnValue({
          isConfigured: true,
          getClient: () => redis,
        }),
      },
      logger,
    });
    const harness = createHarness({ cache });
    const login = await harness.service.login({
      email: 'user@example.com',
      password: 'correct-password',
    });

    await expect(
      harness.service.logout({
        refreshToken: login.refreshToken,
        csrfToken: login.csrfToken,
      }),
    ).resolves.toEqual({ loggedOut: true, revoked: true });

    await expect(
      harness.service.authenticateAccessToken(login.accessToken),
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(redis.exists).toHaveBeenCalledWith(
      `auth:revoked-session:${login.sessionId}`,
    );
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'warn' }),
        expect.objectContaining({ level: 'warn' }),
      ]),
    );
  });

  it('rejects logout when the signed CSRF token is not bound to the session', async () => {
    const harness = createHarness();
    const login = await harness.service.login({
      email: 'user@example.com',
      password: 'correct-password',
    });

    await expect(
      harness.service.logout({
        refreshToken: login.refreshToken,
        csrfToken: 'tampered',
      }),
    ).rejects.toMatchObject({ code: 'CSRF_VALIDATION_FAILED' });
    expect(harness.sessions.size).toBe(1);
    expect([...harness.sessions.values()][0].revokedAt).toBeNull();
  });

  it('lists sessions and marks the current session', async () => {
    const harness = createHarness();
    const login = await harness.service.login({
      email: 'user@example.com',
      password: 'correct-password',
    });

    const result = await harness.service.listSessions({
      userId: 1,
      currentSessionId: login.sessionId,
    });

    expect(result.sessions).toEqual([
      expect.objectContaining({ id: login.sessionId, current: true }),
    ]);
  });

  it('prevents cross-user session revocation', async () => {
    const harness = createHarness();
    const login = await harness.service.login({
      email: 'user@example.com',
      password: 'correct-password',
    });

    await expect(
      harness.service.revokeSession({
        userId: 99,
        sessionId: login.sessionId,
        currentSessionId: login.sessionId,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
});
