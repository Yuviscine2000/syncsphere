import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CSRF_HEADER_NAME } from '../constants/auth.constants';
import { AuthSessionStore } from '../services/auth-session.store';
import { isCsrfProtectedRequest } from '../utils/api-url.util';

export const csrfInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSessionStore);

  if (!isCsrfProtectedRequest(request.url)) {
    return next(request);
  }

  const csrfToken = session.csrfToken();

  if (csrfToken === null) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: {
        [CSRF_HEADER_NAME]: csrfToken,
      },
    }),
  );
};
