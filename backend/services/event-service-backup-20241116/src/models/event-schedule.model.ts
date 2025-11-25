import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IEventSchedule {
  id?: string;
  tenant_id?: string;
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

  async findByEventId(eventId: string, tenantId?: string): Promise<IEventSchedule[]> {
    let query = this.db(this.tableName).where({ event_id: eventId });
    
    if (tenantId) {
      query = query.where({ tenant_id: tenantId });
    }
    
    return query.orderBy('starts_at', 'asc');
  }

  async findUpcomingSchedules(eventId: string, tenantId?: string): Promise<IEventSchedule[]> {
    let query = this.db(this.tableName)
      .where({ event_id: eventId })
      .where('starts_at', '>', new Date())
      .whereIn('status', ['SCHEDULED', 'CONFIRMED']);
    
    if (tenantId) {
      query = query.where({ tenant_id: tenantId });
    }
    
    return query.orderBy('starts_at', 'asc');
  }

  async findSchedulesByDateRange(startDate: Date, endDate: Date): Promise<IEventSchedule[]> {
    return this.db(this.tableName)
      .whereBetween('starts_at', [startDate, endDate])
      .orderBy('starts_at', 'asc');
  }

  async getNextSchedule(eventId: string, tenantId?: string): Promise<IEventSchedule | null> {
    let query = this.db(this.tableName)
      .where({ event_id: eventId })
      .where('starts_at', '>', new Date())
      .whereIn('status', ['SCHEDULED', 'CONFIRMED']);
    
    if (tenantId) {
      query = query.where({ tenant_id: tenantId });
    }
    
    return query.orderBy('starts_at', 'asc').first();
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
