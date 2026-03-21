import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { MarketTransaction } from '../../services/game-state.service';

export const HistoryActions = createActionGroup({
  source: 'History',
  events: {
    'Add Entry':    props<{ entry: MarketTransaction }>(),
    'Load Entries': emptyProps(),
    'Loaded':       props<{ entries: MarketTransaction[] }>(),
    'Clear':        emptyProps(),
  },
});

