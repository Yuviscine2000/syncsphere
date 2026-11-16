import { z } from 'zod';
import {
  AUTH_ACCESS_TOKEN_TTL_MAX_SECONDS,
  AUTH_ACCESS_TOKEN_TTL_MIN_SECONDS,
  AUTH_ARGON2_MEMORY_MAX_KIB,
  AUTH_ARGON2_MEMORY_MIN_KIB,
  AUTH_ARGON2_PARALLELISM_MAX,
  AUTH_ARGON2_PARALLELISM_MIN,
  AUTH_ARGON2_TIME_COST_MAX,
  AUTH_ARGON2_TIME_COST_MIN,
  AUTH_CLOCK_TOLERANCE_MAX_SECONDS,
  AUTH_PASSWORD_MAX_LENGTH_UPPER_BOUND,
  AUTH_PASSWORD_MIN_LENGTH_LOWER_BOUND,
  AUTH_RATE_LIMIT_MAX_UPPER_BOUND,
  AUTH_RATE_LIMIT_WINDOW_MAX_MS,
  AUTH_RATE_LIMIT_WINDOW_MIN_MS,
  AUTH_REFRESH_TOKEN_TTL_MAX_SECONDS,
  AUTH_REFRESH_TOKEN_TTL_MIN_SECONDS,
  AUTH_SECRET_MIN_LENGTH,
  DEFAULT_AUTH_ACCESS_TOKEN_AUDIENCE,
  DEFAULT_AUTH_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS,
  DEFAULT_AUTH_ACCESS_TOKEN_ISSUER,
  DEFAULT_AUTH_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_AUTH_ARGON2_MEMORY_KIB,
  DEFAULT_AUTH_ARGON2_PARALLELISM,
  DEFAULT_AUTH_ARGON2_TIME_COST,
  DEFAULT_AUTH_COOKIE_PATH,
  DEFAULT_AUTH_COOKIE_SAME_SITE,
  DEFAULT_AUTH_CSRF_COOKIE_NAME,
  DEFAULT_AUTH_LOGIN_RATE_LIMIT_MAX,
  DEFAULT_AUTH_PASSWORD_MAX_LENGTH,
  DEFAULT_AUTH_PASSWORD_MIN_LENGTH,
  DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS,
  DEFAULT_AUTH_REFRESH_COOKIE_NAME,
  DEFAULT_AUTH_REFRESH_RATE_LIMIT_MAX,
  DEFAULT_AUTH_REFRESH_TOKEN_TTL_SECONDS,
  DEFAULT_AUTH_REGISTER_RATE_LIMIT_MAX,
} from '../constants/auth.constants.js';
import { ConfigurationError } from './configuration-error.js';

const emptyToUndefined = (value) => (value === '' ? undefined : value);

const cookieNamePattern = /^[A-Za-z0-9_-]+$/;
const cookiePathPattern = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const optionalBoolean = z.preprocess(
  emptyToUndefined,
  z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
);

const requiredSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(AUTH_SECRET_MIN_LENGTH).max(1_024),
);

const cookieName = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .min(1)
    .max(128)
    .regex(cookieNamePattern, 'must contain only letters, numbers, hyphens, or underscores'),
);

const envSchema = z.object({
  AUTH_ACCESS_TOKEN_SECRET: requiredSecret,
  AUTH_CSRF_SECRET: requiredSecret,
  AUTH_ACCESS_TOKEN_ISSUER: z.preprocess(
    emptyToUndefined,
    z.string().min(1).max(200).default(DEFAULT_AUTH_ACCESS_TOKEN_ISSUER),
  ),
  AUTH_ACCESS_TOKEN_AUDIENCE: z.preprocess(
    emptyToUndefined,
    z.string().min(1).max(200).default(DEFAULT_AUTH_ACCESS_TOKEN_AUDIENCE),
  ),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(AUTH_ACCESS_TOKEN_TTL_MIN_SECONDS)
      .max(AUTH_ACCESS_TOKEN_TTL_MAX_SECONDS)
      .default(DEFAULT_AUTH_ACCESS_TOKEN_TTL_SECONDS),
  ),
  AUTH_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(0)
      .max(AUTH_CLOCK_TOLERANCE_MAX_SECONDS)
      .default(DEFAULT_AUTH_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS),
  ),
  AUTH_REFRESH_TOKEN_TTL_SECONDS: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(AUTH_REFRESH_TOKEN_TTL_MIN_SECONDS)
      .max(AUTH_REFRESH_TOKEN_TTL_MAX_SECONDS)
      .default(DEFAULT_AUTH_REFRESH_TOKEN_TTL_SECONDS),
  ),
  AUTH_REFRESH_COOKIE_NAME: cookieName.default(DEFAULT_AUTH_REFRESH_COOKIE_NAME),
  AUTH_CSRF_COOKIE_NAME: cookieName.default(DEFAULT_AUTH_CSRF_COOKIE_NAME),
  AUTH_REFRESH_COOKIE_PATH: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(1)
      .max(500)
      .regex(cookiePathPattern, 'must be an absolute URL path')
      .optional(),
  ),
  AUTH_REFRESH_COOKIE_DOMAIN: optionalString,
  AUTH_REFRESH_COOKIE_SAME_SITE: z.preprocess(
    emptyToUndefined,
    z.enum(['strict', 'lax', 'none']).default(DEFAULT_AUTH_COOKIE_SAME_SITE),
  ),
  AUTH_REFRESH_COOKIE_SECURE: optionalBoolean,
  AUTH_PASSWORD_MIN_LENGTH: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(AUTH_PASSWORD_MIN_LENGTH_LOWER_BOUND)
      .max(AUTH_PASSWORD_MAX_LENGTH_UPPER_BOUND)
      .default(DEFAULT_AUTH_PASSWORD_MIN_LENGTH),
  ),
  AUTH_PASSWORD_MAX_LENGTH: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(AUTH_PASSWORD_MIN_LENGTH_LOWER_BOUND)
      .max(AUTH_PASSWORD_MAX_LENGTH_UPPER_BOUND)
      .default(DEFAULT_AUTH_PASSWORD_MAX_LENGTH),
  ),
  AUTH_ARGON2_MEMORY_KIB: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(AUTH_ARGON2_MEMORY_MIN_KIB)
      .max(AUTH_ARGON2_MEMORY_MAX_KIB)
      .default(DEFAULT_AUTH_ARGON2_MEMORY_KIB),
  ),
  AUTH_ARGON2_TIME_COST: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(AUTH_ARGON2_TIME_COST_MIN)
      .max(AUTH_ARGON2_TIME_COST_MAX)
      .default(DEFAULT_AUTH_ARGON2_TIME_COST),
  ),
  AUTH_ARGON2_PARALLELISM: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(AUTH_ARGON2_PARALLELISM_MIN)
      .max(AUTH_ARGON2_PARALLELISM_MAX)
      .default(DEFAULT_AUTH_ARGON2_PARALLELISM),
  ),
  AUTH_RATE_LIMIT_WINDOW_MS: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(AUTH_RATE_LIMIT_WINDOW_MIN_MS)
      .max(AUTH_RATE_LIMIT_WINDOW_MAX_MS)
      .default(DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS),
  ),
  AUTH_LOGIN_RATE_LIMIT_MAX: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(1)
      .max(AUTH_RATE_LIMIT_MAX_UPPER_BOUND)
      .default(DEFAULT_AUTH_LOGIN_RATE_LIMIT_MAX),
  ),
  AUTH_REGISTER_RATE_LIMIT_MAX: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(1)
      .max(AUTH_RATE_LIMIT_MAX_UPPER_BOUND)
      .default(DEFAULT_AUTH_REGISTER_RATE_LIMIT_MAX),
  ),
  AUTH_REFRESH_RATE_LIMIT_MAX: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(1)
      .max(AUTH_RATE_LIMIT_MAX_UPPER_BOUND)
      .default(DEFAULT_AUTH_REFRESH_RATE_LIMIT_MAX),
  ),
});

