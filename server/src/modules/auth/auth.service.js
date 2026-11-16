import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  AUTH_AUDIT_EVENTS,
  AUTH_AUDIT_OUTCOMES,
  AUTH_USER_STATUS,
  DEFAULT_ROLE,
} from '../../constants/auth.constants.js';
import { isDuplicateKeyError } from '../../database/database-errors.js';
import { AppError } from '../../errors/app-error.js';
import { ERROR_CODES } from '../../errors/error-codes.js';

const REFRESH_TOKEN_BYTES = 48;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function toIsoString(value) {
  return value === null || value === undefined ? null : new Date(value).toISOString();
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    roles: [...user.roles],
    permissions: [...user.permissions],
    lastLoginAt: toIsoString(user.lastLoginAt),
    createdAt: toIsoString(user.createdAt),
  };
}

function requestContext(context) {
  return {
    requestId: context?.requestId ?? null,
    correlationId: context?.correlationId ?? null,
  };
}

function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Creates the authentication application service. Persistence, cryptography,
 * CSRF, audit, and transaction boundaries are injected so each concern remains
 * independently testable.
 * @param {{
 *   config: object,
 *   userRepository: object,
 *   sessionRepository: object,
 *   passwordService: object,
 *   tokenService: object,
 *   csrfService: object,
 *   audit: Function,
 *   cache?: object|null,
 *   runInTransaction: Function,
 *   now?: () => Date,
 *   generateRefreshToken?: () => string,
 *   generateSessionId?: () => string,
 * }} options
 * @returns {object}
 */
