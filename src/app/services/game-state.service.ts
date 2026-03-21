import { Injectable, signal, effect } from '@angular/core';
import { Ship, Resource, PlayerDetails } from './api.service';
import { Cell, MapState } from '../models/map.model';

const STORAGE_KEY = '3026_known_cells';

export interface LogEntry {
  message: string;
  type: 'action' | 'error' | 'info' | 'warning' | '';
  timestamp: Date;
}

export interface MarketTransaction {
  timestamp: Date;
  resourceType: string;
  quantity: number;
  pricePerUnit: number;
  totalCost: number;
  source: 'manual' | 'bot';
}

@Injectable({ providedIn: 'root' })
export class GameStateService {
  // Auth
  readonly token = signal('');
  readonly isAuthenticated = signal(false);

  // Player
  readonly playerDetails = signal<PlayerDetails | null>(null);

  // Ship — persisté dans localStorage pour survie au rechargement
  readonly ship = signal<Ship | null>(this.loadShipFromStorage());

  // ID du bateau (retourné par /ship/build)
  readonly shipId = signal<string>(localStorage.getItem('3026_ship_id') ?? '');

  // Resources
  readonly resources = signal<Resource[]>([]);

  // Map — cellules connues, persistées dans localStorage
  readonly knownCells = signal<Map<string, Cell>>(this.loadCellsFromStorage());

  // MapState complet retourné par le backend map (localhost:8080)
  readonly mapState = signal<MapState | null>(null);

  // Logs
  readonly logs = signal<LogEntry[]>([
    { message: 'Bienvenue dans 3026 ! Commencez par vous inscrire.', type: 'info', timestamp: new Date() }
  ]);

  // Modal
  readonly modalVisible = signal(false);
  readonly modalTitle = signal('');
  readonly modalBody = signal('');

  // Historique des transactions marketplace (200 max)
  readonly transactions = signal<MarketTransaction[]>([]);

  constructor() {
    // Persiste les cellules dans localStorage à chaque changement
    effect(() => {
      const entries = Array.from(this.knownCells().entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    });
    // Persiste le bateau dans localStorage à chaque changement
    effect(() => {
      const s = this.ship();
      if (s) localStorage.setItem('3026_ship', JSON.stringify(s));
      else   localStorage.removeItem('3026_ship');
    });
  }

  // ── Map ───────────────────────────────────────────────────────────────────

  /** Ajoute ou met à jour des cellules dans la map connue */
  addCells(cells: Cell[]): void {
    this.knownCells.update(map => {
      const next = new Map(map);
      for (const c of cells) next.set(c.id, c);
      return next;
    });
  }

  /** Efface toutes les cellules (mémoire + localStorage) */
  clearCells(): void {
    this.knownCells.set(new Map());
    localStorage.removeItem(STORAGE_KEY);
  }

  private loadCellsFromStorage(): Map<string, Cell> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const entries: [string, Cell][] = JSON.parse(raw);
        return new Map(entries);
      }
    } catch { /* données corrompues → map vide */ }
    return new Map();
  }

  /** Charge le bateau depuis localStorage */
  private loadShipFromStorage(): Ship | null {
    try {
      const raw = localStorage.getItem('3026_ship');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  addTransaction(t: MarketTransaction): void {
    this.transactions.update(ts => [t, ...ts].slice(0, 200));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getResource(type: string): number {
    return this.resources().find(r => r.type === type)?.quantity ?? 0;
  }

  // ── Logs ──────────────────────────────────────────────────────────────────

  log(message: string, type: LogEntry['type'] = ''): void {
    this.logs.update(logs =>
      [{ message, type, timestamp: new Date() }, ...logs].slice(0, 100)
    );
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  showModal(title: string, body: string): void {
    this.modalTitle.set(title);
    this.modalBody.set(body);
    this.modalVisible.set(true);
  }

  hideModal(): void {
    this.modalVisible.set(false);
  }
}
