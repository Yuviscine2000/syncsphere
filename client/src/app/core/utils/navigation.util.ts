import { DEFAULT_AUTHENTICATED_URL } from '../constants/auth.constants';

export function safeReturnUrl(returnUrl: string | null | undefined): string {
  if (
    typeof returnUrl === 'string' &&
    returnUrl.startsWith('/') &&
    !returnUrl.startsWith('//')
  ) {
    return returnUrl;
  }

  return DEFAULT_AUTHENTICATED_URL;
}
