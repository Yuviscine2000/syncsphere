import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});

export const CSRF_COOKIE_NAME = new InjectionToken<string>('CSRF_COOKIE_NAME', {
  providedIn: 'root',
  factory: () => environment.csrfCookieName,
});
