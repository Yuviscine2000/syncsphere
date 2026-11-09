import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RegisterPage } from './register';

describe('RegisterPage', () => {
  let fixture: ComponentFixture<RegisterPage>;
  let component: RegisterPage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [provideRouter([])],
    }).compileComponents();

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
      password: 'password123',
      confirmPassword: 'password123',
      ...overrides,
    });
  }

  it('creates the registration form with all controls', () => {
    expect(component).toBeTruthy();
    expect(component.form.contains('fullName')).toBe(true);
    expect(component.form.contains('email')).toBe(true);
    expect(component.form.contains('password')).toBe(true);
    expect(component.form.contains('confirmPassword')).toBe(true);
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

  it('requires a password of at least eight characters', () => {
    setValidValues({ password: 'short', confirmPassword: 'short' });

    expect(component.form.controls.password.hasError('minlength')).toBe(true);
  });

  it('flags a password mismatch on the confirm control', () => {
    setValidValues({ confirmPassword: 'different123' });

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
    expect(query('.auth-form__message')).toBeNull();
  });

  it('shows an informational message on valid submission', () => {
    setValidValues();

    submitForm();

    const message = query<HTMLElement>('.auth-form__message');
    expect(message.textContent).toContain('Backend account creation');
    expect(message.getAttribute('role')).toBe('status');
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
