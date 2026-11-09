import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'syncsphere.theme';
const DARK_THEME_CLASS = 'theme-dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly themeState = signal<Theme>(this.readInitialTheme());

  readonly theme = this.themeState.asReadonly();
  readonly isDark = computed(() => this.themeState() === 'dark');

  constructor() {
    this.applyTheme(this.themeState());
  }

  toggleTheme(): void {
    this.setTheme(this.isDark() ? 'light' : 'dark');
  }

  setTheme(theme: Theme): void {
    this.themeState.set(theme);
    this.applyTheme(theme);
    this.persistTheme(theme);
  }

  private readInitialTheme(): Theme {
    return this.readStoredTheme() ?? 'light';
  }

  private applyTheme(theme: Theme): void {
    if (!this.isBrowser) {
      return;
    }

    this.document.documentElement.classList.toggle(
      DARK_THEME_CLASS,
      theme === 'dark',
    );
  }

  private readStoredTheme(): Theme | null {
    const storage = this.getStorage();

    if (!storage) {
      return null;
    }

    try {
      const stored = storage.getItem(STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : null;
    } catch {
      return null;
    }
  }

  private persistTheme(theme: Theme): void {
    const storage = this.getStorage();

    if (!storage) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage may be unavailable (e.g. private mode); the in-memory theme still applies.
    }
  }

  private getStorage(): Storage | null {
    if (!this.isBrowser) {
      return null;
    }

    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}
