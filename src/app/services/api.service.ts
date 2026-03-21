import { Injectable } from '@angular/core';

export const API_CONFIG = {
  BASE_URL: 'http://ec2-15-237-116-133.eu-west-3.compute.amazonaws.com:8443',
  TOKEN: '',
};

// --- Interfaces 3026 ---

export type CellType = 'SEA' | 'SAND' | 'FOG';

export interface Cell {
  x: number;
  y: number;
  type: CellType;
  islandId?: string;
  risk?: boolean;
}

export interface Position {
  x: number;
  y: number;
}

export interface Ship {
  id: string;
  level: number;
  position: Position;
  maxMovePoints: number;
  currentMovePoints: number;
  visibility: number;
  isBrokenDown: boolean;
  rescueAt?: string;
}

export interface Resources {
  boisium: number;
  feronium: number;
  charbonium: number;
  or: number;
}

export interface StorageInfo {
  boisium: { current: number; max: number };
  feronium: { current: number; max: number };
  charbonium: { current: number; max: number };
}

export interface Island {
  id: string;
  name: string;
  discovered: boolean;
  productionBonus: number;
  isHome: boolean;
}

export interface PlayerInfo {
  id: string;
  teamName: string;
  mainResource: 'BOISIUM' | 'FERONIUM' | 'CHARBONIUM';
  homeIslandId: string;
}

export interface MarketOffer {
  id: string;
  teamName: string;
  resource: string;
  quantity: number;
  unitPrice: number;
  createdAt: string;
}

export interface Tax {
  id: string;
  type: 'RESCUE' | 'CHEAT';
  amount: number;
  paid: boolean;
  description: string;
}

export interface RegisterPayload {
  teamName: string;
  email: string;
  signupCode: string;
}

export interface RegisterResponse {
  token: string;
  playerId: string;
  teamName: string;
  mainResource: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {

  private request<T>(method: string, path: string, body?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${API_CONFIG.BASE_URL}${path}`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (API_CONFIG.TOKEN) {
        xhr.setRequestHeader('codinggame-id', API_CONFIG.TOKEN);
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { resolve(xhr.responseText as any); }
        } else {
          reject(new Error(`${xhr.status} ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }

  private get<T>(path: string) { return this.request<T>('GET', path); }
  private post<T>(path: string, body: any = {}) { return this.request<T>('POST', path, body); }

  // --- Auth ---
  async getSignupCodes(): Promise<any> {
    return this.get(`/signupcodes`);
  }

  async register(payload: RegisterPayload): Promise<RegisterResponse> {
    return this.post(`/player/register`, payload);
  }

  // --- Player ---
  async getPlayer(): Promise<PlayerInfo> {
    return this.get(`/player/details`);
  }

  // --- Map ---
  async getMap(): Promise<Cell[]> {
    return this.get(`/map/details`);
  }

  // --- Ship ---
  async getShip(): Promise<Ship> {
    return this.get(`/ship`);
  }

  async buildShip(): Promise<any> {
    return this.post(`/ship/build`);
  }

  async moveShip(direction: 'N' | 'S' | 'E' | 'W'): Promise<any> {
    return this.post(`/ship/move`, { direction });
  }

  async upgradeShip(): Promise<any> {
    return this.post(`/ship/upgrade`);
  }

  async rescue(): Promise<any> {
    return this.post(`/rescue`);
  }

  // --- Resources ---
  async getResources(): Promise<Resources> {
    return this.get(`/resources`);
  }

  async getStorage(): Promise<StorageInfo> {
    return this.get(`/storage`);
  }

  async upgradeStorage(): Promise<any> {
    return this.post(`/storage/upgrade`);
  }

  // --- Islands ---
  async getIslands(): Promise<Island[]> {
    return this.get(`/islands`);
  }

  // --- Marketplace ---
  async getMarketOffers(): Promise<MarketOffer[]> {
    return this.get(`/marketplace/offers`);
  }

  async createOffer(resource: string, quantity: number, unitPrice: number): Promise<any> {
    return this.post(`/marketplace/offer`, { resource, quantity, unitPrice });
  }

  async buyOffer(offerId: string, quantity: number): Promise<any> {
    return this.post(`/marketplace/buy`, { offerId, quantity });
  }

  // --- Taxes ---
  async getTaxes(): Promise<Tax[]> {
    return this.get(`/taxes`);
  }

  async payTax(taxId: string): Promise<any> {
    return this.post(`/taxes/pay`, { taxId });
  }
}
