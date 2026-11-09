import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const PASSWORD_MISMATCH_ERROR = 'passwordMismatch';

export function passwordMatchValidator(
  passwordControlName = 'password',
  confirmPasswordControlName = 'confirmPassword',
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordControlName);
    const confirmPassword = group.get(confirmPasswordControlName);

    if (!password || !confirmPassword) {
      return null;
    }

    const errors = { ...(confirmPassword.errors ?? {}) };
    const hasValue =
      confirmPassword.value !== null && confirmPassword.value !== '';
    const isMismatch = hasValue && password.value !== confirmPassword.value;

    if (isMismatch) {
      confirmPassword.setErrors({ ...errors, [PASSWORD_MISMATCH_ERROR]: true });
    } else if (PASSWORD_MISMATCH_ERROR in errors) {
      delete errors[PASSWORD_MISMATCH_ERROR];
      confirmPassword.setErrors(Object.keys(errors).length > 0 ? errors : null);
    }

    return null;
  };
}
