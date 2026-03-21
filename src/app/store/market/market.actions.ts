import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Offer, OfferCreateRequest } from '../../services/api.service';

export const MarketActions = createActionGroup({
  source: 'Market',
  events: {
    'Load Offers':           emptyProps(),
    'Load Offers Success':   props<{ offers: Offer[] }>(),
    'Load Offers Failure':   props<{ error: string }>(),
    'Create Offer':          props<{ request: OfferCreateRequest }>(),
    'Create Offer Success':  props<{ offer: Offer }>(),
    'Create Offer Failure':  props<{ error: string }>(),
    'Update Offer':          props<{ request: OfferCreateRequest }>(),
    'Update Offer Success':  props<{ offer: Offer }>(),
    'Update Offer Failure':  props<{ error: string }>(),
    'Delete Offer':          props<{ offerId: string }>(),
    'Delete Offer Success':  props<{ offerId: string }>(),
    'Delete Offer Failure':  props<{ error: string }>(),
    'Buy Offer':             props<{ offerId: string; quantity: number }>(),
    'Buy Offer Success':     props<{ offerId: string; quantity: number }>(),
    'Buy Offer Failure':     props<{ error: string }>(),
    'Broker Offer Received': props<{ offer: Offer }>(),
    'Clear Error':           emptyProps(),
    'Clear Success':         emptyProps(),
  },
});

