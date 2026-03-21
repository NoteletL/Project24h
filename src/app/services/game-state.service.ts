import { Injectable, effect, signal } from '@angular/core';
import { Cell, Ship, Resource, PlayerDetails, DiscoveredIsland } from './api.service';

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

  // Map — cellules découvertes (accumulées, persistées dans localStorage)
  readonly knownCells = signal<Map<string, Cell>>(this.loadCellsFromStorage());

  // Ship — persisté dans localStorage pour survie au rechargement
  readonly shipId = signal<string>(localStorage.getItem('3026_ship_id') ?? '');
  readonly ship   = signal<Ship | null>(this.loadShipFromStorage());

  // Resources (tableau tel que retourné par l'API)
  readonly resources = signal<Resource[]>([]);

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

  /** Ajoute ou met à jour des cellules dans la map connue */
  addCells(cells: Cell[]) {
    this.knownCells.update(map => {
      const next = new Map(map);
      for (const c of cells) next.set(c.id, c);
      return next;
    });
  }

  /** Retourne la quantité d'une ressource donnée */
  getResource(type: string): number {
    return this.resources().find(r => r.type === type)?.quantity ?? 0;
  }

  log(message: string, type: LogEntry['type'] = '') {
    const entry: LogEntry = { message, type, timestamp: new Date() };
    this.logs.update(logs => [entry, ...logs].slice(0, 100));
  }

  showModal(title: string, body: string) {
    this.modalTitle.set(title);
    this.modalBody.set(body);
    this.modalVisible.set(true);
  }

  hideModal() {
    this.modalVisible.set(false);
  }

  addTransaction(t: MarketTransaction): void {
    this.transactions.update(ts => [t, ...ts].slice(0, 200));
  }

  constructor() {
    // Persiste automatiquement les cellules à chaque changement
    effect(() => {
      const entries = Array.from(this.knownCells().entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    });
    // Persiste l'état du bateau à chaque changement
    effect(() => {
      const s = this.ship();
      if (s) localStorage.setItem('3026_ship', JSON.stringify(s));
      else   localStorage.removeItem('3026_ship');
    });
  }

  /** Charge les cellules depuis localStorage (appelé à l'initialisation) */
  private loadCellsFromStorage(): Map<string, Cell> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const entries: [string, Cell][] = JSON.parse(raw);
        return new Map(entries);
      }
    } catch {
      // Données corrompues : on repart d'une map vide
    }
    return new Map();
  }

  /** Efface les cellules découvertes (mémoire + localStorage) */
  clearCells() {
    this.knownCells.set(new Map());
  }

  /** Charge le bateau depuis localStorage */
  private loadShipFromStorage(): Ship | null {
    try {
      const raw = localStorage.getItem('3026_ship');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}
