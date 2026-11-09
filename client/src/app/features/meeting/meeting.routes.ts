import { Routes } from '@angular/router';

export const MEETING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/meetings/meetings').then((m) => m.MeetingsPage),
  },
];
