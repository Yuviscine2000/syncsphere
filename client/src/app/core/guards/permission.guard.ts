import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import {
  AUTH_LOGIN_URL,
  DEFAULT_AUTHENTICATED_URL,
} from '../constants/auth.constants';
import { AuthService } from '../services/auth.service';

export function permissionGuard(permission: string): CanActivateFn {
  return (_route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const resolve = (authenticated: boolean) => {
      if (!authenticated) {
        return router.createUrlTree([AUTH_LOGIN_URL], {
          queryParams: { returnUrl: state.url },
        });
      }

      return authService.hasPermission(permission)
        ? true
        : router.createUrlTree([DEFAULT_AUTHENTICATED_URL]);
    };

    if (authService.initialized()) {
      return resolve(authService.isAuthenticated());
    }

    return authService.restoreSession().then(resolve);
  };
}
