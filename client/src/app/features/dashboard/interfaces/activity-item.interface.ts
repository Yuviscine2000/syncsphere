export type ActivityCategory =
  | 'Application'
  | 'Meeting'
  | 'Document'
  | 'Team'
  | 'System';

export type ActivityStatus =
  | 'approved'
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'rejected';

export interface ActivityItem {
  id: string;
  description: string;
  category: ActivityCategory;
  timestamp: string;
  status?: ActivityStatus;
}
