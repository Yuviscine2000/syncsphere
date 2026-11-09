import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { LoginPage } from './login';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let component: LoginPage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([])],
    }).compileComponents();

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

  it('requires a password of at least eight characters', () => {
    component.form.controls.password.setValue('short');

    expect(component.form.controls.password.hasError('minlength')).toBe(true);
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
    component.form.setValue({
      email: 'jane@example.com',
      password: 'password123',
    });

    submitForm();

    const message = query<HTMLElement>('.auth-form__message');
    expect(message.textContent).toContain('Backend authentication');
    expect(message.getAttribute('role')).toBe('status');
  });

  it('clears the informational message when the form is edited', () => {
    component.form.setValue({
      email: 'jane@example.com',
      password: 'password123',
    });
    submitForm();
    expect(query('.auth-form__message')).not.toBeNull();

    component.form.controls.email.setValue('jane.doe@example.com');
    fixture.detectChanges();

    expect(query('.auth-form__message')).toBeNull();
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
