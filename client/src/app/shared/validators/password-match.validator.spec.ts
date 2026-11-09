import { FormControl, FormGroup, Validators } from '@angular/forms';
import {
  PASSWORD_MISMATCH_ERROR,
  passwordMatchValidator,
} from './password-match.validator';

describe('passwordMatchValidator', () => {
  function createForm(password = '', confirmPassword = '') {
    return new FormGroup(
      {
        password: new FormControl(password, {
          nonNullable: true,
          validators: [Validators.required],
        }),
        confirmPassword: new FormControl(confirmPassword, {
          nonNullable: true,
          validators: [Validators.required],
        }),
      },
      { validators: passwordMatchValidator() },
    );
  }

  it('does not flag matching passwords', () => {
    const form = createForm('password123', 'password123');

    expect(
      form.controls.confirmPassword.hasError(PASSWORD_MISMATCH_ERROR),
    ).toBe(false);
    expect(form.valid).toBe(true);
  });

  it('flags mismatched passwords on the confirm control', () => {
    const form = createForm('password123', 'different123');

    expect(
      form.controls.confirmPassword.hasError(PASSWORD_MISMATCH_ERROR),
    ).toBe(true);
    expect(form.invalid).toBe(true);
  });

  it('clears the mismatch error when the passwords match again', () => {
    const form = createForm('password123', 'different123');

    form.controls.confirmPassword.setValue('password123');

    expect(
      form.controls.confirmPassword.hasError(PASSWORD_MISMATCH_ERROR),
    ).toBe(false);
    expect(form.valid).toBe(true);
  });

  it('does not treat an empty confirm password as a mismatch', () => {
    const form = createForm('password123', '');

    expect(
      form.controls.confirmPassword.hasError(PASSWORD_MISMATCH_ERROR),
    ).toBe(false);
    expect(form.controls.confirmPassword.hasError('required')).toBe(true);
  });
});
