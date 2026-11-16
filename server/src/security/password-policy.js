import { z } from 'zod';
import { AppError } from '../errors/app-error.js';

/**
 * Builds the configurable password policy used by HTTP validation and the
 * administrator provisioning script.
 * @param {{ auth: { password: { minLength: number, maxLength: number } } }} config
 * @returns {import('zod').ZodString}
 */
export function createPasswordSchema(config) {
  return z
    .string()
    .min(
      config.auth.password.minLength,
      `Password must be at least ${config.auth.password.minLength} characters.`,
    )
    .max(
      config.auth.password.maxLength,
      `Password must be at most ${config.auth.password.maxLength} characters.`,
    );
}

/**
 * Enforces the password policy outside Express validation.
 * @param {unknown} password
 * @param {{ auth: { password: { minLength: number, maxLength: number } } }} config
 * @returns {string}
 */
export function assertPasswordPolicy(password, config) {
  const result = createPasswordSchema(config).safeParse(password);

  if (!result.success) {
    throw AppError.validation(
      result.error.issues.map((issue) => ({
        source: 'body',
        field: 'password',
        message: issue.message,
        code: issue.code,
      })),
    );
  }

  return result.data;
}
