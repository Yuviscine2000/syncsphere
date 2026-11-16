import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createTokenService } from '../src/security/token.service.js';
import { createTestConfig } from './helpers/test-app.js';

const config = createTestConfig();
const tokenService = createTokenService(config);
const sessionId = '11111111-1111-4111-8111-111111111111';

describe('access token service', () => {
  it('signs and verifies short-lived access tokens', async () => {
    const token = await tokenService.signAccessToken({
      userId: 7,
      sessionId,
    });
    const claims = await tokenService.verifyAccessToken(token);

    expect(claims).toMatchObject({
      userId: 7,
      sessionId,
      tokenId: expect.any(String),
    });
  });

  it('rejects tampered signatures', async () => {
    const token = await tokenService.signAccessToken({
      userId: 7,
      sessionId,
    });
    const tampered = `${token.slice(0, -2)}xx`;

    await expect(tokenService.verifyAccessToken(tampered)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('rejects expired tokens', async () => {
    const token = await tokenService.signAccessToken({
      userId: 7,
      sessionId,
      now: new Date(Date.now() - 2_000_000),
    });

    await expect(tokenService.verifyAccessToken(token)).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
  });

  it('rejects wrong issuer and audience claims', async () => {
    const otherConfig = createTestConfig({
      AUTH_ACCESS_TOKEN_ISSUER: 'different-issuer',
    });
    const otherService = createTokenService(otherConfig);
    const token = await otherService.signAccessToken({ userId: 7, sessionId });

    await expect(tokenService.verifyAccessToken(token)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('rejects unexpected token types and algorithms', async () => {
    const secret = new TextEncoder().encode(config.auth.accessToken.secret);
    const issuedAt = Math.floor(Date.now() / 1_000);
    const wrongType = await new SignJWT({
      token_type: 'refresh',
      sid: sessionId,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setSubject('7')
      .setJti('token-id')
      .setIssuer(config.auth.accessToken.issuer)
      .setAudience(config.auth.accessToken.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 900)
      .sign(secret);
    const wrongAlgorithm = await new SignJWT({
      token_type: 'access',
      sid: sessionId,
    })
      .setProtectedHeader({ alg: 'HS384', typ: 'at+jwt' })
      .setSubject('7')
      .setJti('token-id')
      .setIssuer(config.auth.accessToken.issuer)
      .setAudience(config.auth.accessToken.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 900)
      .sign(secret);

    await expect(tokenService.verifyAccessToken(wrongType)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
    await expect(
      tokenService.verifyAccessToken(wrongAlgorithm),
    ).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });
});
