import { describe, expect, it } from 'vitest';
import { createCsrfService } from '../src/security/csrf.service.js';
import { createTestConfig } from './helpers/test-app.js';

const config = createTestConfig();
const csrfService = createCsrfService(config);
const sessionId = '11111111-1111-4111-8111-111111111111';

describe('CSRF service', () => {
  it('issues session-bound tokens that verify only for the same session', () => {
    const token = csrfService.issueToken(sessionId);

    expect(csrfService.verifyToken(token, sessionId)).toBe(true);
    expect(
      csrfService.verifyToken(token, '22222222-2222-4222-8222-222222222222'),
    ).toBe(false);
  });

  it('rejects tampered and malformed tokens', () => {
    const token = csrfService.issueToken(sessionId);
    const tampered = `${token.slice(0, -1)}x`;

    expect(csrfService.verifyToken(tampered, sessionId)).toBe(false);
    expect(csrfService.verifyToken('not-a-token', sessionId)).toBe(false);
    expect(csrfService.verifyToken('', sessionId)).toBe(false);
  });

  it('compares double-submit values safely', () => {
    expect(csrfService.safeCompare('same', 'same')).toBe(true);
    expect(csrfService.safeCompare('same', 'different')).toBe(false);
    expect(csrfService.safeCompare('same', 'longer-value')).toBe(false);
  });
});
