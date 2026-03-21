import {
  Component, signal, inject, ElementRef, viewChild,
  OnInit, OnDestroy, computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, interval, takeUntil } from 'rxjs';
import { ResourceType } from '../../services/api.service';
import { GameStateService } from '../../services/game-state.service';
import { PriceHistoryService } from '../../services/price-history.service';
import { SpeculationStrategyService } from '../../services/speculation-strategy.service';
import { AppState } from '../../store/app.state';
import { MarketActions } from '../../store/market/market.actions';
import { BrokerActions } from '../../store/broker/broker.actions';
import {
  selectAllOffers, selectMarketLoading, selectMarketError,
  selectMarketSuccess, selectCooldownUntil,
} from '../../store/market/market.selectors';
import { selectPlayerName, selectPlayerMoney } from '../../store/player/player.selectors';
import { selectRecentHistory } from '../../store/history/history.selectors';
import { selectBrokerStatus } from '../../store/broker/broker.selectors';
import {
  undo, redo, getUndoCount, getRedoCount,
} from '../../store/meta-reducers/undo-redo.meta-reducer';

const CW = 360, CH = 120, PAD = { l: 32, t: 12, r: 16, b: 22 };
type TabId = 'buy' | 'sell' | 'chart' | 'history' | 'signals';

@Component({
  selector:    'app-marketplace',
  standalone:  true,
  imports:     [FormsModule],
  templateUrl: './marketplace.html',
  styleUrl:    './marketplace.css',
})
export class MarketplaceComponent implements OnInit, OnDestroy {
  private readonly store    = inject(Store<AppState>);
  readonly game             = inject(GameStateService);
  readonly priceHistory     = inject(PriceHistoryService);
  private readonly strategy = inject(SpeculationStrategyService);
  private readonly destroy$ = new Subject<void>();

  // ── NgRx → Signals ────────────────────────────────────────────────────────
  readonly allOffers     = toSignal(this.store.select(selectAllOffers),    { initialValue: [] });
  readonly loading       = toSignal(this.store.select(selectMarketLoading), { initialValue: false });
  readonly storeError    = toSignal(this.store.select(selectMarketError),   { initialValue: null });
  readonly storeSuccess  = toSignal(this.store.select(selectMarketSuccess), { initialValue: null });
  readonly cooldownUntil = toSignal(this.store.select(selectCooldownUntil), { initialValue: null });
  readonly playerName    = toSignal(this.store.select(selectPlayerName),    { initialValue: null });
  readonly playerMoney   = toSignal(this.store.select(selectPlayerMoney),   { initialValue: 0 });
  readonly brokerStatus  = toSignal(this.store.select(selectBrokerStatus),  { initialValue: 'idle' as const });
  readonly ngRxHistory   = toSignal(this.store.select(selectRecentHistory), { initialValue: [] });

  // ── Local UI signals ──────────────────────────────────────────────────────
  readonly isOpen            = signal(false);
  readonly activeTab         = signal<TabId>('buy');
  readonly error             = signal('');
  readonly success           = signal('');
  readonly buyingOfferId     = signal<string | null>(null);
  readonly cooldownRemaining = signal(0);
  readonly canUndoSig        = signal(0);
  readonly canRedoSig        = signal(0);

  buyQty       = 1;
  sellResource: ResourceType = 'BOISIUM';
  sellQty      = 0;
  sellPrice    = 0;

  private triggerEl: HTMLElement | null = null;
  private readonly panelEl  = viewChild<ElementRef<HTMLDivElement>>('panelEl');
  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');

  readonly resources: ResourceType[] = ['BOISIUM', 'FERONIUM', 'CHARBONIUM'];
  readonly chartLines = [
    { key: 'BOISIUM',  label: '🪵 BOISIUM',  color: '#4ecca3' },
    { key: 'FERONIUM', label: '⛏️ FERONIUM', color: '#38b6ff' },
  ];

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly marketDiscovered = computed(
    () => this.game.playerDetails()?.marketPlaceDiscovered ?? false
  );
  readonly myOffer = computed(() => {
    const name = this.playerName();
    return this.allOffers().find(o => o.owner?.name === name) ?? null;
  });
  readonly otherOffers = computed(() => {
    const name = this.playerName();
    return this.allOffers().filter(o => o.owner?.name !== name);
  });
  readonly isCooldownActive = computed(() => {
    const until = this.cooldownUntil();
    return until !== null && Date.now() < until;
  });

  get transactions() { return this.ngRxHistory(); }

  get speculSignals(): string[] {
    const hist = this.priceHistory.history();
    return ['BOISIUM', 'FERONIUM'].map(r =>
      this.strategy.signalLabel(this.strategy.getSellSignal(r, hist))
    );
  }

