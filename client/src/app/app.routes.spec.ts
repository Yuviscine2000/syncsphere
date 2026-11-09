import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';

describe('app routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    });
  });

  it('redirects the root path to the dashboard', async () => {
    const harness = await RouterTestingHarness.create('/');
    const title = harness.routeNativeElement?.querySelector(
      '.dashboard-hero__title',
    );

    expect(title?.textContent).toContain('Welcome to SyncSphere');
  });

  it('lazy loads the login page inside the auth layout', async () => {
    const harness = await RouterTestingHarness.create('/auth/login');
    const root = harness.routeNativeElement;

    expect(root?.querySelector('.auth-brand')?.textContent).toContain(
      'SyncSphere',
    );
    expect(root?.querySelector('.page__title')?.textContent).toContain(
      'Sign in',
    );
  });

  it('lazy loads a feature page inside the main layout', async () => {
    const harness = await RouterTestingHarness.create('/meetings');
    const root = harness.routeNativeElement;

    expect(root?.querySelector('nav.app-nav')).toBeTruthy();
    expect(root?.querySelector('.page__title')?.textContent).toContain(
      'Meetings',
    );
  });

  it('renders the not-found page for unknown urls', async () => {
    const harness = await RouterTestingHarness.create('/this/does/not/exist');
    const root = harness.routeNativeElement;

    expect(root?.querySelector('.error-brand')).toBeTruthy();
    expect(root?.querySelector('.page__eyebrow')?.textContent).toContain('404');
  });
});
