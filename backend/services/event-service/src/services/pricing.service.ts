import { Knex } from 'knex';
import Redis from 'ioredis';
import { PricingRule } from '../types';
import { pino } from 'pino';

const logger = pino({ name: 'pricing-service' });

export class PricingService {
  constructor(
    private db: Knex,
    private redis: Redis
  ) {}

  async createPricingRule(data: Partial<PricingRule>): Promise<PricingRule> {
    const [rule] = await this.db('pricing_rules')
      .insert({
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');

    await this.invalidatePricingCache(data.ticket_type_id!);
    logger.info({ ruleId: rule.id }, 'Pricing rule created');
    return rule;
  }

  async calculatePrice(ticketTypeId: string): Promise<number> {
    // Check cache first
    const cached = await this.redis.get(`price:${ticketTypeId}`);
    if (cached) {
      return parseFloat(cached);
    }

    // Get ticket type
    const ticketType = await this.db('ticket_types')
      .where({ id: ticketTypeId })
      .first();

    if (!ticketType) {
      throw new Error('Ticket type not found');
    }

    // Get active pricing rules
    const rules = await this.db('pricing_rules')
      .where({ ticket_type_id: ticketTypeId, active: true })
      .orderBy('priority', 'asc');

    let price = parseFloat(ticketType.base_price);

    logger.info({
      ticketTypeId,
      basePrice: price,
      rulesCount: rules.length
    }, 'Calculating price');

    // Apply rules in priority order
    for (const rule of rules) {
      const oldPrice = price;
      price = await this.applyRule(price, rule, ticketType);

      if (price !== oldPrice) {
        logger.info({
          rule: rule.rule_type,
          oldPrice,
          newPrice: price,
          adjustment: rule.adjustment
        }, 'Price adjusted by rule');
      }
    }

    // Cache for 5 minutes
    await this.redis.setex(`price:${ticketTypeId}`, 300, price.toString());

    logger.info({ ticketTypeId, finalPrice: price }, 'Price calculation complete');
    return price;
  }

  private async applyRule(currentPrice: number, rule: PricingRule, ticketType: any): Promise<number> {
    let shouldApply = false;

    switch (rule.rule_type) {
      case 'time_based':
        shouldApply = await this.checkTimeBased(rule.conditions, ticketType);
        break;
      case 'demand_based':
        shouldApply = await this.checkDemandBased(rule.conditions);
        break;
      case 'group':
        shouldApply = await this.checkGroupDiscount(rule.conditions);
        break;
    }

    logger.info({
      ruleType: rule.rule_type,
      shouldApply,
      conditions: rule.conditions
    }, 'Rule evaluation');

    if (!shouldApply) {
      return currentPrice;
    }

    // Apply adjustment
    if (rule.adjustment.type === 'percentage') {
      const adjustedPrice = currentPrice * (1 + rule.adjustment.value / 100);
      logger.info({
        originalPrice: currentPrice,
        percentage: rule.adjustment.value,
        adjustedPrice
      }, 'Applying percentage adjustment');
      return adjustedPrice;
    } else {
      return currentPrice + rule.adjustment.value;
    }
  }

  private async checkTimeBased(conditions: any, ticketType: any): Promise<boolean> {
    const daysBefore = conditions.days_before;
    if (!daysBefore) return false;

    const event = await this.db('events')
      .where({ id: ticketType.event_id })
      .first();

    if (!event) {
      logger.error({ eventId: ticketType.event_id }, 'Event not found for pricing rule');
      return false;
    }

    const eventDate = new Date(event.event_date);
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysUntilEvent = Math.floor((eventDate.getTime() - now.getTime()) / msPerDay);

    logger.info({
      eventDate: event.event_date,
      now: now.toISOString(),
      daysUntilEvent,
      daysBeforeThreshold: daysBefore,
      shouldApply: daysUntilEvent >= daysBefore
    }, 'Time-based rule check');

    // Apply discount if we're MORE than 'daysBefore' days from the event
    return daysUntilEvent >= daysBefore;
  }

  private async checkDemandBased(conditions: any): Promise<boolean> {
    const percentageSold = conditions.percentage_sold;
    if (!percentageSold) return false;

    // Since we don't have tickets table yet, return false
    logger.info('Demand-based pricing check skipped - tickets table not available');
    return false;
  }

  private async checkGroupDiscount(_conditions: any): Promise<boolean> {
    // This would be checked at purchase time with the actual quantity
    return false; // For now, group discounts are applied at checkout
  }

  private async invalidatePricingCache(ticketTypeId: string): Promise<void> {
    await this.redis.del(`price:${ticketTypeId}`);
  }
}
