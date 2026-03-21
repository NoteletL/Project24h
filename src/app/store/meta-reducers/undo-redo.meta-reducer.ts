import { Action, ActionReducer } from '@ngrx/store';
import { AppState } from '../app.state';

const MAX_HISTORY = 20;

// Clés exclues de l'undo/redo (données temps-réel volumineuses)
const EXCLUDED_KEYS: (keyof AppState)[] = ['broker'];

// Actions réservées au meta-reducer
export const UNDO_ACTION  = '[UndoRedo] Undo';
export const REDO_ACTION  = '[UndoRedo] Redo';
export const undo = (): Action => ({ type: UNDO_ACTION });
export const redo = (): Action => ({ type: REDO_ACTION });

interface UndoRedoState {
  past:    Partial<AppState>[];
  present: AppState | null;
  future:  Partial<AppState>[];
}

const undoRedoState: UndoRedoState = { past: [], present: null, future: [] };

function stripExcluded(state: AppState): Partial<AppState> {
  const partial: Partial<AppState> = { ...state };
  for (const key of EXCLUDED_KEYS) delete partial[key];
  return partial;
}

export function undoRedoMetaReducer(
  reducer: ActionReducer<AppState>
): ActionReducer<AppState> {
  return (state: AppState | undefined, action: Action): AppState => {
    if (action.type === UNDO_ACTION) {
      if (undoRedoState.past.length === 0 || !state) return state ?? reducer(state, action);
      const previous = undoRedoState.past[undoRedoState.past.length - 1];
      undoRedoState.past = undoRedoState.past.slice(0, -1);
      undoRedoState.future = [stripExcluded(state), ...undoRedoState.future];
      return { ...state, ...previous };
    }

    if (action.type === REDO_ACTION) {
      if (undoRedoState.future.length === 0 || !state) return state ?? reducer(state, action);
      const next = undoRedoState.future[0];
      undoRedoState.future = undoRedoState.future.slice(1);
      undoRedoState.past = [...undoRedoState.past, stripExcluded(state)].slice(-MAX_HISTORY);
      return { ...state, ...next };
    }

    const nextState = reducer(state, action);

    // Ne stocke pas les états broker-only dans la pile
    if (state && action.type !== '[Broker] Event Received' && action.type !== '[Broker] Connected') {
      undoRedoState.past = [...undoRedoState.past, stripExcluded(state)].slice(-MAX_HISTORY);
      undoRedoState.future = [];
    }

    undoRedoState.present = nextState;
    return nextState;
  };
}

export function getUndoCount():  number { return undoRedoState.past.length; }
export function getRedoCount():  number { return undoRedoState.future.length; }

