import { Component, inject, signal, HostListener, ElementRef, ViewChild, AfterViewInit, OnInit } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';
import { Cell } from '../../models/map.model';

// Taille fixe du viewport en pixels (doit correspondre au CSS)
const VIEWPORT_W = 720;
const VIEWPORT_H = 528;

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
export class GameMapComponent implements OnInit, AfterViewInit {
  readonly game = inject(GameStateService);

  @ViewChild('viewport') viewportRef!: ElementRef<HTMLDivElement>;

  readonly viewOffsetX = signal(0);
  readonly viewOffsetY = signal(0);
  readonly zoomCols    = signal(ZOOM_DEFAULT);

  readonly zoomMin = ZOOM_MIN;
  readonly zoomMax = ZOOM_MAX;

  protected isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartOffsetX = 0;
  private dragStartOffsetY = 0;
  private userHasPanned = false;

  get ship() { return this.game.ship(); }

  /** Taille d'une tuile en px = largeur fixe / nombre de colonnes */
  get tilePx(): number {
    return Math.floor(VIEWPORT_W / this.zoomCols());
  }

  /** Taille de la police proportionnelle à la tuile */
  get tileFontSize(): string {
    return `${Math.floor(this.tilePx * 0.6)}px`;
  }

  /** Nombre de lignes dérivé de la hauteur fixe et de la taille de tuile, toujours impair */
  get zoomRows(): number {
    const r = Math.floor(VIEWPORT_H / this.tilePx);
    return r % 2 === 0 ? r - 1 : r;
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

  // ── Zoom ─────────────────────────────────────────────────────────────────

  zoomIn():    void { this.zoomCols.update(v => Math.max(v - ZOOM_STEP, ZOOM_MIN)); }
  zoomOut():   void { this.zoomCols.update(v => Math.min(v + ZOOM_STEP, ZOOM_MAX)); }
  zoomReset(): void { this.zoomCols.set(ZOOM_DEFAULT); }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.deltaY < 0) this.zoomIn();
    else              this.zoomOut();
  }

  // ── Pan ───────────────────────────────────────────────────────────────────

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

  ngOnInit(): void {}
  ngAfterViewInit(): void {}

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
