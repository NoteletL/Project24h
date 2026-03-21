import { createFeatureSelector, createSelector } from '@ngrx/store';
import { HistoryState } from './history.reducer';

export const selectHistoryState   = createFeatureSelector<HistoryState>('history');
export const selectAllHistory     = createSelector(selectHistoryState, s => s.entries);
export const selectHistoryLoaded  = createSelector(selectHistoryState, s => s.loaded);
export const selectRecentHistory  = createSelector(selectAllHistory, entries => entries.slice(0, 50));

