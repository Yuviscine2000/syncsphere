import { parseCookie } from 'cookie';
import { LEGACY_AUTH_CSRF_COOKIE_PATH } from '../../constants/auth.constants.js';

function baseCookieOptions(config, path) {
  return {
    secure: config.auth.cookie.secure,
    sameSite: config.auth.cookie.sameSite,
    path,
    ...(config.auth.cookie.domain === undefined
      ? {}
      : { domain: config.auth.cookie.domain }),
  };
}

function readCookieValues(request, name) {
  const header = request.headers.cookie;

  if (typeof header !== 'string' || header.length === 0) {
    return [];
  }

  const values = [];

  for (const part of header.split(';')) {
    const cookies = parseCookie(part.trim());

    if (cookies[name] !== undefined) {
      values.push(cookies[name]);
    }
  }

  return values;
}

function clearCsrfCookieAtPath(response, config, path) {
  response.clearCookie(config.auth.csrf.cookieName, {
    ...baseCookieOptions(config, path),
    httpOnly: false,
  });
}

function clearLegacyCsrfCookies(response, config) {
  const paths = new Set([
    config.auth.cookie.path,
    LEGACY_AUTH_CSRF_COOKIE_PATH,
  ]);

  for (const path of paths) {
    if (path !== config.auth.csrf.path) {
      clearCsrfCookieAtPath(response, config, path);
    }
  }
}

/**
 * Reads the opaque refresh token from the request cookie header.
 * @param {import('express').Request} request
 * @param {object} config
 * @returns {string|undefined}
 */
export function readRefreshToken(request, config) {
  const cookies = parseCookie(request.headers.cookie ?? '');
  return cookies[config.auth.cookie.refreshName];
}

/**
 * Reads every CSRF cookie value so duplicate names cannot hide the current
 * root-path token behind a stale legacy-path token.
 * @param {import('express').Request} request
 * @param {object} config
 * @returns {string[]}
 */
export function readCsrfCookieValues(request, config) {
  return readCookieValues(request, config.auth.csrf.cookieName);
}

/**
 * Sets the HttpOnly refresh cookie and the readable signed CSRF cookie.
 * @param {import('express').Response} response
 * @param {object} config
 * @param {{ refreshToken: string, csrfToken: string }} tokens
 */
export function setAuthCookies(response, config, { refreshToken, csrfToken }) {
  const maxAge = config.auth.refreshToken.ttlSeconds * 1_000;

  response.cookie(config.auth.cookie.refreshName, refreshToken, {
    ...baseCookieOptions(config, config.auth.cookie.path),
    httpOnly: true,
    maxAge,
  });

  response.cookie(config.auth.csrf.cookieName, csrfToken, {
    ...baseCookieOptions(config, config.auth.csrf.path),
    httpOnly: false,
    maxAge,
  });

  clearLegacyCsrfCookies(response, config);
}

/**
 * Clears both authentication cookies using each cookie's configured path and domain.
 * @param {import('express').Response} response
 * @param {object} config
 */
export function clearAuthCookies(response, config) {
  response.clearCookie(config.auth.cookie.refreshName, {
    ...baseCookieOptions(config, config.auth.cookie.path),
    httpOnly: true,
  });
  clearCsrfCookieAtPath(response, config, config.auth.csrf.path);
  clearLegacyCsrfCookies(response, config);
}
