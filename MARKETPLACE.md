# 3026 — Marketplace avancée (spéculation)

Application Angular 21 + NgRx 21 avec stratégie de spéculation par moyennes mobiles (MA5/MA20), proxy broker AMQP→SSE, persistance IndexedDB et accessibilité RGAA.

---

## 🗂️ Arborescence des fichiers générés

```
src/
├── index.html                              # lang="fr", skip-link accessibilité
├── styles.css                              # .sr-only, :focus-visible
├── test-setup.ts                           # Bootstrap @angular/compiler pour Vitest
├── app/
│   ├── app.config.ts                       # provideStore + provideEffects + devtools
│   ├── app.ts                              # Injection Store, PlayerActions, purgeLocalStorage
│   ├── app.html                            # Landmarks ARIA, skip-link, bouton Réinitialiser
│   ├── store/
│   │   ├── app.state.ts                    # ActionReducerMap + MetaReducer[]
│   │   ├── market/
│   │   │   ├── market.actions.ts           # createActionGroup : load/create/update/delete/buy
│   │   │   ├── market.reducer.ts           # EntityAdapter<Offer> + cooldown + friendlyError()
│   │   │   ├── market.selectors.ts         # selectAllOffers, selectMyOffer, selectEligibleOffers
│   │   │   └── market.effects.ts           # Appels API → actions NgRx + rafraîchissement joueur
│   │   ├── player/
│   │   │   ├── player.actions.ts           # loadPlayer, updateMoney, updateResources, reset
│   │   │   ├── player.reducer.ts           # PlayerState (details + resources)
│   │   │   ├── player.selectors.ts         # selectPlayerMoney, selectMarketDiscovered
│   │   │   └── player.effects.ts           # Sync GameStateService Signals ↔ NgRx
│   │   ├── history/
│   │   │   ├── history.actions.ts          # addEntry, loadEntries, loaded, clear
│   │   │   ├── history.reducer.ts          # FIFO 500 entrées
│   │   │   ├── history.selectors.ts        # selectRecentHistory (50 dernières)
│   │   │   └── history.effects.ts          # ROOT_EFFECTS_INIT → IndexedDB + persist addEntry
│   │   ├── broker/
│   │   │   ├── broker.actions.ts           # connect, connected, disconnected, eventReceived
│   │   │   ├── broker.reducer.ts           # BrokerState (status + lastEvent)
│   │   │   ├── broker.selectors.ts         # selectBrokerStatus
│   │   │   └── broker.effects.ts           # BrokerSseService → dispatch eventReceived + injectOffer
│   │   ├── meta-reducers/
│   │   │   ├── local-storage.meta-reducer.ts  # Persist player/market/history, debounce 250 ms
│   │   │   └── undo-redo.meta-reducer.ts      # Ring-buffer 20 états, exclut broker
│   │   └── store.spec.ts                   # 11 tests : reducers + meta-reducers
│   ├── services/
│   │   ├── indexeddb.service.ts            # open/addHistory/queryHistory/saveSnapshot (sans lib)
│   │   ├── speculation-strategy.service.ts # MA5/MA20, golden cross, scoreOffers(), riskProfile
│   │   ├── broker-sse.service.ts           # EventSource + reconnexion exponentielle
│   │   └── bot.service.ts                  # Cycle amélioré : scoring + profil de risque
│   └── components/
│       ├── marketplace/
│       │   ├── marketplace.ts              # NgRx toSignal(), computed, cooldown, broker, undo/redo
│       │   └── marketplace.html            # Onglets : Acheter/Vendre/Prix/Signaux/Historique
│       └── controls/
│           ├── controls.ts                 # FormsModule + sélecteur profil de risque
│           └── controls.html              # Select profil + liste signaux MA5/MA20
broker-proxy/
├── package.json                            # express, amqplib, ws, cors, dotenv, tsx
├── tsconfig.json
├── .env.example                            # AMQP_HOST/USER/PASS/TEAM_ID/PORT
└── src/
    ├── index.ts                            # Express SSE + WebSocket + AMQP TLS + /mock-event
    └── test-sse.mjs                        # Test intégration : mock-event → assert SSE reçu
vitest.config.ts                            # Vitest jsdom + setupFiles + exclude app.spec.ts
```

---

## ⚡ Démarrage rapide

### 1. Angular (frontend)

```bash
cd C:/dev/Project24h
npm install
npm start                    # ng serve → http://localhost:4200
npm test                     # vitest run (11 tests)
```

