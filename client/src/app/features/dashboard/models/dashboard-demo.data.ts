import { ActivityItem } from '../interfaces/activity-item.interface';
import { ApplicationStatus } from '../interfaces/application-status.interface';
import { QuickAction } from '../interfaces/quick-action.interface';
import { SummaryCard } from '../interfaces/summary-card.interface';

// Demonstration data only. None of these values are live production metrics.

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return hoursAgo(days * 24);
}

export const DASHBOARD_SUMMARY_CARDS: readonly SummaryCard[] = [
  {
    label: 'Total Applications',
    value: 128,
    description: 'Across all active workspaces',
    tone: 'primary',
    icon: 'applications',
  },
  {
    label: 'Active Users',
    value: 342,
    description: 'Members active in the last 30 days',
    tone: 'accent',
    icon: 'users',
  },
  {
    label: 'Meetings',
    value: 18,
    description: 'Scheduled for this week',
    tone: 'success',
    icon: 'meetings',
  },
  {
    label: 'Unread Notifications',
    value: 7,
    description: 'Waiting for your attention',
    tone: 'warning',
    icon: 'notifications',
  },
];

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  { key: 'approved', label: 'Approved', value: 74, percentage: 58 },
  { key: 'pending', label: 'Pending', value: 23, percentage: 18 },
  { key: 'in-progress', label: 'In Progress', value: 21, percentage: 16 },
  { key: 'rejected', label: 'Rejected', value: 10, percentage: 8 },
];

export const RECENT_ACTIVITIES: readonly ActivityItem[] = [
  {
    id: 'activity-1',
    description: "Application 'Northwind Portal' was approved",
    category: 'Application',
    timestamp: hoursAgo(2),
    status: 'approved',
  },
  {
    id: 'activity-2',
    description: 'Design sync meeting scheduled for Thursday',
    category: 'Meeting',
    timestamp: hoursAgo(5),
    status: 'pending',
  },
  {
    id: 'activity-3',
    description: 'Q4 roadmap.pdf uploaded to Shared Workspace',
    category: 'Document',
    timestamp: hoursAgo(8),
    status: 'completed',
  },
  {
    id: 'activity-4',
    description: 'New member invited to the Platform team',
    category: 'Team',
    timestamp: daysAgo(1),
    status: 'pending',
  },
  {
    id: 'activity-5',
    description: "Application 'Contoso Analytics' moved to review",
    category: 'Application',
    timestamp: daysAgo(1),
    status: 'in-progress',
  },
  {
    id: 'activity-6',
    description: 'Notification preferences updated',
    category: 'System',
    timestamp: daysAgo(2),
    status: 'completed',
  },
];

export const QUICK_ACTIONS: readonly QuickAction[] = [
  { label: 'Chat', description: 'Open team conversations', route: '/chat' },
  {
    label: 'Meetings',
    description: 'View the meeting schedule',
    route: '/meetings',
  },
  { label: 'Files', description: 'Browse shared documents', route: '/files' },
  {
    label: 'Notifications',
    description: 'Review unread updates',
    route: '/notifications',
  },
  {
    label: 'Settings',
    description: 'Manage your preferences',
    route: '/settings',
  },
];
