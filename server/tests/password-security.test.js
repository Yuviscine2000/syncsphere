import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors/app-error.js';
import {
  assertPasswordPolicy,
  createPasswordSchema,
} from '../src/security/password-policy.js';
import { createPasswordService } from '../src/security/password.service.js';
import { createTestConfig } from './helpers/test-app.js';

const config = createTestConfig();
const passwordService = createPasswordService(config);

describe('password security', () => {
  it('hashes with Argon2id and verifies without exposing the password', async () => {
    const password = 'correct horse battery staple';
    const hash = await passwordService.hashPassword(password);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain(password);
    await expect(passwordService.verifyPassword(hash, password)).resolves.toBe(true);
    await expect(passwordService.verifyPassword(hash, 'wrong password')).resolves.toBe(
      false,
    );
  });

  it('treats malformed hashes as failed verification', async () => {
    await expect(
      passwordService.verifyPassword('not-a-valid-hash', 'password'),
    ).resolves.toBe(false);
  });

  it('enforces the configured password length policy without trimming', () => {
    const schema = createPasswordSchema(config);

    expect(schema.safeParse('short').success).toBe(false);
    expect(schema.safeParse('  spaces are preserved  ').success).toBe(true);
    expect(() => assertPasswordPolicy('short', config)).toThrow(AppError);
    expect(assertPasswordPolicy('long-enough-password', config)).toBe(
      'long-enough-password',
    );
  });
});
