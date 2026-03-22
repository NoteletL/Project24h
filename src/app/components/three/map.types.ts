
export type TileType = 'SAND' | 'SEA';

export interface ShipInfo {
  playerName: string;
  lastMoveAt?: string;
  level?: { id: number; name: string };
}

export interface Cell {
  id: string;
  x: number;
  y: number;
  type: TileType;
  zone: number;
  ships?: ShipInfo[];
  island?: { id: string; name: string; bonusQuotient: number };
}

export interface MapResponse {
  cells: Cell[];
  boatPosition?: { x: number; y: number } | null;
}
