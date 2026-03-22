import { Injectable, signal, inject, OnDestroy } from '@angular/core';
import { GameStateService } from './game-state.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BrokerMsgType = 'status' | 'error' | 'message';
export type BrokerStatus  = 'ws_ready' | 'connecting' | 'ready' | 'disconnected';

export interface BrokerRawMessage {
  type:       BrokerMsgType;
  timestamp?: string;
  status?:    BrokerStatus;
  message?:   string;
  queue?:     string;
  data?:      unknown;
  raw?:       string;
}

/** Entrée du journal broker enrichie pour l'affichage */
export interface BrokerLogEntry {
  id:        number;
  timestamp: string;
  type:      BrokerMsgType;
  status?:   BrokerStatus;
  label:     string;      // résumé court affiché
  detail?:   string;      // JSON complet si disponible
  offer?:    BrokerOffer; // si le message est une offre
}

/** Offre parsée depuis un message broker */
export interface BrokerOffer {
  id:               string;
  resourceType:     string;
  quantityIn:       number;
  pricePerResource: number;
  ownerName?:       string;
}

/** Offre enrichie d'un horodatage de réception pour le HUD et le localStorage */
export interface StoredOffer extends BrokerOffer {
  receivedAt: string; // ISO 8601
}

// ─── Service ──────────────────────────────────────────────────────────────────

const PROXY_URL          = 'ws://localhost:3001';
const MAX_ENTRIES        = 150;
const MAX_STORED_OFFERS  = 30;
const RECONNECT_DELAY_MS = 5_000;
const STORAGE_KEY_OFFERS = '3026_broker_offers';
let   _idSeq             = 0;

@Injectable({ providedIn: 'root' })
export class BrokerService implements OnDestroy {
  private readonly game = inject(GameStateService);

  // ── Signaux publics ────────────────────────────────────────────────────────
  readonly connected     = signal(false);
  readonly connecting    = signal(false);
  readonly status        = signal('Déconnecté');
  readonly error         = signal('');
  readonly logs          = signal<BrokerLogEntry[]>([]);
  /** Dernier message broker (type 'message') — utile pour le bot réactif */
  readonly latestMessage = signal<BrokerLogEntry | null>(null);

  /** Offres marketplace reçues via broker, persistées dans localStorage */
  readonly liveOffers  = signal<StoredOffer[]>(this.loadStoredOffers());
  /** Date de la dernière offre reçue */
  readonly lastOfferAt = signal<Date | null>(this.initLastOfferAt());
  /** Vrai pendant 3 s après la réception d'une nouvelle offre (pour l'animation HUD) */
  readonly hasNewOffer = signal(false);

  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Vrai si la déconnexion est volontaire (pas de reconnexion auto) */
  private manualDisconnect = false;
  private newOfferTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Connexion ──────────────────────────────────────────────────────────────

  /** Ouvre la connexion WebSocket vers le proxy, puis envoie les credentials AMQP. */
  connect(): void {
    const player = this.game.playerDetails();
    if (!player) {
      this.error.set('Données joueur non disponibles. Rafraîchissez d\'abord.');
      return;
    }

    // Règle du guide : username = nom équipe avec espaces → underscores
    const username = player.name.replace(/ /g, '_');
    const password = player.id;
    const playerId = player.id;

    this.connectWith(username, password, playerId);
  }

  /**
   * Connexion automatique si les credentials sont disponibles et qu'on n'est pas
   * déjà connecté. Appelée au login et après chaque refresh complet.
   */
  autoConnect(): void {
    if (this.connected() || this.connecting()) return;
    if (!this.game.playerDetails()) return;
    this.manualDisconnect = false;
    this.connect();
  }

