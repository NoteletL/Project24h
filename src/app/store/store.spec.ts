import { describe, it, expect, beforeEach } from 'vitest';
import { marketReducer, initialMarketState } from './market/market.reducer';
import { MarketActions } from './market/market.actions';
import { historyReducer, initialHistoryState } from './history/history.reducer';
import { HistoryActions } from './history/history.actions';
import { localStorageMetaReducer, purgeLocalStorage } from './meta-reducers/local-storage.meta-reducer';
import { undoRedoMetaReducer, undo, redo } from './meta-reducers/undo-redo.meta-reducer';
import { INIT } from '@ngrx/store';

// ── Faux localStorage ──────────────────────────────────────────────────────────
const storage: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem:    (k: string) => storage[k] ?? null,
    setItem:    (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear:      () => { Object.keys(storage).forEach(k => delete storage[k]); },
  },
  writable: true,
});

const FAKE_OFFER = {
  id: 'o1', resourceType: 'BOISIUM', quantityIn: 10,
  pricePerResource: 3, owner: { name: 'TeamA' },
};

// ── market.reducer ─────────────────────────────────────────────────────────────
describe('marketReducer', () => {
  it('upsert une offre après loadOffersSuccess', () => {
    const s = marketReducer(initialMarketState, MarketActions.loadOffersSuccess({ offers: [FAKE_OFFER] }));
    expect(s.ids).toContain('o1');
    expect(s.entities['o1']?.quantityIn).toBe(10);
    expect(s.loading).toBe(false);
  });

  it('diminue la quantité lors d\'un achat partiel', () => {
    let s = marketReducer(initialMarketState, MarketActions.loadOffersSuccess({ offers: [FAKE_OFFER] }));
    s = marketReducer(s, MarketActions.buyOfferSuccess({ offerId: 'o1', quantity: 3 }));
    expect(s.entities['o1']?.quantityIn).toBe(7);
  });

  it('supprime l\'offre après achat total', () => {
    let s = marketReducer(initialMarketState, MarketActions.loadOffersSuccess({ offers: [FAKE_OFFER] }));
    s = marketReducer(s, MarketActions.buyOfferSuccess({ offerId: 'o1', quantity: 10 }));
    expect(s.ids).not.toContain('o1');
  });

  it('active le cooldown après createOfferSuccess', () => {
    const s = marketReducer(initialMarketState, MarketActions.createOfferSuccess({ offer: FAKE_OFFER }));
    expect(s.cooldownUntil).not.toBeNull();
    expect(s.cooldownUntil!).toBeGreaterThan(Date.now());
  });

  it('affiche un message d\'erreur convivial pour insufficient_funds', () => {
    const s = marketReducer(initialMarketState, MarketActions.buyOfferFailure({ error: 'insufficient_funds' }));
    expect(s.error).toContain('Fonds insuffisants');
  });
});

// ── history.reducer ────────────────────────────────────────────────────────────
describe('historyReducer', () => {
  const mkTx = (n: number) => ({
    timestamp:    new Date(n),
    resourceType: 'BOISIUM',
    quantity:     1,
    pricePerUnit: 3,
    totalCost:    3,
    source:       'manual' as const,
  });

  it('ajoute une entrée en tête de liste', () => {
    const s = historyReducer(initialHistoryState, HistoryActions.addEntry({ entry: mkTx(1) }));
    expect(s.entries).toHaveLength(1);
  });

  it('respecte la limite FIFO de 500 entrées', () => {
    let s = initialHistoryState;
    for (let i = 0; i < 505; i++) {
      s = historyReducer(s, HistoryActions.addEntry({ entry: mkTx(i) }));
    }
    expect(s.entries).toHaveLength(500);
    // Les plus récentes sont en tête
    expect(s.entries[0].timestamp.getTime()).toBe(504);
  });

  it('vide les entrées sur clear', () => {
    let s = historyReducer(initialHistoryState, HistoryActions.addEntry({ entry: mkTx(1) }));
    s = historyReducer(s, HistoryActions.clear());
    expect(s.entries).toHaveLength(0);
  });
});

// ── localStorageMetaReducer ────────────────────────────────────────────────────
describe('localStorageMetaReducer', () => {
  it('rehydrate l\'état depuis localStorage sur INIT', () => {
    const fakeState: any = {
      market:  { ids: [], entities: {}, loading: false, error: null, successMsg: null, myOfferOwner: null, cooldownUntil: null },
      history: { entries: [{ timestamp: '2026-01-01', resourceType: 'BOISIUM', quantity: 5, pricePerUnit: 3, totalCost: 15, source: 'bot' }], loaded: true },
      broker:  { status: 'idle', lastEvent: null, error: null },
      player:  { details: null, resources: [], loading: false, error: null },
    };
    localStorage.setItem('3026_store_history', JSON.stringify(fakeState.history));

    const wrapped = localStorageMetaReducer((s: any) => s ?? fakeState);
    const result  = wrapped(undefined as any, { type: INIT });
    expect(result.history.entries).toHaveLength(1);
    expect(result.history.entries[0].resourceType).toBe('BOISIUM');
  });
});

// ── undoRedoMetaReducer ───────────────────────────────────────────────────────
describe('undoRedoMetaReducer', () => {
  const baseState: any = {
    market:  { ...initialMarketState },
    history: { ...initialHistoryState },
    broker:  { status: 'idle', lastEvent: null, error: null },
    player:  { details: null, resources: [], loading: false, error: null },
  };

  it('permet d\'annuler un changement d\'état market', () => {
    const reducer = undoRedoMetaReducer((s: any, a: any) => {
      if (a.type === 'TEST') return { ...s, market: { ...s.market, loading: true } };
      return s ?? baseState;
    });

    const s0 = reducer(baseState, { type: '@@INIT' });
    const s1 = reducer(s0, { type: 'TEST' });
    expect(s1.market.loading).toBe(true);

    const s2 = reducer(s1, undo());
    expect(s2.market.loading).toBe(false);
  });

  it('exclut le slice broker de la pile undo', () => {
    const reducer = undoRedoMetaReducer((s: any, a: any) => {
      if (a.type === '[Broker] Event Received') return { ...s, broker: { ...s.broker, status: 'connected' } };
      return s ?? baseState;
    });
    const s0 = reducer(baseState, { type: '@@INIT' });
    reducer(s0, { type: '[Broker] Event Received' });
    const s2 = reducer(s0, undo());
    // L'undo ne doit pas avoir modifié l'état (pile inchangée par broker events)
    expect(s2).toStrictEqual(s0);
  });
});

