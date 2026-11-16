import { z } from 'zod';
import { UUID_PATTERN } from '../../constants/http.constants.js';
import { createPasswordSchema } from '../../security/password-policy.js';
import { containsControlCharacters } from '../../utils/text.js';

const emailSchema = z
  .string()
  .trim()
  .max(320)
  .email('A valid email address is required.')
  .transform((value) => value.toLowerCase());

const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Full name must be at least 2 characters.')
  .max(120, 'Full name must be at most 120 characters.')
  .refine((value) => !containsControlCharacters(value), {
    message: 'Full name contains invalid characters.',
  });

const loginPasswordSchema = z
  .string()
  .min(1, 'Password is required.')
  .max(1_024, 'Password is too long.');

const sessionParamsSchema = z.object({
  sessionId: z
    .string()
    .regex(UUID_PATTERN, 'sessionId must be a valid UUID.'),
});

/**
 * Builds auth request validation schemas from the configured password policy.
 * @param {{ auth: { password: { minLength: number, maxLength: number } } }} config
 * @returns {object}
 */
export function createAuthValidators(config) {
  return {
    register: {
      body: z.object({
        email: emailSchema,
        password: createPasswordSchema(config),
        fullName: fullNameSchema,
      }),
    },
    login: {
      body: z.object({
        email: emailSchema,
        password: loginPasswordSchema,
      }),
    },
    sessionParams: {
      params: sessionParamsSchema,
    },
  };
}
