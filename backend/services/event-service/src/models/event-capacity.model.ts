import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IEventCapacity {
  id?: string;
  tenant_id?: string;
  event_id: string;
  schedule_id?: string;
  section_name: string;
  section_code?: string;
  tier?: string;
  total_capacity: number;
  available_capacity: number;
  reserved_capacity?: number;
  buffer_capacity?: number;
  sold_count?: number;
  pending_count?: number;
  reserved_at?: Date | null;
  reserved_expires_at?: Date | null;
  locked_price_data?: {
    pricing_id: string;
    locked_price: number;
    locked_at: Date;
    service_fee?: number;
    facility_fee?: number;
    tax_rate?: number;
  } | null;
  row_config?: Record<string, any>;
  seat_map?: Record<string, any>;
  is_active?: boolean;
  is_visible?: boolean;
  minimum_purchase?: number;
  maximum_purchase?: number;
  created_at?: Date;
  updated_at?: Date;
}

export class EventCapacityModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('event_capacity', db);
  }

  async findByEventId(eventId: string): Promise<IEventCapacity[]> {
    return this.db(this.tableName)
      .where({ event_id: eventId, is_active: true })
      .orderBy('section_name', 'asc');
  }

  async findByScheduleId(scheduleId: string): Promise<IEventCapacity[]> {
    return this.db(this.tableName)
      .where({ schedule_id: scheduleId, is_active: true })
      .orderBy('section_name', 'asc');
  }

  async getTotalCapacity(eventId: string, scheduleId?: string): Promise<number> {
    const query = this.db(this.tableName)
      .where({ event_id: eventId, is_active: true })
      .sum('total_capacity as total');

    if (scheduleId) {
      query.where({ schedule_id: scheduleId });
    }

    const result = await query.first();
    return parseInt(result?.total || '0', 10);
  }

  async getAvailableCapacity(eventId: string, scheduleId?: string): Promise<number> {
    const query = this.db(this.tableName)
      .where({ event_id: eventId, is_active: true })
      .sum('available_capacity as available');

    if (scheduleId) {
      query.where({ schedule_id: scheduleId });
    }

    const result = await query.first();
    return parseInt(result?.available || '0', 10);
  }

  async updateSoldCount(capacityId: string, quantity: number): Promise<void> {
    await this.db(this.tableName)
      .where({ id: capacityId })
      .increment('sold_count', quantity);
  }

  async updatePendingCount(capacityId: string, quantity: number): Promise<void> {
    await this.db(this.tableName)
      .where({ id: capacityId })
      .increment('pending_count', quantity);
  }

  async decrementPendingCount(capacityId: string, quantity: number): Promise<void> {
    await this.db(this.tableName)
      .where({ id: capacityId })
      .decrement('pending_count', quantity);
  }
}
