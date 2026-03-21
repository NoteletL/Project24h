import { Component, signal, inject, OnDestroy, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrokerService, BrokerLogEntry, BrokerOffer } from '../../services/broker.service';
import { ApiService, ResourceType } from '../../services/api.service';
import { GameStateService } from '../../services/game-state.service';

export interface BrokerBotRule {
  resource:     ResourceType | 'ANY';
  maxPrice:     number;
  maxQtyPerBuy: number;
  /** Nombre total d'unités max à acheter (0 = illimité) */
  maxTotalBuy:  number;
}

@Component({
  selector: 'app-broker-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './broker-panel.html',
  styleUrl: './broker-panel.css',
})
export class BrokerPanelComponent implements OnDestroy {
  readonly broker = inject(BrokerService);
  private readonly api  = inject(ApiService);
  readonly game   = inject(GameStateService);

  // ── Bot broker ────────────────────────────────────────────────────────────

  /** Bot activé/désactivé (désactivé par défaut) */
  readonly botEnabled    = signal(false);
  readonly botBuying     = signal(false);
  readonly botBoughtTotal = signal(0);
  readonly botLastAction  = signal('');

  rule: BrokerBotRule = {
    resource:     'ANY',
    maxPrice:     5,
    maxQtyPerBuy: 50,
    maxTotalBuy:  0,
  };

  readonly resources: (ResourceType | 'ANY')[] = ['ANY', 'BOISIUM', 'FERONIUM', 'CHARBONIUM'];

  // ── Achat manuel depuis log ───────────────────────────────────────────────

  readonly buyingLogId    = signal<number | null>(null);
  readonly manualQty      = signal(1);
  readonly buyLoading     = signal(false);
  readonly buyError       = signal('');
  readonly buySuccess     = signal('');

  constructor() {
    // Réagit à chaque nouveau message broker : déclenche le bot si activé
    effect(() => {
      const latest = this.broker.latestMessage();
      if (latest?.offer) {
        this.onBotOffer(latest.offer);
      }
    });
  }

  // ── Connexion ─────────────────────────────────────────────────────────────

  /** Ouvre la connexion. Branchée au click "Se connecter". */
  connect(): void { this.broker.connect(); }
  disconnect(): void { this.broker.disconnect(); }

  // ── Bot ───────────────────────────────────────────────────────────────────

  toggleBot(): void {
    if (this.botEnabled()) {
      this.botEnabled.set(false);
      this.botLastAction.set('Bot arrêté manuellement.');
      this.game.log('🤖 Bot broker arrêté.', 'info');
    } else {
      if (!this.broker.connected()) {
        this.buyError.set('Connectez-vous d\'abord au broker pour activer le bot.');
        return;
      }
      // Réinitialiser le compteur à chaque activation
      this.botBoughtTotal.set(0);
      this.botEnabled.set(true);
      this.botLastAction.set('Bot activé — en attente de messages…');
      this.game.log(`🤖 Bot broker activé — ${this.ruleDescription()}`, 'info');
    }
  }

  ruleDescription(): string {
    const r = this.rule.resource === 'ANY' ? 'toutes ressources' : this.rule.resource;
    const limit = this.rule.maxTotalBuy > 0 ? `, limite ${this.rule.maxTotalBuy} unités` : '';
    return `${r} ≤ 💰 ${this.rule.maxPrice}/u, max ${this.rule.maxQtyPerBuy}/achat${limit}`;
  }

  /** Nombre d'unités restantes avant d'atteindre la limite (Infinity si pas de limite). */
  get remainingBudgetUnits(): number {
    if (this.rule.maxTotalBuy <= 0) return Infinity;
    return Math.max(0, this.rule.maxTotalBuy - this.botBoughtTotal());
  }

  /** Pourcentage de progression vers la limite (0–100), null si pas de limite. */
  get progressPercent(): number | null {
    if (this.rule.maxTotalBuy <= 0) return null;
    return Math.min(100, Math.round((this.botBoughtTotal() / this.rule.maxTotalBuy) * 100));
  }

  /** Vrai quand la limite totale est atteinte. */
  get limitReached(): boolean {
    return this.rule.maxTotalBuy > 0 && this.botBoughtTotal() >= this.rule.maxTotalBuy;
  }

