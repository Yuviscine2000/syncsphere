export const AUTH_ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  USER: 'USER',
});

export const AUTH_PERMISSIONS = Object.freeze({
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  DASHBOARD_READ: 'dashboard:read',
  ADMIN_ACCESS: 'admin:access',
});

export const AUTH_ROLE_NAMES = Object.freeze(Object.values(AUTH_ROLES));
export const AUTH_PERMISSION_NAMES = Object.freeze(Object.values(AUTH_PERMISSIONS));

export const DEFAULT_ROLE = AUTH_ROLES.USER;

export const ACCESS_TOKEN_TYPE = 'access';
export const ACCESS_TOKEN_HEADER_TYPE = 'at+jwt';
export const ACCESS_TOKEN_ALGORITHM = 'HS256';
export const ACCESS_TOKEN_BEARER_PREFIX = 'Bearer';

export const CSRF_HEADER_NAME = 'X-CSRF-Token';

export const AUTH_AUDIT_EVENTS = Object.freeze({
  USER_REGISTERED: 'USER_REGISTERED',
  LOGIN_SUCCEEDED: 'LOGIN_SUCCEEDED',
  LOGIN_FAILED: 'LOGIN_FAILED',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  USER_LOGGED_OUT: 'USER_LOGGED_OUT',
  SESSION_REVOKED: 'SESSION_REVOKED',
  AUTHORIZATION_DENIED: 'AUTHORIZATION_DENIED',
});

export const AUTH_AUDIT_OUTCOMES = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
});

export const AUTH_CACHE_KEYS = Object.freeze({
  REVOKED_SESSION_PREFIX: 'auth:revoked-session:',
});

export const AUTH_USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  DISABLED: 'disabled',
});

export const DEFAULT_AUTH_ACCESS_TOKEN_ISSUER = 'syncsphere-api';
export const DEFAULT_AUTH_ACCESS_TOKEN_AUDIENCE = 'syncsphere-web';
export const DEFAULT_AUTH_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const DEFAULT_AUTH_REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const DEFAULT_AUTH_ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS = 5;
export const DEFAULT_AUTH_REFRESH_COOKIE_NAME = 'syncsphere_refresh';
export const DEFAULT_AUTH_CSRF_COOKIE_NAME = 'syncsphere_csrf';
export const DEFAULT_AUTH_COOKIE_PATH = '/api/v1/auth';
export const DEFAULT_AUTH_CSRF_COOKIE_PATH = '/';
export const LEGACY_AUTH_CSRF_COOKIE_PATH = '/api/v1/auth';
export const DEFAULT_AUTH_COOKIE_SAME_SITE = 'strict';
export const DEFAULT_AUTH_PASSWORD_MIN_LENGTH = 12;
export const DEFAULT_AUTH_PASSWORD_MAX_LENGTH = 128;
export const DEFAULT_AUTH_ARGON2_MEMORY_KIB = 19_456;
export const DEFAULT_AUTH_ARGON2_TIME_COST = 2;
export const DEFAULT_AUTH_ARGON2_PARALLELISM = 1;
export const DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const DEFAULT_AUTH_LOGIN_RATE_LIMIT_MAX = 10;
export const DEFAULT_AUTH_REGISTER_RATE_LIMIT_MAX = 5;
export const DEFAULT_AUTH_REFRESH_RATE_LIMIT_MAX = 60;

export const AUTH_ACCESS_TOKEN_TTL_MIN_SECONDS = 60;
export const AUTH_ACCESS_TOKEN_TTL_MAX_SECONDS = 3_600;
export const AUTH_REFRESH_TOKEN_TTL_MIN_SECONDS = 300;
export const AUTH_REFRESH_TOKEN_TTL_MAX_SECONDS = 2_592_000;
export const AUTH_CLOCK_TOLERANCE_MAX_SECONDS = 30;
export const AUTH_PASSWORD_MIN_LENGTH_LOWER_BOUND = 8;
export const AUTH_PASSWORD_MAX_LENGTH_UPPER_BOUND = 256;
export const AUTH_ARGON2_MEMORY_MIN_KIB = 8_192;
export const AUTH_ARGON2_MEMORY_MAX_KIB = 262_144;
export const AUTH_ARGON2_TIME_COST_MIN = 2;
export const AUTH_ARGON2_TIME_COST_MAX = 10;
export const AUTH_ARGON2_PARALLELISM_MIN = 1;
export const AUTH_ARGON2_PARALLELISM_MAX = 4;
export const AUTH_SECRET_MIN_LENGTH = 32;
export const AUTH_RATE_LIMIT_WINDOW_MIN_MS = 1_000;
export const AUTH_RATE_LIMIT_WINDOW_MAX_MS = 86_400_000;
export const AUTH_RATE_LIMIT_MAX_UPPER_BOUND = 1_000;
