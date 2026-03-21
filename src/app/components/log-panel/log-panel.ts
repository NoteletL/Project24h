import { Component, inject } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';

@Component({
  selector: 'app-log-panel',
  standalone: true,
  templateUrl: './log-panel.html',
  styleUrl: './log-panel.css',
})
export class LogPanelComponent {
  private gameState = inject(GameStateService);
  readonly logs = this.gameState.logs;
}

