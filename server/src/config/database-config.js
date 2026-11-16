import { z } from 'zod';
import {
  DATABASE_DEPENDENCY_NAMES,
  DEFAULT_DATABASE_CONNECT_TIMEOUT_MS,
  DEFAULT_MONGODB_MAX_POOL_SIZE,
  DEFAULT_MYSQL_CONNECTION_LIMIT,
  DEFAULT_MYSQL_PORT,
  DEFAULT_REDIS_MAX_RETRIES,
  MAX_CONNECT_TIMEOUT_MS,
  MAX_CONNECTION_LIMIT,
  MAX_REDIS_RETRIES,
  MIN_CONNECT_TIMEOUT_MS,
  MIN_CONNECTION_LIMIT,
  MIN_REDIS_RETRIES,
} from '../constants/database.constants.js';
import { ConfigurationError } from './configuration-error.js';

const emptyToUndefined = (value) => (value === '' ? undefined : value);

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const optionalBoolean = z.preprocess(
  emptyToUndefined,
  z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
);

const optionalTimeout = z.preprocess(
  emptyToUndefined,
  z.coerce
    .number()
    .int()
    .min(MIN_CONNECT_TIMEOUT_MS)
    .max(MAX_CONNECT_TIMEOUT_MS)
    .optional(),
);

const envSchema = z.object({
  DATABASE_CONNECT_TIMEOUT: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(MIN_CONNECT_TIMEOUT_MS)
      .max(MAX_CONNECT_TIMEOUT_MS)
      .default(DEFAULT_DATABASE_CONNECT_TIMEOUT_MS),
  ),
  DATABASE_STARTUP_POLICY: z.preprocess(
    emptyToUndefined,
    z.enum(['required', 'optional']).optional(),
  ),

  MYSQL_HOST: optionalString,
  MYSQL_PORT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(65_535).default(DEFAULT_MYSQL_PORT),
  ),
  MYSQL_USER: optionalString,
  MYSQL_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
  MYSQL_DATABASE: optionalString,
  MYSQL_CONNECTION_LIMIT: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(MIN_CONNECTION_LIMIT)
      .max(MAX_CONNECTION_LIMIT)
      .default(DEFAULT_MYSQL_CONNECTION_LIMIT),
  ),
  MYSQL_CONNECT_TIMEOUT: optionalTimeout,
  MYSQL_SSL: optionalBoolean,

  MONGODB_URI: optionalString,
  MONGODB_DATABASE: optionalString,
  MONGODB_MAX_POOL_SIZE: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(MIN_CONNECTION_LIMIT)
      .max(MAX_CONNECTION_LIMIT)
      .default(DEFAULT_MONGODB_MAX_POOL_SIZE),
  ),
  MONGODB_SERVER_SELECTION_TIMEOUT: optionalTimeout,

  REDIS_URL: optionalString,
  REDIS_CONNECT_TIMEOUT: optionalTimeout,
  REDIS_MAX_RETRIES: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(MIN_REDIS_RETRIES)
      .max(MAX_REDIS_RETRIES)
      .default(DEFAULT_REDIS_MAX_RETRIES),
  ),
});

const MYSQL_KEYS = [
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_DATABASE',
  'MYSQL_CONNECTION_LIMIT',
  'MYSQL_CONNECT_TIMEOUT',
  'MYSQL_SSL',
];

const MONGODB_KEYS = [
  'MONGODB_URI',
  'MONGODB_DATABASE',
  'MONGODB_MAX_POOL_SIZE',
  'MONGODB_SERVER_SELECTION_TIMEOUT',
];

const REDIS_KEYS = ['REDIS_URL', 'REDIS_CONNECT_TIMEOUT', 'REDIS_MAX_RETRIES'];

function hasAny(env, keys) {
  return keys.some((key) => {
    const value = env[key];
    return typeof value === 'string' ? value.trim().length > 0 : value !== undefined;
  });
}

function formatIssues(error) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'database';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

