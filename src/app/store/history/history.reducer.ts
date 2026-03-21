import { createReducer, on } from '@ngrx/store';
import { MarketTransaction } from '../../services/game-state.service';
import { HistoryActions } from './history.actions';

const MAX_IN_MEMORY = 500;

export interface HistoryState {
  entries: MarketTransaction[];
  loaded:  boolean;
}

export const initialHistoryState: HistoryState = {
  entries: [],
  loaded:  false,
};

export const historyReducer = createReducer(
  initialHistoryState,
  on(HistoryActions.addEntry, (s, { entry }) => ({
    ...s,
    entries: [entry, ...s.entries].slice(0, MAX_IN_MEMORY),
  })),
  on(HistoryActions.loaded, (s, { entries }) => ({
    ...s,
    entries: entries.slice(0, MAX_IN_MEMORY),
    loaded: true,
  })),
  on(HistoryActions.clear, () => initialHistoryState),
);

