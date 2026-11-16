import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { AUTH_LOGIN_URL } from '../constants/auth.constants';
import { AuthService } from '../services/auth.service';
import { AuthSessionStore } from '../services/auth-session.store';
import {
  isApiRequest,
  isNoRefreshAuthRequest,
} from '../utils/api-url.util';
import { AUTH_RETRIED, SKIP_AUTH_REFRESH } from './auth-context';

function bearerToken(request: HttpRequest<unknown>): string | null {
  const authorization = request.headers.get('Authorization');

  if (authorization === null) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

function withBearer(
  request: HttpRequest<unknown>,
  accessToken: string,
): HttpRequest<unknown> {
  return request.clone({
    setHeaders: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

function markRetried(request: HttpRequest<unknown>): HttpRequest<unknown> {
  return request.clone({
    context: request.context.set(AUTH_RETRIED, true),
  });
}

export const refreshInterceptor: HttpInterceptorFn = (request, next) => {
  const apiBaseUrl = inject(API_BASE_URL);
  const authService = inject(AuthService);
  const session = inject(AuthSessionStore);
  const router = inject(Router);

  if (
    !isApiRequest(request.url, apiBaseUrl) ||
    isNoRefreshAuthRequest(request.url) ||
    request.context.get(SKIP_AUTH_REFRESH) ||
    request.context.get(AUTH_RETRIED)
  ) {
    return next(request);
  }

  function redirectToLogin(): void {
    if (!router.url.startsWith(AUTH_LOGIN_URL)) {
      void router.navigate([AUTH_LOGIN_URL], {
        queryParams: { returnUrl: router.url },
      });
    }
  }

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      const requestToken = bearerToken(request);
      const currentToken = session.accessToken();

      if (
        requestToken !== null &&
        currentToken !== null &&
        requestToken !== currentToken
      ) {
        return next(markRetried(withBearer(request, currentToken))).pipe(
          catchError((retryError: unknown) => {
            authService.clearSession();
            redirectToLogin();
            return throwError(() => retryError);
          }),
        );
      }

      return authService.refresh().pipe(
        switchMap(() => {
          const accessToken = session.accessToken();

          if (accessToken === null) {
            return throwError(
              () => new Error('The refreshed session has no access token.'),
            );
          }

          return next(markRetried(withBearer(request, accessToken)));
        }),
        catchError((refreshError: unknown) => {
          authService.clearSession();
          redirectToLogin();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
