import { Injectable, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { ApiService } from './api.service';
import { GameStateService } from './game-state.service';
import { PriceHistoryService } from './price-history.service';
import { SpeculationStrategyService, RiskProfile } from './speculation-strategy.service';
import { AppState } from '../store/app.state';
import { HistoryActions } from '../store/history/history.actions';

const EXCLUDED: string[] = ['CHARBONIUM'];
const POLL_MS   = 15_000;

@Injectable({ providedIn: 'root' })
export class BotService {
  private readonly api          = inject(ApiService);
  private readonly game         = inject(GameStateService);
  private readonly priceHistory = inject(PriceHistoryService);
  private readonly strategy     = inject(SpeculationStrategyService);
  private readonly store        = inject(Store<AppState>);

  readonly isRunning     = signal(false);
  readonly purchaseCount = signal(0);
  readonly lastStatus    = signal('');
  readonly signals       = signal<string[]>([]);

  /** Exposition du profil de risque (modifiable depuis l'UI) */
  get riskProfile() { return this.strategy.riskProfile; }

  setRiskProfile(p: RiskProfile): void {
    this.strategy.riskProfile.set(p);
    this.game.log(`🤖 Profil de risque : ${p}`, 'info');
  }

  private timerId: ReturnType<typeof setInterval> | null = null;

  toggle(): void { this.isRunning() ? this.stop() : this.start(); }

  start(): void {
    if (this.isRunning()) return;
    this.isRunning.set(true);
    this.priceHistory.start();
    this.game.log(`🤖 Bot démarré (profil: ${this.strategy.riskProfile()}) — stratégie de spéculation active`, 'info');
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
      const offers  = await this.api.getMarketplaceOffers();
      const myName  = this.game.playerDetails()?.name;
      const money   = this.game.playerDetails()?.money ?? 0;
      const history = this.priceHistory.history();

      // ── Signaux de vente (golden cross) ────────────────────────────────────
      const sellSignals = ['BOISIUM', 'FERONIUM'].map(r =>
        this.strategy.getSellSignal(r, history)
      );
      this.signals.set(sellSignals.map(s => this.strategy.signalLabel(s)));

      // ── Scoring des offres disponibles ─────────────────────────────────────
      const eligible = offers.filter(o =>
        !EXCLUDED.includes(o.resourceType) && o.owner?.name !== myName && o.quantityIn > 0
      );
      const scored = this.strategy.scoreOffers(eligible, history, myName)
        .filter(s => s.signal === 'buy' && s.score > 10);

      if (scored.length === 0) {
        this.lastStatus.set(`Aucune opportunité d'achat — ${this._time()}`);
        return;
      }

      let budget = this.strategy.maxBudget(money);
      let bought = 0;

      for (const { offer } of scored) {
        if (budget <= 15000) break;
        const qty = Math.min(offer.quantityIn, Math.floor(budget / offer.pricePerResource));
        if (qty <= 0) continue;
        try {
          await this.api.purchaseOffer({ offerId: offer.id, quantity: qty });
          const cost = qty * offer.pricePerResource;
          budget -= cost;
          bought += qty;
          this.purchaseCount.update(c => c + qty);
          const tx = {
            timestamp:    new Date(),
            resourceType: offer.resourceType,
            quantity:     qty,
            pricePerUnit: offer.pricePerResource,
            totalCost:    cost,
            source:       'bot' as const,
          };
          this.game.addTransaction(tx);
          this.store.dispatch(HistoryActions.addEntry({ entry: tx }));
          this.game.log(
            `🤖 ${qty}× ${offer.resourceType} @ ${offer.pricePerResource} OR/u = ${cost} OR (score bot: ${scored.find(s => s.offer.id === offer.id)?.score.toFixed(1) ?? '?'})`,
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
          : `Budget insuffisant (${budget} OR) — ${this._time()}`
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
