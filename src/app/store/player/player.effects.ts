import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { from, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { GameStateService } from '../../services/game-state.service';
import { PlayerActions } from './player.actions';

@Injectable()
export class PlayerEffects {
  private readonly actions$ = inject(Actions);
  private readonly api      = inject(ApiService);
  private readonly game     = inject(GameStateService);

  loadPlayer$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PlayerActions.loadPlayer),
      switchMap(() =>
        from(Promise.all([this.api.getPlayerDetails(), this.api.getResources()])).pipe(
          map(([player, resources]) => {
            // Synchronisation avec GameStateService (Signals)
            this.game.playerDetails.set(player);
            this.game.resources.set(resources);
            return PlayerActions.loadPlayerSuccess({ player, resources });
          }),
          catchError(err => of(PlayerActions.loadPlayerFailure({ error: err.message })))
        )
      )
    )
  );
}

