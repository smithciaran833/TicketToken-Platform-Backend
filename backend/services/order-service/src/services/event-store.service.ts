import { getDatabase } from '../config/database';
import { OrderEvents } from '../events/event-types';
import { logger } from '../utils/logger';

export interface StoredEvent {
  id: string;
  eventType: string;
  version: string;
  aggregateId: string;
  aggregateType: string;
  tenantId: string;
  payload: any;
  metadata?: any;
  publishedAt: Date;
  createdAt: Date;
}

export interface EventStoreQuery {
  tenantId?: string;
  aggregateId?: string;
  eventType?: OrderEvents;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Event Store Service
 * Persists all published events for audit trail and replay capabilities
 */
export class EventStoreService {
  /**
   * Store an event in the event store
   */
  async storeEvent(event: {
    eventType: string;
    version: string;
    aggregateId: string;
    tenantId: string;
    payload: any;
    metadata?: any;
  }): Promise<string> {
    const db = getDatabase();
    
    try {
      const result = await db.query(
        `
        INSERT INTO event_store (
          event_type, version, aggregate_id, aggregate_type, tenant_id,
          payload, metadata, published_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id
        `,
        [
          event.eventType,
          event.version,
          event.aggregateId,
          'order',
          event.tenantId,
          JSON.stringify(event.payload),
          event.metadata ? JSON.stringify(event.metadata) : null,
        ]
      );
      
      const eventId = result.rows[0].id;
      
      logger.debug('Event stored in event store', { 
        eventId, 
        eventType: event.eventType,
        aggregateId: event.aggregateId 
      });
      
      return eventId;
    } catch (error) {
      logger.error('Failed to store event', { 
        error, 
        eventType: event.eventType,
        aggregateId: event.aggregateId 
      });
      throw error;
    }
  }

  /**
   * Query events from the event store
   */
  async queryEvents(query: EventStoreQuery): Promise<StoredEvent[]> {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (query.tenantId) {
      conditions.push(`tenant_id = $${paramIndex++}`);
      params.push(query.tenantId);
    }

    if (query.aggregateId) {
      conditions.push(`aggregate_id = $${paramIndex++}`);
      params.push(query.aggregateId);
    }

    if (query.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(query.eventType);
    }

    if (query.startDate) {
      conditions.push(`published_at >= $${paramIndex++}`);
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push(`published_at <= $${paramIndex++}`);
      params.push(query.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit || 100;
    const offset = query.offset || 0;

    try {
      const result = await db.query(
        `
        SELECT 
          id, event_type, version, aggregate_id, aggregate_type, tenant_id,
          payload, metadata, published_at, created_at
        FROM event_store
        ${whereClause}
        ORDER BY published_at ASC
        LIMIT $${paramIndex++} OFFSET $${paramIndex}
        `,
        [...params, limit, offset]
      );

      return result.rows.map(row => ({
        id: row.id,
        eventType: row.event_type,
        version: row.version,
        aggregateId: row.aggregate_id,
        aggregateType: row.aggregate_type,
        tenantId: row.tenant_id,
        payload: row.payload,
        metadata: row.metadata,
        publishedAt: row.published_at,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('Failed to query events', { error, query });
      throw error;
    }
  }

  /**
   * Get all events for a specific order
   */
  async getOrderEvents(orderId: string): Promise<StoredEvent[]> {
    return this.queryEvents({ aggregateId: orderId });
  }

  /**
   * Get events count matching query
   */
  async countEvents(query: EventStoreQuery): Promise<number> {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (query.tenantId) {
      conditions.push(`tenant_id = $${paramIndex++}`);
      params.push(query.tenantId);
    }

    if (query.aggregateId) {
      conditions.push(`aggregate_id = $${paramIndex++}`);
      params.push(query.aggregateId);
    }

    if (query.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(query.eventType);
    }

    if (query.startDate) {
      conditions.push(`published_at >= $${paramIndex++}`);
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push(`published_at <= $${paramIndex++}`);
      params.push(query.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const result = await db.query(
        `SELECT COUNT(*) as count FROM event_store ${whereClause}`,
        params
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to count events', { error, query });
      throw error;
    }
  }
}

export const eventStoreService = new EventStoreService();
