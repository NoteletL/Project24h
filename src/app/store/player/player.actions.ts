import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { PlayerDetails, Resource } from '../../services/api.service';

export const PlayerActions = createActionGroup({
  source: 'Player',
  events: {
    'Load Player':         emptyProps(),
    'Load Player Success': props<{ player: PlayerDetails; resources: Resource[] }>(),
    'Load Player Failure': props<{ error: string }>(),
    'Update Money':        props<{ money: number }>(),
    'Update Resources':    props<{ resources: Resource[] }>(),
    'Reset':               emptyProps(),
  },
});

