import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AUTH_PASSWORD_MIN_LENGTH } from '../../../../core/constants/auth.constants';
import { AuthService } from '../../../../core/services/auth.service';
import { authErrorMessage } from '../../../../core/utils/auth-error.util';
import { passwordMatchValidator } from '../../../../shared/validators/password-match.validator';

type RegisterControlName =
  | 'fullName'
  | 'email'
  | 'password'
  | 'confirmPassword';

@Component({
  selector: 'app-register-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class RegisterPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.group(
    {
      fullName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(120),
        ],
      ],
      email: [
        '',
        [Validators.required, Validators.email, Validators.maxLength(320)],
      ],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(AUTH_PASSWORD_MIN_LENGTH),
          Validators.maxLength(128),
        ],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator() },
  );

  protected readonly passwordVisible = signal(false);
  protected readonly confirmPasswordVisible = signal(false);
  protected readonly submitted = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly passwordMinLength = AUTH_PASSWORD_MIN_LENGTH;

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.errorMessage.set(''));
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected toggleConfirmPasswordVisibility(): void {
    this.confirmPasswordVisible.update((visible) => !visible);
  }

  protected showError(controlName: RegisterControlName, error: string): boolean {
    const control = this.form.controls[controlName];
    return control.hasError(error) && (control.touched || this.submitted());
  }

  protected submit(): void {
    this.submitted.set(true);
    this.errorMessage.set('');

    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const { fullName, email, password } = this.form.getRawValue();

    this.authService
      .register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigate(['/auth/login'], {
            queryParams: {
              registered: '1',
              email: email.trim(),
            },
          });
        },
        error: (error: unknown) => {
          this.errorMessage.set(authErrorMessage(error));
        },
      });
  }
}
