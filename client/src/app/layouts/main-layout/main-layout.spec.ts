import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MainLayout } from './main-layout';
import { installMemoryStorage } from '../../../testing/memory-storage';

const DARK_THEME_CLASS = 'theme-dark';

describe('MainLayout', () => {
  beforeEach(async () => {
    installMemoryStorage();
    document.documentElement.classList.remove(DARK_THEME_CLASS);

    await TestBed.configureTestingModule({
      imports: [MainLayout],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    document.documentElement.classList.remove(DARK_THEME_CLASS);
  });

  it('should render the brand, navigation, landmarks and router outlet', async () => {
    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.app-brand')?.textContent).toContain(
      'SyncSphere',
    );
    expect(compiled.querySelector('nav.app-nav')).toBeTruthy();
    expect(compiled.querySelector('header')).toBeTruthy();
    expect(compiled.querySelector('main')).toBeTruthy();
    expect(compiled.querySelector('footer')).toBeTruthy();
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('should render a theme switch control with the light theme action', async () => {
    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector(
      'button.theme-toggle',
    ) as HTMLButtonElement;

    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Switch to Dark');
  });

  it('should switch the theme when the control is clicked', async () => {
    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector(
      'button.theme-toggle',
    ) as HTMLButtonElement;

    button.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.documentElement.classList.contains(DARK_THEME_CLASS)).toBe(
      true,
    );
    expect(button.textContent).toContain('Switch to Light');
  });
});
