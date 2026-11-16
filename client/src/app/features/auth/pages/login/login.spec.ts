import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { Subject, throwError } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import {
  TEST_USER,
  authErrorEnvelope,
  createAuthServiceMock,
} from '../../../../../testing/auth-test-helpers';
import { LoginPage } from './login';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let component: LoginPage;
  let authMock: ReturnType<typeof createAuthServiceMock>;
  let router: Router;

  beforeEach(async () => {
    authMock = createAuthServiceMock();

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function submitForm(): void {
    fixture.debugElement
      .query(By.css('form'))
      .triggerEventHandler('submit', null);
    fixture.detectChanges();
  }

  function query<T extends Element>(selector: string): T {
    return fixture.nativeElement.querySelector(selector) as T;
  }

  function setValidValues(): void {
    component.form.setValue({
      email: 'jane@example.com',
      password: 'password123',
    });
  }

  it('creates the login form with email and password controls', () => {
    expect(component).toBeTruthy();
    expect(component.form.contains('email')).toBe(true);
    expect(component.form.contains('password')).toBe(true);
  });

  it('requires both email and password', () => {
    expect(component.form.controls.email.hasError('required')).toBe(true);
    expect(component.form.controls.password.hasError('required')).toBe(true);
    expect(component.form.invalid).toBe(true);
  });

  it('rejects an invalid email address', () => {
    component.form.controls.email.setValue('not-an-email');

    expect(component.form.controls.email.hasError('email')).toBe(true);
  });

  it('shows errors and does not submit when the form is invalid', () => {
    submitForm();

    expect(component.form.touched).toBe(true);
    expect(
      fixture.nativeElement.querySelectorAll('mat-error').length,
    ).toBeGreaterThan(0);
    expect(authMock.login).not.toHaveBeenCalled();
  });

  it('submits valid credentials and navigates to the dashboard', () => {
    component.form.setValue({
      email: 'jane@example.com',
      password: 'password123',
    });

    submitForm();

    expect(authMock.login).toHaveBeenCalledWith({
      email: 'jane@example.com',
      password: 'password123',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('shows a safe error for invalid credentials', () => {
    authMock.login.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: authErrorEnvelope(
              'INVALID_CREDENTIALS',
              'Email or password is incorrect.',
            ),
          }),
      ),
    );
    setValidValues();

    submitForm();

    const message = query<HTMLElement>('.auth-form__message--error');
    expect(message.textContent).toContain('Email or password is incorrect.');
    expect(message.getAttribute('role')).toBe('alert');
  });

  it('disables submission while the login request is pending', () => {
    const pending = new Subject<typeof TEST_USER>();
    authMock.login.mockReturnValue(pending.asObservable());
    setValidValues();

    submitForm();

    const button = query<HTMLButtonElement>('button[type="submit"]');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Signing in');

    pending.next(TEST_USER);
    pending.complete();
    fixture.detectChanges();

    expect(button.disabled).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('clears the error message when the form is edited', () => {
    authMock.login.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: authErrorEnvelope('INVALID_CREDENTIALS', 'Invalid.'),
          }),
      ),
    );
    setValidValues();
    submitForm();
    expect(query('.auth-form__message--error')).not.toBeNull();

    component.form.controls.email.setValue('jane.doe@example.com');
    fixture.detectChanges();

    expect(query('.auth-form__message--error')).toBeNull();
  });

  it('toggles password visibility', () => {
    const input = query<HTMLInputElement>('input[formcontrolname="password"]');
    const toggle = query<HTMLButtonElement>('button.password-toggle');

    expect(input.type).toBe('password');

    toggle.click();
    fixture.detectChanges();

    expect(input.type).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
  });
});
