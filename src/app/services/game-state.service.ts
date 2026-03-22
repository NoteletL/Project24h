import { Injectable, signal, computed, effect } from '@angular/core';
import { Ship, Resource, PlayerDetails } from './api.service';
import { Cell, MapState } from '../models/map.model';

const STORAGE_KEY = '3026_known_cells';
const MAX_PERSISTED_CELLS = 2000; // limite pour ne pas exploser le quota localStorage

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

  // Map — couche de base chargée depuis map.json (non persistée dans localStorage)
  readonly baseMapCells = signal<Map<string, Cell>>(new Map());

  // Map — cellules découvertes en jeu, persistées dans localStorage
  readonly persistedCells = signal<Map<string, Cell>>(this.loadCellsFromStorage());

  /**
   * Vue fusionnée : baseMapCells (fond statique) + persistedCells (jeu en cours).
   * persistedCells a la priorité sur baseMapCells pour les mêmes coordonnées.
   */
  readonly knownCells = computed<Map<string, Cell>>(() => {
    const merged = new Map(this.baseMapCells());
    for (const [k, v] of this.persistedCells()) merged.set(k, v);
    return merged;
  });

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
    // Persiste uniquement les cellules découvertes en jeu (pas la carte de base)
    effect(() => {
      this.persistCells(this.persistedCells());
    });
    // Persiste le bateau dans localStorage à chaque changement
    effect(() => {
      const s = this.ship();
      if (s) localStorage.setItem('3026_ship', JSON.stringify(s));
      else   localStorage.removeItem('3026_ship');
    });
  }

  // ── Map ───────────────────────────────────────────────────────────────────

  /**
   * Initialise la couche de base depuis map.json.
   * Appelé une seule fois au démarrage, avant l'authentification.
   * Ces cellules ne sont pas persistées dans localStorage.
   */
  initBaseMap(cells: Cell[]): void {
    const map = new Map<string, Cell>();
    for (const c of cells) {
      if (c.id) map.set(c.id, c);
    }
    this.baseMapCells.set(map);
  }

  /** Ajoute ou met à jour des cellules dans la couche persistée (découvertes en jeu) */
  addCells(cells: Cell[]): void {
    this.persistedCells.update(map => {
      const next = new Map(map);
      for (const c of cells) next.set(c.id, c);
      return next;
    });
  }

  /** Efface les cellules découvertes en jeu (mémoire + localStorage). La carte de base reste intacte. */
  clearCells(): void {
    this.persistedCells.set(new Map());
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  /** Persiste un sous-ensemble de cellules (les plus proches du bateau) */
  private persistCells(map: Map<string, Cell>): void {
    try {
      let entries = Array.from(map.entries());

      // Si trop de cellules, garder celles autour du bateau
      if (entries.length > MAX_PERSISTED_CELLS) {
        const ship = this.ship();
        const bx = ship?.currentPosition?.x ?? 0;
        const by = ship?.currentPosition?.y ?? 0;

        // Trier par distance au bateau, garder les plus proches
        entries.sort((a, b) => {
          const da = Math.abs(a[1].x - bx) + Math.abs(a[1].y - by);
          const db = Math.abs(b[1].x - bx) + Math.abs(b[1].y - by);
          return da - db;
        });
        entries = entries.slice(0, MAX_PERSISTED_CELLS);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // QuotaExceededError — on tente avec moins de cellules
      try {
        const entries = Array.from(map.entries()).slice(0, 500);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      } catch {
        // Abandonner la persistance silencieusement
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* rien */ }
      }
    }
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
