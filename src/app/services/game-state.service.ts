import { Injectable, signal } from '@angular/core';
import { Cell, Ship, Resources, StorageInfo, Island, PlayerInfo, MarketOffer, Tax } from './api.service';

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
  readonly player = signal<PlayerInfo | null>(null);

  // Map
  readonly cells = signal<Cell[]>([]);

  // Ship
  readonly ship = signal<Ship | null>(null);

  // Resources
  readonly resources = signal<Resources>({ boisium: 0, feronium: 0, charbonium: 0, or: 0 });
  readonly storage = signal<StorageInfo>({
    boisium: { current: 0, max: 0 },
    feronium: { current: 0, max: 0 },
    charbonium: { current: 0, max: 0 },
  });

  // Islands
  readonly islands = signal<Island[]>([]);

  // Marketplace
  readonly marketOffers = signal<MarketOffer[]>([]);

  // Taxes
  readonly taxes = signal<Tax[]>([]);

  // Logs
  readonly logs = signal<LogEntry[]>([
    { message: 'Bienvenue dans 3026 ! Commencez par vous inscrire.', type: 'info', timestamp: new Date() }
  ]);

  // Modal
  readonly modalVisible = signal(false);
  readonly modalTitle = signal('');
  readonly modalBody = signal('');

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
