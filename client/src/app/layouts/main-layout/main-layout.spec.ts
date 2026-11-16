import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MainLayout } from './main-layout';
import { AuthService } from '../../core/services/auth.service';
import {
  TEST_USER,
  createAuthServiceMock,
} from '../../../testing/auth-test-helpers';
import { installMemoryStorage } from '../../../testing/memory-storage';

const DARK_THEME_CLASS = 'theme-dark';

describe('MainLayout', () => {
  let authMock: ReturnType<typeof createAuthServiceMock>;
  let router: Router;

  beforeEach(async () => {
    installMemoryStorage();
    document.documentElement.classList.remove(DARK_THEME_CLASS);
    authMock = createAuthServiceMock();

    await TestBed.configureTestingModule({
      imports: [MainLayout],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    document.documentElement.classList.remove(DARK_THEME_CLASS);
  });

  it('should render the brand, navigation, landmarks and router outlet', async () => {
    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.app-brand')?.textContent).toContain(
      'SyncSphere',
    );
    expect(compiled.querySelector('nav.app-nav')).toBeTruthy();
    expect(compiled.querySelector('header')).toBeTruthy();
    expect(compiled.querySelector('main')).toBeTruthy();
    expect(compiled.querySelector('footer')).toBeTruthy();
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('should render a theme switch control with the light theme action', async () => {
    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector(
      'button.theme-toggle',
    ) as HTMLButtonElement;

    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Switch to Dark');
  });

  it('should switch the theme when the control is clicked', async () => {
    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector(
      'button.theme-toggle',
    ) as HTMLButtonElement;

    button.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.documentElement.classList.contains(DARK_THEME_CLASS)).toBe(
      true,
    );
    expect(button.textContent).toContain('Switch to Light');
  });

  it('should show the current user name', async () => {
    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const user = fixture.nativeElement.querySelector(
      '.app-user',
    ) as HTMLElement;

    expect(user.textContent).toContain(TEST_USER.fullName);
    expect(user.getAttribute('title')).toBe(TEST_USER.email);
  });

  it('should hide the admin link without admin:access', async () => {
    authMock.setPermissions(['dashboard:read']);

    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const adminLink = fixture.nativeElement.querySelector(
      'a[href="/admin"]',
    );

    expect(adminLink).toBeNull();
  });

  it('should show the admin link with admin:access', async () => {
    authMock.setPermissions(['dashboard:read', 'admin:access']);

    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const adminLink = fixture.nativeElement.querySelector(
      'a[href="/admin"]',
    );

    expect(adminLink).toBeTruthy();
  });

  it('should sign out and navigate to login', async () => {
    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector(
      'button.sign-out',
    ) as HTMLButtonElement;

    button.click();
    fixture.detectChanges();

    expect(authMock.logout).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });
});
