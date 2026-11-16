import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { API_BASE_URL } from '../config/api.config';
import {
  CSRF_HEADER_NAME,
  CSRF_STORAGE_KEY,
} from '../constants/auth.constants';
import { AuthService } from '../services/auth.service';
import { AuthSessionStore } from '../services/auth-session.store';
import {
  TEST_SESSION,
  authEnvelope,
  authErrorEnvelope,
} from '../../../testing/auth-test-helpers';
import { authTokenInterceptor } from './auth-token.interceptor';
import { csrfInterceptor } from './csrf.interceptor';
import { refreshInterceptor } from './refresh.interceptor';

const API_BASE_URL_VALUE = 'http://test.local/api/v1';
const REFRESH_URL = `${API_BASE_URL_VALUE}/auth/refresh`;
const PROTECTED_URL = `${API_BASE_URL_VALUE}/dashboard`;

function unauthorizedBody(): object {
  return authErrorEnvelope('ACCESS_TOKEN_EXPIRED', 'Access token expired.');
}

describe('auth interceptors', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([
            csrfInterceptor,
            authTokenInterceptor,
            refreshInterceptor,
          ]),
        ),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: API_BASE_URL_VALUE },
      ],
    });

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('attaches the bearer token and credentials to API requests', () => {
    const store = TestBed.inject(AuthSessionStore);
    const client = TestBed.inject(HttpClient);
    store.setSession(TEST_SESSION);

    client.get(PROTECTED_URL).subscribe();

    const request = http.expectOne(PROTECTED_URL);
    expect(request.request.headers.get('Authorization')).toBe(
      `Bearer ${TEST_SESSION.accessToken}`,
    );
    expect(request.request.withCredentials).toBe(true);
    request.flush(authEnvelope({ ok: true }));
  });

  it('does not attach the bearer token to login, register or refresh', () => {
    const store = TestBed.inject(AuthSessionStore);
    const client = TestBed.inject(HttpClient);
    store.setSession(TEST_SESSION);

    for (const path of ['login', 'register', 'refresh']) {
      client.post(`${API_BASE_URL_VALUE}/auth/${path}`, {}).subscribe();
      const request = http.expectOne(`${API_BASE_URL_VALUE}/auth/${path}`);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.withCredentials).toBe(true);
      request.flush(authEnvelope({}));
    }
  });

  it('does not modify requests outside the API', () => {
    const store = TestBed.inject(AuthSessionStore);
    const client = TestBed.inject(HttpClient);
    store.setSession(TEST_SESSION);

    client.get('https://cdn.example.com/asset.json').subscribe();

    const request = http.expectOne('https://cdn.example.com/asset.json');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.withCredentials).toBe(false);
    request.flush({});
  });

  it('adds the CSRF header only to refresh and logout requests', () => {
    const store = TestBed.inject(AuthSessionStore);
    const client = TestBed.inject(HttpClient);
    store.setSession(TEST_SESSION);

    client.post(REFRESH_URL, {}).subscribe();
    const refresh = http.expectOne(REFRESH_URL);
    expect(refresh.request.headers.get(CSRF_HEADER_NAME)).toBe(
      TEST_SESSION.csrfToken,
    );
    refresh.flush(authEnvelope(TEST_SESSION));

    client.post(`${API_BASE_URL_VALUE}/auth/logout`, {}).subscribe();
    const logout = http.expectOne(`${API_BASE_URL_VALUE}/auth/logout`);
    expect(logout.request.headers.get(CSRF_HEADER_NAME)).toBe(
      TEST_SESSION.csrfToken,
    );
    logout.flush(authEnvelope({ loggedOut: true, revoked: true }));

    client.post(`${API_BASE_URL_VALUE}/auth/login`, {}).subscribe();
    const login = http.expectOne(`${API_BASE_URL_VALUE}/auth/login`);
    expect(login.request.headers.has(CSRF_HEADER_NAME)).toBe(false);
    login.flush(authEnvelope(TEST_SESSION));
  });

  it('refreshes an expired token and retries the request once', () => {
    const store = TestBed.inject(AuthSessionStore);
    const client = TestBed.inject(HttpClient);
    store.setSession(TEST_SESSION);
    const next = vi.fn();
    const error = vi.fn();

    client.get(PROTECTED_URL).subscribe({ next, error });

    const initial = http.expectOne(PROTECTED_URL);
    expect(initial.request.headers.get('Authorization')).toBe(
      `Bearer ${TEST_SESSION.accessToken}`,
    );
    initial.flush(unauthorizedBody(), {
      status: 401,
      statusText: 'Unauthorized',
    });

    const refresh = http.expectOne(REFRESH_URL);
    expect(refresh.request.headers.get(CSRF_HEADER_NAME)).toBe(
      TEST_SESSION.csrfToken,
    );
    refresh.flush(
      authEnvelope({
        ...TEST_SESSION,
        accessToken: 'new-access-token',
        csrfToken: 'new-csrf-token',
      }),
    );

    const retry = http.expectOne(PROTECTED_URL);
    expect(retry.request.headers.get('Authorization')).toBe(
      'Bearer new-access-token',
    );
    retry.flush(authEnvelope({ ok: true }));

    expect(next).toHaveBeenCalledWith(authEnvelope({ ok: true }));
    expect(error).not.toHaveBeenCalled();
    expect(store.accessToken()).toBe('new-access-token');
    expect(sessionStorage.getItem(CSRF_STORAGE_KEY)).toBe('new-csrf-token');
  });

  it('coalesces concurrent 401 responses into one refresh request', () => {
    const store = TestBed.inject(AuthSessionStore);
    const client = TestBed.inject(HttpClient);
    store.setSession(TEST_SESSION);

    client.get(PROTECTED_URL).subscribe();
    client.get(PROTECTED_URL).subscribe();

    const initialRequests = http.match(PROTECTED_URL);
    expect(initialRequests.length).toBe(2);

    initialRequests[0].flush(unauthorizedBody(), {
      status: 401,
      statusText: 'Unauthorized',
    });
    const refresh = http.expectOne(REFRESH_URL);
    initialRequests[1].flush(unauthorizedBody(), {
      status: 401,
      statusText: 'Unauthorized',
    });
    http.expectNone(REFRESH_URL);

    refresh.flush(
      authEnvelope({ ...TEST_SESSION, accessToken: 'shared-new-token' }),
    );

    const retries = http.match(PROTECTED_URL);
    expect(retries.length).toBe(2);
    for (const retry of retries) {
      expect(retry.request.headers.get('Authorization')).toBe(
        'Bearer shared-new-token',
      );
      retry.flush(authEnvelope({ ok: true }));
    }
  });

  it('clears the session and redirects to login when refresh fails', () => {
    const store = TestBed.inject(AuthSessionStore);
    const client = TestBed.inject(HttpClient);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    store.setSession(TEST_SESSION);
    const error = vi.fn();

    client.get(PROTECTED_URL).subscribe({ error });

    const initial = http.expectOne(PROTECTED_URL);
    initial.flush(unauthorizedBody(), {
      status: 401,
      statusText: 'Unauthorized',
    });

    const refresh = http.expectOne(REFRESH_URL);
    refresh.flush(
      authErrorEnvelope('REFRESH_TOKEN_INVALID', 'Refresh rejected.'),
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(error).toHaveBeenCalledOnce();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.csrfToken()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { returnUrl: '/' },
    });
  });

  it('does not refresh on non-401 errors', () => {
    const store = TestBed.inject(AuthSessionStore);
    const client = TestBed.inject(HttpClient);
    store.setSession(TEST_SESSION);
    const error = vi.fn();

    client.get(PROTECTED_URL).subscribe({ error });

    const request = http.expectOne(PROTECTED_URL);
    request.flush(authErrorEnvelope('INTERNAL_ERROR', 'Server error.'), {
      status: 500,
      statusText: 'Server Error',
    });

    http.expectNone(REFRESH_URL);
    expect(error).toHaveBeenCalledOnce();
    expect(store.isAuthenticated()).toBe(true);
  });

  it('does not refresh login or logout requests', () => {
    const store = TestBed.inject(AuthSessionStore);
    const client = TestBed.inject(HttpClient);
    const authService = TestBed.inject(AuthService);
    store.setSession(TEST_SESSION);
    const loginError = vi.fn();

    authService
      .login({ email: 'jane@example.com', password: 'wrong' })
      .subscribe({ error: loginError });

    const login = http.expectOne(`${API_BASE_URL_VALUE}/auth/login`);
    login.flush(unauthorizedBody(), {
      status: 401,
      statusText: 'Unauthorized',
    });

    http.expectNone(REFRESH_URL);
    expect(loginError).toHaveBeenCalledOnce();
  });

  it('uses the latest token when the session was refreshed by another request', () => {
    const store = TestBed.inject(AuthSessionStore);
    const client = TestBed.inject(HttpClient);
    store.setSession(TEST_SESSION);

    client.get(PROTECTED_URL).subscribe();

    const initial = http.expectOne(PROTECTED_URL);
    store.setSession({ ...TEST_SESSION, accessToken: 'already-refreshed' });
    initial.flush(unauthorizedBody(), {
      status: 401,
      statusText: 'Unauthorized',
    });

    http.expectNone(REFRESH_URL);
    const retry = http.expectOne(PROTECTED_URL);
    expect(retry.request.headers.get('Authorization')).toBe(
      'Bearer already-refreshed',
    );
    retry.flush(authEnvelope({ ok: true }));
  });
});
