import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, throwError, timeout } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { AUTH_API_PATHS } from '../constants/auth.constants';
import { SKIP_AUTH_REFRESH } from '../interceptors/auth-context';
import {
  ApiEnvelope,
  AuthSession,
  AuthUser,
  LoginRequest,
  LogoutResponse,
  RegisterRequest,
  RegisterResponse,
  SessionInfo,
  SessionListResponse,
} from '../models/auth.model';
import { AuthSessionStore } from './auth-session.store';

const REFRESH_TIMEOUT_MS = 8_000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly session = inject(AuthSessionStore);

  private refreshInFlight: Observable<AuthUser> | null = null;

  readonly user = this.session.user;
  readonly initialized = this.session.initialized;
  readonly isAuthenticated = this.session.isAuthenticated;

  login(credentials: LoginRequest): Observable<AuthUser> {
    return this.http
      .post<ApiEnvelope<AuthSession>>(this.endpoint(AUTH_API_PATHS.login), credentials, {
        withCredentials: true,
        context: new HttpContext().set(SKIP_AUTH_REFRESH, true),
      })
      .pipe(
        map((response) => {
          this.session.setSession(response.data);
          return response.data.user;
        }),
      );
  }

  register(payload: RegisterRequest): Observable<AuthUser> {
    return this.http
      .post<ApiEnvelope<RegisterResponse>>(
        this.endpoint(AUTH_API_PATHS.register),
        payload,
        {
          withCredentials: true,
          context: new HttpContext().set(SKIP_AUTH_REFRESH, true),
        },
      )
      .pipe(map((response) => response.data.user));
  }

  logout(): Observable<void> {
    const hasCsrfToken = this.session.csrfToken() !== null;
    const request$: Observable<ApiEnvelope<LogoutResponse> | null> =
      hasCsrfToken
        ? this.http.post<ApiEnvelope<LogoutResponse>>(
            this.endpoint(AUTH_API_PATHS.logout),
            {},
            {
              withCredentials: true,
              context: new HttpContext().set(SKIP_AUTH_REFRESH, true),
            },
          )
        : of(null);

    return request$.pipe(
      map((): void => undefined),
      catchError((): Observable<void> => of(undefined)),
      finalize(() => this.session.clear()),
    );
  }

  refresh(): Observable<AuthUser> {
    if (this.refreshInFlight !== null) {
      return this.refreshInFlight;
    }

    if (this.session.csrfToken() === null) {
      return throwError(
        () => new Error('No refresh session is available.'),
      );
    }

    const request$ = this.http
      .post<ApiEnvelope<AuthSession>>(
        this.endpoint(AUTH_API_PATHS.refresh),
        {},
        {
          withCredentials: true,
          context: new HttpContext().set(SKIP_AUTH_REFRESH, true),
        },
      )
      .pipe(
        map((response) => {
          this.session.setSession(response.data);
          return response.data.user;
        }),
        catchError((error: unknown) => {
          this.session.clear();
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    this.refreshInFlight = request$;
    return request$;
  }

  async restoreSession(): Promise<boolean> {
    if (this.session.initialized()) {
      return this.session.isAuthenticated();
    }

    if (this.session.csrfToken() === null) {
      this.session.markInitialized();
      return false;
    }

    try {
      await firstValueFrom(this.refresh().pipe(timeout(REFRESH_TIMEOUT_MS)));
      return true;
    } catch {
      this.session.markInitialized();
      return false;
    }
  }

  loadCurrentUser(): Observable<AuthUser> {
    return this.http
      .get<ApiEnvelope<{ user: AuthUser }>>(this.endpoint(AUTH_API_PATHS.me), {
        withCredentials: true,
      })
      .pipe(
        map((response) => {
          this.session.setUser(response.data.user);
          return response.data.user;
        }),
      );
  }

  listSessions(): Observable<readonly SessionInfo[]> {
    return this.http
      .get<ApiEnvelope<SessionListResponse>>(
        this.endpoint(AUTH_API_PATHS.sessions),
        { withCredentials: true },
      )
      .pipe(map((response) => response.data.sessions));
  }

  revokeSession(sessionId: string): Observable<void> {
    return this.http
      .delete<ApiEnvelope<{ revoked: boolean; current: boolean }>>(
        this.endpoint(`${AUTH_API_PATHS.sessions}/${sessionId}`),
        { withCredentials: true },
      )
      .pipe(map(() => undefined));
  }

  hasPermission(permission: string): boolean {
    return this.session.hasPermission(permission);
  }

  hasAnyPermission(permissions: readonly string[]): boolean {
    return this.session.hasAnyPermission(permissions);
  }

  clearSession(): void {
    this.session.clear();
  }

  private endpoint(path: string): string {
    return `${this.apiBaseUrl.replace(/\/$/, '')}${path}`;
  }
}
