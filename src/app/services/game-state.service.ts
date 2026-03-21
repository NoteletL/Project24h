import { Injectable, signal } from '@angular/core';
import { Tile, Position, TILE_ICONS } from './api.service';

export interface GameState {
  turn: number;
  hp: number;
  maxHp: number;
  gold: number;
}

export interface LogEntry {
  message: string;
  type: 'action' | 'error' | 'info' | 'warning' | '';
  turn: number;
}

@Injectable({ providedIn: 'root' })
export class GameStateService {
  // Map state
  readonly grid = signal<Tile[][]>([]);
  readonly playerPos = signal<Position>({ x: 7, y: 5 });
  readonly cols = signal(15);
  readonly rows = signal(11);

  // Player state
  readonly turn = signal(1);
  readonly hp = signal(100);
  readonly maxHp = signal(100);
  readonly gold = signal(0);

  // Logs
  readonly logs = signal<LogEntry[]>([
    { message: 'Bienvenue ! En attente de connexion à l\'API...', type: '', turn: 0 }
  ]);

  // Modal
  readonly modalVisible = signal(false);
  readonly modalTitle = signal('');
  readonly modalBody = signal('');

  loadMap(map: Tile[][], playerPos: Position) {
    this.grid.set(map);
    this.playerPos.set(playerPos);
  }

  movePlayer(dx: number, dy: number): boolean {
    const pos = this.playerPos();
    const grid = this.grid();
    const newX = pos.x + dx;
    const newY = pos.y + dy;

    if (newX < 0 || newX >= this.cols() || newY < 0 || newY >= this.rows()) {
      return false;
    }

    const targetTile = grid[newY]?.[newX];
    if (targetTile && (targetTile.type === 'wall' || targetTile.type === 'water')) {
      return false;
    }

    this.playerPos.set({ x: newX, y: newY });
    return true;
  }

  getCurrentTile(): Tile | null {
    const pos = this.playerPos();
    return this.grid()[pos.y]?.[pos.x] || null;
  }

  getAdjacentTiles(): Record<string, Tile | null> {
    const { x, y } = this.playerPos();
    const grid = this.grid();
    return {
      up: grid[y - 1]?.[x] || null,
      down: grid[y + 1]?.[x] || null,
      left: grid[y]?.[x - 1] || null,
      right: grid[y]?.[x + 1] || null,
    };
  }

  updateTile(x: number, y: number, data: Partial<Tile>) {
    const grid = this.grid();
    if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
      const newGrid = grid.map(row => [...row]);
      newGrid[y][x] = { ...newGrid[y][x], ...data };
      this.grid.set(newGrid);
    }
  }

  log(message: string, type: LogEntry['type'] = '') {
    const entry: LogEntry = { message, type, turn: this.turn() };
    this.logs.update(logs => [entry, ...logs].slice(0, 50));
  }

  incrementTurn() {
    this.turn.update(t => t + 1);
  }

  showModal(title: string, body: string) {
    this.modalTitle.set(title);
    this.modalBody.set(body);
    this.modalVisible.set(true);
  }

  hideModal() {
    this.modalVisible.set(false);
  }

  getTileIcon(type: string): string {
    return TILE_ICONS[type] || '';
  }
}

