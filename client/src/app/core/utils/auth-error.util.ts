import { HttpErrorResponse } from '@angular/common/http';
import { AuthErrorBody } from '../models/auth.model';

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: 'Please check the highlighted fields and try again.',
  BAD_REQUEST: 'The request could not be processed. Please try again.',
  UNAUTHORIZED: 'Please sign in to continue.',
  AUTHENTICATION_REQUIRED: 'Please sign in to continue.',
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  ACCOUNT_DISABLED: 'This account is disabled.',
  EMAIL_ALREADY_EXISTS: 'An account with this email already exists.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  TOKEN_INVALID: 'Your session is no longer valid. Please sign in again.',
  TOKEN_REUSE_DETECTED:
    'A security issue was detected. Please sign in again.',
  SESSION_REVOKED: 'Your session has been revoked. Please sign in again.',
  CSRF_VALIDATION_FAILED:
    'Your session could not be verified. Please sign in again.',
  INSUFFICIENT_PERMISSIONS:
    'You do not have permission to perform this action.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  RESOURCE_CONFLICT: 'The requested resource already exists.',
  RATE_LIMIT_EXCEEDED: 'Too many attempts. Please try again later.',
  PAYLOAD_TOO_LARGE: 'The submitted data is too large.',
  DATABASE_UNAVAILABLE:
    'A required service is temporarily unavailable. Please try again later.',
  DATABASE_CONNECTION_FAILED:
    'A required service is temporarily unavailable. Please try again later.',
  DATABASE_OPERATION_FAILED:
    'The request could not be completed. Please try again.',
  DATABASE_INITIALIZATION_FAILED:
    'A required service is temporarily unavailable. Please try again later.',
  SERVICE_UNAVAILABLE:
    'The service is temporarily unavailable. Please try again later.',
  INTERNAL_SERVER_ERROR: 'Something went wrong. Please try again.',
};

function readErrorBody(error: HttpErrorResponse): AuthErrorBody | null {
  const body = error.error as { error?: AuthErrorBody } | null | undefined;
  return body?.error ?? null;
}

export function authErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Something went wrong. Please try again.';
  }

  if (error.status === 0) {
    return 'Unable to reach the server. Check your connection and try again.';
  }

  const body = readErrorBody(error);

  if (body !== null) {
    const validationMessage = body.details
      ?.map((detail) => detail.message)
      .find((message): message is string => typeof message === 'string');

    if (body.code === 'VALIDATION_ERROR' && validationMessage !== undefined) {
      return validationMessage;
    }

    const mapped = ERROR_MESSAGES[body.code];

    if (mapped !== undefined) {
      return mapped;
    }
  }

  return body?.message || 'Something went wrong. Please try again.';
}

export function isInvalidSessionError(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    (error.status === 401 || error.status === 403)
  );
}
