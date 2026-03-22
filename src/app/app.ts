import {Component, inject, OnInit, signal, viewChild, ViewChild} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameMapComponent } from './components/game-map/game-map';
import { ControlsComponent } from './components/controls/controls';
import { LogPanelComponent } from './components/log-panel/log-panel';
import { MarketplaceComponent } from './components/marketplace/marketplace';
import { MarketDashboardComponent } from './components/market-dashboard/market-dashboard';
import { BrokerPanelComponent } from './components/broker-panel/broker-panel';
import { Map3dComponent } from './components/three/map-3d.component';
import { ApiService, API_CONFIG, Direction, Ship } from './services/api.service';
import { GameStateService } from './services/game-state.service';
import { MapService } from './services/map.service';
import { BotService } from './services/bot.service';
import { BrokerService } from './services/broker.service';
import { PriceHistoryService } from './services/price-history.service';
import { ShipTrackerService } from './services/ship-tracker.service';
import { RecapPanelComponent } from './components/recap-panel/recap-panel';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    GameMapComponent,
    ControlsComponent,
    LogPanelComponent,
    MarketplaceComponent,
    MarketDashboardComponent,
    BrokerPanelComponent,
    RecapPanelComponent,
    Map3dComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private api = inject(ApiService);
  private mapService = inject(MapService);
  readonly game = inject(GameStateService);
  private readonly bot         = inject(BotService);
  private readonly broker      = inject(BrokerService);
  private readonly priceHistory = inject(PriceHistoryService);
  readonly tracker = inject(ShipTrackerService);

  private readonly marketplaceModal = viewChild(MarketplaceComponent);
  private pendingShipUpgrade: Ship | null = null;

  /** Vue active : carte générale, dashboard marketplace ou broker */
  readonly activeView = signal<'map' | '3d' | 'market' | 'broker' | 'recap'>('map');

  setView(view: 'map' | '3d' | 'market' | 'broker' | 'recap'): void {
    this.activeView.set(view);
  }

  @ViewChild(GameMapComponent) gameMap?: GameMapComponent;

  // Champs inscription
  mailInput = '';
  signupCode = '';
  teamName = '';

  // Champ connexion
  tokenInput = '';

  async ngOnInit() {
    // Chargement de la carte de base (map.json) dès le démarrage, sans authentification
    await this.loadMapJson();

    const saved = localStorage.getItem('3026_token');
    if (saved) {
      API_CONFIG.TOKEN = saved;
      this.game.token.set(saved);
      this.game.isAuthenticated.set(true);
      this.game.log('Token restauré depuis le stockage local.', 'info');
      await this.refreshAll();
      this.broker.autoConnect();
    }
  }

  // --- Auth ---

  async fetchSignupCode() {
    if (!this.mailInput.trim()) return;
    try {
      const res = await this.api.getSignupCode(this.mailInput.trim());
      this.signupCode = res.signupCode;
      this.game.log('Code reçu ! Renseignez-le dans le champ ci-dessous.', 'info');
    } catch (e: any) {
      this.game.log(`Erreur signup code: ${e.message}`, 'error');
    }
  }

  async registerPlayer() {
    if (!this.teamName.trim() || !this.signupCode.trim()) return;
    try {
      const res = await this.api.registerPlayer(this.teamName.trim(), this.signupCode.trim());
      API_CONFIG.TOKEN = res.codingGameId!;
      localStorage.setItem('3026_token', res.codingGameId!);
      this.game.token.set(res.codingGameId!);
      this.game.isAuthenticated.set(true);
      this.game.log(`Inscription réussie ! Équipe : ${res.name}`, 'action');
      await this.refreshAll();
    } catch (e: any) {
      this.game.log(`Erreur inscription: ${e.message}`, 'error');
    }
  }

  async connectWithToken() {
    if (!this.tokenInput.trim()) return;
    API_CONFIG.TOKEN = this.tokenInput.trim();
    localStorage.setItem('3026_token', API_CONFIG.TOKEN);
    this.game.token.set(API_CONFIG.TOKEN);
    this.game.isAuthenticated.set(true);
    this.game.log('Connecté.', 'action');
    await this.refreshAll();
    this.broker.autoConnect();
  }

  logout() {
    localStorage.removeItem('3026_token');
    API_CONFIG.TOKEN = '';
    this.game.token.set('');
    this.game.isAuthenticated.set(false);
    this.game.log('Déconnecté.', 'info');
    this.bot.stop();
    this.broker.disconnect();
    this.priceHistory.stop();
    this.tracker.stop();
  }

  // --- Actions ---

  async onAction(action: string) {
    const dirs: Direction[] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
    if (dirs.includes(action as Direction)) {
      await this.handleMove(action as Direction);
    } else {
      switch (action) {
        case 'build':
          await this.handleBuild();
          break;
        case 'upgrade-ship':
          await this.handleUpgradeShip();
          break;
        case 'refresh':
          await this.refreshAll();
          break;
        case 'show-islands':
          await this.showIslands();
          break;
        case 'show-market':
          this.setView('market');
          break;
        case 'show-taxes':
          await this.showTaxes();
          break;
      }
    }
  }

  private async handleMove(dir: Direction) {
    try {
      this.game.log(`⛵ Déplacement ${dir}...`, 'action');
      const res = await this.api.moveShip(dir);

      // 1. Mise à jour locale (knownCells)
      const allCells = [...(res.discoveredCells ?? [])];
      if (res.position) allCells.push(res.position);
      if (allCells.length) this.game.addCells(allCells);

      // 2. Mise à jour du signal ship (position + énergie)
      const ship = this.game.ship();
      if (ship && res.position) {
        this.game.ship.set({ ...ship, availableMove: res.energy, currentPosition: res.position });
      }

      this.game.log(
        `${dir} ✓ — Énergie: ${res.energy} | +${res.discoveredCells?.length ?? 0} cell(s)`,
        'action',
      );

      // Recentrer la vue sur le bateau (sauf si l'utilisateur a panné manuellement)
      this.gameMap?.recenterOnMove();

      // 3. Persistance backend map (fire & forget — ne bloque pas l'UI)
      if (res.position) {
        this.mapService
          .updateMap({
            discoveredCells: res.discoveredCells ?? [],
            position: res.position,
          })
          .subscribe({
            next: (mapState) => this.game.mapState.set(mapState),
            error: (err) => this.game.log(`Map backend: ${err.message}`, 'warning'),
          });
      }
    } catch (e: any) {
      this.game.log(`Erreur déplacement ${dir}: ${e.message}`, 'error');
    }
  }

  private async handleBuild() {
    try {
      this.game.log('🔨 Construction du bateau...', 'action');
      const res = await this.api.buildShip();
      // Persister l'ID du bateau
      this.game.shipId.set(res.shipId);
      localStorage.setItem('3026_ship_id', res.shipId);
      this.game.log(`⛵ Bateau construit ! ID : ${res.shipId}`, 'action');
      // Récupérer immédiatement la position initiale
      await this.refreshShip();
    } catch (e: any) {
      this.game.log(`Erreur construction: ${e.message}`, 'error');
    }
  }

  /** Récupère la position et l'état courant du bateau via GET /ship */
  private async refreshShip(): Promise<void> {
    try {
      const state = await this.api.getShipState();
      const existing = this.game.ship();
      if (existing) {
        this.game.ship.set({
          ...existing,
          availableMove: state.availableMove,
          currentPosition: state.currentPosition,
        });
      } else {
        this.game.ship.set(state);
      }
      if (state.currentPosition) {
        this.game.addCells([state.currentPosition]);
        this.game.log(
          `⛵ Position bateau : (${state.currentPosition.x}, ${state.currentPosition.y}) — énergie : ${state.availableMove}`,
          'info',
        );
      }
    } catch {
      // Aucun bateau encore construit — silencieux
    }
  }

  private async handleUpgradeShip() {
    // Si le modal de confirmation a été fermé manuellement, on réinitialise
    if (!this.game.modalVisible()) this.pendingShipUpgrade = null;

    if (!this.pendingShipUpgrade) {
      // Étape 1 : afficher les infos du prochain niveau
      try {
        const next = await this.api.getNextShipLevel();
        this.pendingShipUpgrade = next;
        const cost = next.costResources
          ? Object.entries(next.costResources)
              .map(([k, v]) => `${v} ${k}`)
              .join(', ')
          : '?';
        const html = `
          <p>Niveau actuel : <strong>${this.game.ship()?.level.name ?? '?'}</strong></p>
          <p>Prochain niveau : <strong>${next.level.name}</strong></p>
          <ul style="margin:8px 0 8px 16px;line-height:1.8">
            <li>⚡ Vitesse : ${next.level.speed}</li>
            <li>🧭 Mouvement max : ${next.level.maxMovement}</li>
            <li>👁️ Visibilité : ${next.level.visibilityRange}</li>
          </ul>
          <p>Coût : <span style="color:var(--gold)">${cost}</span></p>
          <p style="margin-top:12px;color:var(--gold)">
            Appuyez à nouveau sur <kbd style="background:var(--bg-tertiary);border:1px solid var(--accent);border-radius:4px;padding:1px 6px">U</kbd>
            pour confirmer l'amélioration.
          </p>`;
        this.game.showModal('⬆️ Améliorer le bateau', html);
      } catch (e: any) {
        this.pendingShipUpgrade = null;
        this.game.log(`Erreur prochain niveau : ${e.message}`, 'error');
      }
      return;
    }

    // Étape 2 : confirmation — on procède à l'upgrade
    const next = this.pendingShipUpgrade;
    this.pendingShipUpgrade = null;
    this.game.hideModal();
    try {
      this.game.log('⬆️ Amélioration du bateau en cours…', 'action');
      await this.api.upgradeShip(next.level.id);
      this.game.log(`✅ Bateau amélioré au niveau : ${next.level.name}`, 'action');
      await this.refreshAll();
    } catch (e: any) {
      this.game.log(`Erreur amélioration : ${e.message}`, 'error');
    }
  }

  private async showTaxes() {
    try {
      const taxes = await this.api.getTaxes();
      if (taxes.length === 0) {
        this.game.showModal('💸 Taxes', '<p>Aucune taxe en cours. Vous êtes en règle ✅</p>');
        return;
      }
      const html = taxes
        .map(
          (t) => `
        <div style="padding:8px 0;border-bottom:1px solid #2a2a3e;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <span style="color:${t.state === 'DUE' ? 'var(--red)' : 'var(--green)'}">
            ${t.state === 'DUE' ? '🔴 À PAYER' : '✅ PAYÉE'}
          </span>
          <strong>${t.type}</strong>
          <span style="color:var(--gold)">💰 ${t.amount} OR</span>
          ${t.remainingTime > 0 ? `<span style="color:var(--text-muted)">⏳ ${t.remainingTime}s</span>` : ''}
        </div>`,
        )
        .join('');
      const due = taxes.filter((t) => t.state === 'DUE');
      const title = `💸 Taxes${due.length ? ` — ${due.length} à payer` : ''}`;
      this.game.showModal(title, html);
    } catch (e: any) {
      this.game.log(`Erreur taxes : ${e.message}`, 'error');
    }
  }

  closeModal() {
    this.pendingShipUpgrade = null;
    this.game.hideModal();
  }

  private async showIslands() {
    const details = this.game.playerDetails();
    if (!details) {
      this.game.log("Données joueur non chargées, rafraîchissez d'abord.", 'warning');
      return;
    }
    const islands = details.discoveredIslands;
    const html =
      islands.length === 0
        ? "<p>Aucune île découverte pour l'instant.</p>"
        : islands
            .map(
              (di) => `
          <div style="padding:6px 0;border-bottom:1px solid #333;">
            <strong>${di.islandState === 'KNOWN' ? '✅' : '👁️'} ${di.island.name}</strong>
            <span style="color:#888;margin-left:8px;">Bonus: +${di.island.bonusQuotient}</span>
            <span style="color:var(--blue);margin-left:8px;">${di.islandState}</span>
          </div>`,
            )
            .join('');
    this.game.showModal(`🏝️ Îles découvertes (${islands.length})`, html);
  }

  // ── Refresh ────────────────────────────────────────────────────────────────

  async refreshAll() {
    this.game.log('🔄 Rafraîchissement...', 'info');
    await Promise.allSettled([
      this.refreshPlayer(),
      this.refreshResources(),
      this.refreshShip(),
      this.loadMap(),
    ]);
    // Démarrer le polling des prix si la marketplace est débloquée
    if (this.game.playerDetails()?.marketPlaceDiscovered) {
      this.priceHistory.start();
    }
    // Démarrer le suivi automatique du bateau
    this.tracker.start();
    // Connexion automatique au broker si pas encore connecté
    this.broker.autoConnect();
    this.game.log('Données mises à jour.', 'info');
  }

  /**
   * Charge la carte de base depuis /map.json (fichier statique public).
   * Peuple baseMapCells — pas de token requis, exécuté avant l'auth.
   * Les cellules découvertes en jeu (localStorage) ont toujours la priorité.
   */
  private loadMapJson(): Promise<void> {
    return new Promise((resolve) => {
      this.mapService.loadStaticMap().subscribe({
        next: (cells) => {
          if (cells.length) {
            this.game.initBaseMap(cells);
            this.game.log(`🗺️ Carte de base chargée : ${cells.length} cellules.`, 'info');
          }
          resolve();
        },
        error: () => {
          this.game.log('map.json indisponible — carte de base vide.', 'warning');
          resolve();
        },
      });
    });
  }

  /** Charge (ou recharge) la carte depuis le backend map (localhost:8080) */
  private loadMap(): Promise<void> {
    return new Promise((resolve) => {
      this.mapService.getMap().subscribe({
        next: (mapState) => {
          this.game.mapState.set(mapState);
          if (mapState.cells?.length) {
            this.game.addCells(mapState.cells);
          }
          resolve();
        },
        error: (err) => {
          this.game.log(`Map backend indisponible: ${err.message}`, 'warning');
          resolve();
        },
      });
    });
  }

  private async refreshPlayer() {
    try {
      const details = await this.api.getPlayerDetails();
      this.game.playerDetails.set(details);
    } catch (e: any) {
      this.game.log(`Player: ${e.message}`, 'warning');
    }
  }

  private async refreshResources() {
    try {
      const resources = await this.api.getResources();
      this.game.resources.set(resources);
    } catch (e: any) {
      this.game.log(`Ressources: ${e.message}`, 'warning');
    }
  }
}
