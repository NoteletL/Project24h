import { Component, inject } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';
import { Cell } from '../../services/api.service';

@Component({
  selector: 'app-game-map',
  standalone: true,
  templateUrl: './game-map.html',
  styleUrl: './game-map.css',
})
export class GameMapComponent {
  readonly game = inject(GameStateService);

  get cells(): Cell[] { return Array.from(this.game.knownCells().values()); }
  get ship() { return this.game.ship(); }

  get gridBounds() {
    const cells = this.cells;
    if (!cells.length) return { minX: 0, maxX: 10, minY: 0, maxY: 10 };
    const xs = cells.map(c => c.x);
    const ys = cells.map(c => c.y);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
    };
  }

  get gridCols() { return this.gridBounds.maxX - this.gridBounds.minX + 1; }
  get gridRows() { return this.gridBounds.maxY - this.gridBounds.minY + 1; }

  get gridArray(): (Cell | null)[][] {
    const { minX, minY } = this.gridBounds;
    const map = this.game.knownCells();
    const byCoord = new Map<string, Cell>();
    for (const c of map.values()) byCoord.set(`${c.x},${c.y}`, c);

    const rows: (Cell | null)[][] = [];
    for (let y = 0; y < this.gridRows; y++) {
      const row: (Cell | null)[] = [];
      for (let x = 0; x < this.gridCols; x++) {
        row.push(byCoord.get(`${minX + x},${minY + y}`) || null);
      }
      rows.push(row);
    }
    return rows;
  }

  isShipHere(cell: Cell | null): boolean {
    if (!cell || !this.ship) return false;
    return cell.id === this.ship.currentPosition.id;
  }

  getCellClass(cell: Cell | null): string {
    if (!cell) return 'tile-fog';
    return `tile-${cell.type.toLowerCase()}`;
  }

  getCellIcon(cell: Cell | null): string {
    if (!cell) return '';
    if (this.isShipHere(cell)) return '⛵';
    switch (cell.type) {
      case 'SAND':  return '🏝️';
      case 'SEA':   return '🌊';
      case 'ROCKS': return '🪨';
      default:      return '';
    }
  }
}
