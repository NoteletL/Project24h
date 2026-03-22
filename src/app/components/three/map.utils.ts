// map.utils.ts
import { Cell } from './map.types';

export function findBoatPosition(
  map: { boatPosition?: { x: number; y: number } | null; cells: Cell[] },
  teamName?: string // facultatif si on ne reçoit pas boatPosition
): { x: number; y: number } | null {
  if (map.boatPosition && map.boatPosition !== null) return map.boatPosition;

  if (teamName) {
    const cell = map.cells.find(c => (c.ships ?? []).some(s => s.playerName === teamName));
    if (cell) return { x: cell.x, y: cell.y };
  }
  return null;
}

export type DistanceMetric = 'euclidean' | 'manhattan' | 'chebyshev';
export function withinRadius(
  cell: Cell,
  center: { x: number; y: number },
  r: number,
  metric: DistanceMetric = 'euclidean'
): boolean {
  const dx = Math.abs(cell.x - center.x);
  const dy = Math.abs(cell.y - center.y);
  switch (metric) {
    case 'manhattan':  return (dx + dy) <= r;
    case 'chebyshev':  return Math.max(dx, dy) <= r;
    default:           return Math.sqrt(dx*dx + dy*dy) <= r;
  }
}

export function filterCellsAroundBoat(
  cells: Cell[],
  boat: { x: number; y: number },
  r = 10,
  metric: DistanceMetric = 'euclidean'
): Cell[] {
  return cells.filter(c => withinRadius(c, boat, r, metric));
}