### 2. Broker Proxy (Node.js)

```bash
cd C:/dev/Project24h/broker-proxy
npm install
cp .env.example .env         # Renseignez AMQP_HOST, AMQP_USER, AMQP_PASS, TEAM_ID
npm run dev                  # tsx watch src/index.ts → http://localhost:4000
```

Endpoints disponibles :

| Route | Description |
|---|---|
| `GET /events` | Flux SSE (Angular se connecte ici) |
| `GET /ws` | WebSocket alternatif |
| `GET /health` | Statut AMQP + compteurs clients |
| `POST /mock-event` | Injecte un faux événement sans AMQP |

### 3. Tester sans credentials AMQP

```bash
# Terminal 1 : démarrez le proxy (sans .env, il échouera AMQP mais SSE fonctionne)
cd broker-proxy && npm run dev

# Terminal 2 : injectez un faux événement "offer.created"
curl -X POST http://localhost:4000/mock-event \
  -H "Content-Type: application/json" \
  -d '{"type":"market.offer.created","payload":{"id":"fake-1","resourceType":"BOISIUM","quantityIn":5,"pricePerResource":3,"owner":{"name":"TeamTest"}}}'

# L'offre apparaît instantanément dans l'onglet Acheter de la Marketplace
```

```powershell
# PowerShell équivalent
Invoke-RestMethod -Uri http://localhost:4000/mock-event -Method Post `
  -ContentType 'application/json' `
  -Body '{"type":"market.offer.created","payload":{"id":"fake-1","resourceType":"BOISIUM","quantityIn":5,"pricePerResource":3,"owner":{"name":"TeamTest"}}}'
```

---

## 🏗️ Câblage NgRx dans `app.config.ts`

```typescript
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { reducers, metaReducers } from './store/app.state';
import { MarketEffects, PlayerEffects, HistoryEffects, BrokerEffects } from './store/...';

provideStore(reducers, { metaReducers }),
provideEffects([MarketEffects, PlayerEffects, HistoryEffects, BrokerEffects]),
provideStoreDevtools({ maxAge: 50, logOnly: !isDevMode() }),
```

---

## 🧠 Stratégie de spéculation (SpeculationStrategyService)

| Signal | Condition | Action bot |
|---|---|---|
| **Golden cross** | MA5 > MA20 × 1.20 | Vendre (prix cible = MA5 × 1.05) |
| **Death cross** | MA5 < MA20 × 0.90 | Acheter (prix cible = MA5 × 0.95) |
| **Score offre** | (delta_prix × 0.6) + (volume × 0.4) > 10 | Acheter si signal = `buy` |

Profils de risque (budget par cycle) :

| Profil | Budget max |
|---|---|
| 🛡️ Conservateur | 30 % du solde |
| ⚖️ Équilibré | 50 % du solde |
| ⚔️ Agressif | 80 % du solde |

---

## 🔒 Sécurité

- Le token (`codingGameId`) est stocké **uniquement** dans `localStorage['3026_token']` — **jamais** dans le store NgRx persisté.
- Le bouton **Réinitialiser l'appareil** (`resetDevice()`) purge : `localStorage` (clés NgRx) + IndexedDB (historique + snapshots) + dispatche `PlayerActions.reset()`.
- Déconnexion simple (`logout()`) retire seulement `3026_token` sans toucher à la persistance du store.

---

## ♿ Accessibilité (RGAA / WCAG 2.2 AA)

- `lang="fr"` sur `<html>`, titre de page descriptif
- Skip link "Aller au contenu principal" (visible au focus clavier)
- Landmarks `<header role="banner">`, `<main id="maincontent">`, `<nav>`, `<footer role="contentinfo">`
- Dialogs marketplace : `role="dialog" aria-modal="true" aria-labelledby`
- Tableaux : `<caption class="sr-only">`, `<th scope="col/row">`
- `aria-live="polite/assertive"` pour les messages d'erreur et broker status
- Cooldown annoncé avec `role="status" aria-live="polite"`
- `:focus-visible` avec outline 3 px (ratio ≥ 3:1)
- Boutons avec `aria-label` explicite contenant le libellé visuel

> ⚠️ Ce code a été conçu avec l'accessibilité en tête, mais des problèmes subsistent probablement. Testez avec [Accessibility Insights](https://accessibilityinsights.io/) ou [WAVE](https://wave.webaim.org/).

