export const DATABASE_DEPENDENCY_NAMES = Object.freeze(['mysql', 'mongodb', 'redis']);

export const DATABASE_STARTUP_POLICIES = Object.freeze(['required', 'optional']);

export const DATABASE_STATUS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  NOT_INITIALIZED: 'not_initialized',
  INITIALIZING: 'initializing',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  UNAVAILABLE: 'unavailable',
  CLOSED: 'closed',
});

export const DEFAULT_DATABASE_CONNECT_TIMEOUT_MS = 10_000;
export const DEFAULT_MYSQL_PORT = 3306;
export const DEFAULT_MYSQL_CONNECTION_LIMIT = 10;
export const DEFAULT_MONGODB_MAX_POOL_SIZE = 10;
export const DEFAULT_REDIS_MAX_RETRIES = 5;

export const MIN_CONNECT_TIMEOUT_MS = 1_000;
export const MAX_CONNECT_TIMEOUT_MS = 60_000;
export const MIN_CONNECTION_LIMIT = 1;
export const MAX_CONNECTION_LIMIT = 1_000;
export const MIN_REDIS_RETRIES = 0;
export const MAX_REDIS_RETRIES = 50;
