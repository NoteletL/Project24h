import { createActionGroup, emptyProps, props } from '@ngrx/store';

export interface BrokerEvent {
  type:      string;
  payload:   unknown;
  timestamp: number;
}

export const BrokerActions = createActionGroup({
  source: 'Broker',
  events: {
    'Connect':         emptyProps(),
    'Connected':       emptyProps(),
    'Disconnected':    emptyProps(),
    'Event Received':  props<{ event: BrokerEvent }>(),
    'Error':           props<{ message: string }>(),
  },
});

