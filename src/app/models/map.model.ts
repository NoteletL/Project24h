export interface ShipLevel {
  id: number;
  name: string;
}

export interface Ship {
  level: ShipLevel;
  playerName: string;
  lastMoveAt?: string; // ISO 8601
}

export interface Island {
  id: string;
  name: string;
  bonusQuotient: number;
}

export interface Cell {
  id: string;
  x: number;
  y: number;
  type: 'SEA' | 'SAND' | null; // null = cellule non encore découverte
  zone: number;
  ships: Ship[];
  island?: Island; // présent uniquement sur les cellules SAND
}

export interface MapState {
  cells: Cell[];
  boatPosition: Cell | null;
}

export interface MovementUpdate {
  discoveredCells: Cell[];
  position: Cell;
}
