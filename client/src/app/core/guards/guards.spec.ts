import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import {
  TEST_USER,
  createAuthServiceMock,
} from '../../../testing/auth-test-helpers';
import { authGuard } from './auth.guard';
import { guestGuard } from './guest.guard';
import { permissionGuard } from './permission.guard';

describe('auth guards', () => {
  let authMock: ReturnType<typeof createAuthServiceMock>;
  let router: Router;

  beforeEach(() => {
    authMock = createAuthServiceMock();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
      ],
    });

    router = TestBed.inject(Router);
  });

  function runAuthGuard(url: string): unknown {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  }

  function runGuestGuard(): unknown {
    return TestBed.runInInjectionContext(() =>
      guestGuard({} as ActivatedRouteSnapshot, {
        url: '/auth/login',
      } as RouterStateSnapshot),
    );
  }

  function runPermissionGuard(permission: string, url: string): unknown {
    return TestBed.runInInjectionContext(() =>
      permissionGuard(permission)(
        {} as ActivatedRouteSnapshot,
        { url } as RouterStateSnapshot,
      ),
    );
  }

  function serialized(result: unknown): string {
    expect(result).toBeInstanceOf(UrlTree);
    return router.serializeUrl(result as UrlTree);
  }

  it('allows authenticated users into protected routes', () => {
    authMock.setUser(TEST_USER);

    expect(runAuthGuard('/meetings')).toBe(true);
  });

  it('redirects guests to login with a return url', () => {
    authMock.setUser(null);

    expect(serialized(runAuthGuard('/meetings'))).toBe(
      '/auth/login?returnUrl=%2Fmeetings',
    );
  });

  it('restores an uninitialized session before allowing access', async () => {
    authMock.setUser(TEST_USER);
    authMock.setInitialized(false);
    authMock.restoreSession.mockResolvedValue(true);

    await expect(runAuthGuard('/meetings')).resolves.toBe(true);
    expect(authMock.restoreSession).toHaveBeenCalledOnce();
  });

  it('redirects when session restoration finds no authenticated user', async () => {
    authMock.setUser(null);
    authMock.setInitialized(false);
    authMock.restoreSession.mockResolvedValue(false);

    const result = await runAuthGuard('/meetings');

    expect(serialized(result)).toBe('/auth/login?returnUrl=%2Fmeetings');
  });

  it('redirects authenticated users away from guest routes', () => {
    authMock.setUser(TEST_USER);

    expect(serialized(runGuestGuard())).toBe('/dashboard');
  });

  it('allows guests into guest routes', () => {
    authMock.setUser(null);

    expect(runGuestGuard()).toBe(true);
  });

  it('allows access when the required permission is present', () => {
    authMock.setUser(TEST_USER);
    authMock.setPermissions(['dashboard:read', 'admin:access']);

    expect(runPermissionGuard('admin:access', '/admin')).toBe(true);
  });

  it('redirects authenticated users without the required permission', () => {
    authMock.setUser(TEST_USER);
    authMock.setPermissions(['dashboard:read']);

    expect(serialized(runPermissionGuard('admin:access', '/admin'))).toBe(
      '/dashboard',
    );
  });

  it('redirects unauthenticated users before checking permissions', () => {
    authMock.setUser(null);

    expect(serialized(runPermissionGuard('admin:access', '/admin'))).toBe(
      '/auth/login?returnUrl=%2Fadmin',
    );
  });

  it('restores the session before checking permissions', async () => {
    authMock.setUser(TEST_USER);
    authMock.setInitialized(false);
    authMock.setPermissions(['dashboard:read', 'admin:access']);
    authMock.restoreSession.mockResolvedValue(true);

    await expect(
      runPermissionGuard('admin:access', '/admin'),
    ).resolves.toBe(true);
    expect(authMock.restoreSession).toHaveBeenCalledOnce();
  });
});
