/**
 * InfluxDB Metrics Service
 * 
 * AUDIT FIX: LOG-5 - Prevent Flux query injection by sanitizing all inputs
 */

import { Point } from '@influxdata/influxdb-client';
import { getWriteApi, getQueryApi } from '../config/influxdb';
import { logger } from '../utils/logger';
import { BadRequestError } from '../errors';

// =============================================================================
// AUDIT FIX: LOG-5 - Flux Query Sanitization
// =============================================================================

/**
 * Validate and sanitize an ID value for use in Flux queries
 * IDs should only contain alphanumeric characters, hyphens, and underscores
 * This prevents Flux injection attacks
 */
function sanitizeId(id: string, fieldName: string): string {
  if (!id || typeof id !== 'string') {
    throw new BadRequestError(`Invalid ${fieldName}: must be a non-empty string`);
  }
  
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // Also allow simple alphanumeric IDs with underscores
  const validIdPattern = /^[a-zA-Z0-9_-]+$/;
  
  if (!validIdPattern.test(id)) {
    logger.warn({
      event: 'flux_injection_attempt',
      fieldName,
      suspiciousValue: id.substring(0, 50) // Log only first 50 chars
    }, 'Potential Flux injection attempt detected');
    
    throw new BadRequestError(`Invalid ${fieldName}: contains invalid characters`);
  }
  
  // Additional safety: limit length
  if (id.length > 100) {
    throw new BadRequestError(`Invalid ${fieldName}: exceeds maximum length`);
  }
  
  return id;
}

/**
 * Sanitize a numeric value for use in Flux queries
 */
function sanitizeNumber(value: number, fieldName: string, min?: number, max?: number): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new BadRequestError(`Invalid ${fieldName}: must be a number`);
  }
  
  if (min !== undefined && value < min) {
    throw new BadRequestError(`Invalid ${fieldName}: must be at least ${min}`);
  }
  
  if (max !== undefined && value > max) {
    throw new BadRequestError(`Invalid ${fieldName}: must be at most ${max}`);
  }
  
  return value;
}

/**
 * Escape a string value for safe use in Flux queries
 * This escapes special characters that could break out of string literals
 */
function escapeFluxString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/"/g, '\\"')     // Escape double quotes
    .replace(/\n/g, '\\n')    // Escape newlines
    .replace(/\r/g, '\\r')    // Escape carriage returns
    .replace(/\t/g, '\\t');   // Escape tabs
}

/**
 * Get the bucket name safely
 */
function getBucketName(): string {
  const bucket = process.env.INFLUX_BUCKET || 'analytics';
  // Bucket names should be alphanumeric with underscores/hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(bucket)) {
    logger.error({ bucket }, 'Invalid bucket name in configuration');
    throw new Error('Invalid InfluxDB bucket configuration');
  }
  return bucket;
}

// =============================================================================
// InfluxDB Metrics Service
// =============================================================================

export class InfluxDBMetricsService {
  private writeApi = getWriteApi();
  private queryApi = getQueryApi();
  private bucket = getBucketName();

  async recordUserAction(data: {
    userId: string;
    action: string;
    eventId?: string;
    venueId?: string;
    durationMs?: number;
  }) {
    // AUDIT FIX: Validate IDs before using in tags
    const userId = sanitizeId(data.userId, 'userId');
    const action = sanitizeId(data.action, 'action');
    
    const point = new Point('user_actions')
      .tag('user_id', userId)
      .tag('action', action)
      .intField('count', 1);

    if (data.eventId) {
      point.tag('event_id', sanitizeId(data.eventId, 'eventId'));
    }
    if (data.venueId) {
      point.tag('venue_id', sanitizeId(data.venueId, 'venueId'));
    }
    if (data.durationMs !== undefined) {
      point.intField('duration_ms', sanitizeNumber(data.durationMs, 'durationMs', 0));
    }

    this.writeApi.writePoint(point);
  }

  async recordEventMetrics(data: {
    eventId: string;
    venueId: string;
    ticketsSold: number;
    revenueCents: number;
    capacity: number;
  }) {
    // AUDIT FIX: Validate all inputs
    const eventId = sanitizeId(data.eventId, 'eventId');
    const venueId = sanitizeId(data.venueId, 'venueId');
    const ticketsSold = sanitizeNumber(data.ticketsSold, 'ticketsSold', 0);
    const revenueCents = sanitizeNumber(data.revenueCents, 'revenueCents', 0);
    const capacity = sanitizeNumber(data.capacity, 'capacity', 1);
    
    const point = new Point('event_metrics')
      .tag('event_id', eventId)
      .tag('venue_id', venueId)
      .intField('tickets_sold', ticketsSold)
      .intField('revenue_cents', revenueCents)
      .intField('capacity', capacity)
      .floatField('sell_through_rate', ticketsSold / capacity);

    this.writeApi.writePoint(point);
  }

