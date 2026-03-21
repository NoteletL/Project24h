import { createFeatureSelector, createSelector } from '@ngrx/store';
import { BrokerState } from './broker.reducer';

export const selectBrokerState  = createFeatureSelector<BrokerState>('broker');
export const selectBrokerStatus = createSelector(selectBrokerState, s => s.status);
export const selectLastEvent    = createSelector(selectBrokerState, s => s.lastEvent);
export const selectBrokerError  = createSelector(selectBrokerState, s => s.error);

