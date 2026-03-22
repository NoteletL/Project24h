import { Component, inject, signal, computed, HostListener, ElementRef, ViewChild, AfterViewInit, OnInit, OnDestroy } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';
import { Cell } from '../../models/map.model';

// Dimensions par défaut (mode fenêtré)
const DEFAULT_W = 720;
const DEFAULT_H = 528;

// Zoom = nombre de colonnes visibles (impair pour centrage)
const ZOOM_DEFAULT = 15;
const ZOOM_MIN     = 7;
const ZOOM_MAX     = 300;
const ZOOM_STEP    = 10;

@Component({
  selector: 'app-game-map',
  standalone: true,
  templateUrl: './game-map.html',
  styleUrl: './game-map.css',
})
export class GameMapComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly game = inject(GameStateService);

  @ViewChild('viewport')   viewportRef!: ElementRef<HTMLDivElement>;
  @ViewChild('mapWrapper') wrapperRef!:  ElementRef<HTMLDivElement>;

  readonly viewOffsetX  = signal(0);
  readonly viewOffsetY  = signal(0);
  readonly zoomCols     = signal(ZOOM_DEFAULT);
  readonly isFullscreen = signal(false);
  readonly showZones    = signal(true);

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
    return (this.ship?.currentPosition?.y ?? 0) + this.viewOffsetY();
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

  // ── Plein écran ───────────────────────────────────────────────────────────

  async toggleFullscreen(): Promise<void> {
    const wrapper = this.wrapperRef?.nativeElement;
    if (!wrapper) return;
    try {
      if (!document.fullscreenElement) {
        await wrapper.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch { /* refusé hors geste utilisateur ou navigateur non supporté */ }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    const active = !!document.fullscreenElement;
    this.isFullscreen.set(active);
    // En sortant du plein écran : réinitialiser les dimensions par défaut
    // (le ResizeObserver reprendra la main dès que l'élément retrouve sa taille)
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
  }

  // ── Souris / Tactile ──────────────────────────────────────────────────────

  onMouseDown(e: MouseEvent): void {
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
    if (e.touches.length !== 1) return;
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
