import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { Offer } from '../../services/api.service';
import { MarketActions } from './market.actions';

export interface MarketState extends EntityState<Offer> {
  loading:      boolean;
  error:        string | null;
  successMsg:   string | null;
  myOfferOwner: string | null;   // nom de l'équipe courante (pour filtrage côté store)
  cooldownUntil: number | null;  // unix ms
}

export const offerAdapter: EntityAdapter<Offer> = createEntityAdapter<Offer>({
  selectId: (o) => o.id,
  sortComparer: (a, b) => a.pricePerResource - b.pricePerResource,
});

const COOLDOWN_MS = 60_000; // 1 min entre modifications

export const initialMarketState: MarketState = offerAdapter.getInitialState({
  loading:       false,
  error:         null,
  successMsg:    null,
  myOfferOwner:  null,
  cooldownUntil: null,
});

export const marketReducer = createReducer(
  initialMarketState,

  // Load
  on(MarketActions.loadOffers, s => ({ ...s, loading: true, error: null })),
  on(MarketActions.loadOffersSuccess, (s, { offers }) =>
    offerAdapter.setAll(offers, { ...s, loading: false })
  ),
  on(MarketActions.loadOffersFailure, (s, { error }) =>
    ({ ...s, loading: false, error })
  ),

  // Create
  on(MarketActions.createOffer, s => ({ ...s, loading: true, error: null, successMsg: null })),
  on(MarketActions.createOfferSuccess, (s, { offer }) =>
    offerAdapter.upsertOne(offer, {
      ...s,
      loading:       false,
      successMsg:    '✅ Offre publiée !',
      cooldownUntil: Date.now() + COOLDOWN_MS,
    })
  ),
  on(MarketActions.createOfferFailure, (s, { error }) =>
    ({ ...s, loading: false, error })
  ),

  // Update
  on(MarketActions.updateOffer, s => ({ ...s, loading: true, error: null, successMsg: null })),
  on(MarketActions.updateOfferSuccess, (s, { offer }) =>
    offerAdapter.upsertOne(offer, {
      ...s,
      loading:       false,
      successMsg:    '✅ Offre mise à jour !',
      cooldownUntil: Date.now() + COOLDOWN_MS,
    })
  ),
  on(MarketActions.updateOfferFailure, (s, { error }) =>
    ({ ...s, loading: false, error })
  ),

  // Delete
  on(MarketActions.deleteOffer, s => ({ ...s, loading: true, error: null })),
  on(MarketActions.deleteOfferSuccess, (s, { offerId }) =>
    offerAdapter.removeOne(offerId, { ...s, loading: false, successMsg: '🗑️ Offre supprimée.' })
  ),
  on(MarketActions.deleteOfferFailure, (s, { error }) =>
    ({ ...s, loading: false, error })
  ),

  // Buy
  on(MarketActions.buyOffer, s => ({ ...s, loading: true, error: null })),
  on(MarketActions.buyOfferSuccess, (s, { offerId, quantity }) => {
    const offer = s.entities[offerId];
    if (!offer) return { ...s, loading: false };
    const remaining = offer.quantityIn - quantity;
    if (remaining <= 0) {
      return offerAdapter.removeOne(offerId, { ...s, loading: false, successMsg: `✅ Achat de ${quantity} unité(s) confirmé !` });
    }
    return offerAdapter.updateOne(
      { id: offerId, changes: { quantityIn: remaining } },
      { ...s, loading: false, successMsg: `✅ Achat de ${quantity} unité(s) confirmé !` }
    );
  }),
  on(MarketActions.buyOfferFailure, (s, { error }) =>
    ({ ...s, loading: false, error: friendlyError(error) })
  ),

  // Broker real-time
  on(MarketActions.brokerOfferReceived, (s, { offer }) =>
    offerAdapter.upsertOne(offer, s)
  ),

  // UI helpers
  on(MarketActions.clearError,   s => ({ ...s, error: null })),
  on(MarketActions.clearSuccess, s => ({ ...s, successMsg: null })),
);

// ── Messages d'erreur conviviaux ──────────────────────────────────────────────
function friendlyError(raw: string): string {
  if (raw.includes('insufficient_funds') || raw.includes('fonds'))
    return '❌ Fonds insuffisants pour cet achat.';
  if (raw.includes('no_stock') || raw.includes('stock'))
    return '❌ Stock insuffisant pour créer cette offre.';
  if (raw.includes('offer_not_modifiable') || raw.includes('modif'))
    return '❌ Offre non modifiable (cooldown actif).';
  if (raw.includes('market_locked') || raw.includes('lock'))
    return '❌ La Marketplace n\'est pas encore débloquée.';
  if (raw.includes('Network') || raw.includes('réseau'))
    return '❌ Erreur réseau — réessayez dans quelques instants.';
  return `❌ Erreur : ${raw}`;
}

