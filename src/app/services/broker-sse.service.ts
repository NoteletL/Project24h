import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

const BROKER_PROXY_URL = 'http://localhost:4000';
const MAX_RETRIES      = 10;
const BASE_BACKOFF_MS  = 1_000;

@Injectable({ providedIn: 'root' })
export class BrokerSseService implements OnDestroy {

  /** Flux d'événements broker décodés en JSON */
  readonly events$ = new Subject<Record<string, unknown>>();

  private source:      EventSource | null = null;
  private retryCount   = 0;
  private retryTimer:  ReturnType<typeof setTimeout> | null = null;
  private _connected   = false;

  get isConnected(): boolean { return this._connected; }

  /** Lance la connexion SSE au proxy */
  connect(): void {
    if (this.source) return;
    this._openConnection();
  }

  /** Ferme la connexion et annule les retentatives */
  disconnect(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.source?.close();
    this.source    = null;
    this._connected = false;
    this.retryCount = 0;
  }

  private _openConnection(): void {
    const url = `${BROKER_PROXY_URL}/events`;
    this.source = new EventSource(url);

    this.source.onopen = () => {
      this._connected = true;
      this.retryCount  = 0;
    };

    this.source.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as Record<string, unknown>;
        this.events$.next(data);
      } catch { /* message non JSON — ignoré */ }
    };

    // Écoute des événements nommés du broker
    ['market.offer.created', 'offer.created', 'price.update'].forEach(eventType => {
      this.source?.addEventListener(eventType, (evt: Event) => {
        try {
          const data = JSON.parse((evt as MessageEvent).data) as Record<string, unknown>;
          this.events$.next({ type: eventType, payload: data });
        } catch { /* ignoré */ }
      });
    });

    this.source.onerror = () => {
      this._connected = false;
      this.source?.close();
      this.source = null;
      this._scheduleRetry();
    };
  }

  private _scheduleRetry(): void {
    if (this.retryCount >= MAX_RETRIES) return;
    const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, this.retryCount), 30_000);
    this.retryCount++;
    this.retryTimer = setTimeout(() => this._openConnection(), delay);
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.events$.complete();
  }
}

