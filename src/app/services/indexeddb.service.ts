import { Injectable } from '@angular/core';
import { MarketTransaction } from './game-state.service';

const DB_NAME    = '3026-marketplace';
const DB_VERSION = 1;
const STORE_TX   = 'transactions';
const STORE_SNAP = 'snapshots';

@Injectable({ providedIn: 'root' })
export class IndexedDbService {
  private db: IDBDatabase | null = null;

  /** Ouvre (ou crée) la base IndexedDB */
  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_TX)) {
          const store = db.createObjectStore(STORE_TX, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('resourceType', 'resourceType');
        }
        if (!db.objectStoreNames.contains(STORE_SNAP)) {
          db.createObjectStore(STORE_SNAP, { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /** Ajoute une transaction à l'historique */
  async addHistory(entry: MarketTransaction): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_TX, 'readwrite');
      const req = tx.objectStore(STORE_TX).add({
        ...entry,
        timestamp: entry.timestamp instanceof Date
          ? entry.timestamp.toISOString()
          : entry.timestamp,
      });
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  /** Récupère les N dernières transactions (ordre décroissant) */
  async queryHistory(limit = 500): Promise<MarketTransaction[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx      = db.transaction(STORE_TX, 'readonly');
      const store   = tx.objectStore(STORE_TX);
      const index   = store.index('timestamp');
      const results: MarketTransaction[] = [];
      const req     = index.openCursor(null, 'prev');
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor || results.length >= limit) { resolve(results); return; }
        const rec = cursor.value;
        results.push({
          ...rec,
          timestamp: new Date(rec.timestamp),
        } as MarketTransaction);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  /** Vide l'object store de transactions */
  async clearHistory(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_TX, 'readwrite');
      const req = tx.objectStore(STORE_TX).clear();
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  /** Sauvegarde un snapshot JSON (ex : état complet du store) */
  async saveSnapshot(key: string, value: unknown): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_SNAP, 'readwrite');
      const req = tx.objectStore(STORE_SNAP).put({ key, value, savedAt: new Date().toISOString() });
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  /** Charge un snapshot JSON */
  async loadSnapshot<T>(key: string): Promise<T | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_SNAP, 'readonly');
      const req = tx.objectStore(STORE_SNAP).get(key);
      req.onsuccess = () => resolve(req.result ? (req.result.value as T) : null);
      req.onerror   = () => reject(req.error);
    });
  }

  /** Efface toute la base (déconnexion / reset appareil) */
  async purgeAll(): Promise<void> {
    await Promise.all([this.clearHistory()]);
    try {
      await new Promise<void>((resolve, reject) => {
        const db = this.db;
        if (!db) { resolve(); return; }
        const tx  = db.transaction(STORE_SNAP, 'readwrite');
        const req = tx.objectStore(STORE_SNAP).clear();
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
    } catch { /* silencieux */ }
  }
}

