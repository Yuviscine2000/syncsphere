import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { API_BASE_URL } from '../config/api.config';
import {
  CSRF_HEADER_NAME,
  CSRF_STORAGE_KEY,
} from '../constants/auth.constants';
import { csrfInterceptor } from '../interceptors/csrf.interceptor';
import {
  TEST_SESSION,
  authEnvelope,
} from '../../../testing/auth-test-helpers';
import { AuthService } from './auth.service';
import { AuthSessionStore } from './auth-session.store';

const API_BASE_URL_VALUE = 'http://test.local/api/v1';
const CSRF_COOKIE = 'syncsphere_csrf';

function clearCsrfCookie(): void {
  document.cookie = `${CSRF_COOKIE}=; Max-Age=0; Path=/`;
}

describe('AuthSessionStore CSRF bootstrap', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearCsrfCookie();
  });

  afterEach(() => {
    sessionStorage.clear();
    clearCsrfCookie();
  });

  function configureStore(): void {
    TestBed.configureTestingModule({});
  }

  it('reads the readable CSRF cookie during store initialization', () => {
    document.cookie = `${CSRF_COOKIE}=cookie-csrf-token; Path=/`;
    configureStore();

    const store = TestBed.inject(AuthSessionStore);

    expect(store.csrfToken()).toBe('cookie-csrf-token');
  });

  it('prefers the cookie over a stale sessionStorage copy', () => {
    document.cookie = `${CSRF_COOKIE}=fresh-cookie-token; Path=/`;
    sessionStorage.setItem(CSRF_STORAGE_KEY, 'stale-storage-token');
    configureStore();

    const store = TestBed.inject(AuthSessionStore);

    expect(store.csrfToken()).toBe('fresh-cookie-token');
  });

  it('falls back to sessionStorage when the cookie is unavailable', () => {
    sessionStorage.setItem(CSRF_STORAGE_KEY, 'storage-fallback-token');
    configureStore();

    const store = TestBed.inject(AuthSessionStore);

    expect(store.csrfToken()).toBe('storage-fallback-token');
  });

  it('has no CSRF token when neither cookie nor storage is available', () => {
    configureStore();

    const store = TestBed.inject(AuthSessionStore);

    expect(store.csrfToken()).toBeNull();
  });

  it('restores a session after sessionStorage is cleared using the cookie', async () => {
    document.cookie = `${CSRF_COOKIE}=startup-cookie-token; Path=/`;
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([csrfInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API_BASE_URL_VALUE },
      ],
    });

    const service = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);

    const restore = service.restoreSession();
    const request = http.expectOne(`${API_BASE_URL_VALUE}/auth/refresh`);

    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get(CSRF_HEADER_NAME)).toBe(
      'startup-cookie-token',
    );
    expect(sessionStorage.getItem(CSRF_STORAGE_KEY)).toBeNull();

    request.flush(authEnvelope(TEST_SESSION));

    await expect(restore).resolves.toBe(true);
    expect(service.isAuthenticated()).toBe(true);
    expect(sessionStorage.getItem(CSRF_STORAGE_KEY)).toBe(
      TEST_SESSION.csrfToken,
    );
    http.verify();
  });
});
