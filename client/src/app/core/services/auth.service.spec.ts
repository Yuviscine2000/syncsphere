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
import { CSRF_STORAGE_KEY } from '../constants/auth.constants';
import {
  TEST_SESSION,
  TEST_USER,
  authEnvelope,
  authErrorEnvelope,
} from '../../../testing/auth-test-helpers';
import { AuthService } from './auth.service';
import { AuthSessionStore } from './auth-session.store';

const API_BASE_URL_VALUE = 'http://test.local/api/v1';

describe('AuthService', () => {
  let service: AuthService;
  let store: AuthSessionStore;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API_BASE_URL_VALUE },
      ],
    });

    service = TestBed.inject(AuthService);
    store = TestBed.inject(AuthSessionStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('logs in, stores the session in memory and persists only CSRF', () => {
    let result: typeof TEST_USER | undefined;
    service.login({ email: 'jane@example.com', password: 'password123' }).subscribe(
      (user) => {
        result = user;
      },
    );

    const request = http.expectOne(`${API_BASE_URL_VALUE}/auth/login`);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      email: 'jane@example.com',
      password: 'password123',
    });

    request.flush(authEnvelope(TEST_SESSION));

    expect(result).toEqual(TEST_USER);
    expect(store.user()).toEqual(TEST_USER);
    expect(store.accessToken()).toBe(TEST_SESSION.accessToken);
    expect(store.isAuthenticated()).toBe(true);
    expect(store.initialized()).toBe(true);
    expect(sessionStorage.getItem(CSRF_STORAGE_KEY)).toBe(
      TEST_SESSION.csrfToken,
    );
    expect(sessionStorage.getItem(TEST_SESSION.accessToken)).toBeNull();
  });

  it('registers an account without starting a session', () => {
    let result: typeof TEST_USER | undefined;
    service
      .register({
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        password: 'password1234',
      })
      .subscribe((user) => {
        result = user;
      });

    const request = http.expectOne(`${API_BASE_URL_VALUE}/auth/register`);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password1234',
    });

    request.flush(authEnvelope({ user: TEST_USER }));

    expect(result).toEqual(TEST_USER);
    expect(store.user()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('logs out and clears the local session even when the request fails', () => {
    store.setSession(TEST_SESSION);
    const completed = vi.fn();

    service.logout().subscribe({ complete: completed });

    const request = http.expectOne(`${API_BASE_URL_VALUE}/auth/logout`);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    request.flush(
      authErrorEnvelope('INTERNAL_ERROR', 'Logout failed.'),
      { status: 500, statusText: 'Server Error' },
    );

    expect(completed).toHaveBeenCalledOnce();
    expect(store.user()).toBeNull();
    expect(store.accessToken()).toBeNull();
    expect(store.csrfToken()).toBeNull();
    expect(sessionStorage.getItem(CSRF_STORAGE_KEY)).toBeNull();
  });

  it('clears the local session without a request when no CSRF token exists', () => {
    store.setSession(TEST_SESSION);
    store.clear();

    service.logout().subscribe();

    http.expectNone(`${API_BASE_URL_VALUE}/auth/logout`);
    expect(store.user()).toBeNull();
    expect(store.initialized()).toBe(true);
  });

  it('coalesces concurrent refresh requests into one network call', () => {
    store.setSession(TEST_SESSION);
    const results: string[] = [];

    const first = service.refresh();
    const second = service.refresh();

    expect(first).toBe(second);

    first.subscribe((user) => results.push(user.email));
    second.subscribe((user) => results.push(user.email));

    const request = http.expectOne(`${API_BASE_URL_VALUE}/auth/refresh`);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    request.flush(
      authEnvelope({
        ...TEST_SESSION,
        accessToken: 'refreshed-access-token',
        csrfToken: 'refreshed-csrf-token',
      }),
    );

    expect(results).toEqual(['jane@example.com', 'jane@example.com']);
    expect(store.accessToken()).toBe('refreshed-access-token');
    expect(store.csrfToken()).toBe('refreshed-csrf-token');
    expect(sessionStorage.getItem(CSRF_STORAGE_KEY)).toBe(
      'refreshed-csrf-token',
    );
  });

  it('clears the session when refresh is rejected', () => {
    store.setSession(TEST_SESSION);
    let error: unknown;

    service.refresh().subscribe({ error: (value) => (error = value) });

    const request = http.expectOne(`${API_BASE_URL_VALUE}/auth/refresh`);
    request.flush(
      authErrorEnvelope('REFRESH_TOKEN_INVALID', 'Refresh rejected.'),
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(error).toBeTruthy();
    expect(store.user()).toBeNull();
    expect(store.accessToken()).toBeNull();
    expect(store.csrfToken()).toBeNull();
    expect(sessionStorage.getItem(CSRF_STORAGE_KEY)).toBeNull();
  });

  it('does not refresh without a persisted CSRF token', () => {
    let error: unknown;

    service.refresh().subscribe({ error: (value) => (error = value) });

    http.expectNone(`${API_BASE_URL_VALUE}/auth/refresh`);
    expect(error).toBeTruthy();
  });

  it('marks the session initialized when there is nothing to restore', async () => {
    await expect(service.restoreSession()).resolves.toBe(false);

    http.expectNone(`${API_BASE_URL_VALUE}/auth/refresh`);
    expect(store.initialized()).toBe(true);
    expect(store.isAuthenticated()).toBe(false);
  });

  it('restores a session from the refresh cookie using the persisted CSRF token', async () => {
    store.setCsrfToken('persisted-csrf-token');
    expect(store.initialized()).toBe(false);

    const restore = service.restoreSession();

    const request = http.expectOne(`${API_BASE_URL_VALUE}/auth/refresh`);
    expect(request.request.withCredentials).toBe(true);
    request.flush(authEnvelope(TEST_SESSION));

    await expect(restore).resolves.toBe(true);
    expect(store.user()).toEqual(TEST_USER);
    expect(store.accessToken()).toBe(TEST_SESSION.accessToken);
    expect(store.initialized()).toBe(true);
  });

  it('handles a failed session restore without throwing', async () => {
    store.setCsrfToken('persisted-csrf-token');

    const restore = service.restoreSession();

    const request = http.expectOne(`${API_BASE_URL_VALUE}/auth/refresh`);
    request.error(new ProgressEvent('network error'));

    await expect(restore).resolves.toBe(false);
    expect(store.initialized()).toBe(true);
    expect(store.isAuthenticated()).toBe(false);
  });

  it('loads the current user and updates permissions', () => {
    store.setSession(TEST_SESSION);
    store.setUser({ ...TEST_USER, permissions: [] });

    let result: typeof TEST_USER | undefined;
    service.loadCurrentUser().subscribe((user) => {
      result = user;
    });

    const request = http.expectOne(`${API_BASE_URL_VALUE}/auth/me`);
    expect(request.request.method).toBe('GET');
    request.flush(authEnvelope({ user: TEST_USER }));

    expect(result).toEqual(TEST_USER);
    expect(service.hasPermission('dashboard:read')).toBe(true);
    expect(service.hasPermission('admin:access')).toBe(false);
    expect(service.hasAnyPermission(['admin:access', 'dashboard:read'])).toBe(
      true,
    );
  });
});
