import { parseCookie } from 'cookie';

function baseCookieOptions(config) {
  return {
    secure: config.auth.cookie.secure,
    sameSite: config.auth.cookie.sameSite,
    path: config.auth.cookie.path,
    ...(config.auth.cookie.domain === undefined
      ? {}
      : { domain: config.auth.cookie.domain }),
  };
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
 * Reads the CSRF cookie used for the double-submit check.
 * @param {import('express').Request} request
 * @param {object} config
 * @returns {string|undefined}
 */
export function readCsrfCookie(request, config) {
  const cookies = parseCookie(request.headers.cookie ?? '');
  return cookies[config.auth.csrf.cookieName];
}

/**
 * Sets the HttpOnly refresh cookie and the readable signed CSRF cookie.
 * @param {import('express').Response} response
 * @param {object} config
 * @param {{ refreshToken: string, csrfToken: string }} tokens
 */
export function setAuthCookies(response, config, { refreshToken, csrfToken }) {
  const maxAge = config.auth.refreshToken.ttlSeconds * 1_000;
  const base = baseCookieOptions(config);

  response.cookie(config.auth.cookie.refreshName, refreshToken, {
    ...base,
    httpOnly: true,
    maxAge,
  });

  response.cookie(config.auth.csrf.cookieName, csrfToken, {
    ...base,
    httpOnly: false,
    maxAge,
  });
}

/**
 * Clears both authentication cookies using the same path/domain attributes.
 * @param {import('express').Response} response
 * @param {object} config
 */
export function clearAuthCookies(response, config) {
  const base = baseCookieOptions(config);

  response.clearCookie(config.auth.cookie.refreshName, {
    ...base,
    httpOnly: true,
  });
  response.clearCookie(config.auth.csrf.cookieName, {
    ...base,
    httpOnly: false,
  });
}
