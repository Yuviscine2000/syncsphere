import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { SummaryCard } from '../../interfaces/summary-card.interface';

@Component({
  selector: 'app-summary-card',
  imports: [MatCardModule],
  templateUrl: './summary-card.html',
  styleUrl: './summary-card.scss',
})
export class SummaryCardComponent {
  readonly card = input.required<SummaryCard>();
}
