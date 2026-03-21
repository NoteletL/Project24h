import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameMapComponent } from './components/game-map/game-map';
import { ControlsComponent } from './components/controls/controls';
import { LogPanelComponent } from './components/log-panel/log-panel';
import { ApiService, API_CONFIG, Direction } from './services/api.service';
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

  // Champs inscription
  mailInput = '';
  signupCode = '';
  teamName = '';

  // Champ connexion
  tokenInput = '';

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

  // --- Auth ---

  async fetchSignupCode() {
    if (!this.mailInput.trim()) return;
    try {
      const res = await this.api.getSignupCode(this.mailInput.trim());
      this.signupCode = res.signupCode;
      this.game.log(`Code reçu ! Collez-le dans le champ "Code d'inscription".`, 'info');
    } catch (e: any) {
      this.game.log(`Erreur signup code: ${e.message}`, 'error');
    }
  }

  async registerPlayer() {
    if (!this.teamName.trim() || !this.signupCode.trim()) return;
    try {
      const res = await this.api.registerPlayer(this.teamName.trim(), this.signupCode.trim());
      API_CONFIG.TOKEN = res.codingGameId;
      localStorage.setItem('3026_token', res.codingGameId);
      this.game.token.set(res.codingGameId);
      this.game.isAuthenticated.set(true);
      this.game.log(`Inscription réussie ! Équipe: ${res.name}`, 'action');
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
    this.game.log('Connecté avec le token.', 'action');
    await this.refreshAll();
  }

  logout() {
    localStorage.removeItem('3026_token');
    API_CONFIG.TOKEN = '';
    this.game.token.set('');
    this.game.isAuthenticated.set(false);
    this.game.log('Déconnecté.', 'info');
  }

  // --- Actions ---

  async onAction(action: string) {
    const dirs: Direction[] = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
    if (dirs.includes(action as Direction)) {
      await this.handleMove(action as Direction);
    } else {
      switch (action) {
        case 'build':         await this.handleBuild(); break;
        case 'upgrade-ship':  await this.handleUpgradeShip(); break;
        case 'refresh':       await this.refreshAll(); break;
        case 'show-islands':  await this.showIslands(); break;
        case 'show-market':   this.game.log('Marketplace disponible après OAS complet.', 'warning'); break;
        case 'show-taxes':    this.game.log('Taxes disponibles après OAS complet.', 'warning'); break;
      }
    }
  }

  private async handleMove(dir: Direction) {
    try {
      this.game.log(`⛵ Déplacement ${dir}...`, 'action');
      const res = await this.api.moveShip(dir);
      // Accumuler les cellules découvertes
      if (res.discoveredCells?.length) {
        this.game.addCells(res.discoveredCells);
      }
      if (res.position) {
        this.game.addCells([res.position]);
        // Mettre à jour la position du bateau
        const ship = this.game.ship();
        if (ship) {
          this.game.ship.set({ ...ship, availableMove: res.energy, currentPosition: res.position });
        }
      }
      this.game.log(`${dir} — Énergie restante: ${res.energy} | +${res.discoveredCells?.length ?? 0} cell(s)`, 'action');
    } catch (e: any) {
      this.game.log(`Erreur déplacement ${dir}: ${e.message}`, 'error');
    }
  }

  private async handleBuild() {
    try {
      this.game.log('🔨 Construction du bateau...', 'action');
      const ship = await this.api.buildShip();
      this.game.ship.set(ship);
      if (ship.currentPosition) this.game.addCells([ship.currentPosition]);
      this.game.log(`Bateau construit ! Niveau: ${ship.level.name} — ${ship.availableMove} points de mouvement`, 'action');
    } catch (e: any) {
      this.game.log(`Erreur construction: ${e.message}`, 'error');
    }
  }

  private async handleUpgradeShip() {
    this.game.log('Amélioration disponible après OAS complet.', 'warning');
  }

  private async showIslands() {
    const details = this.game.playerDetails();
    if (!details) {
      this.game.log('Récupération des données...', 'info');
      await this.refreshPlayer();
    }
    const d = this.game.playerDetails();
    if (!d) return;

    const islands = d.discoveredIslands;
    const html = islands.length === 0
      ? '<p>Aucune île découverte.</p>'
      : islands.map(di => `
          <div style="padding:6px 0;border-bottom:1px solid #333;">
            <strong>${di.islandState === 'KNOWN' ? '✅' : '👁️'} ${di.island.name}</strong>
            <span style="color:#888;margin-left:8px;">Bonus: +${di.island.bonusQuotient}</span>
            <span style="color:var(--blue);margin-left:8px;">${di.islandState}</span>
          </div>`).join('');
    this.game.showModal(`🏝️ Îles découvertes (${islands.length})`, html);
  }

  // --- Refresh ---

  async refreshAll() {
    this.game.log('🔄 Rafraîchissement...', 'info');
    await Promise.allSettled([
      this.refreshPlayer(),
      this.refreshResources(),
    ]);
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

  closeModal() {
    this.game.hideModal();
  }
}