  get chartData() {
    const history = this.priceHistory.history();
    const allPts  = this.chartLines.flatMap(l => history[l.key] ?? []);
    if (allPts.length < 2) return null;
    const minT   = Math.min(...allPts.map(p => p.timestamp));
    const maxT   = Math.max(...allPts.map(p => p.timestamp));
    const maxP   = Math.max(8, ...allPts.map(p => p.maxPrice));
    const tRange = maxT - minT || 1;
    const w = CW - PAD.l - PAD.r, h = CH - PAD.t - PAD.b;
    const toX = (t: number) => PAD.l + ((t - minT) / tRange) * w;
    const toY = (p: number) => PAD.t + (1 - p / maxP) * h;
    return {
      CW, CH, PAD,
      lines: this.chartLines.map(l => ({
        ...l,
        points:  (history[l.key] ?? []).map(p => `${toX(p.timestamp).toFixed(1)},${toY(p.avgPrice).toFixed(1)}`).join(' '),
        hasData: (history[l.key] ?? []).length >= 2,
      })),
      yTicks:     [0, Math.round(maxP / 2), maxP].map(v => ({ v, y: toY(v).toFixed(1), x: (PAD.l - 4).toString() })),
      thresholdY: toY(5).toFixed(1),
      xLabels:    [{ x: toX(minT).toFixed(1), label: this.fmtTime(minT) }, { x: toX(maxT).toFixed(1), label: this.fmtTime(maxT) }],
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    interval(1_000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      const until = this.cooldownUntil();
      this.cooldownRemaining.set(until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0);
      this.canUndoSig.set(getUndoCount());
      this.canRedoSig.set(getRedoCount());
    });
    this.store.dispatch(BrokerActions.connect());
    this.store.select(selectMarketError)
      .pipe(takeUntil(this.destroy$))
      .subscribe(e => { if (e) this.error.set(e); });
    this.store.select(selectMarketSuccess)
      .pipe(takeUntil(this.destroy$))
      .subscribe(s => { if (s) this.success.set(s); });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ── Modal ─────────────────────────────────────────────────────────────────
  open(): void {
    this.triggerEl = document.activeElement as HTMLElement;
    this.error.set(''); this.success.set('');
    this.isOpen.set(true);
    if (this.marketDiscovered()) { this.loadOffers(); this.priceHistory.start(); }
    setTimeout(() => this.closeBtn()?.nativeElement.focus(), 50);
  }

  close(): void { this.isOpen.set(false); setTimeout(() => this.triggerEl?.focus(), 50); }

  // ── Market actions ────────────────────────────────────────────────────────
  loadOffers(): void {
    this.error.set('');
    this.store.dispatch(MarketActions.loadOffers());
    const my = this.myOffer();
    if (my) { this.sellResource = my.resourceType as ResourceType; this.sellQty = my.quantityIn; this.sellPrice = my.pricePerResource; }
  }

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
    this.error.set(''); this.success.set('');
    this.buyingOfferId.set(null);
    this.store.dispatch(MarketActions.clearError());
    this.store.dispatch(MarketActions.clearSuccess());
  }

  startBuy(offerId: string): void { this.buyingOfferId.set(offerId); this.buyQty = 1; this.error.set(''); }
  cancelBuy(): void { this.buyingOfferId.set(null); }

  confirmBuy(): void {
    const offerId = this.buyingOfferId();
    if (!offerId || this.buyQty < 1) return;
    this.store.dispatch(MarketActions.buyOffer({ offerId, quantity: this.buyQty }));
    this.buyingOfferId.set(null);
  }

  publishOffer(): void {
    if (!this.sellQty || !this.sellPrice) { this.error.set('Veuillez renseigner la quantité et le prix.'); return; }
    const request = { resourceType: this.sellResource, quantityIn: this.sellQty, pricePerResource: this.sellPrice };
    if (this.myOffer()) this.store.dispatch(MarketActions.updateOffer({ request }));
    else                this.store.dispatch(MarketActions.createOffer({ request }));
  }

  deleteMyOffer(): void {
    const offer = this.myOffer();
    if (offer) this.store.dispatch(MarketActions.deleteOffer({ offerId: offer.id }));
  }

  undoAction(): void { this.store.dispatch(undo()); }
  redoAction(): void { this.store.dispatch(redo()); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  resourceIcon(t: string): string { return t === 'BOISIUM' ? '🪵' : t === 'FERONIUM' ? '⛏️' : '🪨'; }

  fmtTime(ts: number | Date): string {
    const d = typeof ts === 'number' ? new Date(ts) : ts;
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('market-overlay')) this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.stopPropagation(); this.close(); return; }
    if (event.key !== 'Tab') return;
    const panel = this.panelEl()?.nativeElement;
    if (!panel) return;
    const fs = Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
    ));
    if (fs.length < 2) return;
    const [first, last] = [fs[0], fs[fs.length - 1]];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
