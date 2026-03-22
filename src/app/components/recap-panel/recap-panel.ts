import { Component, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { GameStateService } from '../../services/game-state.service';
import { ShipTrackerService } from '../../services/ship-tracker.service';

@Component({
  selector: 'app-recap-panel',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './recap-panel.html',
  styleUrl: './recap-panel.css',
})
export class RecapPanelComponent {
  readonly game = inject(GameStateService);
  readonly tracker = inject(ShipTrackerService);

  readonly openSections = signal<Record<string, boolean>>({
    ship: true,
    exploration: true,
    transactions: true,
    logs: false,
  });
  toggleSection(s: string): void {
    this.openSections.update((o) => ({ ...o, [s]: !o[s] }));
  }
  isSectionOpen(s: string): boolean {
    return !!this.openSections()[s];
  }

  readonly logFilter = signal<string>('all');
  readonly filteredLogs = computed(() => {
    const f = this.logFilter();
    return f === 'all' ? this.game.logs() : this.game.logs().filter((l) => l.type === f);
  });

  readonly mapStats = computed(() => {
    const cells = Array.from(this.game.knownCells().values());
    const zoneMap = new Map<number, { count: number; sea: number; sand: number }>();
    let sea = 0,
      sand = 0,
      fog = 0;
    for (const c of cells) {
      if (c.type === 'SEA') sea++;
      else if (c.type === 'SAND') sand++;
      else fog++;
      if (c.zone > 0) {
        const z = zoneMap.get(c.zone) ?? { count: 0, sea: 0, sand: 0 };
        z.count++;
        if (c.type === 'SEA') z.sea++;
        if (c.type === 'SAND') z.sand++;
        zoneMap.set(c.zone, z);
      }
    }
    const zones = Array.from(zoneMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([zone, data]) => ({ zone, ...data }));
    return {
      total: cells.length,
      sea,
      sand,
      fog,
      zones,
      maxCells: Math.max(1, ...zones.map((z) => z.count)),
    };
  });

  readonly txStats = computed(() => {
    const txs = this.game.transactions();
    let totalSpent = 0,
      botQty = 0,
      manualQty = 0;
    const byResource: Record<string, { qty: number; cost: number }> = {};
    for (const tx of txs) {
      totalSpent += tx.totalCost;
      if (tx.source === 'bot') botQty += tx.quantity;
      else manualQty += tx.quantity;
      if (!byResource[tx.resourceType]) byResource[tx.resourceType] = { qty: 0, cost: 0 };
      byResource[tx.resourceType].qty += tx.quantity;
      byResource[tx.resourceType].cost += tx.totalCost;
    }
    return {
      count: txs.length,
      totalSpent,
      totalQty: botQty + manualQty,
      botQty,
      manualQty,
      byResource: Object.entries(byResource).sort(([a], [b]) => a.localeCompare(b)),
    };
  });

  resourceIcon(t: string): string {
    return t === 'BOISIUM' ? '🪵' : t === 'FERONIUM' ? '⛏️' : t === 'CHARBONIUM' ? '🪨' : '📦';
  }
  fmtTime(d: Date | string): string {
    const dt = typeof d === 'string' ? new Date(d) : d;
    return dt.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  zoneHue(z: number): number {
    return Math.round((z * 137.508) % 360);
  }
  zoneColor(z: number): string {
    return `hsla(${this.zoneHue(z)}, 65%, 50%, 0.25)`;
  }
  zoneLabelColor(z: number): string {
    return `hsla(${this.zoneHue(z)}, 90%, 80%, 1)`;
  }
  logTypeLabel(t: string): string {
    return t === 'action' ? '⚡' : t === 'error' ? '❌' : t === 'warning' ? '⚠️' : 'ℹ️';
  }
  logTypeClass(t: string): string {
    return t === 'action'
      ? 'log--action'
      : t === 'error'
        ? 'log--error'
        : t === 'warning'
          ? 'log--warning'
          : 'log--info';
  }
}
