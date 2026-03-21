import { Injectable, signal } from '@angular/core';
import { Cell, Ship, Resource, PlayerDetails, DiscoveredIsland } from './api.service';

export interface LogEntry {
  message: string;
  type: 'action' | 'error' | 'info' | 'warning' | '';
  timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class GameStateService {
  // Auth
  readonly token = signal('');
  readonly isAuthenticated = signal(false);

  // Player
  readonly playerDetails = signal<PlayerDetails | null>(null);

  // Map — cellules découvertes (accumulées)
  readonly knownCells = signal<Map<string, Cell>>(new Map());

  // Ship
  readonly ship = signal<Ship | null>(null);

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
}
