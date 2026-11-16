import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { Subject, throwError } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import {
  TEST_USER,
  authErrorEnvelope,
  createAuthServiceMock,
} from '../../../../../testing/auth-test-helpers';
import { RegisterPage } from './register';

describe('RegisterPage', () => {
  let fixture: ComponentFixture<RegisterPage>;
  let component: RegisterPage;
  let authMock: ReturnType<typeof createAuthServiceMock>;
  let router: Router;

  beforeEach(async () => {
    authMock = createAuthServiceMock();

    await TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(RegisterPage);
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

  function setValidValues(overrides: Partial<Record<string, string>> = {}): void {
    component.form.setValue({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password1234',
      confirmPassword: 'password1234',
      ...overrides,
    });
  }

  it('creates the registration form with all controls', () => {
    expect(component).toBeTruthy();
    expect(component.form.contains('fullName')).toBe(true);
    expect(component.form.contains('email')).toBe(true);
    expect(component.form.contains('password')).toBe(true);
    expect(component.form.contains('confirmPassword')).toBe(true);
    expect(component.form.contains('roles')).toBe(false);
  });

  it('requires every field', () => {
    expect(component.form.controls.fullName.hasError('required')).toBe(true);
    expect(component.form.controls.email.hasError('required')).toBe(true);
    expect(component.form.controls.password.hasError('required')).toBe(true);
    expect(
      component.form.controls.confirmPassword.hasError('required'),
    ).toBe(true);
    expect(component.form.invalid).toBe(true);
  });

  it('rejects an invalid email address', () => {
    setValidValues({ email: 'not-an-email' });

    expect(component.form.controls.email.hasError('email')).toBe(true);
  });

  it('requires a full name of at least two characters', () => {
    setValidValues({ fullName: 'J' });

    expect(component.form.controls.fullName.hasError('minlength')).toBe(true);
  });

  it('requires a password of at least twelve characters', () => {
    setValidValues({ password: 'short', confirmPassword: 'short' });

    expect(component.form.controls.password.hasError('minlength')).toBe(true);
  });

  it('flags a password mismatch on the confirm control', () => {
    setValidValues({ confirmPassword: 'different1234' });

    expect(
      component.form.controls.confirmPassword.hasError('passwordMismatch'),
    ).toBe(true);
    expect(component.form.invalid).toBe(true);
  });

  it('accepts matching passwords', () => {
    setValidValues();

    expect(
      component.form.controls.confirmPassword.hasError('passwordMismatch'),
    ).toBe(false);
    expect(component.form.valid).toBe(true);
  });

  it('shows errors and does not submit when the form is invalid', () => {
    submitForm();

    expect(component.form.touched).toBe(true);
    expect(
      fixture.nativeElement.querySelectorAll('mat-error').length,
    ).toBeGreaterThan(0);
    expect(authMock.register).not.toHaveBeenCalled();
  });

  it('registers the account and navigates to login with feedback', () => {
    setValidValues();

    submitForm();

    expect(authMock.register).toHaveBeenCalledWith({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password1234',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { registered: '1', email: 'jane@example.com' },
    });
  });

  it('shows a safe duplicate-email error', () => {
    authMock.register.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: authErrorEnvelope(
              'EMAIL_ALREADY_EXISTS',
              'An account with this email already exists.',
            ),
          }),
      ),
    );
    setValidValues();

    submitForm();

    const message = query<HTMLElement>('.auth-form__message--error');
    expect(message.textContent).toContain(
      'An account with this email already exists.',
    );
    expect(message.getAttribute('role')).toBe('alert');
  });

  it('disables submission while registration is pending', () => {
    const pending = new Subject<typeof TEST_USER>();
    authMock.register.mockReturnValue(pending.asObservable());
    setValidValues();

    submitForm();

    const button = query<HTMLButtonElement>('button[type="submit"]');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Creating account');

    pending.next(TEST_USER);
    pending.complete();
    fixture.detectChanges();

    expect(button.disabled).toBe(false);
  });

  it('toggles visibility for both password fields', () => {
    const passwordInput = query<HTMLInputElement>(
      'input[formcontrolname="password"]',
    );
    const confirmInput = query<HTMLInputElement>(
      'input[formcontrolname="confirmPassword"]',
    );
    const toggles = fixture.nativeElement.querySelectorAll(
      'button.password-toggle',
    ) as NodeListOf<HTMLButtonElement>;

    expect(toggles.length).toBe(2);
    expect(passwordInput.type).toBe('password');
    expect(confirmInput.type).toBe('password');

    toggles[0].click();
    toggles[1].click();
    fixture.detectChanges();

    expect(passwordInput.type).toBe('text');
    expect(confirmInput.type).toBe('text');
  });
});
