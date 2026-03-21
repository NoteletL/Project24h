import { Injectable } from '@angular/core';
import { Cell } from '../models/map.model';

export const API_CONFIG = {
  BASE_URL: 'http://ec2-15-237-116-133.eu-west-3.compute.amazonaws.com:8443',
  TOKEN: '',
};

// ─── Types OAS ───────────────────────────────────────────────────────────────

export type Direction = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';
export type ResourceType = 'BOISIUM' | 'FERONIUM' | 'CHARBONIUM';
export type IslandState = 'KNOWN' | 'DISCOVERED';
export type TaxeType = 'RESCUE' | 'CHEAT';
export type TaxeState = 'DUE' | 'PAID';
export type TheftChance = 'FAIBLE' | 'MOYENNE' | 'FORTE';

export type PriceResources = Record<string, number>;

export interface ShipLevel {
  id: number;
  name: string;
  visibilityRange: number;
  maxMovement: number;
  speed: number;
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

export interface SignupCodeResponse {
  signupCode: string;
}

export interface Player {
  name: string;
  codingGameId?: string;
}

export interface ShipBuildResponse {
  shipId: string;
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

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ApiService {

  /** XHR helper — préserve la casse exacte des headers (le navigateur capitalise fetch/HttpClient) */
  private request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
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
          catch { resolve(xhr.responseText as T); }
        } else {
          let msg = `${xhr.status}`;
          try {
            const err: ApiError = JSON.parse(xhr.responseText);
            msg = `${err.codeError}: ${err.message}`;
          } catch { msg = `${xhr.status} ${xhr.responseText}`; }
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(body !== undefined ? JSON.stringify(body) : null);
    });
  }

  // ── Inscription ────────────────────────────────────────────────────────────

  /** POST /signupcodes — Envoie le mail et reçoit le code d'inscription */
  getSignupCode(mail: string): Promise<SignupCodeResponse> {
    return this.request<SignupCodeResponse>('POST', '/signupcodes', { mail });
  }

  /** POST /players/register — Crée l'équipe ; signupCode passé en header */
  registerPlayer(name: string, signupCode: string): Promise<Player> {
    return this.request<Player>(
      'POST', '/players/register',
      { name },
      { 'codinggame-signupcode': signupCode }
    );
  }

  // ── Joueur ─────────────────────────────────────────────────────────────────

  /** GET /players/details — Solde, ressources, îles découvertes… */
  getPlayerDetails(): Promise<PlayerDetails> {
    return this.request<PlayerDetails>('GET', '/players/details');
  }

  /** GET /resources — Stocks de ressources actuels */
  getResources(): Promise<Resource[]> {
    return this.request<Resource[]>('GET', '/resources');
  }

  // ── Bateau ─────────────────────────────────────────────────────────────────

  /** POST /ship/build — Construit le bateau (une seule fois) */
  buildShip(): Promise<ShipBuildResponse> {
    return this.request<ShipBuildResponse>('POST', '/ship/build');
  }

  /**
   * GET /ship/next-level — Récupère la position et l'état courant du bateau.
   * (Seul endpoint retournant un Ship complet avec currentPosition sans effectuer de mouvement.)
   */
  async getShipState(): Promise<Ship> {
    return this.request<Ship>('GET', '/ship/next-level');
  }

  /** POST /ship/move — Déplace le bateau (8 directions), retourne cellules découvertes */
  moveShip(direction: Direction): Promise<ShipMoveResponse> {
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
