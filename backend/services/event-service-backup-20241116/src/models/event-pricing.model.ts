import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IEventPricing {
  id?: string;
  event_id: string;
  schedule_id?: string;
  capacity_id?: string;
  name: string;
  description?: string;
  tier?: string;
  base_price: number;
  service_fee?: number;
  facility_fee?: number;
  tax_rate?: number;
  is_dynamic?: boolean;
  min_price?: number;
  max_price?: number;
  price_adjustment_rules?: Record<string, any>;
  current_price?: number;
  early_bird_price?: number;
  early_bird_ends_at?: Date;
  last_minute_price?: number;
  last_minute_starts_at?: Date;
  group_size_min?: number;
  group_discount_percentage?: number;
  currency?: string;
  sales_start_at?: Date;
  sales_end_at?: Date;
  max_per_order?: number;
  max_per_customer?: number;
  is_active?: boolean;
  is_visible?: boolean;
  display_order?: number;
  created_at?: Date;
  updated_at?: Date;
}

export class EventPricingModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('event_pricing', db);
  }

  async findByEventId(eventId: string): Promise<IEventPricing[]> {
    return this.db(this.tableName)
      .where({ event_id: eventId, is_active: true })
      .orderBy('display_order', 'asc')
      .orderBy('base_price', 'asc');
  }

  async findByScheduleId(scheduleId: string): Promise<IEventPricing[]> {
    return this.db(this.tableName)
      .where({ schedule_id: scheduleId, is_active: true })
      .orderBy('display_order', 'asc');
  }

  async findByCapacityId(capacityId: string): Promise<IEventPricing[]> {
    return this.db(this.tableName)
      .where({ capacity_id: capacityId, is_active: true })
      .orderBy('base_price', 'asc');
  }

  async getActivePricing(eventId: string): Promise<IEventPricing[]> {
    const now = new Date();
    return this.db(this.tableName)
      .where({ event_id: eventId, is_active: true, is_visible: true })
      .where(function(this: any) {
        this.whereNull('sales_start_at').orWhere('sales_start_at', '<=', now);
      })
      .where(function(this: any) {
        this.whereNull('sales_end_at').orWhere('sales_end_at', '>=', now);
      })
      .orderBy('display_order', 'asc');
  }

  async calculateTotalPrice(pricingId: string, quantity: number = 1): Promise<number> {
    const pricing = await this.findById(pricingId);
    if (!pricing) return 0;

    const basePrice = pricing.is_dynamic && pricing.current_price 
      ? pricing.current_price 
      : pricing.base_price;

    const serviceFee = pricing.service_fee || 0;
    const facilityFee = pricing.facility_fee || 0;
    const taxRate = pricing.tax_rate || 0;

    const subtotal = (basePrice + serviceFee + facilityFee) * quantity;
    const total = subtotal * (1 + taxRate);

    return Math.round(total * 100) / 100;
  }
}
