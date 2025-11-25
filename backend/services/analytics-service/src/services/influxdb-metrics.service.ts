import { Point } from '@influxdata/influxdb-client';
import { getWriteApi, getQueryApi } from '../config/influxdb';
import { logger } from '../utils/logger';

export class InfluxDBMetricsService {
  private writeApi = getWriteApi();
  private queryApi = getQueryApi();

  async recordUserAction(data: {
    userId: string;
    action: string;
    eventId?: string;
    venueId?: string;
    durationMs?: number;
  }) {
    const point = new Point('user_actions')
      .tag('user_id', data.userId)
      .tag('action', data.action)
      .intField('count', 1);

    if (data.eventId) point.tag('event_id', data.eventId);
    if (data.venueId) point.tag('venue_id', data.venueId);
    if (data.durationMs) point.intField('duration_ms', data.durationMs);

    this.writeApi.writePoint(point);
  }

  async recordEventMetrics(data: {
    eventId: string;
    venueId: string;
    ticketsSold: number;
    revenueCents: number;
    capacity: number;
  }) {
    const point = new Point('event_metrics')
      .tag('event_id', data.eventId)
      .tag('venue_id', data.venueId)
      .intField('tickets_sold', data.ticketsSold)
      .intField('revenue_cents', data.revenueCents)
      .intField('capacity', data.capacity)
      .floatField('sell_through_rate', data.ticketsSold / data.capacity);

    this.writeApi.writePoint(point);
  }

  async recordSalesVelocity(data: {
    eventId: string;
    venueId: string;
    ticketsPerHour: number;
  }) {
    const point = new Point('sales_velocity')
      .tag('event_id', data.eventId)
      .tag('venue_id', data.venueId)
      .floatField('tickets_per_hour', data.ticketsPerHour);

    this.writeApi.writePoint(point);
  }

  async flush() {
    await this.writeApi.flush();
  }

  async close() {
    await this.writeApi.close();
  }

  async getEventSalesTimeSeries(eventId: string, hours: number = 24) {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const query = `
      from(bucket: "${process.env.INFLUX_BUCKET || 'analytics'}")
        |> range(start: ${startTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "event_metrics")
        |> filter(fn: (r) => r.event_id == "${eventId}")
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
          logger.error('InfluxDB query error:', error);
          reject(error);
        },
        complete: () => {
          resolve(results);
        },
      });
    });
  }

  async getSalesVelocity(eventId: string, hours: number = 24) {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const query = `
      from(bucket: "${process.env.INFLUX_BUCKET || 'analytics'}")
        |> range(start: ${startTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "sales_velocity")
        |> filter(fn: (r) => r.event_id == "${eventId}")
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
          logger.error('InfluxDB query error:', error);
          reject(error);
        },
        complete: () => {
          resolve(avgVelocity);
        },
      });
    });
  }

  async getVenuePerformance(venueId: string, days: number = 30) {
    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const query = `
      from(bucket: "${process.env.INFLUX_BUCKET || 'analytics'}")
        |> range(start: ${startTime.toISOString()})
        |> filter(fn: (r) => r._measurement == "event_metrics")
        |> filter(fn: (r) => r.venue_id == "${venueId}")
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
          logger.error('InfluxDB query error:', error);
          reject(error);
        },
        complete: () => {
          resolve(results);
        },
      });
    });
  }
}
