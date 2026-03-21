import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { GameStateService } from './game-state.service';

export interface PricePoint {
  timestamp: number;   // unix ms
  minPrice: number;
  avgPrice: number;
  maxPrice: number;
  offerCount: number;
}

const MAX_POINTS = 60;   // 10 min à 10 s
const POLL_MS    = 10_000;

@Injectable({ providedIn: 'root' })
export class PriceHistoryService {
  private readonly api  = inject(ApiService);
  private readonly game = inject(GameStateService);

  readonly history   = signal<Record<string, PricePoint[]>>({});
  readonly isPolling = signal(false);

  private timerId: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.isPolling()) return;
    this.isPolling.set(true);
    this.poll();
    this.timerId = setInterval(() => this.poll(), POLL_MS);
  }

  stop(): void {
    if (this.timerId !== null) { clearInterval(this.timerId); this.timerId = null; }
    this.isPolling.set(false);
  }

  private async poll(): Promise<void> {
    if (!this.game.playerDetails()?.marketPlaceDiscovered) return;
    try {
      const offers = await this.api.getMarketplaceOffers();
      const now    = Date.now();

      // Regrouper les prix par type de ressource
      const byResource: Record<string, number[]> = {};
      for (const offer of offers) {
        (byResource[offer.resourceType] ??= []).push(offer.pricePerResource);
      }

      this.history.update(h => {
        const next = { ...h };
        for (const [res, prices] of Object.entries(byResource)) {
          const point: PricePoint = {
            timestamp:  now,
            minPrice:   Math.min(...prices),
            avgPrice:   prices.reduce((a, b) => a + b, 0) / prices.length,
            maxPrice:   Math.max(...prices),
            offerCount: prices.length,
          };
          next[res] = [...(next[res] ?? []), point].slice(-MAX_POINTS);
        }
        return next;
      });
    } catch { /* silencieux */ }
  }
}

