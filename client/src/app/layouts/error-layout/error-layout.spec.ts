import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ErrorLayout } from './error-layout';

describe('ErrorLayout', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ErrorLayout],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should render SyncSphere branding and a router outlet', async () => {
    const fixture = TestBed.createComponent(ErrorLayout);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.error-brand')?.textContent).toContain(
      'SyncSphere',
    );
    expect(compiled.querySelector('main.error-content')).toBeTruthy();
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
