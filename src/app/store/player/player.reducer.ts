import { createReducer, on } from '@ngrx/store';
import { PlayerDetails, Resource } from '../../services/api.service';
import { PlayerActions } from './player.actions';

export interface PlayerState {
  details:   PlayerDetails | null;
  resources: Resource[];
  loading:   boolean;
  error:     string | null;
}

export const initialPlayerState: PlayerState = {
  details:   null,
  resources: [],
  loading:   false,
  error:     null,
};

export const playerReducer = createReducer(
  initialPlayerState,
  on(PlayerActions.loadPlayer,        s => ({ ...s, loading: true, error: null })),
  on(PlayerActions.loadPlayerSuccess, (s, { player, resources }) =>
    ({ ...s, loading: false, details: player, resources })
  ),
  on(PlayerActions.loadPlayerFailure, (s, { error }) =>
    ({ ...s, loading: false, error })
  ),
  on(PlayerActions.updateMoney,       (s, { money }) =>
    s.details ? { ...s, details: { ...s.details, money } } : s
  ),
  on(PlayerActions.updateResources,   (s, { resources }) =>
    ({ ...s, resources })
  ),
  on(PlayerActions.reset, () => initialPlayerState),
);

