import { createReducer, on } from '@ngrx/store';
import { BrokerActions, BrokerEvent } from './broker.actions';

export type BrokerStatus = 'idle' | 'connected' | 'disconnected' | 'error';

export interface BrokerState {
  status:    BrokerStatus;
  lastEvent: BrokerEvent | null;
  error:     string | null;
}

export const initialBrokerState: BrokerState = {
  status:    'idle',
  lastEvent: null,
  error:     null,
};

export const brokerReducer = createReducer(
  initialBrokerState,
  on(BrokerActions.connect,       s => ({ ...s, status: 'idle' as const })),
  on(BrokerActions.connected,     s => ({ ...s, status: 'connected' as const, error: null })),
  on(BrokerActions.disconnected,  s => ({ ...s, status: 'disconnected' as const })),
  on(BrokerActions.eventReceived, (s, { event }) => ({ ...s, lastEvent: event })),
  on(BrokerActions.error,         (s, { message }) => ({ ...s, status: 'error' as const, error: message })),
);

