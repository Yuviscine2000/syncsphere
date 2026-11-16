import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CSRF_COOKIE_NAME } from '../config/api.config';
import { CSRF_STORAGE_KEY } from '../constants/auth.constants';
import { AuthSession, AuthUser } from '../models/auth.model';

function readCookie(document: Document, name: string): string | null {
  try {
    const prefix = `${encodeURIComponent(name)}=`;
    const cookie = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));

    if (cookie === undefined) {
      return null;
    }

    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthSessionStore {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly csrfCookieName = inject(CSRF_COOKIE_NAME);

  private readonly userState = signal<AuthUser | null>(null);
  private readonly accessTokenState = signal<string | null>(null);
  private readonly csrfTokenState = signal<string | null>(
    this.readInitialCsrfToken(),
  );
  private readonly initializedState = signal(false);

  readonly user = this.userState.asReadonly();
  readonly accessToken = this.accessTokenState.asReadonly();
  readonly csrfToken = this.csrfTokenState.asReadonly();
  readonly initialized = this.initializedState.asReadonly();
  readonly isAuthenticated = computed(
    () => this.userState() !== null && this.accessTokenState() !== null,
  );
  readonly permissions = computed(
    () => new Set(this.userState()?.permissions ?? []),
  );

  setSession(session: AuthSession): void {
    this.userState.set(session.user);
    this.accessTokenState.set(session.accessToken);
    this.csrfTokenState.set(session.csrfToken);
    this.initializedState.set(true);
    this.persistCsrfToken(session.csrfToken);
  }

  setUser(user: AuthUser): void {
    this.userState.set(user);
    this.initializedState.set(true);
  }

  setAccessToken(accessToken: string | null): void {
    this.accessTokenState.set(accessToken);
  }

  setCsrfToken(csrfToken: string | null): void {
    this.csrfTokenState.set(csrfToken);
    this.persistCsrfToken(csrfToken);
  }

  markInitialized(): void {
    this.initializedState.set(true);
  }

  clear(): void {
    this.userState.set(null);
    this.accessTokenState.set(null);
    this.csrfTokenState.set(null);
    this.initializedState.set(true);
    this.removePersistedCsrfToken();
  }

  hasPermission(permission: string): boolean {
    return this.permissions().has(permission);
  }

  hasAnyPermission(permissions: readonly string[]): boolean {
    return permissions.some((permission) => this.hasPermission(permission));
  }

  private readInitialCsrfToken(): string | null {
    if (!this.isBrowser) {
      return null;
    }

    return (
      readCookie(this.document, this.csrfCookieName) ??
      this.readPersistedCsrfToken()
    );
  }

  private readPersistedCsrfToken(): string | null {
    try {
      return this.document.defaultView?.sessionStorage.getItem(
        CSRF_STORAGE_KEY,
      ) ?? null;
    } catch {
      return null;
    }
  }

  private persistCsrfToken(csrfToken: string | null): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      if (csrfToken === null) {
        this.document.defaultView?.sessionStorage.removeItem(CSRF_STORAGE_KEY);
        return;
      }

      this.document.defaultView?.sessionStorage.setItem(
        CSRF_STORAGE_KEY,
        csrfToken,
      );
    } catch {
      // The in-memory token still supports the current tab.
    }
  }

  private removePersistedCsrfToken(): void {
    try {
      this.document.defaultView?.sessionStorage.removeItem(CSRF_STORAGE_KEY);
    } catch {
      // Nothing else to clear when storage is unavailable.
    }
  }
}
