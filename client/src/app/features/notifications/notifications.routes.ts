import { Routes } from '@angular/router';

export const NOTIFICATIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/notifications/notifications').then(
        (m) => m.NotificationsPage,
      ),
  },
];
