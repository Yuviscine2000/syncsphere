import { Component, computed, signal } from '@angular/core';
import { ApplicationStatusComponent } from '../../components/application-status/application-status';
import { QuickActionsComponent } from '../../components/quick-actions/quick-actions';
import { RecentActivityComponent } from '../../components/recent-activity/recent-activity';
import { SummaryCardComponent } from '../../components/summary-card/summary-card';
import {
  APPLICATION_STATUSES,
  DASHBOARD_SUMMARY_CARDS,
  QUICK_ACTIONS,
  RECENT_ACTIVITIES,
} from '../../models/dashboard-demo.data';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    SummaryCardComponent,
    ApplicationStatusComponent,
    QuickActionsComponent,
    RecentActivityComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  protected readonly today = signal(new Date());
  protected readonly formattedDate = computed(() =>
    new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(this.today()),
  );

  protected readonly summaryCards = DASHBOARD_SUMMARY_CARDS;
  protected readonly applicationStatuses = APPLICATION_STATUSES;
  protected readonly recentActivities = RECENT_ACTIVITIES;
  protected readonly quickActions = QUICK_ACTIONS;
}
