import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';
import { logger } from '../utils/logger';
import { MetricType } from '../types';

interface InfluxConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
}

export class InfluxDBService {
  private static instance: InfluxDBService;
  private client: InfluxDB;
  private writeApi: WriteApi;
  private config: InfluxConfig;
  private log = logger.child({ component: 'InfluxDBService' });
  private isConnected: boolean = false;

  private constructor() {
    this.config = {
      url: process.env.INFLUXDB_URL || 'http://influxdb:8086',
      token: process.env.INFLUXDB_TOKEN || 'my-super-secret-auth-token',
      org: process.env.INFLUXDB_ORG || 'tickettoken',
      bucket: process.env.INFLUXDB_BUCKET || 'metrics',
    };

    this.client = new InfluxDB({
      url: this.config.url,
      token: this.config.token,
    });

    this.writeApi = this.client.getWriteApi(this.config.org, this.config.bucket, 'ms');
    
    // Use tags for better querying performance
    this.writeApi.useDefaultTags({ service: 'analytics' });

    this.log.info('InfluxDB client initialized', {
      url: this.config.url,
      org: this.config.org,
      bucket: this.config.bucket,
    });
  }

  static getInstance(): InfluxDBService {
    if (!this.instance) {
      this.instance = new InfluxDBService();
    }
    return this.instance;
  }

  async writeMetric(
    venueId: string,
    metricType: MetricType,
    value: number,
    dimensions?: Record<string, string>,
    metadata?: Record<string, any>,
    timestamp?: Date
  ): Promise<void> {
    try {
      const point = new Point(metricType)
        .tag('venue_id', venueId)
        .floatField('value', value)
        .timestamp(timestamp || new Date());

      // Add dimensions as tags for better querying
      if (dimensions) {
        Object.entries(dimensions).forEach(([key, val]) => {
          point.tag(key, val);
        });
      }

      // Add metadata as fields
      if (metadata) {
        Object.entries(metadata).forEach(([key, val]) => {
          if (typeof val === 'number') {
            point.floatField(key, val);
          } else if (typeof val === 'string') {
            point.stringField(key, val);
          } else if (typeof val === 'boolean') {
            point.booleanField(key, val);
          }
        });
      }

      this.writeApi.writePoint(point);
      this.isConnected = true;

      this.log.debug('Metric written to InfluxDB', {
        venueId,
        metricType,
        value,
      });
    } catch (error) {
      this.isConnected = false;
      this.log.error('Failed to write metric to InfluxDB', error, {
        venueId,
        metricType,
      });
      throw error;
    }
  }

  async bulkWriteMetrics(
    metrics: Array<{
      venueId: string;
      metricType: MetricType;
      value: number;
      timestamp?: Date;
      dimensions?: Record<string, string>;
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    try {
      metrics.forEach((metric) => {
        const point = new Point(metric.metricType)
          .tag('venue_id', metric.venueId)
          .floatField('value', metric.value)
          .timestamp(metric.timestamp || new Date());

        if (metric.dimensions) {
          Object.entries(metric.dimensions).forEach(([key, val]) => {
            point.tag(key, val);
          });
        }

        if (metric.metadata) {
          Object.entries(metric.metadata).forEach(([key, val]) => {
            if (typeof val === 'number') {
              point.floatField(key, val);
            } else if (typeof val === 'string') {
              point.stringField(key, val);
            } else if (typeof val === 'boolean') {
              point.booleanField(key, val);
            }
          });
        }

        this.writeApi.writePoint(point);
      });

      this.isConnected = true;

      this.log.debug('Bulk metrics written to InfluxDB', {
        count: metrics.length,
      });
    } catch (error) {
      this.isConnected = false;
      this.log.error('Failed to bulk write metrics to InfluxDB', error);
      throw error;
    }
  }

  async flush(): Promise<void> {
    try {
      await this.writeApi.flush();
      this.log.debug('InfluxDB write buffer flushed');
    } catch (error) {
      this.log.error('Failed to flush InfluxDB write buffer', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      await this.writeApi.close();
      this.isConnected = false;
      this.log.info('InfluxDB connection closed');
    } catch (error) {
      this.log.error('Failed to close InfluxDB connection', error);
      throw error;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Try to write a test point and flush to verify connection
      const testPoint = new Point('health_check')
        .tag('service', 'analytics')
        .floatField('value', 1)
        .timestamp(new Date());
      
      this.writeApi.writePoint(testPoint);
      await this.writeApi.flush();
      
      this.isConnected = true;
      return true;
    } catch (error) {
      this.isConnected = false;
      this.log.error('InfluxDB health check failed', error);
      return false;
    }
  }
}

export const influxDBService = InfluxDBService.getInstance();
