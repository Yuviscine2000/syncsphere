export type SummaryCardTone = 'primary' | 'accent' | 'success' | 'warning';

export type SummaryCardIcon =
  | 'applications'
  | 'users'
  | 'meetings'
  | 'notifications';

export interface SummaryCard {
  label: string;
  value: number;
  description: string;
  tone: SummaryCardTone;
  icon: SummaryCardIcon;
}
