import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IEventSchedule {
  id?: string;
  tenant_id: string; // AUDIT FIX: Made required (was optional)
  event_id: string;
  starts_at: Date;
  ends_at: Date;
  doors_open_at?: Date;
  is_recurring?: boolean;
  recurrence_rule?: string;
  recurrence_end_date?: Date;
  occurrence_number?: number;
  timezone: string;
  utc_offset?: number;
  status?: 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED' | 'RESCHEDULED';
  status_reason?: string;
  capacity_override?: number;
  check_in_opens_at?: Date;
  check_in_closes_at?: Date;
  notes?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

export class EventScheduleModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('event_schedules', db);
  }

  // Override findById to not check deleted_at (schedules don't have soft delete)
  async findById(id: string): Promise<IEventSchedule | null> {
    try {
      const result = await this.db(this.tableName)
        .where({ id })
        .first();
      return result || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * AUDIT FIX (MEDIUM): Made tenantId required instead of optional
   */
  async findByEventId(eventId: string, tenantId: string): Promise<IEventSchedule[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for findByEventId');
    }

    return this.db(this.tableName)
      .where({ event_id: eventId, tenant_id: tenantId })
      .orderBy('starts_at', 'asc');
  }

  /**
   * AUDIT FIX (MEDIUM): Made tenantId required instead of optional
   */
  async findUpcomingSchedules(eventId: string, tenantId: string): Promise<IEventSchedule[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for findUpcomingSchedules');
    }

    return this.db(this.tableName)
      .where({ event_id: eventId, tenant_id: tenantId })
      .where('starts_at', '>', new Date())
      .whereIn('status', ['SCHEDULED', 'CONFIRMED'])
      .orderBy('starts_at', 'asc');
  }

  /**
   * AUDIT FIX (MEDIUM): Added tenantId parameter for proper isolation
   */
  async findSchedulesByDateRange(startDate: Date, endDate: Date, tenantId: string): Promise<IEventSchedule[]> {
    if (!tenantId) {
      throw new Error('tenant_id is required for findSchedulesByDateRange');
    }

    return this.db(this.tableName)
      .where({ tenant_id: tenantId })
      .whereBetween('starts_at', [startDate, endDate])
      .orderBy('starts_at', 'asc');
  }

  /**
   * AUDIT FIX (MEDIUM): Made tenantId required instead of optional
   */
  async getNextSchedule(eventId: string, tenantId: string): Promise<IEventSchedule | null> {
    if (!tenantId) {
      throw new Error('tenant_id is required for getNextSchedule');
    }

    return this.db(this.tableName)
      .where({ event_id: eventId, tenant_id: tenantId })
      .where('starts_at', '>', new Date())
      .whereIn('status', ['SCHEDULED', 'CONFIRMED'])
      .orderBy('starts_at', 'asc')
      .first();
  }

  async updateWithTenant(id: string, tenantId: string, data: Partial<IEventSchedule>): Promise<IEventSchedule | null> {
    const [result] = await this.db(this.tableName)
      .where({ id, tenant_id: tenantId })
      .update({
        ...(data as any),
        updated_at: new Date()
      })
      .returning('*');

    return result || null;
  }
}
