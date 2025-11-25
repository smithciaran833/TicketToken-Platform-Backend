import { getDb } from '../config/database';
import { dynamicPricingService } from '../services/dynamic-pricing.service';
import { logger } from '../utils/logger';

export class PricingWorker {
  private isRunning = false;

  async start() {
    this.isRunning = true;
    logger.info('🚀 Pricing worker started');

    while (this.isRunning) {
      try {
        await this.processEvents();
      } catch (error) {
        logger.error('Pricing worker error:', error);
      }
      await this.sleep(15 * 60 * 1000);
    }
  }

  stop() {
    this.isRunning = false;
    logger.info('🛑 Pricing worker stopped');
  }

  private async processEvents() {
    const db = getDb();
    const result = await db.raw(`
      SELECT e.id, e.price_cents, e.venue_id, vs.dynamic_pricing_enabled, vs.price_require_approval
      FROM events e
      JOIN venue_settings vs ON e.venue_id = vs.venue_id
      WHERE e.start_time > NOW() AND e.start_time < NOW() + INTERVAL '30 days' AND vs.dynamic_pricing_enabled = true AND e.status = 'active'
    `);

    logger.info(`Processing ${result.rows.length} events with dynamic pricing`);

    for (const event of result.rows) {
      try {
        await this.processEvent(event);
      } catch (error) {
        logger.error(`Error processing event ${event.id}:`, error);
      }
    }
  }

  private async processEvent(event: any) {
    const rules = await dynamicPricingService.getVenuePricingRules(event.venue_id);
    const recommendation = await dynamicPricingService.calculateOptimalPrice(event.id, event.price_cents, rules);

    logger.info(`Event ${event.id}:`);
    logger.info(`  Current: $${(event.price_cents / 100).toFixed(2)}`);
    logger.info(`  Recommended: $${(recommendation.recommendedPrice / 100).toFixed(2)}`);
    logger.info(`  Demand Score: ${recommendation.demandScore}/100`);
    logger.info(`  Confidence: ${(recommendation.confidence * 100).toFixed(0)}%`);

    const priceChange = Math.abs(recommendation.recommendedPrice - event.price_cents);
    const changePercent = priceChange / event.price_cents;

    if (changePercent < 0.05) {
      logger.info(`  ⏭️  Change too small (${(changePercent * 100).toFixed(1)}%), skipping`);
      return;
    }

    const db = getDb();
    if (rules.requireApproval) {
      await db.raw(`
        INSERT INTO pending_price_changes (event_id, current_price, recommended_price, confidence, reasoning, demand_score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
        ON CONFLICT (event_id) DO UPDATE SET recommended_price = ?, confidence = ?, reasoning = ?, demand_score = ?, updated_at = NOW()
      `, [event.id, event.price_cents, recommendation.recommendedPrice, recommendation.confidence, JSON.stringify(recommendation.reasoning), recommendation.demandScore, recommendation.recommendedPrice, recommendation.confidence, JSON.stringify(recommendation.reasoning), recommendation.demandScore]);
      logger.info(`  ⏸️  Awaiting approval`);
    } else {
      await dynamicPricingService.applyPriceChange(event.id, recommendation.recommendedPrice, `Auto-adjusted: ${recommendation.reasoning.join(', ')}`);
      logger.info(`  ✅ Price updated automatically`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
