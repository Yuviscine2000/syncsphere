import { HTTP_STATUS } from '../../responses/response-codes.js';
import { sendSuccess } from '../../responses/response-builder.js';
import {
  clearAuthCookies,
  readRefreshToken,
  setAuthCookies,
} from './auth.cookies.js';

function getContext(request) {
  return {
    requestId: request.requestId,
    correlationId: request.correlationId,
  };
}

function getAuthService(request) {
  return request.app.locals.authService;
}

/**
 * Creates a new account with the default USER role.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 */
export async function registerController(request, response) {
  const authService = getAuthService(request);
  const result = await authService.register(request.validated.body, getContext(request));

  sendSuccess(response, result, HTTP_STATUS.CREATED);
}

/**
 * Authenticates credentials, creates a refresh session, and issues tokens.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 */
export async function loginController(request, response) {
  const authService = getAuthService(request);
  const config = request.app.locals.appConfig;
  const result = await authService.login(request.validated.body, getContext(request));
  const { refreshToken, ...body } = result;

  setAuthCookies(response, config, {
    refreshToken,
    csrfToken: result.csrfToken,
  });
  sendSuccess(response, body);
}

/**
 * Rotates the refresh token and issues a new access token.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 */
export async function refreshController(request, response) {
  const authService = getAuthService(request);
  const config = request.app.locals.appConfig;
  const result = await authService.refresh(
    {
      refreshToken: readRefreshToken(request, config),
      csrfToken: request.csrfToken,
    },
    getContext(request),
  );
  const { refreshToken, ...body } = result;

  setAuthCookies(response, config, {
    refreshToken,
    csrfToken: result.csrfToken,
  });
  sendSuccess(response, body);
}

/**
 * Revokes the refresh session identified by the cookie and clears auth cookies.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 */
export async function logoutController(request, response) {
  const authService = getAuthService(request);
  const config = request.app.locals.appConfig;
  const result = await authService.logout(
    {
      refreshToken: readRefreshToken(request, config),
      csrfToken: request.csrfToken,
    },
    getContext(request),
  );

  clearAuthCookies(response, config);
  sendSuccess(response, result);
}

/**
 * Returns the authenticated user's current roles and permissions.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 */
export async function meController(request, response) {
  const authService = getAuthService(request);
  const result = await authService.getCurrentUser({ userId: request.auth.userId });

  sendSuccess(response, result);
}

/**
 * Lists active refresh-session families for the authenticated user.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 */
export async function sessionsController(request, response) {
  const authService = getAuthService(request);
  const result = await authService.listSessions({
    userId: request.auth.userId,
    currentSessionId: request.auth.sessionId,
  });

  sendSuccess(response, result);
}

/**
 * Revokes one of the authenticated user's sessions without cross-user access.
 * @param {import('express').Request} request
 * @param {import('express').Response} response
 */
export async function revokeSessionController(request, response) {
  const authService = getAuthService(request);
  const config = request.app.locals.appConfig;
  const result = await authService.revokeSession(
    {
      userId: request.auth.userId,
      sessionId: request.validated.params.sessionId,
      currentSessionId: request.auth.sessionId,
    },
    getContext(request),
  );

  if (result.current) {
    clearAuthCookies(response, config);
  }

  sendSuccess(response, result);
}
