import { createFeatureSelector, createSelector } from '@ngrx/store';
import { PlayerState } from './player.reducer';

export const selectPlayerState    = createFeatureSelector<PlayerState>('player');
export const selectPlayerDetails  = createSelector(selectPlayerState, s => s.details);
export const selectPlayerMoney    = createSelector(selectPlayerState, s => s.details?.money ?? 0);
export const selectPlayerResources = createSelector(selectPlayerState, s => s.resources);
export const selectMarketDiscovered = createSelector(
  selectPlayerState, s => s.details?.marketPlaceDiscovered ?? false
);
export const selectPlayerName     = createSelector(selectPlayerState, s => s.details?.name ?? null);

export const selectResourceQty = (type: string) =>
  createSelector(selectPlayerResources, resources =>
    resources.find(r => r.type === type)?.quantity ?? 0
  );

