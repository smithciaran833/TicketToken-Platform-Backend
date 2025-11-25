import { getDb } from '../config/database';
import { demandTrackerService } from './demand-tracker.service';
import { logger } from '../utils/logger';

interface PricingRules {
  enabled: boolean;
  minMultiplier: number;
  maxMultiplier: number;
  adjustmentFrequency: number;
  requireApproval: boolean;
  aggressiveness: number;
}

interface PriceRecommendation {
  eventId: string;
  currentPrice: number;
  recommendedPrice: number;
  confidence: number;
  reasoning: string[];
  demandScore: number;
}

export class DynamicPricingService {
  private static instance: DynamicPricingService;
  private log = logger.child({ component: 'DynamicPricingService' });

  static getInstance(): DynamicPricingService {
    if (!this.instance) {
      this.instance = new DynamicPricingService();
    }
    return this.instance;
  }

  async calculateOptimalPrice(
    eventId: string,
    basePrice: number,
    rules: PricingRules
  ): Promise<PriceRecommendation> {
    if (!rules.enabled) {
      return {
        eventId,
        currentPrice: basePrice,
        recommendedPrice: basePrice,
        confidence: 1.0,
        reasoning: ['Dynamic pricing disabled'],
        demandScore: 50,
      };
    }

    const demand = await demandTrackerService.calculateDemand(eventId);
    let demandScore = 0;
    const reasoning: string[] = [];

    const velocityScore = Math.min(30, demand.salesVelocity * 3);
    demandScore += velocityScore;
    if (demand.salesVelocity > 5) {
      reasoning.push(`High sales velocity: ${demand.salesVelocity.toFixed(1)} tickets/hour`);
    } else if (demand.salesVelocity < 1) {
      reasoning.push(`Low sales velocity: ${demand.salesVelocity.toFixed(1)} tickets/hour`);
    }

    const sellThroughScore = demand.sellThroughRate * 30;
    demandScore += sellThroughScore;
    if (demand.sellThroughRate > 0.7) {
      reasoning.push(`High sell-through: ${(demand.sellThroughRate * 100).toFixed(0)}%`);
    } else if (demand.sellThroughRate < 0.3) {
      reasoning.push(`Low sell-through: ${(demand.sellThroughRate * 100).toFixed(0)}%`);
    }

    let timeScore = 0;
    if (demand.timeUntilEvent < 24) {
      timeScore = 30;
      reasoning.push(`Event in ${demand.timeUntilEvent.toFixed(0)} hours`);
    } else if (demand.timeUntilEvent < 72) {
      timeScore = 20;
      reasoning.push(`Event in ${(demand.timeUntilEvent / 24).toFixed(1)} days`);
    } else if (demand.timeUntilEvent < 168) {
      timeScore = 10;
    }
    demandScore += timeScore;

    const remainingRate = 1 - demand.sellThroughRate;
    const inventoryScore = demand.timeUntilEvent < 48 && remainingRate > 0.5 ? 10 : 0;
    demandScore += inventoryScore;
    if (inventoryScore > 0) {
      reasoning.push(`High inventory with event approaching`);
    }

    let multiplier = 1.0;
    if (demandScore > 70) {
      multiplier = 1.0 + (demandScore - 70) / 100 * rules.aggressiveness;
      reasoning.push(`High demand score: ${demandScore.toFixed(0)}/100`);
    } else if (demandScore < 30) {
      multiplier = 1.0 - (30 - demandScore) / 100 * rules.aggressiveness;
      reasoning.push(`Low demand score: ${demandScore.toFixed(0)}/100`);
    } else {
      reasoning.push(`Moderate demand: ${demandScore.toFixed(0)}/100`);
    }

    if (demand.priceElasticity > 1.5) {
      multiplier = 1.0 + (multiplier - 1.0) * 0.7;
      reasoning.push(`High price sensitivity detected`);
    }

    multiplier = Math.max(rules.minMultiplier, Math.min(rules.maxMultiplier, multiplier));
    const recommendedPrice = Math.round(basePrice * multiplier);
    const confidence = this.calculateConfidence(demand, reasoning.length);

    return { eventId, currentPrice: basePrice, recommendedPrice, confidence, reasoning, demandScore };
  }

  private calculateConfidence(demand: any, reasoningCount: number): number {
    let confidence = 0.5;
    if (demand.salesVelocity > 0) confidence += 0.1;
    if (demand.ticketsSold > 10) confidence += 0.1;
    if (demand.priceElasticity !== 1.0) confidence += 0.1;
    if (reasoningCount >= 3) confidence += 0.1;
    return Math.min(1.0, confidence);
  }

  async getVenuePricingRules(venueId: string): Promise<PricingRules> {
    try {
      const db = getDb();
      const result = await db.raw(`SELECT dynamic_pricing_enabled, price_min_multiplier, price_max_multiplier, price_adjustment_frequency, price_require_approval, price_aggressiveness FROM venue_settings WHERE venue_id = ?`, [venueId]);
      if (result.rows.length === 0) {
        return { enabled: false, minMultiplier: 0.9, maxMultiplier: 2.0, adjustmentFrequency: 60, requireApproval: true, aggressiveness: 0.5 };
      }
      const row = result.rows[0];
      return {
        enabled: row.dynamic_pricing_enabled || false,
        minMultiplier: row.price_min_multiplier || 0.9,
        maxMultiplier: row.price_max_multiplier || 2.0,
        adjustmentFrequency: row.price_adjustment_frequency || 60,
        requireApproval: row.price_require_approval !== false,
        aggressiveness: row.price_aggressiveness || 0.5,
      };
    } catch (error) {
      this.log.error('Failed to get venue pricing rules', { error, venueId });
      throw error;
    }
  }

  async applyPriceChange(eventId: string, newPrice: number, reason: string) {
    try {
      const db = getDb();
      await db.raw(`INSERT INTO price_history (event_id, price_cents, reason, changed_at) VALUES (?, ?, ?, NOW())`, [eventId, newPrice, reason]);
      await db.raw(`UPDATE events SET price_cents = ?, updated_at = NOW() WHERE id = ?`, [newPrice, eventId]);
    } catch (error) {
      this.log.error('Failed to apply price change', { error, eventId });
      throw error;
    }
  }
}

export const dynamicPricingService = DynamicPricingService.getInstance();
