import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL } from '../config/api.config';
import { AuthSessionStore } from '../services/auth-session.store';
import { isApiRequest, isTokenlessAuthRequest } from '../utils/api-url.util';

export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const apiBaseUrl = inject(API_BASE_URL);
  const session = inject(AuthSessionStore);

  if (!isApiRequest(request.url, apiBaseUrl)) {
    return next(request);
  }

  const accessToken = session.accessToken();
  const authenticatedRequest = request.clone({ withCredentials: true });

  if (accessToken === null || isTokenlessAuthRequest(request.url)) {
    return next(authenticatedRequest);
  }

  return next(
    authenticatedRequest.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  );
};