  /** Appelée par le template lors d'un nouveau message broker contenant une offre. */
  async onBotOffer(offer: BrokerOffer): Promise<void> {
    if (!this.botEnabled() || this.botBuying()) return;
    if (!this.matchesRule(offer)) return;

    // Vérifier la limite totale d'unités
    if (this.limitReached) {
      this._autoStopBot();
      return;
    }

    const player = this.game.playerDetails();
    if (!player || player.money <= 0) return;

    // On ne rachète pas ses propres offres
    if (offer.ownerName && offer.ownerName === player.name) return;

    const maxAffordable  = Math.floor(player.money / offer.pricePerResource);
    const maxByTotalLimit = this.remainingBudgetUnits === Infinity
      ? offer.quantityIn
      : this.remainingBudgetUnits;

    const qty = Math.min(offer.quantityIn, this.rule.maxQtyPerBuy, maxAffordable, maxByTotalLimit);
    if (qty <= 0) {
      this.botLastAction.set(`💰 Budget insuffisant pour ${offer.resourceType} @ ${offer.pricePerResource} OR/u`);
      return;
    }

    this.botBuying.set(true);
    try {
      await this.api.purchaseOffer({ offerId: offer.id, quantity: qty });
      const cost = qty * offer.pricePerResource;
      this.botBoughtTotal.update(n => n + qty);

      const limitInfo = this.rule.maxTotalBuy > 0
        ? ` [${this.botBoughtTotal()}/${this.rule.maxTotalBuy}]`
        : '';
      this.botLastAction.set(
        `✅ Acheté ${qty}× ${offer.resourceType} @ ${offer.pricePerResource} OR/u = ${cost} OR${limitInfo}`
      );
      this.game.addTransaction({
        timestamp:    new Date(),
        resourceType: offer.resourceType,
        quantity:     qty,
        pricePerUnit: offer.pricePerResource,
        totalCost:    cost,
        source:       'bot',
      });
      this.game.log(`🤖 [Broker bot] ${qty}× ${offer.resourceType} @ ${offer.pricePerResource} = ${cost} OR${limitInfo}`, 'action');

      // Auto-stop si la limite est atteinte après cet achat
      if (this.limitReached) {
        this._autoStopBot();
      }

      // Rafraîchir les données joueur
      try {
        this.game.resources.set(await this.api.getResources());
        this.game.playerDetails.set(await this.api.getPlayerDetails());
      } catch { /* silencieux */ }
    } catch (e: any) {
      this.botLastAction.set(`❌ Erreur achat : ${e.message}`);
      this.game.log(`🤖 [Broker bot] Erreur : ${e.message}`, 'warning');
    } finally {
      this.botBuying.set(false);
    }
  }

  private _autoStopBot(): void {
    this.botEnabled.set(false);
    const msg = `🏁 Limite de ${this.rule.maxTotalBuy} unité(s) atteinte — bot arrêté automatiquement.`;
    this.botLastAction.set(msg);
    this.game.log(`🤖 Bot broker — ${msg}`, 'info');
  }

  private matchesRule(offer: BrokerOffer): boolean {
    if (this.rule.resource !== 'ANY' && offer.resourceType !== this.rule.resource) return false;
    if (offer.pricePerResource > this.rule.maxPrice) return false;
    if (offer.quantityIn <= 0) return false;
    return true;
  }

  // ── Achat manuel depuis un message ────────────────────────────────────────

  startManualBuy(entry: BrokerLogEntry): void {
    this.buyingLogId.set(entry.id);
    this.manualQty.set(Math.min(1, entry.offer?.quantityIn ?? 1));
    this.buyError.set('');
    this.buySuccess.set('');
  }

  cancelManualBuy(): void { this.buyingLogId.set(null); }

  async confirmManualBuy(entry: BrokerLogEntry): Promise<void> {
    const offer = entry.offer;
    if (!offer || this.manualQty() < 1) return;

    this.buyLoading.set(true);
    this.buyError.set('');
    this.buySuccess.set('');
    try {
      await this.api.purchaseOffer({ offerId: offer.id, quantity: this.manualQty() });
      const cost = this.manualQty() * offer.pricePerResource;
      this.buySuccess.set(`✅ Acheté ${this.manualQty()}× ${offer.resourceType} = ${cost} OR`);
      this.game.addTransaction({
        timestamp:    new Date(),
        resourceType: offer.resourceType,
        quantity:     this.manualQty(),
        pricePerUnit: offer.pricePerResource,
        totalCost:    cost,
        source:       'manual',
      });
      this.buyingLogId.set(null);
      try {
        this.game.resources.set(await this.api.getResources());
        this.game.playerDetails.set(await this.api.getPlayerDetails());
      } catch { /* silencieux */ }
    } catch (e: any) {
      this.buyError.set(`Erreur : ${e.message}`);
    } finally {
      this.buyLoading.set(false);
    }
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────

  resourceIcon(type: string): string {
    return type === 'BOISIUM' ? '🪵' : type === 'FERONIUM' ? '⛏️' : type === 'CHARBONIUM' ? '🪨' : '📦';
  }

  fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  trackById(_i: number, e: BrokerLogEntry): number { return e.id; }

  ngOnDestroy(): void { /* broker service s'auto-déconnecte via ngOnDestroy */ }
}





