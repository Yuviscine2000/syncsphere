import { loadConfig } from '../../../src/config/index.js';
import { createLogger } from '../../../src/utils/logger.js';
import { TEST_ENV } from '../../helpers/test-app.js';

export const INTEGRATION_DEFAULTS = Object.freeze({
  ...TEST_ENV,
  DATABASE_STARTUP_POLICY: 'required',
  DATABASE_CONNECT_TIMEOUT: '5000',
  MYSQL_HOST: '127.0.0.1',
  MYSQL_PORT: '3306',
  MYSQL_USER: 'syncsphere',
  MYSQL_PASSWORD: 'change-me',
  MYSQL_DATABASE: 'syncsphere',
  MYSQL_CONNECTION_LIMIT: '5',
  MYSQL_CONNECT_TIMEOUT: '5000',
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  MONGODB_DATABASE: 'syncsphere',
  MONGODB_MAX_POOL_SIZE: '5',
  MONGODB_SERVER_SELECTION_TIMEOUT: '5000',
  REDIS_URL: 'redis://127.0.0.1:6379',
  REDIS_CONNECT_TIMEOUT: '5000',
  REDIS_MAX_RETRIES: '3',
});

/**
 * Builds integration-test environment values from the shell, falling back to
 * local development defaults that match infrastructure/docker-compose.yml.
 * @param {Record<string, string>} [overrides]
 * @returns {Record<string, string>}
 */
export function integrationEnvironment(overrides = {}) {
  const environment = { ...INTEGRATION_DEFAULTS };

  for (const key of Object.keys(INTEGRATION_DEFAULTS)) {
    const value = process.env[key];

    if (typeof value === 'string' && value.length > 0) {
      environment[key] = value;
    }
  }

  return { ...environment, ...overrides };
}

/**
 * @param {Record<string, string>} [overrides]
 * @returns {Readonly<object>}
 */
export function createIntegrationConfig(overrides = {}) {
  return loadConfig(integrationEnvironment(overrides));
}

export function createIntegrationLogger() {
  return createLogger({ logLevel: 'silent', nodeEnv: 'test' });
}
