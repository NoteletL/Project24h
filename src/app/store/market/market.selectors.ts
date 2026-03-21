import { createFeatureSelector, createSelector } from '@ngrx/store';
import { MarketState, offerAdapter } from './market.reducer';

export const selectMarketState = createFeatureSelector<MarketState>('market');

const { selectAll, selectEntities } = offerAdapter.getSelectors(selectMarketState);

export const selectAllOffers    = selectAll;
export const selectOfferEntities = selectEntities;

export const selectMarketLoading  = createSelector(selectMarketState, s => s.loading);
export const selectMarketError    = createSelector(selectMarketState, s => s.error);
export const selectMarketSuccess  = createSelector(selectMarketState, s => s.successMsg);
export const selectCooldownUntil  = createSelector(selectMarketState, s => s.cooldownUntil);

export const selectIsCooldownActive = createSelector(
  selectCooldownUntil,
  (until) => until !== null && Date.now() < until
);

export const selectOtherOffers = (myName: string | null | undefined) =>
  createSelector(selectAllOffers, offers =>
    offers.filter(o => o.owner?.name !== myName)
  );

export const selectMyOffer = (myName: string | null | undefined) =>
  createSelector(selectAllOffers, offers =>
    offers.find(o => o.owner?.name === myName) ?? null
  );

/** Offres éligibles pour la stratégie de spéculation (hors CHARBONIUM, vendeur ≠ moi) */
export const selectEligibleOffers = (myName: string | null | undefined, excluded: string[] = ['CHARBONIUM']) =>
  createSelector(selectAllOffers, offers =>
    offers.filter(o =>
      !excluded.includes(o.resourceType) &&
      o.owner?.name !== myName           &&
      o.quantityIn > 0
    )
  );

