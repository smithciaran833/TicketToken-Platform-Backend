import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IEventCapacity {
  id?: string;
  tenant_id: string; // AUDIT FIX: Made required for tenant isolation
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

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id parameter for proper isolation
   */
  async findByEventId(eventId: string, tenantId: string): Promise<IEventCapacity[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for findByEventId');
    }

    return this.db(this.tableName)
      .where({ event_id: eventId, tenant_id: tenantId, is_active: true })
      .orderBy('section_name', 'asc');
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id parameter for proper isolation
   */
  async findByScheduleId(scheduleId: string, tenantId: string): Promise<IEventCapacity[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for findByScheduleId');
    }

    return this.db(this.tableName)
      .where({ schedule_id: scheduleId, tenant_id: tenantId, is_active: true })
      .orderBy('section_name', 'asc');
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id parameter for proper isolation
   */
  async getTotalCapacity(eventId: string, tenantId: string, scheduleId?: string): Promise<number> {
    if (!tenantId) {
      throw new Error('tenant_id is required for getTotalCapacity');
    }

    const query = this.db(this.tableName)
      .where({ event_id: eventId, tenant_id: tenantId, is_active: true })
      .sum('total_capacity as total');

    if (scheduleId) {
      query.where({ schedule_id: scheduleId });
    }

    const result = await query.first();
    return parseInt(result?.total || '0', 10);
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id parameter for proper isolation
   */
  async getAvailableCapacity(eventId: string, tenantId: string, scheduleId?: string): Promise<number> {
    if (!tenantId) {
      throw new Error('tenant_id is required for getAvailableCapacity');
    }

    const query = this.db(this.tableName)
      .where({ event_id: eventId, tenant_id: tenantId, is_active: true })
      .sum('available_capacity as available');

    if (scheduleId) {
      query.where({ schedule_id: scheduleId });
    }

    const result = await query.first();
    return parseInt(result?.available || '0', 10);
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id parameter for proper isolation
   */
  async updateSoldCount(capacityId: string, tenantId: string, quantity: number): Promise<void> {
    if (!tenantId) {
      throw new Error('tenant_id is required for updateSoldCount');
    }

    await this.db(this.tableName)
      .where({ id: capacityId, tenant_id: tenantId })
      .increment('sold_count', quantity);
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id parameter for proper isolation
   */
  async updatePendingCount(capacityId: string, tenantId: string, quantity: number): Promise<void> {
    if (!tenantId) {
      throw new Error('tenant_id is required for updatePendingCount');
    }

    await this.db(this.tableName)
      .where({ id: capacityId, tenant_id: tenantId })
      .increment('pending_count', quantity);
  }

  /**
   * AUDIT FIX (CRITICAL): Added tenant_id parameter for proper isolation
   */
  async decrementPendingCount(capacityId: string, tenantId: string, quantity: number): Promise<void> {
    if (!tenantId) {
      throw new Error('tenant_id is required for decrementPendingCount');
    }

    await this.db(this.tableName)
      .where({ id: capacityId, tenant_id: tenantId })
      .decrement('pending_count', quantity);
  }
}