export function createAuthService({
  config,
  userRepository,
  sessionRepository,
  passwordService,
  tokenService,
  csrfService,
  audit,
  cache = null,
  runInTransaction,
  now = () => new Date(),
  generateRefreshToken = () => randomBytes(REFRESH_TOKEN_BYTES).toString('base64url'),
  generateSessionId = () => randomUUID(),
}) {
  if (typeof runInTransaction !== 'function') {
    throw new TypeError('createAuthService requires runInTransaction');
  }

  function auditEvent(event, outcome, userId, context, reason = null) {
    audit({
      event,
      outcome,
      userId,
      ...requestContext(context),
      reason,
    });
  }

  function refreshExpiry() {
    return new Date(now().getTime() + config.auth.refreshToken.ttlSeconds * 1_000);
  }

  function revocationCacheTtl() {
    return config.auth.accessToken.ttlSeconds + config.auth.accessToken.clockToleranceSeconds + 60;
  }

  async function issueSessionTokens(user, sessionId, refreshToken) {
    const accessToken = await tokenService.signAccessToken({
      userId: user.id,
      sessionId,
    });
    const csrfToken = csrfService.issueToken(sessionId);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: config.auth.accessToken.ttlSeconds,
      csrfToken,
      sessionId,
      refreshToken,
      user: toPublicUser(user),
    };
  }

  async function loadActiveUser(userId) {
    const user = await userRepository.findByIdWithAuthorization(userId);

    if (user === null) {
      throw new AppError(ERROR_CODES.AUTHENTICATION_REQUIRED);
    }

    if (user.status !== AUTH_USER_STATUS.ACTIVE) {
      throw new AppError(ERROR_CODES.ACCOUNT_DISABLED);
    }

    return user;
  }

  async function register({ email, password, fullName }, context) {
    const normalizedEmail = normalizeEmail(email);
    const existing = await userRepository.findByEmail(normalizedEmail);

    if (existing !== null) {
      throw new AppError(ERROR_CODES.EMAIL_ALREADY_EXISTS);
    }

    const passwordHash = await passwordService.hashPassword(password);
    let userId;

    try {
      ({ userId } = await userRepository.createUser({
        email: normalizedEmail,
        passwordHash,
        fullName: fullName.trim(),
        roleName: DEFAULT_ROLE,
      }));
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(ERROR_CODES.EMAIL_ALREADY_EXISTS);
      }

      throw error;
    }

    const user = await userRepository.findByIdWithAuthorization(userId);

    if (user === null) {
      throw new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR);
    }

    auditEvent(AUTH_AUDIT_EVENTS.USER_REGISTERED, AUTH_AUDIT_OUTCOMES.SUCCESS, userId, context);

    return { user: toPublicUser(user) };
  }

  async function login({ email, password }, context) {
    const normalizedEmail = normalizeEmail(email);
    const user = await userRepository.findByEmail(normalizedEmail);

    if (user === null) {
      await passwordService.verifyDummy(password);
      auditEvent(
        AUTH_AUDIT_EVENTS.LOGIN_FAILED,
        AUTH_AUDIT_OUTCOMES.FAILURE,
        null,
        context,
        'invalid_credentials',
      );
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
    }

    const passwordValid = await passwordService.verifyPassword(user.passwordHash, password);

    if (!passwordValid) {
      auditEvent(
        AUTH_AUDIT_EVENTS.LOGIN_FAILED,
        AUTH_AUDIT_OUTCOMES.FAILURE,
        user.id,
        context,
        'invalid_credentials',
      );
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (user.status !== AUTH_USER_STATUS.ACTIVE) {
      auditEvent(
        AUTH_AUDIT_EVENTS.LOGIN_FAILED,
        AUTH_AUDIT_OUTCOMES.FAILURE,
        user.id,
        context,
        'account_disabled',
      );
      throw new AppError(ERROR_CODES.ACCOUNT_DISABLED);
    }

    await userRepository.updateLastLogin(user.id);

    const authUser = await loadActiveUser(user.id);
    const sessionId = generateSessionId();
    const refreshToken = generateRefreshToken();

    await sessionRepository.createSession({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      tokenFamilyId: sessionId,
      expiresAt: refreshExpiry(),
    });

    auditEvent(AUTH_AUDIT_EVENTS.LOGIN_SUCCEEDED, AUTH_AUDIT_OUTCOMES.SUCCESS, user.id, context);

    return issueSessionTokens(authUser, sessionId, refreshToken);
  }

  async function refresh({ refreshToken, csrfToken }, context) {
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw new AppError(ERROR_CODES.AUTHENTICATION_REQUIRED);
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const outcome = await runInTransaction(async (transaction) => {
      const session = await sessionRepository.findByTokenHashForUpdate(tokenHash, transaction);

      if (session === null) {
        return { kind: 'invalid' };
      }

      if (session.revokedAt !== null) {
        await sessionRepository.revokeFamily(
          { userId: session.userId, tokenFamilyId: session.tokenFamilyId },
          transaction,
        );
        return {
          kind: 'reuse',
          userId: session.userId,
          sessionId: session.tokenFamilyId,
        };
      }

      if (new Date(session.expiresAt).getTime() <= now().getTime()) {
        await sessionRepository.revokeFamily(
          { userId: session.userId, tokenFamilyId: session.tokenFamilyId },
          transaction,
        );
        return {
          kind: 'expired',
          userId: session.userId,
          sessionId: session.tokenFamilyId,
        };
      }

      if (!csrfService.verifyToken(csrfToken, session.tokenFamilyId)) {
        return { kind: 'csrf' };
      }

      const user = await userRepository.findByIdWithAuthorization(session.userId, transaction);

      if (user === null) {
        await sessionRepository.revokeFamily(
          { userId: session.userId, tokenFamilyId: session.tokenFamilyId },
          transaction,
        );
        return {
          kind: 'invalid_user',
          userId: session.userId,
          sessionId: session.tokenFamilyId,
        };
      }

      if (user.status !== AUTH_USER_STATUS.ACTIVE) {
        await sessionRepository.revokeFamily(
          { userId: session.userId, tokenFamilyId: session.tokenFamilyId },
          transaction,
        );
        return {
          kind: 'disabled',
          userId: session.userId,
          sessionId: session.tokenFamilyId,
        };
      }

      const nextRefreshToken = generateRefreshToken();
      await sessionRepository.revokeSessionRow(session.id, transaction);
      await sessionRepository.createSession(
        {
          userId: session.userId,
          tokenHash: hashRefreshToken(nextRefreshToken),
          tokenFamilyId: session.tokenFamilyId,
          expiresAt: refreshExpiry(),
        },
        transaction,
      );

      return {
        kind: 'rotated',
        user,
        sessionId: session.tokenFamilyId,
        refreshToken: nextRefreshToken,
      };
    });

    if (outcome.kind === 'csrf') {
      auditEvent(
        AUTH_AUDIT_EVENTS.TOKEN_REFRESHED,
        AUTH_AUDIT_OUTCOMES.FAILURE,
        null,
        context,
        'csrf_validation_failed',
      );
      throw new AppError(ERROR_CODES.CSRF_VALIDATION_FAILED);
    }

    if (outcome.kind === 'invalid') {
      throw new AppError(ERROR_CODES.TOKEN_INVALID);
    }

    if (outcome.kind === 'reuse') {
      await cache?.markSessionRevoked(outcome.sessionId, revocationCacheTtl());
      auditEvent(
        AUTH_AUDIT_EVENTS.TOKEN_REUSE_DETECTED,
        AUTH_AUDIT_OUTCOMES.FAILURE,
        outcome.userId,
        context,
        'refresh_token_reuse',
      );
      throw new AppError(ERROR_CODES.TOKEN_REUSE_DETECTED);
    }

    if (outcome.kind === 'expired') {
      await cache?.markSessionRevoked(outcome.sessionId, revocationCacheTtl());
      throw new AppError(ERROR_CODES.TOKEN_EXPIRED);
    }

    if (outcome.kind === 'invalid_user') {
      await cache?.markSessionRevoked(outcome.sessionId, revocationCacheTtl());
      throw new AppError(ERROR_CODES.AUTHENTICATION_REQUIRED);
    }

    if (outcome.kind === 'disabled') {
      await cache?.markSessionRevoked(outcome.sessionId, revocationCacheTtl());
      throw new AppError(ERROR_CODES.ACCOUNT_DISABLED);
    }

    auditEvent(
      AUTH_AUDIT_EVENTS.TOKEN_REFRESHED,
      AUTH_AUDIT_OUTCOMES.SUCCESS,
      outcome.user.id,
      context,
    );

    return issueSessionTokens(outcome.user, outcome.sessionId, outcome.refreshToken);
  }

  async function logout({ refreshToken, csrfToken }, context) {
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      return { loggedOut: true, revoked: false };
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const outcome = await runInTransaction(async (transaction) => {
      const session = await sessionRepository.findByTokenHashForUpdate(tokenHash, transaction);

      if (session === null) {
        return { kind: 'not_found' };
      }

      if (!csrfService.verifyToken(csrfToken, session.tokenFamilyId)) {
        return { kind: 'csrf' };
      }

      await sessionRepository.revokeFamily(
        { userId: session.userId, tokenFamilyId: session.tokenFamilyId },
        transaction,
      );

      return {
        kind: 'revoked',
        userId: session.userId,
        sessionId: session.tokenFamilyId,
      };
    });

    if (outcome.kind === 'csrf') {
      auditEvent(
        AUTH_AUDIT_EVENTS.USER_LOGGED_OUT,
        AUTH_AUDIT_OUTCOMES.FAILURE,
        null,
        context,
        'csrf_validation_failed',
      );
      throw new AppError(ERROR_CODES.CSRF_VALIDATION_FAILED);
    }

    if (outcome.kind === 'revoked') {
      await cache?.markSessionRevoked(outcome.sessionId, revocationCacheTtl());
      auditEvent(
        AUTH_AUDIT_EVENTS.USER_LOGGED_OUT,
        AUTH_AUDIT_OUTCOMES.SUCCESS,
        outcome.userId,
        context,
      );
      return { loggedOut: true, revoked: true };
    }

    return { loggedOut: true, revoked: false };
  }

  async function listSessions({ userId, currentSessionId }) {
    const sessions = await sessionRepository.listActiveFamilies(userId);

    return {
      sessions: sessions.map((session) => ({
        ...session,
        current: session.id === currentSessionId,
      })),
    };
  }

  async function revokeSession({ userId, sessionId, currentSessionId }, context) {
    const affected = await sessionRepository.revokeFamily({
      userId,
      tokenFamilyId: sessionId,
    });

    if (affected === 0) {
      const exists = await sessionRepository.findFamilyForUser({
        userId,
        tokenFamilyId: sessionId,
      });

      if (!exists) {
        throw AppError.notFound('The requested session was not found.');
      }
    }

    await cache?.markSessionRevoked(sessionId, revocationCacheTtl());
    auditEvent(
      AUTH_AUDIT_EVENTS.SESSION_REVOKED,
      AUTH_AUDIT_OUTCOMES.SUCCESS,
      userId,
      context,
    );

    return {
      revoked: true,
      current: sessionId === currentSessionId,
    };
  }

  async function authenticateAccessToken(token) {
    const claims = await tokenService.verifyAccessToken(token);

    if (await cache?.isSessionRevoked(claims.sessionId)) {
      throw new AppError(ERROR_CODES.SESSION_REVOKED);
    }

    const session = await sessionRepository.findActiveFamily({
      userId: claims.userId,
      tokenFamilyId: claims.sessionId,
    });

    if (session === null) {
      throw new AppError(ERROR_CODES.SESSION_REVOKED);
    }

    const user = await loadActiveUser(claims.userId);

    return {
      user: toPublicUser(user),
      userId: user.id,
      sessionId: claims.sessionId,
      tokenId: claims.tokenId,
    };
  }

  async function getCurrentUser({ userId }) {
    const user = await loadActiveUser(userId);
    return { user: toPublicUser(user) };
  }

  return {
    register,
    login,
    refresh,
    logout,
    listSessions,
    revokeSession,
    authenticateAccessToken,
    getCurrentUser,
  };
}
