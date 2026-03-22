import { Component, inject, signal, computed, effect, HostListener, ElementRef, ViewChild, AfterViewInit, OnInit, OnDestroy } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { GameStateService } from '../../services/game-state.service';
import { AudioService } from '../../services/audio.service';
import { BrokerService, StoredOffer } from '../../services/broker.service';
import { Cell } from '../../models/map.model';

// Dimensions par défaut (mode fenêtré)
const DEFAULT_W = 720;
const DEFAULT_H = 528;

// Zoom = nombre de colonnes visibles (impair pour centrage)
const ZOOM_DEFAULT     = 15;
const ZOOM_DEFAULT_POV = 11;
const ZOOM_MIN         = 7;
const ZOOM_MAX         = 300;
const ZOOM_STEP        = 10;

// ─── Interfaces GPS ──────────────────────────────────────────────────────────

/** Île cible sélectionnée pour la navigation GPS */
export interface IslandTarget {
  name:          string;
  x:             number;
  y:             number;
  state:         'KNOWN' | 'DISCOVERED' | null;
  distance:      number;
  bonusQuotient: number;
}

/** Étape compressée (même direction consécutive) */
export interface GpsStep {
  dir:   string;
  count: number;
  emoji: string;
}

/** Tronçon de route entre deux points */
export interface GpsSegment {
  steps:       GpsStep[];
  waypoints:   Set<string>;
  movesNeeded: number;
  /** Vrai si ce tronçon mène à une île de recharge (pas la destination finale) */
  isRecharge:  boolean;
  toName?:     string;  // nom de l'île destination de ce tronçon
}

/** Résultat complet du calcul de chemin avec gestion d'énergie */
export interface GpsResult {
  segments:         GpsSegment[];
  allWaypoints:     Set<string>;  // union de tous les waypoints
  totalMoves:       number;
  targetX:          number;
  targetY:          number;
  rechargeStops:    number;
  /** L'énergie actuelle suffit pour un trajet direct */
  energySufficient: boolean;
  /** Atteignable avec des arrêts recharge sur des îles KNOWN */
  canReach:         boolean;
}

