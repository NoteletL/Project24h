import { Injectable, signal } from '@angular/core';
import { Offer } from './api.service';
import { PricePoint } from './price-history.service';

export type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

export interface ScoredOffer {
  offer:          Offer;
  score:          number;   // 0–100, plus élevé = meilleur achat
  expectedProfit: number;   // delta vs prix moyen marché (par unité)
  signal:         'buy' | 'hold' | 'sell';
}

export interface SpeculationSignal {
  resource:    string;
  action:      'buy' | 'sell' | 'hold';
  targetPrice: number | null;
  reason:      string;
}

const BUDGET_RATIO: Record<RiskProfile, number> = {
  conservative: 0.30,
  balanced:     0.50,
  aggressive:   0.80,
};

/** Calcule la moyenne mobile simple sur N points */
function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

@Injectable({ providedIn: 'root' })
export class SpeculationStrategyService {

  /** Profil de risque configurable depuis l'UI */
  readonly riskProfile = signal<RiskProfile>('balanced');

  /**
   * Évalue et classe les offres du marché.
   * Formule : score = (delta_prix × 0.6) + (volume_dispo × 0.4)
   * delta_prix = (prixMoyen - offrePrix) / prixMoyen × 100
   */
  scoreOffers(
    offers:  Offer[],
    history: Record<string, PricePoint[]>,
    myName:  string | null | undefined
  ): ScoredOffer[] {
    const scored: ScoredOffer[] = [];

    for (const offer of offers) {
      if (offer.owner?.name === myName) continue;

      const pts      = history[offer.resourceType] ?? [];
      const prices   = pts.map(p => p.avgPrice);
      const avgPrice = prices.length > 0
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : offer.pricePerResource;

      const ma5  = sma(prices, 5)  ?? avgPrice;
      const ma20 = sma(prices, 20) ?? avgPrice;

      const priceDelta   = avgPrice > 0 ? ((avgPrice - offer.pricePerResource) / avgPrice) * 100 : 0;
      const volumeScore  = Math.min(offer.quantityIn / 50, 1) * 100; // normalisé sur 50 unités

      const score         = priceDelta * 0.6 + volumeScore * 0.4;
      const expectedProfit = avgPrice - offer.pricePerResource;

      // Signal golden/death cross
      let sig: 'buy' | 'hold' | 'sell' = 'hold';
      if (ma5 > ma20 * 1.10 && offer.pricePerResource < avgPrice) sig = 'buy';
      else if (ma5 < ma20 * 0.90) sig = 'sell';

      scored.push({ offer, score, expectedProfit, signal: sig });
    }

    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Retourne le signal de vente pour une ressource donnée :
   * golden cross si MA5 > MA20 * 1.20.
   */
  getSellSignal(
    resource: string,
    history:  Record<string, PricePoint[]>
  ): SpeculationSignal {
    const pts    = history[resource] ?? [];
    const prices = pts.map(p => p.avgPrice);
    const ma5    = sma(prices, 5);
    const ma20   = sma(prices, 20);

    if (ma5 === null || ma20 === null) {
      return { resource, action: 'hold', targetPrice: null, reason: 'Données insuffisantes' };
    }

    if (ma5 > ma20 * 1.20) {
      return {
        resource,
        action:      'sell',
        targetPrice: parseFloat((ma5 * 1.05).toFixed(2)), // 5% au-dessus de MA5
        reason:      `Golden cross détecté (MA5=${ma5.toFixed(2)} > MA20=${ma20.toFixed(2)})`,
      };
    }

    if (ma5 < ma20 * 0.90) {
      return {
        resource,
        action:      'buy',
        targetPrice: parseFloat((ma5 * 0.95).toFixed(2)),
        reason:      `Death cross détecté — bon moment d'achat`,
      };
    }

    return {
      resource,
      action:      'hold',
      targetPrice: parseFloat(ma5.toFixed(2)),
      reason:      `Marché stable (MA5=${ma5.toFixed(2)}, MA20=${ma20.toFixed(2)})`,
    };
  }

  /** Calcule le budget maximal selon le profil de risque */
  maxBudget(totalMoney: number): number {
    return Math.floor(totalMoney * BUDGET_RATIO[this.riskProfile()]);
  }

  /** Retourne un résumé textuel du signal pour l'UI */
  signalLabel(signal: SpeculationSignal): string {
    const icons = { buy: '📈', sell: '📉', hold: '⏸️' };
    return `${icons[signal.action]} ${signal.resource} — ${signal.reason}`;
  }
}

