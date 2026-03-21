import { Component, inject } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';
import { TILE_ICONS } from '../../services/api.service';

@Component({
  selector: 'app-game-map',
  standalone: true,
  templateUrl: './game-map.html',
  styleUrl: './game-map.css',
})
export class GameMapComponent {
  private gameState = inject(GameStateService);

  readonly grid = this.gameState.grid;
  readonly playerPos = this.gameState.playerPos;
  readonly cols = this.gameState.cols;
  readonly rows = this.gameState.rows;

  isPlayer(x: number, y: number): boolean {
    const pos = this.playerPos();
    return pos.x === x && pos.y === y;
  }

  getTileIcon(type: string): string {
    return TILE_ICONS[type] || '';
  }

  getPlayerIcon(): string {
    return TILE_ICONS['player'];
  }
}

