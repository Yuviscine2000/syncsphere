import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { finalize } from 'rxjs';
import { AUTH_PERMISSIONS } from '../../core/constants/auth.constants';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
})
export class MainLayout {
  protected readonly themeService = inject(ThemeService);
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.authService.user;
  protected readonly canAccessAdmin = computed(() =>
    this.authService.hasPermission(AUTH_PERMISSIONS.adminAccess),
  );
  protected readonly signingOut = signal(false);

  protected logout(): void {
    if (this.signingOut()) {
      return;
    }

    this.signingOut.set(true);

    this.authService
      .logout()
      .pipe(finalize(() => this.signingOut.set(false)))
      .subscribe(() => {
        void this.router.navigate(['/auth/login']);
      });
  }
}
