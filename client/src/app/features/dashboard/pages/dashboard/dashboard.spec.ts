import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  APPLICATION_STATUSES,
  DASHBOARD_SUMMARY_CARDS,
  QUICK_ACTIONS,
  RECENT_ACTIVITIES,
} from '../../models/dashboard-demo.data';
import { DashboardPage } from './dashboard';

describe('DashboardPage', () => {
  let fixture: ComponentFixture<DashboardPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
  });

  function query<T extends Element>(selector: string): T {
    return fixture.nativeElement.querySelector(selector) as T;
  }

  function queryAll<T extends Element>(selector: string): T[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector)) as T[];
  }

  it('creates the dashboard page', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the welcome heading and a friendly current date', () => {
    expect(query('.dashboard-hero__title').textContent).toContain(
      'Welcome to SyncSphere',
    );

    const date = query('.dashboard-hero__date-value').textContent?.trim();
    expect(date).toBeTruthy();
    expect(date?.length).toBeGreaterThan(3);
  });

  it('renders all summary cards with demonstration values', () => {
    const cards = queryAll<HTMLElement>('.summary-card');

    expect(cards.length).toBe(4);
    expect(cards.length).toBe(DASHBOARD_SUMMARY_CARDS.length);

    const text = cards.map((card) => card.textContent ?? '').join(' ');
    for (const card of DASHBOARD_SUMMARY_CARDS) {
      expect(text).toContain(card.label);
      expect(text).toContain(String(card.value));
    }
  });

  it('renders the application status breakdown', () => {
    const labels = queryAll<HTMLElement>('.status-list__label').map((element) =>
      element.textContent?.trim(),
    );

    expect(labels).toEqual(
      APPLICATION_STATUSES.map((status) => status.label),
    );
    expect(queryAll('[role="progressbar"]').length).toBe(
      APPLICATION_STATUSES.length,
    );
  });

  it('renders recent activity with categories, times and statuses', () => {
    const items = queryAll<HTMLElement>('.activity-item');
    const text = items.map((item) => item.textContent ?? '').join(' ');

    expect(items.length).toBe(RECENT_ACTIVITIES.length);
    expect(text).toContain(RECENT_ACTIVITIES[0].description);
    expect(queryAll('.activity-item__category').length).toBe(
      RECENT_ACTIVITIES.length,
    );
    expect(queryAll('.activity-item__time').length).toBe(
      RECENT_ACTIVITIES.length,
    );
    expect(queryAll('.activity-item__status').length).toBeGreaterThan(0);
  });

  it('renders quick action links to the existing routes', () => {
    const links = queryAll<HTMLAnchorElement>('a.quick-action');

    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      QUICK_ACTIONS.map((action) => action.route),
    );
  });

  it('identifies all values as demonstration data', () => {
    expect(query('.dashboard-demo-note').textContent).toContain(
      'demonstration data',
    );
  });
});
