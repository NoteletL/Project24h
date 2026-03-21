import { Component, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Offer, OfferCreateRequest, ResourceType } from '../../services/api.service';
import { GameStateService, MarketTransaction } from '../../services/game-state.service';
import { PriceHistoryService } from '../../services/price-history.service';
import { BotService } from '../../services/bot.service';

// Dimensions du graphique SVG
const CW = 400, CH = 130, PAD = { l: 32, t: 12, r: 16, b: 22 };

@Component({
  selector: 'app-market-dashboard',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './market-dashboard.html',
  styleUrl: './market-dashboard.css',
})
export class MarketDashboardComponent implements OnInit {
  private readonly api  = inject(ApiService);
  readonly game         = inject(GameStateService);
  readonly priceHistory = inject(PriceHistoryService);
  readonly bot          = inject(BotService);

  readonly offers         = signal<Offer[]>([]);
  readonly loading        = signal(false);
  readonly error          = signal('');
  readonly success        = signal('');
  readonly buyingOfferId  = signal<string | null>(null);

  buyQty       = 1;
  sellResource: ResourceType = 'BOISIUM';
  sellQty      = 0;
  sellPrice    = 0;

  /** État d'ouverture de chaque accordéon */
  openSections = signal<Record<string, boolean>>({
    buy:     true,
    sell:    true,
    chart:   true,
    history: false,
    bot:     false,
  });

  readonly resources: ResourceType[] = ['BOISIUM', 'FERONIUM', 'CHARBONIUM'];

  readonly chartLines: { key: string; label: string; color: string }[] = [
    { key: 'BOISIUM',  label: '🪵 BOISIUM',  color: '#4ecca3' },
    { key: 'FERONIUM', label: '⛏️ FERONIUM', color: '#38b6ff' },
  ];

  // ── Getters ──────────────────────────────────────────────────────────────

  get marketDiscovered(): boolean {
    return this.game.playerDetails()?.marketPlaceDiscovered ?? false;
  }

  get myOffer(): Offer | null {
    const myName = this.game.playerDetails()?.name;
    return this.offers().find(o => o.owner?.name === myName) ?? null;
  }

  get otherOffers(): Offer[] {
    const myName = this.game.playerDetails()?.name;
    return this.offers().filter(o => o.owner?.name !== myName && o.quantityIn > 0);
  }

  get transactions(): MarketTransaction[] {
    return this.game.transactions();
  }

  /** Données calculées pour le graphique SVG. Retourne null si pas assez de données. */
  get chartData() {
    const history = this.priceHistory.history();
    const allPts  = this.chartLines.flatMap(l => history[l.key] ?? []);
    if (allPts.length < 2) return null;

    const minT = Math.min(...allPts.map(p => p.timestamp));
    const maxT = Math.max(...allPts.map(p => p.timestamp));
    const maxP = Math.max(8, ...allPts.map(p => p.maxPrice));
    const tRange = maxT - minT || 1;

    const w = CW - PAD.l - PAD.r;
    const h = CH - PAD.t - PAD.b;
    const toX = (t: number) => PAD.l + ((t - minT) / tRange) * w;
    const toY = (p: number) => PAD.t + (1 - p / maxP) * h;

    const lines = this.chartLines.map(l => ({
      ...l,
      points: (history[l.key] ?? [])
        .map(p => `${toX(p.timestamp).toFixed(1)},${toY(p.avgPrice).toFixed(1)}`)
        .join(' '),
      hasData: (history[l.key] ?? []).length >= 2,
    }));

    const yTicks = [0, Math.round(maxP / 2), maxP].map(v => ({
      v, y: toY(v).toFixed(1),
      x: (PAD.l - 4).toString(),
    }));

    const thresholdY = toY(5).toFixed(1);
    const xLabels = [
      { x: toX(minT).toFixed(1), label: this.fmtTime(minT) },
      { x: toX(maxT).toFixed(1), label: this.fmtTime(maxT) },
    ];

    return { lines, yTicks, thresholdY, xLabels, CW, CH, PAD };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    if (this.marketDiscovered) {
      this.loadOffers();
      this.priceHistory.start();
    }
  }

