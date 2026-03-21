import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { reducers, metaReducers } from './store/app.state';
import { MarketEffects } from './store/market/market.effects';
import { PlayerEffects } from './store/player/player.effects';
import { HistoryEffects } from './store/history/history.effects';
import { BrokerEffects } from './store/broker/broker.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),

    // ── NgRx Store ────────────────────────────────────────────────────────────
    provideStore(reducers, { metaReducers }),
    provideEffects([MarketEffects, PlayerEffects, HistoryEffects, BrokerEffects]),
    provideStoreDevtools({
      maxAge:   50,
      logOnly:  !isDevMode(),
      features: { pause: true, lock: true, export: true, jump: true, skip: true, reorder: true, dispatch: true, test: true },
    }),
  ]
};