  async recordSalesVelocity(data: {
    eventId: string;
    venueId: string;
    ticketsPerHour: number;
  }) {
    const eventId = sanitizeId(data.eventId, 'eventId');
    const venueId = sanitizeId(data.venueId, 'venueId');
    const ticketsPerHour = sanitizeNumber(data.ticketsPerHour, 'ticketsPerHour', 0);
    
    const point = new Point('sales_velocity')
      .tag('event_id', eventId)
      .tag('venue_id', venueId)
      .floatField('tickets_per_hour', ticketsPerHour);

    this.writeApi.writePoint(point);
  }

  async flush() {
    await this.writeApi.flush();
  }

  async close() {
    await this.writeApi.close();
  }

  // AUDIT FIX: LOG-5 - Sanitized Flux queries
  async getEventSalesTimeSeries(eventId: string, hours: number = 24) {
    // Validate inputs
    const safeEventId = sanitizeId(eventId, 'eventId');
    const safeHours = sanitizeNumber(hours, 'hours', 1, 8760); // Max 1 year
    
    const startTime = new Date(Date.now() - safeHours * 60 * 60 * 1000);
    
    // AUDIT FIX: Use sanitized values in query
    const query = `
      from(bucket: "${this.bucket}")
        |> range(start: ${startTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "event_metrics")
        |> filter(fn: (r) => r.event_id == "${escapeFluxString(safeEventId)}")
        |> filter(fn: (r) => r._field == "tickets_sold")
        |> aggregateWindow(every: 1h, fn: sum)
    `;

    const results: any[] = [];
    return new Promise<any[]>((resolve, reject) => {
      this.queryApi.queryRows(query, {
        next: (row, tableMeta) => {
          const o = tableMeta.toObject(row);
          results.push({
            time: o._time,
            tickets_sold: o._value,
          });
        },
        error: (error) => {
          logger.error({ error, eventId: safeEventId }, 'InfluxDB query error');
          reject(error);
        },
        complete: () => {
          resolve(results);
        },
      });
    });
  }

  async getSalesVelocity(eventId: string, hours: number = 24) {
    // Validate inputs
    const safeEventId = sanitizeId(eventId, 'eventId');
    const safeHours = sanitizeNumber(hours, 'hours', 1, 8760);
    
    const startTime = new Date(Date.now() - safeHours * 60 * 60 * 1000);
    
    const query = `
      from(bucket: "${this.bucket}")
        |> range(start: ${startTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "sales_velocity")
        |> filter(fn: (r) => r.event_id == "${escapeFluxString(safeEventId)}")
        |> filter(fn: (r) => r._field == "tickets_per_hour")
        |> mean()
    `;

    let avgVelocity = 0;
    return new Promise<number>((resolve, reject) => {
      this.queryApi.queryRows(query, {
        next: (row, tableMeta) => {
          const o = tableMeta.toObject(row);
          avgVelocity = o._value;
        },
        error: (error) => {
          logger.error({ error, eventId: safeEventId }, 'InfluxDB query error');
          reject(error);
        },
        complete: () => {
          resolve(avgVelocity);
        },
      });
    });
  }

  async getVenuePerformance(venueId: string, days: number = 30) {
    // Validate inputs
    const safeVenueId = sanitizeId(venueId, 'venueId');
    const safeDays = sanitizeNumber(days, 'days', 1, 365);
    
    const startTime = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    
    const query = `
      from(bucket: "${this.bucket}")
        |> range(start: ${startTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "event_metrics")
        |> filter(fn: (r) => r.venue_id == "${escapeFluxString(safeVenueId)}")
        |> filter(fn: (r) => r._field == "revenue_cents" or r._field == "tickets_sold")
        |> aggregateWindow(every: 1d, fn: sum)
    `;

    const results: any[] = [];
    return new Promise<any[]>((resolve, reject) => {
      this.queryApi.queryRows(query, {
        next: (row, tableMeta) => {
          const o = tableMeta.toObject(row);
          results.push({
            time: o._time,
            field: o._field,
            value: o._value,
          });
        },
        error: (error) => {
          logger.error({ error, venueId: safeVenueId }, 'InfluxDB query error');
          reject(error);
        },
        complete: () => {
          resolve(results);
        },
      });
    });
  }
}

// Export sanitization functions for use in other modules
export { sanitizeId, sanitizeNumber, escapeFluxString };
