import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import {
  ActivityItem,
  ActivityStatus,
} from '../../interfaces/activity-item.interface';

const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  approved: 'Approved',
  pending: 'Pending',
  'in-progress': 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
};

@Component({
  selector: 'app-recent-activity',
  imports: [DatePipe, MatCardModule],
  templateUrl: './recent-activity.html',
  styleUrl: './recent-activity.scss',
})
export class RecentActivityComponent {
  readonly activities = input.required<readonly ActivityItem[]>();

  protected statusLabel(status: ActivityStatus): string {
    return ACTIVITY_STATUS_LABELS[status];
  }
}