  // ── Accordéon ────────────────────────────────────────────────────────────

  toggleSection(section: string): void {
    this.openSections.update(s => ({ ...s, [section]: !s[section] }));
  }

  isSectionOpen(section: string): boolean {
    return !!this.openSections()[section];
  }

  // ── Chargement ───────────────────────────────────────────────────────────

  async loadOffers(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.offers.set(await this.api.getMarketplaceOffers());
      const my = this.myOffer;
      if (my) {
        this.sellResource = my.resourceType as ResourceType;
        this.sellQty      = my.quantityIn;
        this.sellPrice    = my.pricePerResource;
      }
    } catch (e: any) {
      this.error.set(`Erreur chargement : ${e.message}`);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Achat ────────────────────────────────────────────────────────────────

  startBuy(offer: Offer): void {
    this.buyingOfferId.set(offer.id);
    this.buyQty = 1;
    this.error.set('');
    this.success.set('');
  }

  cancelBuy(): void { this.buyingOfferId.set(null); }

  async confirmBuy(): Promise<void> {
    const offerId = this.buyingOfferId();
    if (!offerId || this.buyQty < 1) return;
    const offer = this.otherOffers.find(o => o.id === offerId);
    this.loading.set(true);
    this.error.set('');
    try {
      await this.api.purchaseOffer({ offerId, quantity: this.buyQty });
      if (offer) {
        this.game.addTransaction({
          timestamp:    new Date(),
          resourceType: offer.resourceType,
          quantity:     this.buyQty,
          pricePerUnit: offer.pricePerResource,
          totalCost:    this.buyQty * offer.pricePerResource,
          source:       'manual',
        });
      }
      this.success.set(`✅ Achat de ${this.buyQty} unité(s) confirmé !`);
      this.buyingOfferId.set(null);
      await this.loadOffers();
      await this.refreshResources();
    } catch (e: any) {
      this.error.set(`Erreur achat : ${e.message}`);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Vente ────────────────────────────────────────────────────────────────

  async publishOffer(): Promise<void> {
    if (!this.sellQty || !this.sellPrice) {
      this.error.set('Veuillez renseigner la quantité et le prix.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const req: OfferCreateRequest = {
      resourceType:     this.sellResource,
      quantityIn:       this.sellQty,
      pricePerResource: this.sellPrice,
    };
    try {
      if (this.myOffer) {
        await this.api.updateOffer(req);
        this.success.set('✅ Offre mise à jour !');
      } else {
        await this.api.createOffer(req);
        this.success.set('✅ Offre publiée !');
      }
      await this.loadOffers();
    } catch (e: any) {
      this.error.set(`Erreur publication : ${e.message}`);
    } finally {
      this.loading.set(false);
    }
  }

  async deleteMyOffer(): Promise<void> {
    const offer = this.myOffer;
    if (!offer) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.api.deleteOffer(offer.id);
      this.success.set('🗑️ Offre supprimée.');
      await this.loadOffers();
    } catch (e: any) {
      this.error.set(`Erreur suppression : ${e.message}`);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Utilitaires ──────────────────────────────────────────────────────────

  private async refreshResources(): Promise<void> {
    try {
      this.game.resources.set(await this.api.getResources());
      this.game.playerDetails.set(await this.api.getPlayerDetails());
    } catch { /* silencieux */ }
  }

  resourceIcon(type: string): string {
    return type === 'BOISIUM' ? '🪵' : type === 'FERONIUM' ? '⛏️' : '🪨';
  }

  fmtTime(ts: number | Date): string {
    const d = typeof ts === 'number' ? new Date(ts) : ts;
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

