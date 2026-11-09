import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';
import { installMemoryStorage } from '../../../testing/memory-storage';

const STORAGE_KEY = 'syncsphere.theme';
const DARK_THEME_CLASS = 'theme-dark';

describe('ThemeService', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = installMemoryStorage();
    document.documentElement.classList.remove(DARK_THEME_CLASS);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    document.documentElement.classList.remove(DARK_THEME_CLASS);
    TestBed.resetTestingModule();
  });

  it('should default to light theme for a first-time visitor', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('light');
    expect(service.isDark()).toBe(false);
    expect(document.documentElement.classList.contains(DARK_THEME_CLASS)).toBe(
      false,
    );
  });

  it('should update the active theme and apply it to the root element', () => {
    const service = TestBed.inject(ThemeService);

    service.toggleTheme();

    expect(service.theme()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.classList.contains(DARK_THEME_CLASS)).toBe(
      true,
    );

    service.toggleTheme();

    expect(service.theme()).toBe('light');
    expect(document.documentElement.classList.contains(DARK_THEME_CLASS)).toBe(
      false,
    );
  });

  it('should persist the selected theme preference', () => {
    const service = TestBed.inject(ThemeService);

    service.setTheme('dark');

    expect(storage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('should restore a saved theme preference on initialization', () => {
    storage.setItem(STORAGE_KEY, 'dark');

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.classList.contains(DARK_THEME_CLASS)).toBe(
      true,
    );
  });
});
