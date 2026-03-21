import { Injectable } from '@angular/core';

export const API_CONFIG = {
  BASE_URL: 'http://ec2-35-180-187-43.eu-west3.compute.amazonaws.com:8443',
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

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (API_CONFIG.TOKEN) {
      h['Authorization'] = `Bearer ${API_CONFIG.TOKEN}`;
    }
    return h;
  }

  // --- Auth ---
  async getSignupCodes(): Promise<any> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/signupcodes`, { headers: this.headers });
    if (!res.ok) throw new Error(`Signup codes: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async register(payload: RegisterPayload): Promise<RegisterResponse> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/player/register`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Register: ${res.status} ${await res.text()}`);
    return res.json();
  }

  // --- Player ---
  async getPlayer(): Promise<PlayerInfo> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/player`, { headers: this.headers });
    if (!res.ok) throw new Error(`Player: ${res.status}`);
    return res.json();
  }

  // --- Map ---
  async getMap(): Promise<Cell[]> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/map`, { headers: this.headers });
    if (!res.ok) throw new Error(`Map: ${res.status}`);
    return res.json();
  }

  // --- Ship ---
  async getShip(): Promise<Ship> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/ship`, { headers: this.headers });
    if (!res.ok) throw new Error(`Ship: ${res.status}`);
    return res.json();
  }

  async buildShip(): Promise<any> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/ship/build`, {
      method: 'POST', headers: this.headers,
    });
    if (!res.ok) throw new Error(`Build ship: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async moveShip(direction: 'N' | 'S' | 'E' | 'W'): Promise<any> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/ship/move`, {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ direction }),
    });
    if (!res.ok) throw new Error(`Move: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async upgradeShip(): Promise<any> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/ship/upgrade`, {
      method: 'POST', headers: this.headers,
    });
    if (!res.ok) throw new Error(`Upgrade ship: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async rescue(): Promise<any> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/rescue`, {
      method: 'POST', headers: this.headers,
    });
    if (!res.ok) throw new Error(`Rescue: ${res.status} ${await res.text()}`);
    return res.json();
  }

  // --- Resources ---
  async getResources(): Promise<Resources> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/resources`, { headers: this.headers });
    if (!res.ok) throw new Error(`Resources: ${res.status}`);
    return res.json();
  }

  async getStorage(): Promise<StorageInfo> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/storage`, { headers: this.headers });
    if (!res.ok) throw new Error(`Storage: ${res.status}`);
    return res.json();
  }

  async upgradeStorage(): Promise<any> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/storage/upgrade`, {
      method: 'POST', headers: this.headers,
    });
    if (!res.ok) throw new Error(`Upgrade storage: ${res.status} ${await res.text()}`);
    return res.json();
  }

  // --- Islands ---
  async getIslands(): Promise<Island[]> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/islands`, { headers: this.headers });
    if (!res.ok) throw new Error(`Islands: ${res.status}`);
    return res.json();
  }

  // --- Marketplace ---
  async getMarketOffers(): Promise<MarketOffer[]> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/marketplace/offers`, { headers: this.headers });
    if (!res.ok) throw new Error(`Marketplace: ${res.status}`);
    return res.json();
  }

  async createOffer(resource: string, quantity: number, unitPrice: number): Promise<any> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/marketplace/offer`, {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ resource, quantity, unitPrice }),
    });
    if (!res.ok) throw new Error(`Create offer: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async buyOffer(offerId: string, quantity: number): Promise<any> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/marketplace/buy`, {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ offerId, quantity }),
    });
    if (!res.ok) throw new Error(`Buy offer: ${res.status} ${await res.text()}`);
    return res.json();
  }

  // --- Taxes ---
  async getTaxes(): Promise<Tax[]> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/taxes`, { headers: this.headers });
    if (!res.ok) throw new Error(`Taxes: ${res.status}`);
    return res.json();
  }

  async payTax(taxId: string): Promise<any> {
    const res = await fetch(`${API_CONFIG.BASE_URL}/taxes/pay`, {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ taxId }),
    });
    if (!res.ok) throw new Error(`Pay tax: ${res.status} ${await res.text()}`);
    return res.json();
  }
}
