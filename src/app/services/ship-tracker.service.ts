import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { GameStateService } from './game-state.service';
import { MapService } from './map.service';

const INTERVAL_MS = 5_000;

@Injectable({ providedIn: 'root' })
export class ShipTrackerService {
  private readonly api  = inject(ApiService);
  private readonly game = inject(GameStateService);
  private readonly map  = inject(MapService);

  readonly isRunning  = signal(false);
  readonly lastUpdate = signal<Date | null>(null);
  readonly error      = signal('');

  private timerId: ReturnType<typeof setInterval> | null = null;

  toggle(): void { this.isRunning() ? this.stop() : this.start(); }

  start(): void {
    if (this.isRunning()) return;
    this.isRunning.set(true);
    this.error.set('');
    this.game.log(`📡 Suivi bateau activé — rafraîchissement toutes les ${INTERVAL_MS / 1000} s`, 'info');
    // Premier appel immédiat
    this.poll();
    this.timerId = setInterval(() => this.poll(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timerId !== null) { clearInterval(this.timerId); this.timerId = null; }
    this.isRunning.set(false);
    this.game.log('📡 Suivi bateau désactivé.', 'info');
  }

  private async poll(): Promise<void> {
    try {
      // 1. Position du bateau (game API)
      const ship = await this.api.getShipState();
      if (!ship) return;

      const current = this.game.ship();
      this.game.ship.set({
        ...(current ?? ship),
        availableMove:   ship.availableMove,
        currentPosition: ship.currentPosition,
      });

      if (ship.currentPosition) {
        this.game.addCells([ship.currentPosition]);
      }

      // 2. Cellules connues (map backend localhost:8080)
      try {
        const mapState = await firstValueFrom(this.map.getMap());
        this.game.mapState.set(mapState);
        if (mapState.cells?.length) {
          this.game.addCells(mapState.cells);
        }

      } catch { /* map backend optionnel — silencieux */ }

      this.lastUpdate.set(new Date());
      this.error.set('');
    } catch (e: any) {
      this.error.set(e.message);
    }
  }
}
