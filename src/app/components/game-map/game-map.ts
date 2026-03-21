import { Component, inject, signal, HostListener, ElementRef, ViewChild, AfterViewInit, OnInit } from '@angular/core';
import { GameStateService } from '../../services/game-state.service';
import { Cell } from '../../models/map.model';

// Taille du viewport en nombre de tuiles visibles
const VIEWPORT_COLS = 15;
const VIEWPORT_ROWS = 11;

@Component({
  selector: 'app-game-map',
  standalone: true,
  templateUrl: './game-map.html',
  styleUrl: './game-map.css',
})
export class GameMapComponent implements OnInit, AfterViewInit {
  readonly game = inject(GameStateService);

  @ViewChild('viewport') viewportRef!: ElementRef<HTMLDivElement>;

  // Offset de la vue (en nombre de tuiles) par rapport au bateau
  // (0,0) = centré sur le bateau
  readonly viewOffsetX = signal(0);
  readonly viewOffsetY = signal(0);

  // Drag state
  protected isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartOffsetX = 0;
  private dragStartOffsetY = 0;
  private tileSize = 48;

  // true = l'utilisateur a déplacé la vue manuellement
  private userHasPanned = false;

  get ship() { return this.game.ship(); }

  /** Coordonnée centrale de la vue (position du bateau + offset) */
  private get viewCenterX(): number {
    return (this.ship?.currentPosition?.x ?? 0) + this.viewOffsetX();
  }
  private get viewCenterY(): number {
    return (this.ship?.currentPosition?.y ?? 0) + this.viewOffsetY();
  }

  /** Tuile en haut à gauche du viewport */
  private get viewStartX(): number {
    return this.viewCenterX - Math.floor(VIEWPORT_COLS / 2);
  }
  private get viewStartY(): number {
    return this.viewCenterY - Math.floor(VIEWPORT_ROWS / 2);
  }

  readonly viewportCols = VIEWPORT_COLS;
  readonly viewportRows = VIEWPORT_ROWS;

  /** Grille visible (VIEWPORT_COLS × VIEWPORT_ROWS), null = fog */
  get gridArray(): (Cell | null)[][] {
    const byCoord = new Map<string, Cell>();
    for (const c of this.game.knownCells().values()) {
      byCoord.set(`${c.x},${c.y}`, c);
    }
    const rows: (Cell | null)[][] = [];
    for (let row = 0; row < VIEWPORT_ROWS; row++) {
      const line: (Cell | null)[] = [];
      for (let col = 0; col < VIEWPORT_COLS; col++) {
        const wx = this.viewStartX + col;
        const wy = this.viewStartY + row;
        line.push(byCoord.get(`${wx},${wy}`) ?? null);
      }
      rows.push(line);
    }
    return rows;
  }

  /** Recentre la vue sur le bateau */
  recenter(): void {
    this.viewOffsetX.set(0);
    this.viewOffsetY.set(0);
    this.userHasPanned = false;
  }

  /** Appelé par app.ts après chaque déplacement — recentre sauf si l'utilisateur a panné */
  recenterOnMove(): void {
    if (!this.userHasPanned) {
      this.viewOffsetX.set(0);
      this.viewOffsetY.set(0);
    }
  }

  isShipHere(cell: Cell | null): boolean {
    const ship = this.ship; // variable locale nécessaire pour le narrowing TypeScript sur un getter
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
    switch (cell.type) {
      case 'SAND': return '🏝️';
      default:     return '';
    }
  }

  // ── Drag to pan ──────────────────────────────────────────────────────────

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    // Lire la taille réelle des tuiles depuis le CSS
    const style = getComputedStyle(document.documentElement);
    const ts = style.getPropertyValue('--tile-size').trim();
    if (ts) this.tileSize = parseInt(ts, 10) || 48;
  }

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
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    const tilesDx = Math.round(dx / this.tileSize);
    const tilesDy = Math.round(dy / this.tileSize);
    if (tilesDx !== 0 || tilesDy !== 0) this.userHasPanned = true;
    this.viewOffsetX.set(this.dragStartOffsetX - tilesDx);
    this.viewOffsetY.set(this.dragStartOffsetY - tilesDy);
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isDragging = false;
  }

  // Touch support
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
    const dx = e.touches[0].clientX - this.dragStartX;
    const dy = e.touches[0].clientY - this.dragStartY;
    const tilesDx = Math.round(dx / this.tileSize);
    const tilesDy = Math.round(dy / this.tileSize);
    if (tilesDx !== 0 || tilesDy !== 0) this.userHasPanned = true;
    this.viewOffsetX.set(this.dragStartOffsetX - tilesDx);
    this.viewOffsetY.set(this.dragStartOffsetY - tilesDy);
  }

  @HostListener('document:touchend')
  onTouchEnd(): void {
    this.isDragging = false;
  }
}