  /** Variante avec credentials explicites (pour tests). */
  connectWith(username: string, password: string, playerId: string): void {
    if (this.ws) this.disconnect();
    this.manualDisconnect = false;

    this.connecting.set(true);
    this.error.set('');
    this.status.set('Connexion au proxy WebSocket…');

    this.ws = new WebSocket(PROXY_URL);

    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({ type: 'connect', username, password, playerId }));
    };

    this.ws.onmessage = (event) => this.handleMessage(event.data);

    this.ws.onclose = () => {
      this.connected.set(false);
      this.connecting.set(false);
      this.status.set('Connexion WebSocket fermée');
      this.pushLog({ type: 'status', status: 'disconnected', message: 'Connexion WebSocket fermée', timestamp: new Date().toISOString() });
      // Reconnexion automatique si non-volontaire et utilisateur toujours connecté
      if (!this.manualDisconnect && this.game.isAuthenticated()) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.error.set('Proxy WebSocket inaccessible (localhost:3001). Démarrez le broker-proxy avec : npm start');
      this.connecting.set(false);
    };
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    if (this.ws) {
      // Envoyer un message de déconnexion propre avant de fermer
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'disconnect' }));
      }
      this.ws.close();
      this.ws = null;
    }
    this.connected.set(false);
    this.connecting.set(false);
    this.status.set('Déconnecté');
  }

  clearLogs(): void { this.logs.set([]); }

  // ── Traitement des messages ────────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let msg: BrokerRawMessage;
    try {
      msg = JSON.parse(raw) as BrokerRawMessage;
    } catch {
      this.pushLog({ type: 'error', message: `Message invalide : ${raw}`, timestamp: new Date().toISOString() });
      return;
    }

    msg.timestamp = msg.timestamp ?? new Date().toISOString();

    switch (msg.type) {
      case 'status':
        this.handleStatus(msg);
        break;
      case 'error':
        this.error.set(msg.message ?? 'Erreur inconnue');
        this.connecting.set(false);
        this.pushLog(msg);
        break;
      case 'message':
        this.pushLog(msg);
        // Mettre à jour latestMessage pour les abonnés (ex : bot réactif)
        // On le fait après pushLog pour que l'entrée soit déjà dans le journal
        setTimeout(() => {
          const top = this.logs()[0];
          if (top) this.latestMessage.set(top);
        }, 0);
        break;
    }
  }

  private handleStatus(msg: BrokerRawMessage): void {
    const s = msg.status;
    this.status.set(msg.message ?? s ?? '');
    if (s === 'ready') {
      this.connected.set(true);
      this.connecting.set(false);
      this.error.set('');
    } else if (s === 'disconnected') {
      this.connected.set(false);
      this.connecting.set(false);
    }
    this.pushLog(msg);
  }

  // ── Journal ────────────────────────────────────────────────────────────────

  private pushLog(msg: BrokerRawMessage): void {
    const offer = this.parseOffer(msg.data);
    const entry: BrokerLogEntry = {
      id:        ++_idSeq,
      timestamp: msg.timestamp ?? new Date().toISOString(),
      type:      msg.type,
      status:    msg.status,
      label:     this.buildLabel(msg, offer),
      detail:    msg.data ? JSON.stringify(msg.data, null, 2) : undefined,
      offer,
    };

    this.logs.update(list => {
      const updated = [entry, ...list];
      return updated.length > MAX_ENTRIES ? updated.slice(0, MAX_ENTRIES) : updated;
    });

    // Persister l'offre dans localStorage et mettre à jour le HUD
    if (offer) this.addLiveOffer(offer);
  }

  // ── Persistence des offres (localStorage) ────────────────────────────────

  private addLiveOffer(offer: BrokerOffer): void {
    const stored: StoredOffer = { ...offer, receivedAt: new Date().toISOString() };
    this.liveOffers.update(list => {
      // Dédupliquer par id d'offre
      const next = [stored, ...list.filter(o => o.id !== offer.id)]
        .slice(0, MAX_STORED_OFFERS);
      this.saveOffers(next);
      return next;
    });
    this.lastOfferAt.set(new Date());
    // Indicateur visuel "nouvelle offre" pendant 3 s
    if (this.newOfferTimer) clearTimeout(this.newOfferTimer);
    this.hasNewOffer.set(true);
    this.newOfferTimer = setTimeout(() => this.hasNewOffer.set(false), 3000);
  }

  private saveOffers(offers: StoredOffer[]): void {
    try { localStorage.setItem(STORAGE_KEY_OFFERS, JSON.stringify(offers)); } catch { /* quota */ }
  }

  private loadStoredOffers(): StoredOffer[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_OFFERS);
      return raw ? (JSON.parse(raw) as StoredOffer[]) : [];
    } catch { return []; }
  }

  private initLastOfferAt(): Date | null {
    const offers = this.loadStoredOffers();
    return offers.length > 0 ? new Date(offers[0].receivedAt) : null;
  }

  // ── Reconnexion automatique ───────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.connected() && !this.connecting() && this.game.isAuthenticated()) {
        this.game.log('📡 Reconnexion broker…', 'info');
        this.connect();
      }
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  ngOnDestroy(): void {
    this.clearReconnectTimer();
    if (this.newOfferTimer) clearTimeout(this.newOfferTimer);
    this.disconnect();
  }

  private buildLabel(msg: BrokerRawMessage, offer?: BrokerOffer): string {
    if (msg.type === 'status')  return msg.message ?? `Statut : ${msg.status}`;
    if (msg.type === 'error')   return `⚠️ ${msg.message}`;
    if (offer) {
      const icon = offer.resourceType === 'BOISIUM' ? '🪵' : offer.resourceType === 'FERONIUM' ? '⛏️' : '🪨';
      return `Offre ${icon} ${offer.resourceType} × ${offer.quantityIn} @ 💰 ${offer.pricePerResource}/u${offer.ownerName ? ` (${offer.ownerName})` : ''}`;
    }
    // Générique
    const data = msg.data as Record<string, unknown> | null;
    if (data && typeof data === 'object') {
      const type = (data['type'] ?? data['eventType'] ?? data['event']) as string | undefined;
      if (type) return `Événement : ${type}`;
    }
    return msg.raw ?? JSON.stringify(msg.data ?? '(vide)');
  }

  /** Tente d'extraire des informations d'offre de la donnée brute. */
  parseOffer(data: unknown): BrokerOffer | undefined {
    if (!data || typeof data !== 'object') return undefined;

    const d = data as Record<string, unknown>;

    // Cas 1 : le message EST une offre
    const tryParse = (src: Record<string, unknown>): BrokerOffer | undefined => {
      const rt = src['resourceType'] as string | undefined;
      const q  = src['quantityIn']   as number | undefined;
      const p  = src['pricePerResource'] as number | undefined;
      if (rt && q !== undefined && p !== undefined) {
        const owner = src['owner'] as Record<string, unknown> | undefined;
        return { id: (src['id'] as string) ?? '', resourceType: rt, quantityIn: q, pricePerResource: p, ownerName: owner?.['name'] as string | undefined };
      }
      return undefined;
    };

    const direct = tryParse(d);
    if (direct) return direct;

    // Cas 2 : enveloppé dans data.offer, data.payload, data.content, etc.
    for (const key of ['offer', 'payload', 'content', 'data']) {
      const nested = d[key];
      if (nested && typeof nested === 'object') {
        const found = tryParse(nested as Record<string, unknown>);
        if (found) return found;
      }
    }

    return undefined;
  }

}