function formatIssues(error) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'auth';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Validates authentication and authorization configuration.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ isProduction?: boolean, defaultCookiePath?: string }} [options]
 * @returns {Readonly<object>}
 */
export function parseAuthConfig(
  env = process.env,
  { isProduction = false, defaultCookiePath = DEFAULT_AUTH_COOKIE_PATH } = {},
) {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    throw new ConfigurationError(
      `Invalid authentication configuration: ${formatIssues(result.error)}`,
    );
  }

  const data = result.data;

  if (data.AUTH_PASSWORD_MAX_LENGTH < data.AUTH_PASSWORD_MIN_LENGTH) {
    throw new ConfigurationError(
      'AUTH_PASSWORD_MAX_LENGTH must be greater than or equal to AUTH_PASSWORD_MIN_LENGTH',
    );
  }

  if (data.AUTH_ACCESS_TOKEN_SECRET === data.AUTH_CSRF_SECRET) {
    throw new ConfigurationError(
      'AUTH_ACCESS_TOKEN_SECRET and AUTH_CSRF_SECRET must be different values',
    );
  }

  const secureCookie = data.AUTH_REFRESH_COOKIE_SECURE ?? isProduction;

  if (isProduction && secureCookie !== true) {
    throw new ConfigurationError(
      'AUTH_REFRESH_COOKIE_SECURE must be true in production',
    );
  }

  if (data.AUTH_REFRESH_COOKIE_SAME_SITE === 'none' && secureCookie !== true) {
    throw new ConfigurationError(
      'AUTH_REFRESH_COOKIE_SAME_SITE=none requires AUTH_REFRESH_COOKIE_SECURE=true',
    );
  }

  return {
    accessToken: {
      secret: data.AUTH_ACCESS_TOKEN_SECRET,
      issuer: data.AUTH_ACCESS_TOKEN_ISSUER,
      audience: data.AUTH_ACCESS_TOKEN_AUDIENCE,
      ttlSeconds: data.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      clockToleranceSeconds: data.AUTH_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS,
    },
    refreshToken: {
      ttlSeconds: data.AUTH_REFRESH_TOKEN_TTL_SECONDS,
    },
    csrf: {
      secret: data.AUTH_CSRF_SECRET,
      cookieName: data.AUTH_CSRF_COOKIE_NAME,
    },
    cookie: {
      refreshName: data.AUTH_REFRESH_COOKIE_NAME,
      path: data.AUTH_REFRESH_COOKIE_PATH ?? defaultCookiePath,
      domain: data.AUTH_REFRESH_COOKIE_DOMAIN,
      sameSite: data.AUTH_REFRESH_COOKIE_SAME_SITE,
      secure: secureCookie,
    },
    password: {
      minLength: data.AUTH_PASSWORD_MIN_LENGTH,
      maxLength: data.AUTH_PASSWORD_MAX_LENGTH,
      argon2: {
        memoryCost: data.AUTH_ARGON2_MEMORY_KIB,
        timeCost: data.AUTH_ARGON2_TIME_COST,
        parallelism: data.AUTH_ARGON2_PARALLELISM,
      },
    },
    rateLimit: {
      windowMs: data.AUTH_RATE_LIMIT_WINDOW_MS,
      loginMax: data.AUTH_LOGIN_RATE_LIMIT_MAX,
      registerMax: data.AUTH_REGISTER_RATE_LIMIT_MAX,
      refreshMax: data.AUTH_REFRESH_RATE_LIMIT_MAX,
    },
  };
}
