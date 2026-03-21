import { ActionReducerMap, MetaReducer } from '@ngrx/store';
import { marketReducer, MarketState } from './market/market.reducer';
import { historyReducer, HistoryState } from './history/history.reducer';
import { brokerReducer, BrokerState } from './broker/broker.reducer';
import { playerReducer, PlayerState } from './player/player.reducer';
import { localStorageMetaReducer } from './meta-reducers/local-storage.meta-reducer';
import { undoRedoMetaReducer } from './meta-reducers/undo-redo.meta-reducer';
import { isDevMode } from '@angular/core';

export interface AppState {
  market:  MarketState;
  history: HistoryState;
  broker:  BrokerState;
  player:  PlayerState;
}

export const reducers: ActionReducerMap<AppState> = {
  market:  marketReducer,
  history: historyReducer,
  broker:  brokerReducer,
  player:  playerReducer,
};

export const metaReducers: MetaReducer<AppState>[] = [
  localStorageMetaReducer,
  undoRedoMetaReducer,
];

