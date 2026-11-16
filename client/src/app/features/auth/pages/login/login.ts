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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { authErrorMessage } from '../../../../core/utils/auth-error.util';
import { safeReturnUrl } from '../../../../core/utils/navigation.util';

type LoginControlName = 'email' | 'password';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly returnUrl = safeReturnUrl(
    this.route.snapshot.queryParamMap.get('returnUrl'),
  );

  readonly form = this.fb.group({
    email: [
      '',
      [Validators.required, Validators.email, Validators.maxLength(320)],
    ],
    password: ['', [Validators.required, Validators.maxLength(1_024)]],
  });

  protected readonly passwordVisible = signal(false);
  protected readonly submitted = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly infoMessage = signal('');
  protected readonly errorMessage = signal('');

  constructor() {
    const registered = this.route.snapshot.queryParamMap.get('registered');
    const email = this.route.snapshot.queryParamMap.get('email');

    if (registered === '1') {
      this.infoMessage.set(
        'Account created successfully. Sign in with your new account.',
      );
    }

    if (email !== null && email.length > 0) {
      this.form.controls.email.setValue(email);
    }

    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.infoMessage.set('');
        this.errorMessage.set('');
      });
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected showError(controlName: LoginControlName, error: string): boolean {
    const control = this.form.controls[controlName];
    return control.hasError(error) && (control.touched || this.submitted());
  }

  protected submit(): void {
    this.submitted.set(true);
    this.infoMessage.set('');
    this.errorMessage.set('');

    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const { email, password } = this.form.getRawValue();

    this.authService
      .login({ email: email.trim(), password })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl(this.returnUrl);
        },
        error: (error: unknown) => {
          this.errorMessage.set(authErrorMessage(error));
        },
      });
  }
}
