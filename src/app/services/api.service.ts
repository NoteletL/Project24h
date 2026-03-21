import { Injectable } from '@angular/core';

// --- Configuration API ---
export const API_CONFIG = {
  BASE_URL: '',       // À remplir quand l'API sera disponible
  USE_MOCK: true,     // Passer à false pour utiliser la vraie API
  TOKEN: '',
};

// --- Types ---
export interface Tile {
  type: string;
  x: number;
  y: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface MapData {
  map: Tile[][];
  playerPos: Position;
}

export interface ActionResult {
  success: boolean;
  action: string;
  message: string;
  payload?: any;
}

export interface PlayerStatus {
  hp: number;
  maxHp: number;
  gold: number;
  level: number;
  xp: number;
  xpNext: number;
  attack: number;
  defense: number;
  inventory: { name: string; type: string; qty: number }[];
}

export interface ScanResult {
  nearby: { type: string; name: string; distance: number; direction: string }[];
}

// --- Constantes de tuiles ---
export const TILE_TYPES: Record<string, string> = {
  EMPTY: 'empty',
  WALL: 'wall',
  FLOOR: 'floor',
  GRASS: 'grass',
  WATER: 'water',
  DOOR: 'door',
  CHEST: 'chest',
  ENEMY: 'enemy',
  NPC: 'npc',
  SHOP: 'shop',
  UNKNOWN: 'unknown',
};

export const TILE_ICONS: Record<string, string> = {
  empty: '',
  wall: '🧱',
  floor: '·',
  grass: '🌿',
  water: '💧',
  door: '🚪',
  chest: '📦',
  enemy: '👹',
  npc: '🧙',
  shop: '🏪',
  unknown: '?',
  player: '🧑',
};

@Injectable({ providedIn: 'root' })
export class ApiService {

  // --- Génération d'une carte mockée ---
  private generateMockMap(cols: number, rows: number): Tile[][] {
    const map: Tile[][] = [];
    for (let y = 0; y < rows; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < cols; x++) {
        if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) {
          row.push({ type: TILE_TYPES['WALL'], x, y });
        } else {
          const rand = Math.random();
          let type: string;
          if (rand < 0.55) type = TILE_TYPES['FLOOR'];
          else if (rand < 0.70) type = TILE_TYPES['GRASS'];
          else if (rand < 0.78) type = TILE_TYPES['WATER'];
          else if (rand < 0.85) type = TILE_TYPES['WALL'];
          else if (rand < 0.88) type = TILE_TYPES['DOOR'];
          else if (rand < 0.91) type = TILE_TYPES['CHEST'];
          else if (rand < 0.94) type = TILE_TYPES['ENEMY'];
          else if (rand < 0.97) type = TILE_TYPES['NPC'];
          else type = TILE_TYPES['SHOP'];
          row.push({ type, x, y });
        }
      }
      map.push(row);
    }
    return map;
  }

  // --- Fetch Map ---
  async fetchMapData(cols = 15, rows = 11): Promise<MapData> {
    if (API_CONFIG.USE_MOCK) {
      return new Promise<MapData>(resolve => {
        setTimeout(() => {
          resolve({
            map: this.generateMockMap(cols, rows),
            playerPos: { x: Math.floor(cols / 2), y: Math.floor(rows / 2) },
          });
        }, 200);
      });
    }

    const res = await fetch(`${API_CONFIG.BASE_URL}/map`, {
      headers: { 'Authorization': `Bearer ${API_CONFIG.TOKEN}` }
    });
    return res.json();
  }

  // --- Send Action ---
  async sendAction(action: string, payload: any = {}): Promise<ActionResult> {
    if (API_CONFIG.USE_MOCK) {
      return new Promise<ActionResult>(resolve => {
        setTimeout(() => {
          resolve({
            success: true,
            action,
            message: `Action "${action}" exécutée (mock)`,
            payload,
          });
        }, 100);
      });
    }

    const res = await fetch(`${API_CONFIG.BASE_URL}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.TOKEN}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    return res.json();
  }

  // --- Fetch Player Status ---
  async fetchPlayerStatus(): Promise<PlayerStatus> {
    if (API_CONFIG.USE_MOCK) {
      return new Promise<PlayerStatus>(resolve => {
        setTimeout(() => {
          resolve({
            hp: 100, maxHp: 100, gold: 42, level: 1,
            xp: 120, xpNext: 300, attack: 10, defense: 5,
            inventory: [
              { name: 'Épée en bois', type: 'weapon', qty: 1 },
              { name: 'Potion de soin', type: 'consumable', qty: 3 },
            ],
          });
        }, 100);
      });
    }

    const res = await fetch(`${API_CONFIG.BASE_URL}/status`, {
      headers: { 'Authorization': `Bearer ${API_CONFIG.TOKEN}` }
    });
    return res.json();
  }

  // --- Scan Area ---
  async scanArea(): Promise<ScanResult> {
    if (API_CONFIG.USE_MOCK) {
      return new Promise<ScanResult>(resolve => {
        setTimeout(() => {
          resolve({
            nearby: [
              { type: 'enemy', name: 'Goblin', distance: 2, direction: 'nord' },
              { type: 'chest', name: 'Coffre', distance: 3, direction: 'est' },
            ],
          });
        }, 150);
      });
    }

    const res = await fetch(`${API_CONFIG.BASE_URL}/scan`, {
      headers: { 'Authorization': `Bearer ${API_CONFIG.TOKEN}` }
    });
    return res.json();
  }
}

