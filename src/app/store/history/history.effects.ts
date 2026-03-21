import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType, ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { from, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { IndexedDbService } from '../../services/indexeddb.service';
import { HistoryActions } from './history.actions';
import { MarketActions } from '../market/market.actions';

@Injectable()
export class HistoryEffects {
  private readonly actions$ = inject(Actions);
  private readonly db       = inject(IndexedDbService);

  /** Au démarrage de l'app, charge les 500 dernières entrées depuis IndexedDB */
  init$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ROOT_EFFECTS_INIT),
      switchMap(() =>
        from(this.db.queryHistory(500)).pipe(
          map(entries => HistoryActions.loaded({ entries })),
          catchError(() => of(HistoryActions.loaded({ entries: [] })))
        )
      )
    )
  );

  /** À chaque achat/vente réussi, persiste dans IndexedDB */
  persist$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.buyOfferSuccess, MarketActions.createOfferSuccess),
      tap(async () => {
        // La persistance effective est déclenchée par l'effet de GameStateService
        // via addTransaction → HistoryActions.addEntry → ici
      })
    ),
    { dispatch: false }
  );

  /** Persiste chaque nouvelle entrée dans IndexedDB */
  persistEntry$ = createEffect(() =>
    this.actions$.pipe(
      ofType(HistoryActions.addEntry),
      tap(({ entry }) => {
        this.db.addHistory(entry).catch(() => { /* silencieux */ });
      })
    ),
    { dispatch: false }
  );

  /** Vide l'IndexedDB */
  clear$ = createEffect(() =>
    this.actions$.pipe(
      ofType(HistoryActions.clear),
      tap(() => this.db.clearHistory().catch(() => {}))
    ),
    { dispatch: false }
  );
}

