import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AUTH_LOGIN_URL } from '../constants/auth.constants';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const resolve = (authenticated: boolean) =>
    authenticated
      ? true
      : router.createUrlTree([AUTH_LOGIN_URL], {
          queryParams: { returnUrl: state.url },
        });

  if (authService.initialized()) {
    return resolve(authService.isAuthenticated());
  }

  return authService.restoreSession().then(resolve);
};
