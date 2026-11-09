import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthLayout } from './auth-layout';

describe('AuthLayout', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthLayout],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should render SyncSphere branding and a router outlet', async () => {
    const fixture = TestBed.createComponent(AuthLayout);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.auth-brand')?.textContent).toContain(
      'SyncSphere',
    );
    expect(compiled.querySelector('main.auth-content')).toBeTruthy();
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
