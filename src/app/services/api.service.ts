import { Injectable } from '@angular/core';

export const API_CONFIG = {
  BASE_URL: 'http://ec2-15-237-116-133.eu-west-3.compute.amazonaws.com:8443',
  TOKEN: '',
};

// --- Interfaces basées sur l'OAS ---

export type CellType = 'SEA' | 'SAND' | 'ROCKS';
export type CellStateEnum = 'VISITED' | 'SEEN' | 'KNOWN';
export type Direction = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';
export type ResourceType = 'BOISIUM' | 'FERONIUM' | 'CHARBONIUM';
export type IslandState = 'KNOWN' | 'DISCOVERED';

export interface Cell {
  id: string;
  x: number;
  y: number;
  type: CellType;
  zone: number;
  ships?: any[];
  visibilityState?: any[];
  positionHistory?: any[];
  risk?: boolean;
  islandId?: string;
}

export interface ShipLevel {
  id: number;
  name: string;
  visibilityRange: number;
  maxMovement: number;
  speed: number;
}

export interface PriceResources {
  [key: string]: any;
}

export interface Ship {
  availableMove: number;
  level: ShipLevel;
  currentPosition: Cell;
  playerName?: string;
  costResources?: PriceResources;
}

export interface Resource {
  quantity: number;
  type: ResourceType;
}

export interface Island {
  name: string;
  bonusQuotient: number;
}

export interface DiscoveredIsland {
  island: Island;
  islandState: IslandState;
}

export interface PlayerDetails {
  id: string;
  signUpCode: string;
  name: string;
  quotient: number;
  money: number;
  resources: { quantity: number; type: string }[];
  home: Island;
  discoveredIslands: DiscoveredIsland[];
  marketPlaceDiscovered: boolean;
}

// --- Requêtes / Réponses ---

export interface SignupCodeRequest {
  mail: string;
}

export interface SignupCodeResponse {
  signupCode: string;
}

export interface RegisterPlayerRequest {
  name: string;
}

export interface RegisterPlayerResponse {
  name: string;
  codingGameId: string;
}

export interface ShipBuildResponse {
  availableMove: number;
  level: ShipLevel;
  currentPosition: Cell;
  playerName?: string;
}

export interface ShipMoveRequest {
  direction: Direction;
}

export interface ShipMoveResponse {
  discoveredCells: Cell[];
  position: Cell;
  energy: number;
}

export interface ApiError {
  codeError: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {

  private request<T>(method: string, path: string, body?: any, extraHeaders?: Record<string, string>): Promise<T> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${API_CONFIG.BASE_URL}${path}`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (API_CONFIG.TOKEN) {
        xhr.setRequestHeader('codinggame-id', API_CONFIG.TOKEN);
      }
      if (extraHeaders) {
        for (const [key, value] of Object.entries(extraHeaders)) {
          xhr.setRequestHeader(key, value);
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { resolve(xhr.responseText as any); }
        } else {
          let errMsg = `${xhr.status}`;
          try {
            const err: ApiError = JSON.parse(xhr.responseText);
            errMsg = `${err.codeError}: ${err.message}`;
          } catch { errMsg = `${xhr.status} ${xhr.responseText}`; }
          reject(new Error(errMsg));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }

  // --- Registration ---

  /** POST /signupcodes — Obtenir un code d'inscription (envoyer l'email) */
  async getSignupCode(mail: string): Promise<SignupCodeResponse> {
    return this.request<SignupCodeResponse>('POST', '/signupcodes', { mail });
  }

  /** POST /players/register — Créer son équipe avec le signupcode en header */
  async registerPlayer(name: string, signupCode: string): Promise<RegisterPlayerResponse> {
    return this.request<RegisterPlayerResponse>('POST', '/players/register', { name }, {
      'codinggame-signupcode': signupCode,
    });
  }

  // --- Player ---

  /** GET /players/details — Détails complets du joueur (ressources, îles, argent…) */
  async getPlayerDetails(): Promise<PlayerDetails> {
    return this.request<PlayerDetails>('GET', '/players/details');
  }

  /** GET /resources — État des stocks de ressources actuels */
  async getResources(): Promise<Resource[]> {
    return this.request<Resource[]>('GET', '/resources');
  }

  // --- Ship ---

  /** POST /ship/build — Construire le bateau (une seule fois) */
  async buildShip(): Promise<ShipBuildResponse> {
    return this.request<ShipBuildResponse>('POST', '/ship/build');
  }

  /** POST /ship/move — Déplacer le bateau (8 directions possibles) */
  async moveShip(direction: Direction): Promise<ShipMoveResponse> {
    return this.request<ShipMoveResponse>('POST', '/ship/move', { direction });
  }
}
