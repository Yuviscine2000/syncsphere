import { Routes } from '@angular/router';
import { AUTH_PERMISSIONS } from './core/constants/auth.constants';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { permissionGuard } from './core/guards/permission.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then(
            (m) => m.DASHBOARD_ROUTES,
          ),
      },
      {
        path: 'chat',
        loadChildren: () =>
          import('./features/chat/chat.routes').then((m) => m.CHAT_ROUTES),
      },
      {
        path: 'meetings',
        loadChildren: () =>
          import('./features/meeting/meeting.routes').then(
            (m) => m.MEETING_ROUTES,
          ),
      },
      {
        path: 'files',
        loadChildren: () =>
          import('./features/file-manager/file-manager.routes').then(
            (m) => m.FILE_MANAGER_ROUTES,
          ),
      },
      {
        path: 'notifications',
        loadChildren: () =>
          import('./features/notifications/notifications.routes').then(
            (m) => m.NOTIFICATIONS_ROUTES,
          ),
      },
      {
        path: 'admin',
        canActivate: [permissionGuard(AUTH_PERMISSIONS.adminAccess)],
        loadChildren: () =>
          import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/settings/settings.routes').then(
            (m) => m.SETTINGS_ROUTES,
          ),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () =>
      import('./layouts/error-layout/error-layout').then((m) => m.ErrorLayout),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/errors/pages/not-found/not-found').then(
            (m) => m.NotFoundPage,
          ),
      },
    ],
  },
];
