import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Creates signed, session-bound CSRF tokens for the double-submit cookie
 * pattern. The HMAC prevents token injection through sibling domains.
 * @param {{ auth: { csrf: { secret: string } } }} config
 * @returns {object}
 */
export function createCsrfService(config) {
  const secret = Buffer.from(config.auth.csrf.secret, 'utf8');

  function signature(sessionId, nonce) {
    return createHmac('sha256', secret)
      .update(`${sessionId}.${nonce}`)
      .digest('base64url');
  }

  function issueToken(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new TypeError('issueToken requires a session identifier');
    }

    const nonce = randomBytes(32).toString('base64url');
    return `${nonce}.${signature(sessionId, nonce)}`;
  }

  function verifyToken(token, sessionId) {
    if (
      typeof token !== 'string' ||
      typeof sessionId !== 'string' ||
      sessionId.length === 0
    ) {
      return false;
    }

    const parts = token.split('.');

    if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
      return false;
    }

    const expected = signature(sessionId, parts[0]);
    return safeEqual(parts[1], expected);
  }

  function safeCompare(left, right) {
    return safeEqual(left, right);
  }

  return {
    issueToken,
    verifyToken,
    safeCompare,
  };
}
