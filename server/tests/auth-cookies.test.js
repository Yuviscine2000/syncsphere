import { describe, expect, it, vi } from 'vitest';
import {
  clearAuthCookies,
  readCsrfCookieValues,
  setAuthCookies,
} from '../src/modules/auth/auth.cookies.js';
import { createTestConfig } from './helpers/test-app.js';

function createResponseRecorder() {
  return {
    cookies: [],
    cleared: [],
    cookie: vi.fn(function cookie(name, value, options) {
      this.cookies.push({ name, value, options });
    }),
    clearCookie: vi.fn(function clearCookie(name, options) {
      this.cleared.push({ name, options });
    }),
  };
}

describe('authentication cookie handling', () => {
  it('reads every duplicate CSRF cookie value in header order', () => {
    const config = createTestConfig();
    const request = {
      headers: {
        cookie:
          'syncsphere_refresh=refresh-token; syncsphere_csrf=legacy-token; syncsphere_csrf=current-token; theme=dark',
      },
    };

    expect(readCsrfCookieValues(request, config)).toEqual([
      'legacy-token',
      'current-token',
    ]);
  });

  it('issues refresh and CSRF cookies with their separate paths and clears the legacy CSRF path', () => {
    const config = createTestConfig();
    const response = createResponseRecorder();

    setAuthCookies(response, config, {
      refreshToken: 'refresh-token',
      csrfToken: 'csrf-token',
    });

    expect(response.cookie).toHaveBeenCalledWith(
      'syncsphere_refresh',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api/v1/auth',
        sameSite: 'strict',
        secure: false,
      }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'syncsphere_csrf',
      'csrf-token',
      expect.objectContaining({
        httpOnly: false,
        path: '/',
        sameSite: 'strict',
        secure: false,
      }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'syncsphere_csrf',
      expect.objectContaining({
        httpOnly: false,
        path: '/api/v1/auth',
      }),
    );
  });

  it('clears legacy CSRF cookies at both the old default and a custom refresh path', () => {
    const config = createTestConfig({
      AUTH_CSRF_COOKIE_PATH: '/app',
      AUTH_REFRESH_COOKIE_PATH: '/custom/auth',
    });
    const response = createResponseRecorder();

    setAuthCookies(response, config, {
      refreshToken: 'refresh-token',
      csrfToken: 'csrf-token',
    });

    expect(response.cookie).toHaveBeenCalledWith(
      'syncsphere_csrf',
      'csrf-token',
      expect.objectContaining({ path: '/app' }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'syncsphere_csrf',
      expect.objectContaining({ path: '/custom/auth' }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'syncsphere_csrf',
      expect.objectContaining({ path: '/api/v1/auth' }),
    );
    expect(response.clearCookie).not.toHaveBeenCalledWith(
      'syncsphere_csrf',
      expect.objectContaining({ path: '/app' }),
    );
  });

  it('clears the refresh cookie and every current and legacy CSRF path on logout', () => {
    const config = createTestConfig();
    const response = createResponseRecorder();

    clearAuthCookies(response, config);

    expect(response.clearCookie).toHaveBeenCalledWith(
      'syncsphere_refresh',
      expect.objectContaining({
        httpOnly: true,
        path: '/api/v1/auth',
      }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'syncsphere_csrf',
      expect.objectContaining({
        httpOnly: false,
        path: '/',
      }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      'syncsphere_csrf',
      expect.objectContaining({
        httpOnly: false,
        path: '/api/v1/auth',
      }),
    );
  });

  it('preserves cookie security attributes while clearing legacy paths', () => {
    const config = createTestConfig({
      AUTH_REFRESH_COOKIE_SECURE: 'true',
      AUTH_REFRESH_COOKIE_SAME_SITE: 'none',
      AUTH_REFRESH_COOKIE_DOMAIN: 'example.com',
    });
    const response = createResponseRecorder();

    clearAuthCookies(response, config);

    for (const { options } of response.cleared) {
      expect(options).toEqual(
        expect.objectContaining({
          domain: 'example.com',
          sameSite: 'none',
          secure: true,
        }),
      );
    }
  });
});
