import { z } from 'zod';
import {
  APP_NAME,
  DEFAULT_API_PREFIX,
  DEFAULT_BODY_LIMIT,
  DEFAULT_DEV_CORS_ORIGIN,
  DEFAULT_LOG_LEVEL,
  DEFAULT_NODE_ENV,
  DEFAULT_PORT,
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  SHUTDOWN_TIMEOUT_MAX_MS,
  SHUTDOWN_TIMEOUT_MIN_MS,
} from '../constants/app.constants.js';
import { parseAuthConfig } from './auth-config.js';
import { ConfigurationError } from './configuration-error.js';
import { parseDatabaseConfig } from './database-config.js';
import { readPackageVersion } from './version.js';

const BODY_LIMIT_PATTERN = /^\d+(?:\.\d+)?\s?(?:b|kb|mb|gb)$/i;

const emptyToUndefined = (value) => (value === '' ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['development', 'test', 'production']).default(DEFAULT_NODE_ENV),
  ),
  PORT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(0).max(65_535).default(DEFAULT_PORT),
  ),
  API_PREFIX: z.preprocess(emptyToUndefined, z.string().default(DEFAULT_API_PREFIX)),
  CORS_ORIGIN: z.preprocess(emptyToUndefined, z.string().optional()),
  TRUST_PROXY: z.preprocess(emptyToUndefined, z.string().optional()),
  RATE_LIMIT_WINDOW_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1_000).max(86_400_000).default(DEFAULT_RATE_LIMIT_WINDOW_MS),
  ),
  RATE_LIMIT_MAX: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(1_000_000).default(DEFAULT_RATE_LIMIT_MAX),
  ),
  BODY_LIMIT: z.preprocess(emptyToUndefined, z.string().default(DEFAULT_BODY_LIMIT)),
  SHUTDOWN_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(SHUTDOWN_TIMEOUT_MIN_MS)
      .max(SHUTDOWN_TIMEOUT_MAX_MS)
      .default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
  ),
  LOG_LEVEL: z.preprocess(
    emptyToUndefined,
    z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default(DEFAULT_LOG_LEVEL),
  ),
});

/**
 * Validates and normalizes environment configuration at startup.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Readonly<object>}
 */
export function loadConfig(env = process.env) {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    throw new ConfigurationError(
      `Invalid environment configuration: ${formatIssues(result.error)}`,
    );
  }

  const data = result.data;
  const isProduction = data.NODE_ENV === 'production';
  const corsOrigins = parseCorsOrigins(data.CORS_ORIGIN, isProduction);
  const apiPrefix = normalizeApiPrefix(data.API_PREFIX);

  return {
    nodeEnv: data.NODE_ENV,
    isProduction,
    port: data.PORT,
    apiPrefix,
    corsOrigins,
    trustProxy: parseTrustProxy(data.TRUST_PROXY),
    rateLimit: {
      windowMs: data.RATE_LIMIT_WINDOW_MS,
      max: data.RATE_LIMIT_MAX,
    },
    bodyLimit: normalizeBodyLimit(data.BODY_LIMIT),
    shutdownTimeoutMs: data.SHUTDOWN_TIMEOUT_MS,
    logLevel: data.LOG_LEVEL,
    appName: APP_NAME,
    version: readPackageVersion(),
    auth: parseAuthConfig(env, {
      isProduction,
      defaultCookiePath: `${apiPrefix}/v1/auth`,
    }),
    database: parseDatabaseConfig(env, { isProduction }),
  };
}

function formatIssues(error) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'environment';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

function normalizeApiPrefix(value) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new ConfigurationError('API_PREFIX must not be empty');
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\/+$/, '');

  if (normalized.length === 0 || normalized === '/') {
    throw new ConfigurationError('API_PREFIX must include a path segment, for example /api');
  }

  if (normalized.includes('//') || normalized.includes('*') || /\s/.test(normalized)) {
    throw new ConfigurationError('API_PREFIX contains invalid characters');
  }

  if (normalized.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new ConfigurationError('API_PREFIX must not contain relative path segments');
  }

  return normalized;
}

function parseCorsOrigins(value, isProduction) {
  const source = value ?? (isProduction ? undefined : DEFAULT_DEV_CORS_ORIGIN);

  if (source === undefined) {
    throw new ConfigurationError(
      'CORS_ORIGIN is required in production and must contain at least one explicit origin',
    );
  }

  const candidates = source
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (candidates.length === 0) {
    throw new ConfigurationError('CORS_ORIGIN must contain at least one explicit origin');
  }

  const normalized = new Set();

  for (const origin of candidates) {
    if (origin === '*') {
      throw new ConfigurationError(
        'Wildcard CORS origins are not allowed; configure explicit origins',
      );
    }

    let parsed;

    try {
      parsed = new URL(origin);
    } catch {
      throw new ConfigurationError(`Invalid CORS origin: ${origin}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ConfigurationError(`Invalid CORS origin protocol: ${origin}`);
    }

    if (parsed.pathname !== '/' || parsed.search.length > 0 || parsed.hash.length > 0) {
      throw new ConfigurationError(
        `CORS origins must not include a path, query, or fragment: ${origin}`,
      );
    }

    normalized.add(parsed.origin);
  }

  return [...normalized];
}

function parseTrustProxy(value) {
  if (value === undefined || value === 'false') {
    return false;
  }

  if (/^\d+$/.test(value)) {
    const hops = Number(value);

    if (hops >= 1 && hops <= 10) {
      return hops;
    }
  }

  throw new ConfigurationError(
    'TRUST_PROXY must be false or an integer hop count between 1 and 10',
  );
}

function normalizeBodyLimit(value) {
  const normalized = value.replace(/\s+/g, '').toLowerCase();

  if (!BODY_LIMIT_PATTERN.test(normalized)) {
    throw new ConfigurationError('BODY_LIMIT must be a size such as 100kb, 1mb, or 1gb');
  }

  return normalized;
}
