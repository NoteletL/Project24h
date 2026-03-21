import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { GameStateService } from './game-state.service';

const EXCLUDED: string[] = ['CHARBONIUM'];
const MAX_PRICE = 5;
const POLL_MS   = 15_000;     // poll toutes les 15 s

@Injectable({ providedIn: 'root' })
export class BotService {
  private readonly api  = inject(ApiService);
  private readonly game = inject(GameStateService);

  readonly isRunning     = signal(false);
  readonly purchaseCount = signal(0);
  readonly lastStatus    = signal('');

  private timerId: ReturnType<typeof setInterval> | null = null;

  toggle(): void { this.isRunning() ? this.stop() : this.start(); }

  start(): void {
    if (this.isRunning()) return;
    this.isRunning.set(true);
    this.game.log(`🤖 Bot démarré — achats BOISIUM/FERONIUM ≤ ${MAX_PRICE} OR/u toutes les ${POLL_MS / 1000} s`, 'info');
    this.runCycle();
    this.timerId = setInterval(() => this.runCycle(), POLL_MS);
  }

  stop(): void {
    if (this.timerId !== null) { clearInterval(this.timerId); this.timerId = null; }
    this.isRunning.set(false);
    this.game.log('🤖 Bot arrêté.', 'info');
    this.lastStatus.set('Arrêté');
  }

  private async runCycle(): Promise<void> {
    if (!this.game.playerDetails()?.marketPlaceDiscovered) {
      this.lastStatus.set('Marketplace non découverte');
      return;
    }
    try {
      const offers = await this.api.getMarketplaceOffers();
      const myName = this.game.playerDetails()?.name;
      const money  = this.game.playerDetails()?.money ?? 0;

      const eligible = offers.filter(o =>
        !EXCLUDED.includes(o.resourceType) &&
        o.pricePerResource <= MAX_PRICE    &&
        o.owner?.name !== myName           &&
        o.quantityIn > 0
      );

      if (eligible.length === 0) {
        this.lastStatus.set(`Aucune offre éligible — ${this._time()}`);
        return;
      }

      let budget = money;
      let bought = 0;

      for (const offer of eligible) {
        if (budget <= 0) break;
        const qty = Math.min(offer.quantityIn, Math.floor(budget / offer.pricePerResource));
        if (qty <= 0) continue;
        try {
          await this.api.purchaseOffer({ offerId: offer.id, quantity: qty });
          const cost = qty * offer.pricePerResource;
          budget -= cost;
          bought += qty;
          this.purchaseCount.update(c => c + qty);
          this.game.addTransaction({
            timestamp:    new Date(),
            resourceType: offer.resourceType,
            quantity:     qty,
            pricePerUnit: offer.pricePerResource,
            totalCost:    cost,
            source:       'bot',
          });
          this.game.log(
            `🤖 ${qty}× ${offer.resourceType} @ ${offer.pricePerResource} OR/u = ${cost} OR`,
            'action'
          );
        } catch (e: any) {
          this.game.log(`🤖 Échec ${offer.resourceType} : ${e.message}`, 'warning');
        }
      }

      if (bought > 0) {
        try {
          this.game.resources.set(await this.api.getResources());
          this.game.playerDetails.set(await this.api.getPlayerDetails());
        } catch { /* silencieux */ }
      }

      this.lastStatus.set(
        bought > 0
          ? `${bought} unité(s) achetée(s) — ${this._time()}`
          : `Budget insuffisant — ${this._time()}`
      );
    } catch (e: any) {
      this.game.log(`🤖 Erreur cycle : ${e.message}`, 'warning');
      this.lastStatus.set(`Erreur — ${this._time()}`);
    }
  }

  private _time(): string {
    return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
