export type ApplicationStatusKey =
  | 'approved'
  | 'pending'
  | 'in-progress'
  | 'rejected';

export interface ApplicationStatus {
  key: ApplicationStatusKey;
  label: string;
  value: number;
  percentage: number;
}
