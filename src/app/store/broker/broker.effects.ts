import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, Subject } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { BrokerSseService } from '../../services/broker-sse.service';
import { AppState } from '../app.state';
import { BrokerActions, BrokerEvent } from './broker.actions';
import { MarketActions } from '../market/market.actions';
import { Offer } from '../../services/api.service';

@Injectable()
export class BrokerEffects {
  private readonly actions$ = inject(Actions);
  private readonly broker   = inject(BrokerSseService);
  private readonly store    = inject(Store<AppState>);

  /** Se connecte au proxy SSE et dispatche les événements broker dans le store */
  connect$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BrokerActions.connect),
      switchMap(() => {
        this.broker.connect();
        return this.broker.events$.pipe(
          map(raw => {
            const event: BrokerEvent = {
              type:      (raw['type'] as string) ?? 'unknown',
              payload:   raw['payload'] ?? raw,
              timestamp: Date.now(),
            };
            return BrokerActions.eventReceived({ event });
          }),
          catchError(() => {
            this.store.dispatch(BrokerActions.error({ message: 'Connexion broker interrompue.' }));
            return EMPTY;
          })
        );
      })
    )
  );

  /** Lorsqu'un événement "offer.created" arrive, injecte l'offre dans le store market */
  injectOffer$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BrokerActions.eventReceived),
      tap(({ event }) => {
        if (
          (event.type === 'market.offer.created' || event.type === 'offer.created') &&
          event.payload &&
          typeof event.payload === 'object' &&
          'id' in (event.payload as object)
        ) {
          this.store.dispatch(
            MarketActions.brokerOfferReceived({ offer: event.payload as Offer })
          );
        }
      })
    ),
    { dispatch: false }
  );
}

