import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { from, of } from 'rxjs';
import { catchError, exhaustMap, map, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { GameStateService } from '../../services/game-state.service';
import { AppState } from '../app.state';
import { MarketActions } from './market.actions';
import { selectAllOffers } from './market.selectors';

@Injectable()
export class MarketEffects {
  private readonly actions$ = inject(Actions);
  private readonly api      = inject(ApiService);
  private readonly game     = inject(GameStateService);
  private readonly store    = inject(Store<AppState>);

  loadOffers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.loadOffers),
      switchMap(() =>
        from(this.api.getMarketplaceOffers()).pipe(
          map(offers => MarketActions.loadOffersSuccess({ offers })),
          catchError(err => of(MarketActions.loadOffersFailure({ error: err.message })))
        )
      )
    )
  );

  createOffer$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.createOffer),
      exhaustMap(({ request }) =>
        from(this.api.createOffer(request)).pipe(
          map(offer => MarketActions.createOfferSuccess({ offer })),
          catchError(err => of(MarketActions.createOfferFailure({ error: err.message })))
        )
      )
    )
  );

  updateOffer$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.updateOffer),
      exhaustMap(({ request }) =>
        from(this.api.updateOffer(request)).pipe(
          map(offer => MarketActions.updateOfferSuccess({ offer })),
          catchError(err => of(MarketActions.updateOfferFailure({ error: err.message })))
        )
      )
    )
  );

  deleteOffer$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.deleteOffer),
      exhaustMap(({ offerId }) =>
        from(this.api.deleteOffer(offerId)).pipe(
          map(() => MarketActions.deleteOfferSuccess({ offerId })),
          catchError(err => of(MarketActions.deleteOfferFailure({ error: err.message })))
        )
      )
    )
  );

  buyOffer$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.buyOffer),
      withLatestFrom(this.store.select(selectAllOffers)),
      exhaustMap(([{ offerId, quantity }, offers]) => {
        const offer = offers.find(o => o.id === offerId);
        return from(this.api.purchaseOffer({ offerId, quantity })).pipe(
          map(() => {
            if (offer) {
              this.game.addTransaction({
                timestamp:    new Date(),
                resourceType: offer.resourceType,
                quantity,
                pricePerUnit: offer.pricePerResource,
                totalCost:    quantity * offer.pricePerResource,
                source:       'manual',
              });
            }
            return MarketActions.buyOfferSuccess({ offerId, quantity });
          }),
          catchError(err => of(MarketActions.buyOfferFailure({ error: err.message })))
        );
      })
    )
  );

  /** Rafraîchit les ressources du joueur après un achat réussi */
  refreshAfterBuy$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketActions.buyOfferSuccess),
      tap(async () => {
        try {
          this.game.resources.set(await this.api.getResources());
          this.game.playerDetails.set(await this.api.getPlayerDetails());
        } catch { /* silencieux */ }
      })
    ),
    { dispatch: false }
  );

  /** Log les succès dans GameStateService */
  logSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        MarketActions.createOfferSuccess,
        MarketActions.updateOfferSuccess,
        MarketActions.deleteOfferSuccess,
      ),
      tap(action => {
        const msg = 'type' in action
          ? action.type.replace('[Market] ', '✅ ')
          : '✅ Action réussie';
        this.game.log(msg, 'action');
      })
    ),
    { dispatch: false }
  );
}