function parseMysql(data, env, connectTimeoutMs, startupPolicy) {
  if (!hasAny(env, MYSQL_KEYS)) {
    return null;
  }

  const missing = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE'].filter(
    (key) => data[key] === undefined,
  );

  if (startupPolicy === 'required' && data.MYSQL_PASSWORD === undefined) {
    missing.push('MYSQL_PASSWORD');
  }

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Incomplete MySQL configuration; missing: ${missing.join(', ')}`,
    );
  }

  return {
    host: data.MYSQL_HOST,
    port: data.MYSQL_PORT,
    user: data.MYSQL_USER,
    password: data.MYSQL_PASSWORD ?? '',
    database: data.MYSQL_DATABASE,
    connectionLimit: data.MYSQL_CONNECTION_LIMIT,
    connectTimeout: data.MYSQL_CONNECT_TIMEOUT ?? connectTimeoutMs,
    ssl: data.MYSQL_SSL ?? false,
  };
}

function parseMongodb(data, env, connectTimeoutMs) {
  if (!hasAny(env, MONGODB_KEYS)) {
    return null;
  }

  const missing = ['MONGODB_URI', 'MONGODB_DATABASE'].filter(
    (key) => data[key] === undefined,
  );

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Incomplete MongoDB configuration; missing: ${missing.join(', ')}`,
    );
  }

  if (!/^mongodb(?:\+srv)?:\/\/\S+$/i.test(data.MONGODB_URI)) {
    throw new ConfigurationError(
      'MONGODB_URI must use the mongodb:// or mongodb+srv:// scheme',
    );
  }

  return {
    uri: data.MONGODB_URI,
    database: data.MONGODB_DATABASE,
    maxPoolSize: data.MONGODB_MAX_POOL_SIZE,
    serverSelectionTimeout: data.MONGODB_SERVER_SELECTION_TIMEOUT ?? connectTimeoutMs,
  };
}

function parseRedis(data, env, connectTimeoutMs) {
  if (!hasAny(env, REDIS_KEYS)) {
    return null;
  }

  if (data.REDIS_URL === undefined) {
    throw new ConfigurationError('Incomplete Redis configuration; missing: REDIS_URL');
  }

  if (!/^rediss?:\/\/\S+$/i.test(data.REDIS_URL)) {
    throw new ConfigurationError('REDIS_URL must use the redis:// or rediss:// scheme');
  }

  return {
    url: data.REDIS_URL,
    connectTimeout: data.REDIS_CONNECT_TIMEOUT ?? connectTimeoutMs,
    maxRetries: data.REDIS_MAX_RETRIES,
  };
}

/**
 * Validates and normalizes database configuration.
 *
 * In `optional` mode, incomplete or missing database configuration is allowed.
 * In `required` mode, all three database dependencies must be fully configured.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ isProduction?: boolean }} [options]
 * @returns {Readonly<object>}
 */
export function parseDatabaseConfig(env = process.env, { isProduction = false } = {}) {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    throw new ConfigurationError(
      `Invalid database configuration: ${formatIssues(result.error)}`,
    );
  }

  const data = result.data;
  const startupPolicy =
    data.DATABASE_STARTUP_POLICY ?? (isProduction ? 'required' : 'optional');

  if (isProduction && startupPolicy !== 'required') {
    throw new ConfigurationError(
      'DATABASE_STARTUP_POLICY must be "required" in production',
    );
  }

  const connectTimeoutMs = data.DATABASE_CONNECT_TIMEOUT;
  const mysql = parseMysql(data, env, connectTimeoutMs, startupPolicy);
  const mongodb = parseMongodb(data, env, connectTimeoutMs);
  const redis = parseRedis(data, env, connectTimeoutMs);

  if (startupPolicy === 'required') {
    const missingDependencies = DATABASE_DEPENDENCY_NAMES.filter(
      (name) => ({ mysql, mongodb, redis })[name] === null,
    );

    if (missingDependencies.length > 0) {
      throw new ConfigurationError(
        `DATABASE_STARTUP_POLICY=required requires configured dependencies: ${missingDependencies.join(', ')}`,
      );
    }
  }

  return {
    startupPolicy,
    connectTimeoutMs,
    requiredDependencies:
      startupPolicy === 'required' ? [...DATABASE_DEPENDENCY_NAMES] : [],
    optionalDependencies:
      startupPolicy === 'optional' ? [...DATABASE_DEPENDENCY_NAMES] : [],
    mysql,
    mongodb,
    redis,
  };
}
