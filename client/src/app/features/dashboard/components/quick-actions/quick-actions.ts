import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { QuickAction } from '../../interfaces/quick-action.interface';

@Component({
  selector: 'app-quick-actions',
  imports: [MatCardModule, RouterLink],
  templateUrl: './quick-actions.html',
  styleUrl: './quick-actions.scss',
})
export class QuickActionsComponent {
  readonly actions = input.required<readonly QuickAction[]>();
}
