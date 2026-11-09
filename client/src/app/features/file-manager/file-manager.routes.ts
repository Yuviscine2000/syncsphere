import { Routes } from '@angular/router';

export const FILE_MANAGER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/files/files').then((m) => m.FilesPage),
  },
];
