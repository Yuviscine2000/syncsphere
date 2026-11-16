import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DEFAULT_AUTHENTICATED_URL } from '../constants/auth.constants';
import { AuthService } from '../services/auth.service';

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const resolve = (authenticated: boolean) =>
    authenticated
      ? router.createUrlTree([DEFAULT_AUTHENTICATED_URL])
      : true;

  if (authService.initialized()) {
    return resolve(authService.isAuthenticated());
  }

  return authService.restoreSession().then(resolve);
};
