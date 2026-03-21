import { ActionReducer, INIT, UPDATE } from '@ngrx/store';
import { AppState } from '../app.state';

const PERSIST_KEYS: (keyof AppState)[] = ['player', 'market', 'history'];
const STORAGE_PREFIX = '3026_store_';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Sérialise les slices sélectionnés dans localStorage avec debounce de 250 ms */
function saveState(state: AppState): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    for (const key of PERSIST_KEYS) {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state[key]));
      } catch { /* quota exceeded — silencieux */ }
    }
  }, 250);
}

/** Rehydrate les slices depuis localStorage */
function loadState(): Partial<AppState> {
  const partial: Partial<AppState> = {};
  for (const key of PERSIST_KEYS) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (raw) (partial as Record<string, unknown>)[key] = JSON.parse(raw);
    } catch { /* données corrompues — ignoré */ }
  }
  return partial;
}

export function localStorageMetaReducer(
  reducer: ActionReducer<AppState>
): ActionReducer<AppState> {
  return (state, action) => {
    // Rehydratation uniquement sur INIT et UPDATE (premier chargement)
    if (action.type === INIT || action.type === UPDATE) {
      const nextState = reducer(state, action);
      const saved     = loadState();
      return { ...nextState, ...saved };
    }
    const nextState = reducer(state, action);
    saveState(nextState);
    return nextState;
  };
}

/** Purge toutes les clés du store dans localStorage */
export function purgeLocalStorage(): void {
  for (const key of PERSIST_KEYS) {
    localStorage.removeItem(STORAGE_PREFIX + key);
  }
}

