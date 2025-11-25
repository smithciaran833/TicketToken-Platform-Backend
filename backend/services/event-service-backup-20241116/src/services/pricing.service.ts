import { Knex } from 'knex';
import { EventPricingModel, IEventPricing } from '../models';
import { NotFoundError, ValidationError } from '../types';
import { pino } from 'pino';

const logger = pino({ name: 'pricing-service' });

export class PricingService {
  private pricingModel: EventPricingModel;

  constructor(private db: Knex) {
    this.pricingModel = new EventPricingModel(db);
  }

  // Helper function to convert string decimals to numbers
  private parseDecimalFields(pricing: any): any {
    const decimalFields = [
      'base_price', 'current_price', 'service_fee', 'facility_fee', 'tax_rate',
      'early_bird_price', 'last_minute_price', 'min_price', 'max_price',
      'group_discount_rate', 'member_discount_rate'
    ];

    const parsed = { ...pricing };
    decimalFields.forEach(field => {
      if (parsed[field] !== null && parsed[field] !== undefined) {
        parsed[field] = typeof parsed[field] === 'string' 
          ? parseFloat(parsed[field]) 
          : parsed[field];
      }
    });

    return parsed;
  }

  async getEventPricing(eventId: string, tenantId: string): Promise<IEventPricing[]> {
    const pricing = await this.db('event_pricing')
      .where({ event_id: eventId, tenant_id: tenantId })
      .select('*');

    return pricing.map(p => this.parseDecimalFields(p));
  }

  async getPricingById(pricingId: string, tenantId: string): Promise<IEventPricing> {
    const pricing = await this.db('event_pricing')
      .where({ id: pricingId, tenant_id: tenantId })
      .first();

    if (!pricing) {
      throw new NotFoundError('Pricing');
    }

    return this.parseDecimalFields(pricing);
  }

  async createPricing(data: Partial<IEventPricing>, tenantId: string): Promise<IEventPricing> {
    // Validate pricing
    if (data.base_price && data.base_price < 0) {
      throw new ValidationError([{ field: 'base_price', message: 'Base price must be positive' }]);
    }

    if (data.is_dynamic && data.min_price && data.max_price && data.min_price > data.max_price) {
      throw new ValidationError([{
        field: 'min_price',
        message: 'Minimum price cannot exceed maximum price'
      }]);
    }

    const pricingData = {
      ...data,
      tenant_id: tenantId,
      current_price: data.current_price || data.base_price,
      is_active: data.is_active !== undefined ? data.is_active : true,
      is_visible: data.is_visible !== undefined ? data.is_visible : true
    };

    const [pricing] = await this.db('event_pricing')
      .insert(pricingData)
      .returning('*');

    logger.info({ pricingId: pricing.id, eventId: data.event_id, tenantId }, 'Pricing created');

    return this.parseDecimalFields(pricing);
  }

  async updatePricing(pricingId: string, data: Partial<IEventPricing>, tenantId: string): Promise<IEventPricing> {
    const existing = await this.getPricingById(pricingId, tenantId);

    // Validate updates
    if (data.base_price !== undefined && data.base_price < 0) {
      throw new ValidationError([{ field: 'base_price', message: 'Base price must be positive' }]);
    }

    const [updated] = await this.db('event_pricing')
      .where({ id: pricingId, tenant_id: tenantId })
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');

    logger.info({ pricingId, tenantId }, 'Pricing updated');

    return this.parseDecimalFields(updated);
  }

  async calculatePrice(pricingId: string, quantity: number, tenantId: string): Promise<{
    base_price: number;
    service_fee: number;
    facility_fee: number;
    tax: number;
    subtotal: number;
    total: number;
    per_ticket: number;
  }> {
    const pricing = await this.getPricingById(pricingId, tenantId);

    // Use current_price if dynamic, otherwise base_price
    const unitPrice = pricing.current_price || pricing.base_price;
    const baseTotal = unitPrice * quantity;

    // Calculate fees
    const serviceFee = (pricing.service_fee || 0) * quantity;
    const facilityFee = (pricing.facility_fee || 0) * quantity;

    // Calculate subtotal before tax
    const subtotal = baseTotal + serviceFee + facilityFee;

    // Calculate tax
    const taxRate = pricing.tax_rate || 0;
    const tax = subtotal * taxRate;

    // Calculate total
    const total = subtotal + tax;

    return {
      base_price: parseFloat(baseTotal.toFixed(2)),
      service_fee: parseFloat(serviceFee.toFixed(2)),
      facility_fee: parseFloat(facilityFee.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      subtotal: parseFloat(subtotal.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      per_ticket: parseFloat((total / quantity).toFixed(2))
    };
  }

  async updateDynamicPrice(pricingId: string, newPrice: number, tenantId: string): Promise<IEventPricing> {
    const pricing = await this.getPricingById(pricingId, tenantId);

    if (!pricing.is_dynamic) {
      throw new ValidationError([{
        field: 'is_dynamic',
        message: 'This pricing tier does not support dynamic pricing'
      }]);
    }

    // Validate against min/max
    if (pricing.min_price && newPrice < pricing.min_price) {
      throw new ValidationError([{
        field: 'price',
        message: `Price cannot be less than minimum (${pricing.min_price})`
      }]);
    }

    if (pricing.max_price && newPrice > pricing.max_price) {
      throw new ValidationError([{
        field: 'price',
        message: `Price cannot exceed maximum (${pricing.max_price})`
      }]);
    }

    return this.updatePricing(pricingId, { current_price: newPrice }, tenantId);
  }

  async getActivePricing(eventId: string, tenantId: string): Promise<IEventPricing[]> {
    const now = new Date();

    const pricing = await this.db('event_pricing')
      .where({ event_id: eventId, tenant_id: tenantId, is_active: true, is_visible: true })
      .where(function() {
        this.whereNull('sales_start_at')
          .orWhere('sales_start_at', '<=', now);
      })
      .where(function() {
        this.whereNull('sales_end_at')
          .orWhere('sales_end_at', '>=', now);
      })
      .orderBy('display_order', 'asc')
      .select('*');

    return pricing.map(p => this.parseDecimalFields(p));
  }

  async applyEarlyBirdPricing(eventId: string, tenantId: string): Promise<void> {
    const now = new Date();

    // Find pricing with early bird rates that are still active
    const earlyBirdPricing = await this.db('event_pricing')
      .where({ event_id: eventId, tenant_id: tenantId })
      .whereNotNull('early_bird_price')
      .whereNotNull('early_bird_ends_at')
      .where('early_bird_ends_at', '>', now)
      .select('*');

    for (const pricing of earlyBirdPricing) {
      await this.updatePricing(pricing.id, {
        current_price: pricing.early_bird_price
      }, tenantId);
    }

    logger.info({ eventId, count: earlyBirdPricing.length, tenantId }, 'Applied early bird pricing');
  }

  async applyLastMinutePricing(eventId: string, tenantId: string): Promise<void> {
    const now = new Date();

    // Find pricing with last minute rates that should be active
    const lastMinutePricing = await this.db('event_pricing')
      .where({ event_id: eventId, tenant_id: tenantId })
      .whereNotNull('last_minute_price')
      .whereNotNull('last_minute_starts_at')
      .where('last_minute_starts_at', '<=', now)
      .select('*');

    for (const pricing of lastMinutePricing) {
      await this.updatePricing(pricing.id, {
        current_price: pricing.last_minute_price
      }, tenantId);
    }

    logger.info({ eventId, count: lastMinutePricing.length, tenantId }, 'Applied last minute pricing');
  }
}
