import { Component, inject, OnInit } from '@angular/core';
import { GameMapComponent } from './components/game-map/game-map';
import { ControlsComponent } from './components/controls/controls';
import { LogPanelComponent } from './components/log-panel/log-panel';
import { ApiService } from './services/api.service';
import { GameStateService } from './services/game-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GameMapComponent, ControlsComponent, LogPanelComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private api = inject(ApiService);
  readonly game = inject(GameStateService);

  private readonly DIRS: Record<string, { dx: number; dy: number }> = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };

  async ngOnInit() {
    this.game.log('Initialisation...', 'info');
    try {
      const data = await this.api.fetchMapData(this.game.cols(), this.game.rows());
      this.game.loadMap(data.map, data.playerPos);
      this.game.log('Carte chargée ! Utilisez les flèches ou ZQSD pour vous déplacer.', 'action');
      this.game.log('Raccourcis : E=Interagir, U=Améliorer, I=Inventaire, P=Statut, R=Scanner, A=Attaquer', 'info');
    } catch (err: any) {
      this.game.log(`Erreur lors du chargement : ${err.message}`, 'error');
    }
  }

  async onAction(action: string) {
    switch (action) {
      case 'up': case 'down': case 'left': case 'right':
        await this.handleMove(action); break;
      case 'wait': await this.handleWait(); break;
      case 'interact': await this.handleInteract(); break;
      case 'upgrade': await this.handleUpgrade(); break;
      case 'attack': await this.handleAttack(); break;
      case 'inventory': await this.handleInventory(); break;
      case 'status': await this.handleStatus(); break;
      case 'scan': await this.handleScan(); break;
    }
  }

  private async handleMove(dir: string) {
    const { dx, dy } = this.DIRS[dir];
    const moved = this.game.movePlayer(dx, dy);

    if (moved) {
      this.game.incrementTurn();
      const pos = this.game.playerPos();
      const tile = this.game.getCurrentTile();
      this.game.log(`Déplacement → ${dir} (${pos.x}, ${pos.y})`, 'action');
      await this.api.sendAction('move', { direction: dir });

      if (tile?.type === 'chest') {
        this.game.gold.update(g => g + 10);
        this.game.log('📦 Coffre trouvé ! +10 or', 'info');
        this.game.updateTile(pos.x, pos.y, { type: 'floor' });
      } else if (tile?.type === 'enemy') {
        this.game.hp.update(h => h - 15);
        this.game.log('👹 Ennemi rencontré ! -15 HP', 'warning');
        this.game.updateTile(pos.x, pos.y, { type: 'floor' });
      } else if (tile?.type === 'npc') {
        this.game.log('🧙 Un PNJ est ici. Appuyez sur E pour interagir.', 'info');
      } else if (tile?.type === 'shop') {
        this.game.log('🏪 Boutique ! Appuyez sur E pour interagir.', 'info');
      }
    } else {
      this.game.log(`Impossible d'aller ${dir}`, 'error');
    }
  }

  private async handleWait() {
    this.game.incrementTurn();
    this.game.log('⏳ Attente... un tour passe.', 'action');
    await this.api.sendAction('wait');
  }

  private async handleInteract() {
    const adjacent = this.game.getAdjacentTiles();
    let interacted = false;
    for (const [dir, adjTile] of Object.entries(adjacent)) {
      if (adjTile && (adjTile.type === 'npc' || adjTile.type === 'shop' || adjTile.type === 'door')) {
        this.game.log(`🤝 Interaction avec ${adjTile.type} (${dir})`, 'action');
        interacted = true;
        const result = await this.api.sendAction('interact', { target: adjTile });
        this.game.log(result.message, 'info');
        break;
      }
    }
    if (!interacted) this.game.log('Rien à proximité pour interagir.', 'warning');
    this.game.incrementTurn();
  }

  private async handleUpgrade() {
    this.game.log('⬆️ Tentative d\'amélioration...', 'action');
    const result = await this.api.sendAction('upgrade');
    this.game.log(result.message, 'info');
    this.game.incrementTurn();
  }

  private async handleAttack() {
    const adjacent = this.game.getAdjacentTiles();
    let attacked = false;
    for (const [dir, adjTile] of Object.entries(adjacent)) {
      if (adjTile && adjTile.type === 'enemy') {
        this.game.log(`⚔️ Attaque l'ennemi (${dir}) !`, 'action');
        attacked = true;
        this.game.updateTile(adjTile.x, adjTile.y, { type: 'floor' });
        this.game.gold.update(g => g + 5);
        this.game.log('Ennemi vaincu ! +5 or', 'info');
        await this.api.sendAction('attack', { direction: dir });
        break;
      }
    }
    if (!attacked) this.game.log('Aucun ennemi à portée.', 'warning');
    this.game.incrementTurn();
  }

  private async handleInventory() {
    const status = await this.api.fetchPlayerStatus();
    const items = status.inventory.map(i =>
      `<div style="padding:4px 0;border-bottom:1px solid #333;">
        ${i.name} <span style="color:#888;">(x${i.qty})</span>
        <span style="color:#666;font-size:0.8rem;"> — ${i.type}</span>
      </div>`
    ).join('');
    this.game.showModal('🎒 Inventaire', items || '<p>Inventaire vide</p>');
  }

  private async handleStatus() {
    const status = await this.api.fetchPlayerStatus();
    const html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div>❤️ HP</div><div>${status.hp} / ${status.maxHp}</div>
        <div>💰 Or</div><div>${status.gold}</div>
        <div>⭐ Niveau</div><div>${status.level}</div>
        <div>📈 XP</div><div>${status.xp} / ${status.xpNext}</div>
        <div>⚔️ Attaque</div><div>${status.attack}</div>
        <div>🛡️ Défense</div><div>${status.defense}</div>
      </div>`;
    this.game.showModal('📊 Statut du joueur', html);
  }

  private async handleScan() {
    this.game.log('🔍 Scan en cours...', 'action');
    const result = await this.api.scanArea();
    if (result.nearby.length === 0) {
      this.game.log('Rien détecté à proximité.', 'info');
    } else {
      result.nearby.forEach(item => {
        this.game.log(`📍 ${item.name} (${item.type}) — ${item.distance} cases au ${item.direction}`, 'info');
      });
    }
    this.game.incrementTurn();
  }

  closeModal() {
    this.game.hideModal();
  }
}
