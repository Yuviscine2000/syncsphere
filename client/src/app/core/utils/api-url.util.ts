import { AUTH_API_PATHS } from '../constants/auth.constants';

const TOKENLESS_AUTH_PATHS = new Set<string>([
  AUTH_API_PATHS.login,
  AUTH_API_PATHS.register,
  AUTH_API_PATHS.refresh,
]);

const NO_REFRESH_AUTH_PATHS = new Set<string>([
  AUTH_API_PATHS.login,
  AUTH_API_PATHS.register,
  AUTH_API_PATHS.refresh,
  AUTH_API_PATHS.logout,
]);

export function isApiRequest(url: string, apiBaseUrl: string): boolean {
  return (
    url.startsWith(apiBaseUrl.replace(/\/$/, '')) ||
    url.startsWith('/api/') ||
    url.includes('/api/v1/')
  );
}

export function isTokenlessAuthRequest(url: string): boolean {
  return [...TOKENLESS_AUTH_PATHS].some((path) => url.includes(path));
}

export function isNoRefreshAuthRequest(url: string): boolean {
  return [...NO_REFRESH_AUTH_PATHS].some((path) => url.includes(path));
}

export function isCsrfProtectedRequest(url: string): boolean {
  return (
    url.includes(AUTH_API_PATHS.refresh) || url.includes(AUTH_API_PATHS.logout)
  );
}
