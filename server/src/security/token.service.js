import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_HEADER_TYPE,
  ACCESS_TOKEN_TYPE,
} from '../constants/auth.constants.js';
import { AppError } from '../errors/app-error.js';
import { ERROR_CODES } from '../errors/error-codes.js';

function toTokenError(error) {
  if (error?.code === 'ERR_JWT_EXPIRED') {
    return new AppError(ERROR_CODES.TOKEN_EXPIRED);
  }

  return new AppError(ERROR_CODES.TOKEN_INVALID);
}

/**
 * Creates access-token signing and verification using a restricted algorithm
 * allowlist and explicit issuer/audience/type validation.
 * @param {{ auth: { accessToken: object } }} config
 * @returns {object}
 */
export function createTokenService(config) {
  const { accessToken } = config.auth;
  const secret = new TextEncoder().encode(accessToken.secret);

  async function signAccessToken({ userId, sessionId, now = new Date() }) {
    const issuedAt = Math.floor(now.getTime() / 1_000);

    return new SignJWT({
      token_type: ACCESS_TOKEN_TYPE,
      sid: sessionId,
    })
      .setProtectedHeader({
        alg: ACCESS_TOKEN_ALGORITHM,
        typ: ACCESS_TOKEN_HEADER_TYPE,
      })
      .setSubject(String(userId))
      .setJti(randomUUID())
      .setIssuer(accessToken.issuer)
      .setAudience(accessToken.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + accessToken.ttlSeconds)
      .sign(secret);
  }

  async function verifyAccessToken(token, { now = new Date() } = {}) {
    if (typeof token !== 'string' || token.trim().length === 0) {
      throw new AppError(ERROR_CODES.TOKEN_INVALID);
    }

    try {
      const { payload, protectedHeader } = await jwtVerify(token, secret, {
        algorithms: [ACCESS_TOKEN_ALGORITHM],
        issuer: accessToken.issuer,
        audience: accessToken.audience,
        clockTolerance: accessToken.clockToleranceSeconds,
        currentDate: now,
      });

      if (
        protectedHeader.typ !== ACCESS_TOKEN_HEADER_TYPE ||
        payload.token_type !== ACCESS_TOKEN_TYPE ||
        typeof payload.sub !== 'string' ||
        payload.sub.length === 0 ||
        typeof payload.sid !== 'string' ||
        payload.sid.length === 0 ||
        typeof payload.jti !== 'string' ||
        payload.jti.length === 0
      ) {
        throw new AppError(ERROR_CODES.TOKEN_INVALID);
      }

      const userId = Number(payload.sub);

      if (!Number.isSafeInteger(userId) || userId < 1) {
        throw new AppError(ERROR_CODES.TOKEN_INVALID);
      }

      return {
        userId,
        sessionId: payload.sid,
        tokenId: payload.jti,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw toTokenError(error);
    }
  }

  return {
    signAccessToken,
    verifyAccessToken,
  };
}
