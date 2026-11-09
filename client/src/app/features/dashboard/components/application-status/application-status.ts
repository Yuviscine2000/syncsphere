import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { ApplicationStatus } from '../../interfaces/application-status.interface';

@Component({
  selector: 'app-application-status',
  imports: [MatCardModule],
  templateUrl: './application-status.html',
  styleUrl: './application-status.scss',
})
export class ApplicationStatusComponent {
  readonly statuses = input.required<readonly ApplicationStatus[]>();
}
