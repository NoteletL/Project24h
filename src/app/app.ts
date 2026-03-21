import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameMapComponent } from './components/game-map/game-map';
import { ControlsComponent } from './components/controls/controls';
import { LogPanelComponent } from './components/log-panel/log-panel';
import { ApiService, API_CONFIG } from './services/api.service';
import { GameStateService } from './services/game-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, GameMapComponent, ControlsComponent, LogPanelComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private api = inject(ApiService);
  readonly game = inject(GameStateService);

  tokenInput = '';
  registerTeamName = '';
  registerEmail = '';
  registerCode = '';

  async ngOnInit() {
    const saved = localStorage.getItem('3026_token');
    if (saved) {
      API_CONFIG.TOKEN = saved;
      this.game.token.set(saved);
      this.game.isAuthenticated.set(true);
      this.game.log('Token restauré depuis le stockage local.', 'info');
      await this.refreshAll();
    }
  }

  async connectWithToken() {
    if (!this.tokenInput.trim()) return;
    API_CONFIG.TOKEN = this.tokenInput.trim();
    localStorage.setItem('3026_token', API_CONFIG.TOKEN);
    this.game.token.set(API_CONFIG.TOKEN);
    this.game.isAuthenticated.set(true);
    this.game.log('Connecté avec le token.', 'action');
    await this.refreshAll();
  }

  async fetchSignupCodes() {
    try {
      const result = await this.api.getSignupCodes();
      this.game.log(`Codes reçus: ${JSON.stringify(result)}`, 'info');
    } catch (e: any) {
      this.game.log(`Erreur signup codes: ${e.message}`, 'error');
    }
  }

  async registerTeam() {
    try {
      const result = await this.api.register({
        teamName: this.registerTeamName,
        email: this.registerEmail,
        signupCode: this.registerCode,
      });
      API_CONFIG.TOKEN = result.token;
      localStorage.setItem('3026_token', result.token);
      this.game.token.set(result.token);
      this.game.isAuthenticated.set(true);
      this.game.log(`Inscription réussie ! Équipe: ${result.teamName}, Ressource: ${result.mainResource}`, 'action');
      await this.refreshAll();
    } catch (e: any) {
      this.game.log(`Erreur inscription: ${e.message}`, 'error');
    }
  }

  async onAction(action: string) {
    switch (action) {
      case 'N': case 'S': case 'E': case 'W':
        await this.handleMove(action as 'N' | 'S' | 'E' | 'W'); break;
      case 'build': await this.handleBuild(); break;
      case 'upgrade-ship': await this.handleUpgradeShip(); break;
      case 'upgrade-storage': await this.handleUpgradeStorage(); break;
      case 'rescue': await this.handleRescue(); break;
      case 'refresh': await this.refreshAll(); break;
      case 'show-islands': await this.showIslands(); break;
      case 'show-market': await this.showMarket(); break;
      case 'show-taxes': await this.showTaxes(); break;
    }
  }

  private async handleMove(dir: 'N' | 'S' | 'E' | 'W') {
    try {
      this.game.log(`⛵ Déplacement ${dir}...`, 'action');
      await this.api.moveShip(dir);
      this.game.log(`Déplacement ${dir} réussi.`, 'action');
      await this.refreshMap();
      await this.refreshShip();
    } catch (e: any) {
      this.game.log(`Erreur déplacement: ${e.message}`, 'error');
    }
  }

  private async handleBuild() {
    try {
      this.game.log('🔨 Construction du bateau...', 'action');
      await this.api.buildShip();
      this.game.log('Bateau construit !', 'action');
      await this.refreshShip();
      await this.refreshMap();
    } catch (e: any) {
      this.game.log(`Erreur construction: ${e.message}`, 'error');
    }
  }

  private async handleUpgradeShip() {
    try {
      this.game.log('⬆️ Amélioration du bateau...', 'action');
      await this.api.upgradeShip();
      this.game.log('Bateau amélioré !', 'action');
      await this.refreshShip();
      await this.refreshResources();
    } catch (e: any) {
      this.game.log(`Erreur amélioration bateau: ${e.message}`, 'error');
    }
  }

  private async handleUpgradeStorage() {
    try {
      this.game.log('📦 Amélioration de l\'entrepôt...', 'action');
      await this.api.upgradeStorage();
      this.game.log('Entrepôt amélioré !', 'action');
      await this.refreshResources();
    } catch (e: any) {
      this.game.log(`Erreur amélioration entrepôt: ${e.message}`, 'error');
    }
  }

  private async handleRescue() {
    try {
      this.game.log('🆘 Demande de sauvetage...', 'action');
      await this.api.rescue();
      this.game.log('Sauvetage en cours !', 'info');
      await this.refreshShip();
    } catch (e: any) {
      this.game.log(`Erreur sauvetage: ${e.message}`, 'error');
    }
  }

  private async showIslands() {
    try {
      const islands = await this.api.getIslands();
      this.game.islands.set(islands);
      const html = islands.length === 0
        ? '<p>Aucune île découverte.</p>'
        : islands.map(i => `
          <div style="padding:6px 0;border-bottom:1px solid #333;">
            <strong>${i.isHome ? '🏠' : '🏝️'} ${i.name}</strong>
            <span style="color:#888;margin-left:8px;">Bonus: +${i.productionBonus}</span>
            ${i.isHome ? '<span style="color:var(--green);margin-left:8px;">(Home)</span>' : ''}
          </div>`).join('');
      this.game.showModal('🏝️ Îles découvertes (' + islands.length + ')', html);
    } catch (e: any) {
      this.game.log(`Erreur îles: ${e.message}`, 'error');
    }
  }

  private async showMarket() {
    try {
      const offers = await this.api.getMarketOffers();
      this.game.marketOffers.set(offers);
      const html = offers.length === 0
        ? '<p>Aucune offre sur le marketplace.</p>'
        : offers.map(o => `
          <div style="padding:6px 0;border-bottom:1px solid #333;">
            <strong>${o.resource}</strong> x${o.quantity}
            <span style="color:var(--gold);margin-left:8px;">${o.unitPrice} OR/u</span>
            <span style="color:#666;margin-left:8px;">par ${o.teamName}</span>
          </div>`).join('');
      this.game.showModal('🏪 Marketplace (' + offers.length + ' offres)', html);
    } catch (e: any) {
      this.game.log(`Erreur marketplace: ${e.message}`, 'error');
    }
  }

  private async showTaxes() {
    try {
      const taxes = await this.api.getTaxes();
      this.game.taxes.set(taxes);
      const unpaid = taxes.filter(t => !t.paid);
      const html = unpaid.length === 0
        ? '<p style="color:var(--green);">Aucune taxe en attente ✅</p>'
        : unpaid.map(t => `
          <div style="padding:6px 0;border-bottom:1px solid #333;">
            <strong style="color:var(--red);">${t.type}</strong>
            <span style="color:var(--gold);margin-left:8px;">${t.amount} OR</span>
            <span style="color:#666;margin-left:8px;">${t.description}</span>
          </div>`).join('');
      this.game.showModal('💸 Taxes (' + unpaid.length + ' impayées)', html);
    } catch (e: any) {
      this.game.log(`Erreur taxes: ${e.message}`, 'error');
    }
  }

  async refreshAll() {
    this.game.log('🔄 Rafraîchissement...', 'info');
    await Promise.allSettled([
      this.refreshPlayer(),
      this.refreshMap(),
      this.refreshShip(),
      this.refreshResources(),
    ]);
    this.game.log('Données mises à jour.', 'info');
  }

  private async refreshPlayer() {
    try {
      const p = await this.api.getPlayer();
      this.game.player.set(p);
    } catch (e: any) {
      this.game.log(`Player: ${e.message}`, 'warning');
    }
  }

  private async refreshMap() {
    try {
      const cells = await this.api.getMap();
      this.game.cells.set(cells);
    } catch (e: any) {
      this.game.log(`Map: ${e.message}`, 'warning');
    }
  }

  private async refreshShip() {
    try {
      const ship = await this.api.getShip();
      this.game.ship.set(ship);
    } catch (e: any) {
      this.game.log(`Ship: ${e.message}`, 'warning');
    }
  }

  private async refreshResources() {
    try {
      const [res, storage] = await Promise.all([
        this.api.getResources(),
        this.api.getStorage(),
      ]);
      this.game.resources.set(res);
      this.game.storage.set(storage);
    } catch (e: any) {
      this.game.log(`Ressources: ${e.message}`, 'warning');
    }
  }

  closeModal() {
    this.game.hideModal();
  }
}
