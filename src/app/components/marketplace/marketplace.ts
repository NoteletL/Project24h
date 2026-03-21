import { Component, signal, inject, ElementRef, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Offer, OfferCreateRequest, ResourceType } from '../../services/api.service';
import { GameStateService } from '../../services/game-state.service';

@Component({
  selector: 'app-marketplace',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './marketplace.html',
  styleUrl: './marketplace.css',
})
export class MarketplaceComponent {
  private readonly api  = inject(ApiService);
  readonly game         = inject(GameStateService);

  readonly isOpen         = signal(false);
  readonly activeTab      = signal<'buy' | 'sell'>('buy');
  readonly offers         = signal<Offer[]>([]);
  readonly loading        = signal(false);
  readonly error          = signal('');
  readonly success        = signal('');
  readonly buyingOfferId  = signal<string | null>(null);

  buyQty       = 1;
  sellResource: ResourceType = 'BOISIUM';
  sellQty      = 0;
  sellPrice    = 0;

  private triggerEl: HTMLElement | null = null;
  private readonly panelEl  = viewChild<ElementRef<HTMLDivElement>>('panelEl');
  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');

  readonly resources: ResourceType[] = ['BOISIUM', 'FERONIUM', 'CHARBONIUM'];

  get marketDiscovered(): boolean {
    return this.game.playerDetails()?.marketPlaceDiscovered ?? false;
  }

  get myOffer(): Offer | null {
    const myName = this.game.playerDetails()?.name;
    return this.offers().find(o => o.owner?.name === myName) ?? null;
  }

  get otherOffers(): Offer[] {
    const myName = this.game.playerDetails()?.name;
    return this.offers().filter(o => o.owner?.name !== myName);
  }

  open(): void {
    this.triggerEl = document.activeElement as HTMLElement;
    this.error.set('');
    this.success.set('');
    this.isOpen.set(true);
    if (this.marketDiscovered) this.loadOffers();
    setTimeout(() => this.closeBtn()?.nativeElement.focus(), 50);
  }

  close(): void {
    this.isOpen.set(false);
    setTimeout(() => this.triggerEl?.focus(), 50);
  }

  async loadOffers(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.offers.set(await this.api.getMarketplaceOffers());
      // Pré-remplir le formulaire de vente si une offre existe déjà
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

  setTab(tab: 'buy' | 'sell'): void {
    this.activeTab.set(tab);
    this.error.set('');
    this.success.set('');
    this.buyingOfferId.set(null);
  }

  startBuy(offer: Offer): void {
    this.buyingOfferId.set(offer.id);
    this.buyQty = 1;
    this.error.set('');
    this.success.set('');
  }

  cancelBuy(): void {
    this.buyingOfferId.set(null);
  }

  async confirmBuy(): Promise<void> {
    const offerId = this.buyingOfferId();
    if (!offerId || this.buyQty < 1) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.api.purchaseOffer({ offerId, quantity: this.buyQty });
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

  async publishOffer(): Promise<void> {
    if (!this.sellQty || !this.sellPrice) {
      this.error.set('Veuillez renseigner la quantité et le prix.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const req: OfferCreateRequest = {
      resourceType: this.sellResource,
      quantityIn: this.sellQty,
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

  private async refreshResources(): Promise<void> {
    try {
      this.game.resources.set(await this.api.getResources());
    } catch { /* silencieux */ }
  }

  resourceIcon(type: string): string {
    return type === 'BOISIUM' ? '🪵' : type === 'FERONIUM' ? '⛏️' : '🪨';
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('market-overlay')) this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.stopPropagation(); this.close(); return; }
    if (event.key !== 'Tab') return;
    const panel = this.panelEl()?.nativeElement;
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
    if (focusables.length < 2) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
}

