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
export type TaxeType = 'RESCUE' | 'CHEAT';
export type TaxeState = 'DUE' | 'PAID';
export type TheftChance = 'FAIBLE' | 'MOYENNE' | 'FORTE';

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
  shipId: string;
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

export interface Taxe {
  id: string;
  type: TaxeType;
  state: TaxeState;
  amount: number;
  remainingTime: number;
  player?: { id?: string; name?: string };
}

export interface Storage {
  id: number;
  name: string;
  maxResources?: PriceResources;
  costResources?: PriceResources;
}

export interface Offer {
  id: string;
  owner?: { name: string };
  resourceType: string;
  quantityIn: number;
  pricePerResource: number;
}

export interface OfferCreateRequest {
  resourceType: ResourceType;
  quantityIn: number;
  pricePerResource: number;
}

export interface Purchase {
  quantity: number;
  offerId: string;
}

export interface Theft {
  id: string;
  resourceType: string;
  amountAttempted: number;
  moneySpent: number;
  createdAt: string;
  resolveAt: string;
  status: string;
  chance: TheftChance;
}

export interface TheftRequest {
  resourceType: string;
  moneySpent: number;
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

  /**
   * GET /ship/next-level — Récupère la position et l'état courant du bateau.
   * (Seul endpoint retournant un Ship complet avec currentPosition sans effectuer de mouvement.)
   */
  async getShipState(): Promise<Ship> {
    return this.request<Ship>('GET', '/ship/next-level');
  }

  /** POST /ship/move — Déplacer le bateau (8 directions possibles) */
  async moveShip(direction: Direction): Promise<ShipMoveResponse> {
    return this.request<ShipMoveResponse>('POST', '/ship/move', { direction });
  }

  // --- Taxes ---

  /** GET /taxes — Liste des taxes (optionnel: filtrer par status DUE | PAID) */
  async getTaxes(status?: TaxeState): Promise<Taxe[]> {
    const q = status ? `?status=${status}` : '';
    return this.request<Taxe[]>('GET', `/taxes${q}`);
  }

  /** PUT /taxes/{taxId} — Payer une taxe */
  async payTax(taxId: string): Promise<void> {
    return this.request<void>('PUT', `/taxes/${taxId}`);
  }

  // --- Ship upgrade ---

  /** GET /ship/next-level — Infos et coût du prochain niveau de bateau */
  async getNextShipLevel(): Promise<Ship> {
    return this.request<Ship>('GET', '/ship/next-level');
  }

  /** PUT /ship/upgrade — Améliorer le bateau au niveau souhaité */
  async upgradeShip(level: number): Promise<void> {
    return this.request<void>('PUT', '/ship/upgrade', { level });
  }

  // --- Storage ---

  /** GET /storage/next-level — Infos et coût du prochain niveau d'entrepôt */
  async getNextStorageLevel(): Promise<Storage> {
    return this.request<Storage>('GET', '/storage/next-level');
  }

  /** PUT /storage/upgrade — Améliorer l'entrepôt au prochain niveau */
  async upgradeStorage(): Promise<Storage> {
    return this.request<Storage>('PUT', '/storage/upgrade');
  }

  // --- Marketplace ---

  /** GET /marketplace/offers — Toutes les offres en cours */
  async getMarketplaceOffers(): Promise<Offer[]> {
    return this.request<Offer[]>('GET', '/marketplace/offers');
  }

  /** GET /marketplace/offers/{id} — Détails d'une offre */
  async getMarketplaceOffer(id: string): Promise<Offer> {
    return this.request<Offer>('GET', `/marketplace/offers/${id}`);
  }

  /** POST /marketplace/offers — Mettre en ligne une offre de vente */
  async createOffer(req: OfferCreateRequest): Promise<Offer> {
    return this.request<Offer>('POST', '/marketplace/offers', req);
  }

  /** PATCH /marketplace/offers — Mettre à jour une offre existante */
  async updateOffer(req: OfferCreateRequest): Promise<Offer> {
    return this.request<Offer>('PATCH', '/marketplace/offers', req);
  }

  /** DELETE /marketplace/offers/{id} — Supprimer une offre */
  async deleteOffer(id: string): Promise<void> {
    return this.request<void>('DELETE', `/marketplace/offers/${id}`);
  }

  /** POST /marketplace/purchases — Acheter une offre disponible */
  async purchaseOffer(req: Purchase): Promise<Purchase> {
    return this.request<Purchase>('POST', '/marketplace/purchases', req);
  }

  // --- Thefts ---

  /** GET /thefts — Consulter tous vos vols */
  async getThefts(): Promise<Theft[]> {
    return this.request<Theft[]>('GET', '/thefts');
  }

  /** POST /thefts/player — Lancer une attaque de pirates */
  async createTheft(req: TheftRequest): Promise<Theft> {
    return this.request<Theft>('POST', '/thefts/player', req);
  }
}
