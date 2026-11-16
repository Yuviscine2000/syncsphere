export const AUTH_API_PATHS = {
  login: '/auth/login',
  register: '/auth/register',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  me: '/auth/me',
  sessions: '/auth/sessions',
} as const;

export const AUTH_PERMISSIONS = {
  adminAccess: 'admin:access',
} as const;

export const CSRF_HEADER_NAME = 'X-CSRF-Token';
export const CSRF_STORAGE_KEY = 'syncsphere.csrf';
export const AUTH_PASSWORD_MIN_LENGTH = 12;
export const DEFAULT_AUTHENTICATED_URL = '/dashboard';
export const AUTH_LOGIN_URL = '/auth/login';
