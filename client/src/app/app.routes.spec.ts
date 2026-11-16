import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from './core/services/auth.service';
import {
  TEST_USER,
  createAuthServiceMock,
} from '../testing/auth-test-helpers';
import { routes } from './app.routes';

describe('app routes', () => {
  let authMock: ReturnType<typeof createAuthServiceMock>;

  beforeEach(() => {
    authMock = createAuthServiceMock();

    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: AuthService, useValue: authMock },
      ],
    });
  });

  it('redirects the root path to the dashboard for authenticated users', async () => {
    authMock.setUser(TEST_USER);

    const harness = await RouterTestingHarness.create('/');
    const title = harness.routeNativeElement?.querySelector(
      '.dashboard-hero__title',
    );

    expect(title?.textContent).toContain('Welcome to SyncSphere');
  });

  it('lazy loads the login page inside the auth layout for guests', async () => {
    authMock.setUser(null);

    const harness = await RouterTestingHarness.create('/auth/login');
    const root = harness.routeNativeElement;

    expect(root?.querySelector('.auth-brand')?.textContent).toContain(
      'SyncSphere',
    );
    expect(root?.querySelector('.page__title')?.textContent).toContain(
      'Sign in',
    );
  });

  it('lazy loads a protected feature page inside the main layout', async () => {
    authMock.setUser(TEST_USER);

    const harness = await RouterTestingHarness.create('/meetings');
    const root = harness.routeNativeElement;

    expect(root?.querySelector('nav.app-nav')).toBeTruthy();
    expect(root?.querySelector('.page__title')?.textContent).toContain(
      'Meetings',
    );
  });

  it('redirects unauthenticated users from protected routes to login', async () => {
    authMock.setUser(null);

    await RouterTestingHarness.create('/dashboard');
    const router = TestBed.inject(Router);

    expect(router.url).toContain('/auth/login');
    expect(router.url).toContain('returnUrl=%2Fdashboard');
  });

  it('redirects authenticated users without permission away from admin', async () => {
    authMock.setUser(TEST_USER);
    authMock.setPermissions(['dashboard:read']);

    const harness = await RouterTestingHarness.create('/admin');
    const router = TestBed.inject(Router);

    expect(router.url).toBe('/dashboard');
    expect(
      harness.routeNativeElement?.querySelector('.dashboard-hero__title')
        ?.textContent,
    ).toContain('Welcome to SyncSphere');
  });

  it('allows users with admin:access to load the admin route', async () => {
    authMock.setUser(TEST_USER);
    authMock.setPermissions(['dashboard:read', 'admin:access']);

    const harness = await RouterTestingHarness.create('/admin');

    expect(
      harness.routeNativeElement?.querySelector('.page__title')?.textContent,
    ).toContain('Admin');
  });

  it('renders the not-found page for unknown urls without authentication', async () => {
    authMock.setUser(null);

    const harness = await RouterTestingHarness.create('/this/does/not/exist');
    const root = harness.routeNativeElement;

    expect(root?.querySelector('.error-brand')).toBeTruthy();
    expect(root?.querySelector('.page__eyebrow')?.textContent).toContain('404');
  });
});
