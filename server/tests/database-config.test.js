import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  loadConfig,
  parseDatabaseConfig,
} from '../src/config/index.js';
import {
  DATABASE_DEPENDENCY_NAMES,
  DEFAULT_DATABASE_CONNECT_TIMEOUT_MS,
  DEFAULT_MONGODB_MAX_POOL_SIZE,
  DEFAULT_MYSQL_CONNECTION_LIMIT,
  DEFAULT_MYSQL_PORT,
  DEFAULT_REDIS_MAX_RETRIES,
} from '../src/constants/database.constants.js';
import { TEST_ENV } from './helpers/test-app.js';

const FULL_DATABASE_ENV = Object.freeze({
  MYSQL_HOST: 'localhost',
  MYSQL_USER: 'syncsphere',
  MYSQL_PASSWORD: 'mysql-secret',
  MYSQL_DATABASE: 'syncsphere',
  MONGODB_URI: 'mongodb://localhost:27017',
  MONGODB_DATABASE: 'syncsphere',
  REDIS_URL: 'redis://localhost:6379',
});

describe('database configuration', () => {
  it('allows an unconfigured optional database setup outside production', () => {
    const database = parseDatabaseConfig({});

    expect(database.startupPolicy).toBe('optional');
    expect(database.requiredDependencies).toEqual([]);
    expect(database.optionalDependencies).toEqual([...DATABASE_DEPENDENCY_NAMES]);
    expect(database.mysql).toBeNull();
    expect(database.mongodb).toBeNull();
    expect(database.redis).toBeNull();
  });

  it('normalizes a fully configured required database setup', () => {
    const database = parseDatabaseConfig(
      {
        ...FULL_DATABASE_ENV,
        DATABASE_STARTUP_POLICY: 'required',
      },
      { isProduction: true },
    );

    expect(database.startupPolicy).toBe('required');
    expect(database.requiredDependencies).toEqual([...DATABASE_DEPENDENCY_NAMES]);
    expect(database.optionalDependencies).toEqual([]);
    expect(database.connectTimeoutMs).toBe(DEFAULT_DATABASE_CONNECT_TIMEOUT_MS);
    expect(database.mysql).toEqual({
      host: 'localhost',
      port: DEFAULT_MYSQL_PORT,
      user: 'syncsphere',
      password: 'mysql-secret',
      database: 'syncsphere',
      connectionLimit: DEFAULT_MYSQL_CONNECTION_LIMIT,
      connectTimeout: DEFAULT_DATABASE_CONNECT_TIMEOUT_MS,
      ssl: false,
    });
    expect(database.mongodb).toEqual({
      uri: 'mongodb://localhost:27017',
      database: 'syncsphere',
      maxPoolSize: DEFAULT_MONGODB_MAX_POOL_SIZE,
      serverSelectionTimeout: DEFAULT_DATABASE_CONNECT_TIMEOUT_MS,
    });
    expect(database.redis).toEqual({
      url: 'redis://localhost:6379',
      connectTimeout: DEFAULT_DATABASE_CONNECT_TIMEOUT_MS,
      maxRetries: DEFAULT_REDIS_MAX_RETRIES,
    });
  });

  it('defaults production to the required startup policy', () => {
    expect(() => parseDatabaseConfig({}, { isProduction: true })).toThrow(
      ConfigurationError,
    );
  });

  it('rejects optional startup policy in production', () => {
    expect(() =>
      parseDatabaseConfig(
        { ...FULL_DATABASE_ENV, DATABASE_STARTUP_POLICY: 'optional' },
        { isProduction: true },
      ),
    ).toThrow('DATABASE_STARTUP_POLICY must be "required" in production');
  });

  it('rejects missing dependencies under the required policy', () => {
    expect(() =>
      parseDatabaseConfig(
        {
          DATABASE_STARTUP_POLICY: 'required',
          MYSQL_HOST: 'localhost',
          MYSQL_USER: 'syncsphere',
          MYSQL_PASSWORD: 'mysql-secret',
          MYSQL_DATABASE: 'syncsphere',
        },
        { isProduction: true },
      ),
    ).toThrow('requires configured dependencies: mongodb, redis');
  });

  it('rejects partial dependency groups even in optional mode', () => {
    expect(() => parseDatabaseConfig({ MYSQL_HOST: 'localhost' })).toThrow(
      'Incomplete MySQL configuration',
    );
    expect(() => parseDatabaseConfig({ MONGODB_URI: 'mongodb://localhost:27017' })).toThrow(
      'Incomplete MongoDB configuration',
    );
    expect(() => parseDatabaseConfig({ REDIS_CONNECT_TIMEOUT: '5000' })).toThrow(
      'Incomplete Redis configuration',
    );
  });

  it('requires a MySQL password when the dependency is required', () => {
    const env = { ...FULL_DATABASE_ENV, DATABASE_STARTUP_POLICY: 'required' };
    delete env.MYSQL_PASSWORD;

    expect(() => parseDatabaseConfig(env)).toThrow(
      'Incomplete MySQL configuration; missing: MYSQL_PASSWORD',
    );
  });

  it.each([
    ['MONGODB_URI', 'http://localhost:27017'],
    ['REDIS_URL', 'http://localhost:6379'],
  ])('rejects unsupported %s schemes', (key, value) => {
    expect(() =>
      parseDatabaseConfig({ ...FULL_DATABASE_ENV, [key]: value }),
    ).toThrow(ConfigurationError);
  });

  it.each([
    ['MYSQL_PORT', '0'],
    ['MYSQL_PORT', '70000'],
    ['MYSQL_CONNECTION_LIMIT', '0'],
    ['MONGODB_MAX_POOL_SIZE', '1001'],
    ['REDIS_MAX_RETRIES', '51'],
    ['DATABASE_CONNECT_TIMEOUT', '999'],
    ['MYSQL_CONNECT_TIMEOUT', '60001'],
    ['MYSQL_SSL', 'yes'],
  ])('rejects invalid %s values', (key, value) => {
    expect(() =>
      parseDatabaseConfig({ ...FULL_DATABASE_ENV, [key]: value }),
    ).toThrow(ConfigurationError);
  });

  it('integrates database configuration into loadConfig', () => {
    const config = loadConfig({
      ...TEST_ENV,
      ...FULL_DATABASE_ENV,
      DATABASE_STARTUP_POLICY: 'optional',
    });

    expect(config.database.startupPolicy).toBe('optional');
    expect(config.database.mysql.host).toBe('localhost');
    expect(config.database.mongodb.database).toBe('syncsphere');
    expect(config.database.redis.url).toBe('redis://localhost:6379');
  });
});