@Component({
  selector: 'app-game-map',
  standalone: true,
  imports: [SlicePipe],
  templateUrl: './game-map.html',
  styleUrl: './game-map.css',
})
export class GameMapComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly game  = inject(GameStateService);
  readonly audio = inject(AudioService);
  readonly broker = inject(BrokerService);

  @ViewChild('viewport')   viewportRef!: ElementRef<HTMLDivElement>;
  @ViewChild('mapWrapper') wrapperRef!:  ElementRef<HTMLDivElement>;

  readonly viewOffsetX  = signal(0);
  readonly viewOffsetY  = signal(0);
  readonly zoomCols     = signal(ZOOM_DEFAULT);
  readonly isFullscreen = signal(false);
  readonly showZones    = signal(true);
  readonly povMode      = signal(false);
  readonly lastMoveDir  = signal<'N' | 'S' | 'E' | 'W' | null>(null);

  readonly hoveredCell  = signal<Cell | null>(null);
  readonly tooltipX     = signal(0);
  readonly tooltipY     = signal(0);

  /** Île cible GPS sélectionnée */
  readonly gpsTarget    = signal<IslandTarget | null>(null);
  /** Panneau GPS ouvert/fermé */
  readonly showGpsPanel = signal(false);

  /** Dimensions réelles du viewport mesurées par ResizeObserver */
  readonly viewportW = signal(DEFAULT_W);
  readonly viewportH = signal(DEFAULT_H);

  readonly zoomMin = ZOOM_MIN;
  readonly zoomMax = ZOOM_MAX;

  protected isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartOffsetX = 0;
  private dragStartOffsetY = 0;
  private userHasPanned = false;
  private resizeObserver?: ResizeObserver;

  private prevShipX: number | null = null;
  private prevShipY: number | null = null;
  private moveDirTimer: ReturnType<typeof setTimeout> | null = null;

  /** Vrai si le navire est dans une zone à risque (zone numérotée ou présence d'autres navires). */
  readonly inDanger = computed(() => {
    const pos = this.game.ship()?.currentPosition;
    if (!pos) return false;
    return pos.zone > 0 || (pos.ships?.length ?? 0) > 0;
  });

  /** Pourcentage d'énergie restante du navire (0–100). */
  readonly energyPercent = computed<number>(() => {
    const ship = this.game.ship();
    if (!ship?.level?.maxMovement || ship.availableMove === undefined) return 0;
    return Math.min(100, Math.round((ship.availableMove / ship.level.maxMovement) * 100));
  });

  constructor() {
    // Calcule la direction du dernier déplacement du navire
    effect(() => {
      const pos = this.game.ship()?.currentPosition;
      if (!pos) return;
      const prevX = this.prevShipX;
      const prevY = this.prevShipY;
      this.prevShipX = pos.x;
      this.prevShipY = pos.y;
      if (prevX !== null && prevY !== null && (pos.x !== prevX || pos.y !== prevY)) {
        const dx = pos.x - prevX;
        const dy = pos.y - prevY;
        const dir: 'N' | 'S' | 'E' | 'W' =
          Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'S' : 'N') : (dx > 0 ? 'E' : 'W');
        this.lastMoveDir.set(dir);
        if (this.moveDirTimer) clearTimeout(this.moveDirTimer);
        this.moveDirTimer = setTimeout(() => this.lastMoveDir.set(null), 900);
      }
    });

    // Synchronise l'état danger avec l'audio (s'active aussi quand la musique démarre)
    effect(() => {
      const active = this.audio.isPlaying() && this.inDanger();
      this.audio.setDanger(active);
    });
  }

  get ship() { return this.game.ship(); }

  /** Taille d'une tuile en px = largeur mesurée / nombre de colonnes */
  get tilePx(): number {
    return Math.max(4, Math.floor(this.viewportW() / this.zoomCols()));
  }

  /** Taille de la police proportionnelle à la tuile */
  get tileFontSize(): string {
    return `${Math.floor(this.tilePx * 0.6)}px`;
  }

  /** Nombre de lignes dérivé de la hauteur mesurée et de la taille de tuile, toujours impair */
  get zoomRows(): number {
    const r = Math.floor(this.viewportH() / this.tilePx);
    return Math.max(1, r % 2 === 0 ? r - 1 : r);
  }

  private get viewCenterX(): number {
    return (this.ship?.currentPosition?.x ?? 0) + this.viewOffsetX();
  }
  private get viewCenterY(): number {
    const base = (this.ship?.currentPosition?.y ?? 0) + this.viewOffsetY();
    // En mode POV, décaler la caméra en avant pour voir plus de mer devant le navire
    if (this.povMode()) return base - Math.floor(this.zoomRows * 0.28);
    return base;
  }
  private get viewStartX(): number {
    return this.viewCenterX - Math.floor(this.zoomCols() / 2);
  }
  private get viewStartY(): number {
    return this.viewCenterY - Math.floor(this.zoomRows / 2);
  }

  /**
   * Liste triée des zones découvertes avec leur couleur — recalculée
   * automatiquement à chaque nouvelle cellule ajoutée.
   */
  readonly knownZones = computed(() => {
    const zones = new Set<number>();
    for (const c of this.game.knownCells().values()) {
      if (c.zone > 0) zones.add(c.zone);
    }
    return Array.from(zones)
      .sort((a, b) => a - b)
      .map(z => ({
        zone:       z,
        tintColor:  this.getZoneTintColor(z),
        labelColor: this.getZoneLabelColor(z),
      }));
  });

  /** Map nom d'île → état de découverte du joueur (KNOWN | DISCOVERED). */
  readonly discoveredIslandMap = computed(() => {
    const details = this.game.playerDetails();
    const m = new Map<string, 'KNOWN' | 'DISCOVERED'>();
    if (!details) return m;
    for (const di of details.discoveredIslands ?? []) {
      m.set(di.island.name, di.islandState as 'KNOWN' | 'DISCOVERED');
    }
    return m;
  });

  /**
   * Liste de toutes les îles visibles sur la carte (depuis knownCells),
   * avec la cellule la plus proche du navire pour chaque île, triée par distance.
   */
  readonly islandTargets = computed<IslandTarget[]>(() => {
    const ship = this.game.ship()?.currentPosition;
    const sx = ship?.x ?? 0;
    const sy = ship?.y ?? 0;
    const discoveredMap = this.discoveredIslandMap();
    const byName = new Map<string, IslandTarget>();

    for (const cell of this.game.knownCells().values()) {
      if (!cell.island) continue;
      const dist = Math.max(Math.abs(cell.x - sx), Math.abs(cell.y - sy));
      const existing = byName.get(cell.island.name);
      if (!existing || dist < existing.distance) {
        byName.set(cell.island.name, {
          name:          cell.island.name,
          x:             cell.x,
          y:             cell.y,
          state:         discoveredMap.get(cell.island.name) ?? null,
          distance:      dist,
          bonusQuotient: cell.island.bonusQuotient,
        });
      }
    }
    return Array.from(byName.values()).sort((a, b) => a.distance - b.distance);
  });

  /** Chemin GPS calculé vers la cible, avec gestion des arrêts recharge. */
  readonly gpsResult = computed<GpsResult | null>(() => {
    const target = this.gpsTarget();
    const ship   = this.game.ship();
    if (!target || !ship?.currentPosition) return null;
    const pos = ship.currentPosition;
    if (pos.x === target.x && pos.y === target.y) return null;

    const energy    = ship.availableMove ?? 0;
    const maxEnergy = ship.level?.maxMovement ?? energy;

    // Seules les îles KNOWN permettent une recharge
    const rechargeIslands = this.islandTargets().filter(i => i.state === 'KNOWN');

    return this.computeEnergyAwarePath(
      pos.x, pos.y, target.x, target.y, energy, maxEnergy, rechargeIslands
    );
  });

  /** Set de "x,y" de toutes les cases du chemin (pour coloration des tuiles). */
  readonly gpsWaypointSet = computed<Set<string>>(
    () => this.gpsResult()?.allWaypoints ?? new Set()
  );

  /** Clé "x,y" de la case cible finale. */
  readonly gpsTargetKey = computed<string | null>(() => {
    const r = this.gpsResult();
    return r ? `${r.targetX},${r.targetY}` : null;
  });

  get gridArray(): (Cell | null)[][] {
    const byCoord = new Map<string, Cell>();
    for (const c of this.game.knownCells().values()) {
      byCoord.set(`${c.x},${c.y}`, c);
    }
    const cols = this.zoomCols();
    const rows = this.zoomRows;
    const result: (Cell | null)[][] = [];
    for (let row = 0; row < rows; row++) {
      const line: (Cell | null)[] = [];
      for (let col = 0; col < cols; col++) {
        line.push(byCoord.get(`${this.viewStartX + col},${this.viewStartY + row}`) ?? null);
      }
      result.push(line);
    }
    return result;
  }

  zoomIn():    void { this.zoomCols.update(v => Math.max(v - ZOOM_STEP, ZOOM_MIN)); }
  zoomOut():   void { this.zoomCols.update(v => Math.min(v + ZOOM_STEP, ZOOM_MAX)); }
  zoomReset(): void { this.zoomCols.set(ZOOM_DEFAULT); }

  /** Bascule le mode POV : zoom réduit + recentrage automatique. */
  togglePov(): void {
    const next = !this.povMode();
    this.povMode.set(next);
    if (next) { this.zoomCols.set(ZOOM_DEFAULT_POV); this.recenter(); }
    else       { this.zoomReset(); }
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.deltaY < 0) this.zoomIn();
    else              this.zoomOut();
  }

  recenter(): void {
    this.viewOffsetX.set(0);
    this.viewOffsetY.set(0);
    this.userHasPanned = false;
  }

  recenterOnMove(): void {
    if (!this.userHasPanned) {
      this.viewOffsetX.set(0);
      this.viewOffsetY.set(0);
    }
  }

  isShipHere(cell: Cell | null): boolean {
    const ship = this.ship;
    if (!cell || !ship?.currentPosition) return false;
    return cell.id === ship.currentPosition.id;
  }

  getCellClass(cell: Cell | null): string {
    if (!cell || !cell.type) return 'tile-fog';
    return `tile-${cell.type.toLowerCase()}`;
  }

  getCellIcon(cell: Cell | null): string {
    if (!cell || !cell.type) return '';
    if (this.isShipHere(cell)) return '⛵';
    return cell.type === 'SAND' ? '🏝️' : '';
  }

  // ── Zones ─────────────────────────────────────────────────────────────────

  /**
   * Distribution d'angles par le nombre d'or → teintes maximalement distinctes.
   * Zone 0 ou null = pas de teinte.
   */
  private zoneHue(zone: number): number {
    return Math.round((zone * 137.508) % 360);
  }

  /** Fond semi-transparent unique par zone, superposé à la couleur de terrain. */
  getZoneTintColor(zone: number): string {
    return `hsla(${this.zoneHue(zone)}, 65%, 50%, 0.22)`;
  }

  /** Couleur vive du label de zone, lisible sur fond sombre. */
  getZoneLabelColor(zone: number): string {
    return `hsla(${this.zoneHue(zone)}, 90%, 80%, 1)`;
  }

  /** Retourne vrai si la cellule possède un numéro de zone valide (>0). */
  hasZone(cell: Cell | null): boolean {
    return !!cell && cell.zone > 0;
  }

  /** Retourne l'état de découverte d'une île pour le joueur courant. */
  getIslandState(cell: Cell | null): 'KNOWN' | 'DISCOVERED' | null {
    if (!cell?.island) return null;
    return this.discoveredIslandMap().get(cell.island.name) ?? null;
  }

  /** Classe CSS complète d'une tuile (type terrain + navire + état île + GPS). */
  getTileClass(cell: Cell | null): string {
    let cls = 'tile ' + this.getCellClass(cell);
    if (this.isShipHere(cell)) cls += ' tile-ship';
    if (cell?.island) {
      const s = this.getIslandState(cell);
      if (s === 'KNOWN')           cls += ' tile-island-known';
      else if (s === 'DISCOVERED') cls += ' tile-island-discovered';
    }
    if (cell && this.gpsTargetKey() === `${cell.x},${cell.y}`)
      cls += ' tile-gps-target';
    else if (cell && this.gpsWaypointSet().has(`${cell.x},${cell.y}`))
      cls += ' tile-gps-path';
    return cls;
  }

  /** Titre accessible complet d'une tuile (screen readers, tooltip natif). */
  getTileTitle(cell: Cell | null): string {
    if (!cell || !cell.type) return 'Inexploré';
    const parts: string[] = [`${cell.type} (${cell.x}, ${cell.y})`];
    if (cell.zone > 0) parts.push(`Zone ${cell.zone} — risque 20 %`);
    if (cell.island) {
      const s = this.getIslandState(cell);
      const sl = s === 'KNOWN' ? ' — validée' : s === 'DISCOVERED' ? ' — aperçue' : '';
      parts.push(`Île : ${cell.island.name}${sl}`);
      if (cell.island.bonusQuotient > 0) parts.push(`+${cell.island.bonusQuotient} quotient`);
    }
    if ((cell.ships?.length ?? 0) > 0) parts.push(`${cell.ships.length} navire(s) présent(s)`);
    return parts.join(' — ');
  }

  // ── Survol des tuiles (délégation sur le viewport) ────────────────────────

  onViewportMouseMove(e: MouseEvent): void {
    if (this.povMode() || this.isDragging) { this.hoveredCell.set(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const col  = Math.floor((e.clientX - rect.left) / this.tilePx);
    const row  = Math.floor((e.clientY - rect.top)  / this.tilePx);
    if (col >= 0 && col < this.zoomCols() && row >= 0 && row < this.zoomRows) {
      const cell = this.game.knownCells().get(`${this.viewStartX + col},${this.viewStartY + row}`) ?? null;
      this.hoveredCell.set(cell);
      const offX = e.clientX + 240 > window.innerWidth  ? -246 : 14;
      const offY = e.clientY + 210 > window.innerHeight ? -216 : 14;
      this.tooltipX.set(e.clientX + offX);
      this.tooltipY.set(e.clientY + offY);
    } else {
      this.hoveredCell.set(null);
    }
  }

  onViewportMouseLeave(): void { this.hoveredCell.set(null); }

  // ── GPS ───────────────────────────────────────────────────────────────────

  /** Sélectionne une île comme destination GPS (re-clic = désélection). */
  selectGpsTarget(island: IslandTarget): void {
    this.gpsTarget.set(this.gpsTarget()?.name === island.name ? null : island);
  }

  clearGps(): void {
    this.gpsTarget.set(null);
    this.showGpsPanel.set(false);
  }

  /**
   * Calcule la route optimale en tenant compte de l'énergie disponible.
   * Si le navire n'a pas assez d'énergie pour un trajet direct, insère des
   * arrêts de recharge sur les îles KNOWN les plus favorables.
   */
  private computeEnergyAwarePath(
    fx: number, fy: number,
    tx: number, ty: number,
    energy: number,
    maxEnergy: number,
    rechargeIslands: IslandTarget[],
  ): GpsResult {
    const allWaypoints = new Set<string>();
    const segments: GpsSegment[] = [];
    let cx = fx, cy = fy;
    let remainingEnergy = energy;
    let reached = false;

    for (let iter = 0; iter <= 15; iter++) {
      const dist = this.chebyshev(cx, cy, tx, ty);
      if (dist === 0) { reached = true; break; }

      if (dist <= remainingEnergy) {
        // Tronçon final direct vers la cible
        const seg = this.buildSegment(cx, cy, tx, ty, false);
        seg.waypoints.forEach(w => allWaypoints.add(w));
        segments.push(seg);
        reached = true;
        break;
      }

      // Chercher une île KNOWN accessible pour recharger
      const reachable = rechargeIslands.filter(i =>
        !(i.x === cx && i.y === cy) &&
        this.chebyshev(cx, cy, i.x, i.y) <= remainingEnergy
      );

      if (reachable.length === 0) {
        // Aucune recharge accessible — trajet partiel jusqu'à la limite d'énergie
        const partial = this.getPartialDest(cx, cy, tx, ty, remainingEnergy);
        const seg = this.buildSegment(cx, cy, partial.x, partial.y, false);
        seg.waypoints.forEach(w => allWaypoints.add(w));
        segments.push(seg);
        break;
      }

      // Choisir l'île qui minimise la distance totale restante
      const best = reachable.reduce((b, i) => {
        const scoreI = this.chebyshev(cx, cy, i.x, i.y) +
                       Math.max(0, this.chebyshev(i.x, i.y, tx, ty) - maxEnergy);
        const scoreB = this.chebyshev(cx, cy, b.x, b.y) +
                       Math.max(0, this.chebyshev(b.x, b.y, tx, ty) - maxEnergy);
        return scoreI < scoreB ? i : b;
      });

      const seg = this.buildSegment(cx, cy, best.x, best.y, true, best.name);
      seg.waypoints.forEach(w => allWaypoints.add(w));
      segments.push(seg);
      cx = best.x;
      cy = best.y;
      remainingEnergy = maxEnergy; // recharge complète
    }

    const totalMoves = segments.reduce((s, seg) => s + seg.movesNeeded, 0);

    return {
      segments,
      allWaypoints,
      totalMoves,
      targetX:          tx,
      targetY:          ty,
      rechargeStops:    segments.filter(s => s.isRecharge).length,
      energySufficient: this.chebyshev(fx, fy, tx, ty) <= energy,
      canReach:         reached,
    };
  }

  /** Calcule le point le plus avancé qu'on peut atteindre en `steps` pas. */
  private getPartialDest(fx: number, fy: number, tx: number, ty: number, steps: number): { x: number; y: number } {
    let x = fx, y = fy;
    let dx = tx - fx, dy = ty - fy;
    for (let i = 0; i < steps && (dx !== 0 || dy !== 0); i++) {
      const sx = Math.sign(dx), sy = Math.sign(dy);
      x += sx; y += sy;
      dx -= sx; dy -= sy;
    }
    return { x, y };
  }

  /** Construit un GpsSegment entre deux points. */
  private buildSegment(fx: number, fy: number, tx: number, ty: number, isRecharge: boolean, toName?: string): GpsSegment {
    const rawDirs: string[] = [];
    const waypoints = new Set<string>();
    let dx = tx - fx, dy = ty - fy;
    let cx = fx, cy = fy;

    while (dx !== 0 || dy !== 0) {
      const sx = Math.sign(dx), sy = Math.sign(dy);
      cx += sx; cy += sy;
      dx -= sx; dy -= sy;
      waypoints.add(`${cx},${cy}`);
      rawDirs.push(this.signToDir(sx, sy));
    }

    const steps: GpsStep[] = [];
    for (const d of rawDirs) {
      if (steps.length && steps[steps.length - 1].dir === d) steps[steps.length - 1].count++;
      else steps.push({ dir: d, count: 1, emoji: this.dirEmoji(d) });
    }

    return { steps, waypoints, movesNeeded: rawDirs.length, isRecharge, toName };
  }

  private chebyshev(ax: number, ay: number, bx: number, by: number): number {
    return Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  }

  private signToDir(sx: number, sy: number): string {
    const MAP: Record<string, string> = {
      '0,-1': 'N', '0,1': 'S', '1,0': 'E', '-1,0': 'W',
      '1,-1': 'NE', '-1,-1': 'NW', '1,1': 'SE', '-1,1': 'SW',
    };
    return MAP[`${sx},${sy}`] ?? '?';
  }

  private dirEmoji(dir: string): string {
    const MAP: Record<string, string> = {
      N: '⬆️', S: '⬇️', E: '➡️', W: '⬅️',
      NE: '↗️', NW: '↖️', SE: '↘️', SW: '↙️',
    };
    return MAP[dir] ?? '❓';
  }

  // ── Broker HUD ────────────────────────────────────────────────────────────

  /** Dernières offres reçues via broker — filtrées aux 10 minutes, max 5 affichées. */
  readonly recentBrokerOffers = computed<StoredOffer[]>(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    return this.broker.liveOffers()
      .filter(o => new Date(o.receivedAt).getTime() > cutoff)
      .slice(0, 5);
  });

  brokerResourceIcon(type: string): string {
    return type === 'BOISIUM' ? '🪵' : type === 'FERONIUM' ? '⛏️' : type === 'CHARBONIUM' ? '🪨' : '📦';
  }

  fmtBrokerTime(date: Date): string {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60)   return `il y a ${diff}s`;
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ── Plein écran ───────────────────────────────────────────────────────────

  async toggleFullscreen(): Promise<void> {
    const wrapper = this.wrapperRef?.nativeElement;
    if (!wrapper) return;
    try {
      if (!document.fullscreenElement) await wrapper.requestFullscreen();
      else                             await document.exitFullscreen();
    } catch { /* refusé hors geste utilisateur */ }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    const active = !!document.fullscreenElement;
    this.isFullscreen.set(active);
    if (!active) {
      this.viewportW.set(DEFAULT_W);
      this.viewportH.set(DEFAULT_H);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    const el = this.viewportRef?.nativeElement;
    if (!el) return;
    // Mesure la taille réelle du viewport à chaque redimensionnement (inclut fullscreen)
    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        if (w > 0) this.viewportW.set(w);
        if (h > 0) this.viewportH.set(h);
      }
    });
    this.resizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.moveDirTimer) clearTimeout(this.moveDirTimer);
  }

  // ── Souris / Tactile ──────────────────────────────────────────────────────

  onMouseDown(e: MouseEvent): void {
    if (this.povMode()) return; // désactiver le pan en mode POV
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartOffsetX = this.viewOffsetX();
    this.dragStartOffsetY = this.viewOffsetY();
    e.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    const tilesDx = Math.round((e.clientX - this.dragStartX) / this.tilePx);
    const tilesDy = Math.round((e.clientY - this.dragStartY) / this.tilePx);
    if (tilesDx !== 0 || tilesDy !== 0) this.userHasPanned = true;
    this.viewOffsetX.set(this.dragStartOffsetX - tilesDx);
    this.viewOffsetY.set(this.dragStartOffsetY - tilesDy);
  }

  @HostListener('document:mouseup')
  onMouseUp(): void { this.isDragging = false; }

  onTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1 || this.povMode()) return;
    this.isDragging = true;
    this.dragStartX = e.touches[0].clientX;
    this.dragStartY = e.touches[0].clientY;
    this.dragStartOffsetX = this.viewOffsetX();
    this.dragStartOffsetY = this.viewOffsetY();
  }

  @HostListener('document:touchmove', ['$event'])
  onTouchMove(e: TouchEvent): void {
    if (!this.isDragging || e.touches.length !== 1) return;
    const tilesDx = Math.round((e.touches[0].clientX - this.dragStartX) / this.tilePx);
    const tilesDy = Math.round((e.touches[0].clientY - this.dragStartY) / this.tilePx);
    if (tilesDx !== 0 || tilesDy !== 0) this.userHasPanned = true;
    this.viewOffsetX.set(this.dragStartOffsetX - tilesDx);
    this.viewOffsetY.set(this.dragStartOffsetY - tilesDy);
  }

  @HostListener('document:touchend')
  onTouchEnd(): void { this.isDragging = false; }
}
