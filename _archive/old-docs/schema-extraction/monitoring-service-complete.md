# COMPLETE DATABASE ANALYSIS: monitoring-service
Generated: Thu Oct  2 15:07:52 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/grafana.routes.ts
```typescript
import { FastifyInstance } from 'fastify';
import { pgPool } from '../utils/database';
import { logger } from '../utils/logger';

export default async function grafanaRoutes(server: FastifyInstance) {
  // Grafana health check
  server.get('/', async (request, reply) => {
    return { status: 'ok' };
  });

  // Search endpoint for metrics
  server.post('/search', async (request, reply) => {
    try {
      const result = await pgPool.query(
        'SELECT DISTINCT metric_name FROM metrics ORDER BY metric_name'
      );
      return result.rows.map(row => row.metric_name);
    } catch (error) {
      logger.error('Grafana search error:', error);
      return [];
    }
  });

  // Query endpoint for time series data
  server.post('/query', async (request, reply) => {
    try {
      const { targets, range } = request.body as any;
      const from = new Date(range.from);
      const to = new Date(range.to);
      
      const results = await Promise.all(
        targets.map(async (target: any) => {
          const query = `
            SELECT 
              extract(epoch from timestamp) * 1000 as time,
              value
            FROM metrics
            WHERE metric_name = $1
              AND timestamp BETWEEN $2 AND $3
            ORDER BY timestamp
          `;
          
          const result = await pgPool.query(query, [target.target, from, to]);
          
          return {
            target: target.target,
            datapoints: result.rows.map(row => [
              parseFloat(row.value),
              parseInt(row.time)
            ])
          };
        })
      );
      
      return results;
    } catch (error) {
      logger.error('Grafana query error:', error);
      return [];
    }
  });

  // Annotations endpoint
  server.post('/annotations', async (request, reply) => {
    try {
      const { range, annotation } = request.body as any;
      const from = new Date(range.from);
      const to = new Date(range.to);
      
      // Get fraud detection events as annotations
      const query = `
        SELECT 
          extract(epoch from timestamp) * 1000 as time,
          metric_name as title,
          value as text
        FROM metrics
        WHERE metric_name LIKE 'fraud_%'
          AND value > 5
          AND timestamp BETWEEN $1 AND $2
        ORDER BY timestamp
      `;
      
      const result = await pgPool.query(query, [from, to]);
      
      return result.rows.map(row => ({
        time: parseInt(row.time),
        title: row.title,
        text: `Value: ${row.text}`,
        tags: ['fraud', 'alert']
      }));
    } catch (error) {
      logger.error('Grafana annotations error:', error);
      return [];
    }
  });
}
```

### FILE: src/config/index.ts
```typescript
import dotenv from 'dotenv';
import joi from 'joi';

dotenv.config();

const envSchema = joi.object({
  NODE_ENV: joi.string().valid('development', 'production', 'test').default('development'),
  PORT: joi.number().default(3013),
  SERVICE_NAME: joi.string().default('monitoring-service'),
  
  // Database
  DB_HOST: joi.string().required(),
  DB_PORT: joi.number().default(5432),
  DB_NAME: joi.string().required(),
  DB_USER: joi.string().required(),
  DB_PASSWORD: joi.string().required(),
  
  // Redis
  REDIS_HOST: joi.string().default('redis'),
  REDIS_PORT: joi.number().default(6379),
  
  // MongoDB
  MONGODB_URI: joi.string().required(),
  
  // Elasticsearch
  ELASTICSEARCH_NODE: joi.string().required(),
  
  // InfluxDB
  INFLUXDB_URL: joi.string().required(),
  INFLUXDB_TOKEN: joi.string().required(),
  INFLUXDB_ORG: joi.string().required(),
  INFLUXDB_BUCKET: joi.string().required(),
  
  // Services
  AUTH_SERVICE_URL: joi.string().required(),
  VENUE_SERVICE_URL: joi.string().required(),
  EVENT_SERVICE_URL: joi.string().required(),
  TICKET_SERVICE_URL: joi.string().required(),
  PAYMENT_SERVICE_URL: joi.string().required(),
  MARKETPLACE_SERVICE_URL: joi.string().required(),
  ANALYTICS_SERVICE_URL: joi.string().required(),
  API_GATEWAY_URL: joi.string().required(),
  
  // Intervals
  HEALTH_CHECK_INTERVAL: joi.number().default(30),
  METRIC_COLLECTION_INTERVAL: joi.number().default(60),
  ALERT_EVALUATION_INTERVAL: joi.number().default(60),
  
  // Thresholds
  CPU_THRESHOLD: joi.number().default(80),
  MEMORY_THRESHOLD: joi.number().default(85),
  DISK_THRESHOLD: joi.number().default(90),
  ERROR_RATE_THRESHOLD: joi.number().default(5),
  RESPONSE_TIME_THRESHOLD_MS: joi.number().default(2000),
  
  // JWT
  JWT_SECRET: joi.string().required(),
  
  // Logging
  LOG_LEVEL: joi.string().default('info'),
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  serviceName: envVars.SERVICE_NAME,
  
  database: {
    host: envVars.DB_HOST,
    port: envVars.DB_PORT,
    database: envVars.DB_NAME,
    user: envVars.DB_USER,
    password: envVars.DB_PASSWORD,
  },
  
  redis: {
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
  },
  
  mongodb: {
    uri: envVars.MONGODB_URI,
  },
  
  elasticsearch: {
    node: envVars.ELASTICSEARCH_NODE,
  },
  
  influxdb: {
    url: envVars.INFLUXDB_URL,
    token: envVars.INFLUXDB_TOKEN,
    org: envVars.INFLUXDB_ORG,
    bucket: envVars.INFLUXDB_BUCKET,
  },
  
  services: {
    auth: envVars.AUTH_SERVICE_URL,
    venue: envVars.VENUE_SERVICE_URL,
    event: envVars.EVENT_SERVICE_URL,
    ticket: envVars.TICKET_SERVICE_URL,
    payment: envVars.PAYMENT_SERVICE_URL,
    marketplace: envVars.MARKETPLACE_SERVICE_URL,
    analytics: envVars.ANALYTICS_SERVICE_URL,
    apiGateway: envVars.API_GATEWAY_URL,
  },
  
  intervals: {
    healthCheck: envVars.HEALTH_CHECK_INTERVAL * 1000,
    metricCollection: envVars.METRIC_COLLECTION_INTERVAL * 1000,
    alertEvaluation: envVars.ALERT_EVALUATION_INTERVAL * 1000,
  },
  
  thresholds: {
    cpu: envVars.CPU_THRESHOLD,
    memory: envVars.MEMORY_THRESHOLD,
    disk: envVars.DISK_THRESHOLD,
    errorRate: envVars.ERROR_RATE_THRESHOLD,
    responseTime: envVars.RESPONSE_TIME_THRESHOLD_MS,
  },
  
  jwt: {
    secret: envVars.JWT_SECRET,
  },
  
  logging: {
    level: envVars.LOG_LEVEL,
  },
  
  cors: {
    origin: envVars.NODE_ENV === 'production' 
      ? ['https://tickettoken.com'] 
      : true,
  },
};
```

### FILE: src/config/database.ts
```typescript
import knex from 'knex';

export const db = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  pool: { min: 2, max: 10 }
});

export default db;
```

### FILE: src/streaming/kafka-consumer.ts
```typescript
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { logger } from '../utils/logger';
import { pgPool } from '../utils/database';

class KafkaConsumerService {
  private kafka: Kafka;
  private consumers: Map<string, Consumer> = new Map();

  constructor() {
    this.kafka = new Kafka({
      clientId: 'monitoring-consumer',
      brokers: [process.env.KAFKA_BROKERS || 'kafka:9092'],
    });
  }

  async subscribeToMetrics() {
    const consumer = this.kafka.consumer({ 
      groupId: 'monitoring-metrics-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    await consumer.subscribe({ 
      topics: ['metrics-stream', 'fraud-events', 'alerts-stream'],
      fromBeginning: false,
    });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
        try {
          const value = message.value?.toString();
          if (!value) return;

          const data = JSON.parse(value);
          
          switch (topic) {
            case 'metrics-stream':
              await this.processMetric(data);
              break;
            case 'fraud-events':
              await this.processFraudEvent(data);
              break;
            case 'alerts-stream':
              await this.processAlert(data);
              break;
          }
        } catch (error) {
          logger.error(`Error processing message from ${topic}:`, error);
        }
      },
    });

    this.consumers.set('metrics', consumer);
    logger.info('Kafka consumer subscribed to metrics streams');
  }

  private async processMetric(metric: any) {
    // Real-time metric processing
    logger.debug(`Processing metric: ${metric.metric_name}`);
    
    // Could add real-time aggregations, windowing, etc.
    if (metric.value > 1000) {
      logger.warn(`High value detected: ${metric.metric_name} = ${metric.value}`);
    }
  }

  private async processFraudEvent(event: any) {
    logger.warn(`🚨 FRAUD EVENT: ${event.pattern} detected for user ${event.userId}`);
    
    // Store in database for analysis
    try {
      await pgPool.query(
        `INSERT INTO fraud_events (user_id, pattern, risk_level, timestamp, data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [event.userId, event.pattern, event.riskLevel, new Date(), JSON.stringify(event)]
      );
    } catch (error) {
      logger.error('Failed to store fraud event:', error);
    }
  }

  private async processAlert(alert: any) {
    logger.info(`📢 ALERT: ${alert.title} [${alert.severity}]`);
    
    // Could trigger additional actions here
    if (alert.severity === 'critical') {
      // Send to PagerDuty, trigger auto-remediation, etc.
      logger.error(`CRITICAL ALERT: ${alert.title}`);
    }
  }

  async disconnect() {
    for (const [name, consumer] of this.consumers) {
      await consumer.disconnect();
      logger.info(`Kafka consumer ${name} disconnected`);
    }
  }
}

export const kafkaConsumer = new KafkaConsumerService();
```

### FILE: src/streaming/stream-processor.ts
```typescript
import { logger } from '../utils/logger';
import { kafkaProducer } from './kafka-producer';

interface EventWindow {
  startTime: Date;
  endTime: Date;
  events: any[];
  aggregates: Map<string, number>;
}

export class StreamProcessor {
  private windows: Map<string, EventWindow> = new Map();
  private windowSizeMs = 60000; // 1 minute windows

  async processEventStream(events: any[]) {
    const now = new Date();
    const windowKey = Math.floor(now.getTime() / this.windowSizeMs).toString();
    
    if (!this.windows.has(windowKey)) {
      this.windows.set(windowKey, {
        startTime: new Date(parseInt(windowKey) * this.windowSizeMs),
        endTime: new Date((parseInt(windowKey) + 1) * this.windowSizeMs),
        events: [],
        aggregates: new Map(),
      });
    }

    const window = this.windows.get(windowKey)!;
    window.events.push(...events);

    // Perform real-time aggregations
    for (const event of events) {
      this.updateAggregates(window, event);
    }

    // Check for patterns
    await this.detectPatterns(window);

    // Clean old windows
    this.cleanOldWindows();
  }

  private updateAggregates(window: EventWindow, event: any) {
    const key = event.metric_name || event.type;
    const current = window.aggregates.get(key) || 0;
    window.aggregates.set(key, current + (event.value || 1));
  }

  private async detectPatterns(window: EventWindow) {
    // Detect high-frequency patterns
    for (const [key, count] of window.aggregates) {
      if (count > 100) {
        logger.warn(`High frequency pattern detected: ${key} = ${count} events/min`);
        
        await kafkaProducer.sendAlert({
          title: `High Frequency Pattern: ${key}`,
          severity: 'warning',
          pattern: key,
          count,
          window: window.startTime,
        });
      }
    }

    // Detect fraud patterns in real-time
    const fraudEvents = window.events.filter(e => e.type === 'fraud');
    if (fraudEvents.length > 5) {
      logger.error(`🚨 FRAUD SPIKE: ${fraudEvents.length} fraud events in 1 minute!`);
      
      await kafkaProducer.sendAlert({
        title: 'Fraud Spike Detected',
        severity: 'critical',
        count: fraudEvents.length,
        window: window.startTime,
      });
    }
  }

  private cleanOldWindows() {
    const now = Date.now();
    const cutoff = now - (5 * this.windowSizeMs); // Keep 5 minutes of windows
    
    for (const [key, window] of this.windows) {
      if (window.startTime.getTime() < cutoff) {
        this.windows.delete(key);
      }
    }
  }

  getWindowStats(): any {
    const stats = {
      activeWindows: this.windows.size,
      totalEvents: 0,
      topPatterns: [] as any[],
    };

    for (const window of this.windows.values()) {
      stats.totalEvents += window.events.length;
    }

    // Get top patterns across all windows
    const allPatterns = new Map<string, number>();
    for (const window of this.windows.values()) {
      for (const [key, count] of window.aggregates) {
        allPatterns.set(key, (allPatterns.get(key) || 0) + count);
      }
    }

    stats.topPatterns = Array.from(allPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));

    return stats;
  }
}

export const streamProcessor = new StreamProcessor();
```

### FILE: src/collectors/business/revenue.collector.ts
```typescript
import { pgPool } from '../../utils/database';
import { metricsService } from '../../services/metrics.service';
import { logger } from '../../utils/logger';

export class BusinessMetricsCollector {
  private interval: NodeJS.Timeout | null = null;
  private name = 'BusinessMetricsCollector';

  getName(): string {
    return this.name;
  }

  async start(): Promise<void> {
    this.interval = setInterval(async () => {
      await this.collect();
    }, 300000); // Every 5 minutes
    
    await this.collect();
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async collect(): Promise<void> {
    if (!pgPool) {
      logger.debug('PostgreSQL not available for business metrics');
      return;
    }

    try {
      // Collect venue metrics
      const venueResult = await pgPool.query(`
        SELECT COUNT(*) as total_venues,
               COUNT(CASE WHEN status = 'active' THEN 1 END) as active_venues
        FROM venues
      `).catch(() => ({ rows: [{ total_venues: 0, active_venues: 0 }] }));

      await metricsService.pushMetrics({
        name: 'business_total_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: parseInt(venueResult.rows[0].total_venues),
        labels: { type: 'total' },
      });

      await metricsService.pushMetrics({
        name: 'business_active_venues',
        type: 'gauge',
        service: 'monitoring-service',
        value: parseInt(venueResult.rows[0].active_venues),
        labels: { type: 'active' },
      });

      // Collect event metrics
      const eventResult = await pgPool.query(`
        SELECT COUNT(*) as total_events,
               COUNT(CASE WHEN status = 'published' THEN 1 END) as published_events
        FROM events
        WHERE created_at > NOW() - INTERVAL '30 days'
      `).catch(() => ({ rows: [{ total_events: 0, published_events: 0 }] }));

      await metricsService.pushMetrics({
        name: 'business_events_last_30_days',
        type: 'gauge',
        service: 'monitoring-service',
        value: parseInt(eventResult.rows[0].total_events),
        labels: { period: '30d' },
      });

      // Collect ticket metrics
      const ticketResult = await pgPool.query(`
        SELECT COUNT(*) as tickets_sold
        FROM tickets
        WHERE status = 'sold'
          AND created_at > NOW() - INTERVAL '24 hours'
      `).catch(() => ({ rows: [{ tickets_sold: 0 }] }));

      await metricsService.pushMetrics({
        name: 'business_tickets_sold_24h',
        type: 'gauge',
        service: 'monitoring-service',
        value: parseInt(ticketResult.rows[0].tickets_sold),
        labels: { period: '24h' },
      });

      logger.debug('Business metrics collected successfully');
    } catch (error) {
      logger.error('Error collecting business metrics:', error);
    }
  }
}
```

### FILE: src/collectors/application/database.collector.ts
```typescript
import { pgPool, redisClient, mongoClient } from '../../utils/database';
import { metricsService } from '../../services/metrics.service';
import { logger } from '../../utils/logger';
import { config } from '../../config';

export class DatabaseMetricsCollector {
  private interval: NodeJS.Timeout | null = null;
  private name = 'DatabaseMetricsCollector';

  getName(): string {
    return this.name;
  }

  async start(): Promise<void> {
    this.interval = setInterval(async () => {
      await this.collect();
    }, 60000); // Every minute
    
    await this.collect();
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async collect(): Promise<void> {
    // PostgreSQL metrics
    if (pgPool) {
      try {
        const poolMetrics = pgPool;
        await metricsService.pushMetrics({
          name: 'postgres_pool_total',
          type: 'gauge',
          service: 'monitoring-service',
          value: poolMetrics.totalCount,
          labels: { database: 'tickettoken_platform' },
        });

        await metricsService.pushMetrics({
          name: 'postgres_pool_idle',
          type: 'gauge',
          service: 'monitoring-service',
          value: poolMetrics.idleCount,
          labels: { database: 'tickettoken_platform' },
        });

        await metricsService.pushMetrics({
          name: 'postgres_pool_waiting',
          type: 'gauge',
          service: 'monitoring-service',
          value: poolMetrics.waitingCount,
          labels: { database: 'tickettoken_platform' },
        });

        // Query database size
        const sizeResult = await pgPool.query(`
          SELECT pg_database_size('tickettoken_platform') as size
        `);
        
        await metricsService.pushMetrics({
          name: 'postgres_database_size_bytes',
          type: 'gauge',
          service: 'monitoring-service',
          value: parseInt(sizeResult.rows[0].size),
          labels: { database: 'tickettoken_platform' },
        });
      } catch (error) {
        logger.debug('PostgreSQL metrics collection failed:', error);
      }
    }

    // Redis metrics
    if (redisClient) {
      try {
        const info = await redisClient.info('stats');
        const lines = info.split('\r\n');
        
        for (const line of lines) {
          if (line.includes('instantaneous_ops_per_sec')) {
            const value = parseInt(line.split(':')[1]);
            await metricsService.pushMetrics({
              name: 'redis_ops_per_second',
              type: 'gauge',
              service: 'monitoring-service',
              value,
              labels: { database: 'redis' },
            });
          }
          if (line.includes('keyspace_hits')) {
            const value = parseInt(line.split(':')[1]);
            await metricsService.pushMetrics({
              name: 'redis_keyspace_hits',
              type: 'counter',
              service: 'monitoring-service',
              value,
              labels: { database: 'redis' },
            });
          }
        }
      } catch (error) {
        logger.debug('Redis metrics collection failed:', error);
      }
    }

    // MongoDB metrics
    if (mongoClient) {
      try {
        const stats = await mongoClient.db().stats();
        await metricsService.pushMetrics({
          name: 'mongodb_database_size_bytes',
          type: 'gauge',
          service: 'monitoring-service',
          value: stats.dataSize,
          labels: { database: 'tickettoken_monitoring' },
        });

        await metricsService.pushMetrics({
          name: 'mongodb_collections_count',
          type: 'gauge',
          service: 'monitoring-service',
          value: stats.collections,
          labels: { database: 'tickettoken_monitoring' },
        });
      } catch (error) {
        logger.debug('MongoDB metrics collection failed:', error);
      }
    }
  }
}
```

### FILE: src/controllers/metrics.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { metricsService } from '../services/metrics.service';
import { pgPool } from '../utils/database';
import { logger } from '../utils/logger';
import { register } from 'prom-client';

export const metricsController = {
  async getMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Get metrics from PostgreSQL instead of InfluxDB
      const result = await pgPool.query(`
        SELECT 
          metric_name,
          service_name,
          value,
          labels,
          timestamp
        FROM metrics
        WHERE timestamp > NOW() - INTERVAL '5 minutes'
        ORDER BY timestamp DESC
        LIMIT 1000
      `);
      
      return result.rows;
    } catch (error) {
      logger.error('Error fetching metrics:', error);
      return [];
    }
  },

  async pushMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      const metrics = request.body as any;
      await metricsService.pushMetrics(metrics);
      return { success: true };
    } catch (error) {
      logger.error('Error pushing metrics:', error);
      return reply.code(500).send({ error: 'Failed to push metrics' });
    }
  },

  async exportPrometheusMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      const metrics = await register.metrics();
      reply.type('text/plain');
      return metrics;
    } catch (error) {
      logger.error('Error exporting prometheus metrics:', error);
      return reply.code(500).send({ error: 'Failed to export metrics' });
    }
  },

  async getLatestMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Get the latest value for each metric
      const result = await pgPool.query(`
        SELECT DISTINCT ON (metric_name, service_name) 
          metric_name,
          service_name,
          value,
          timestamp
        FROM metrics
        WHERE timestamp > NOW() - INTERVAL '1 hour'
        ORDER BY metric_name, service_name, timestamp DESC
      `);
      
      return result.rows;
    } catch (error) {
      logger.error('Error fetching latest metrics:', error);
      return [];
    }
  },

  async getMetricsByService(request: FastifyRequest<{ Params: { service: string } }>, reply: FastifyReply) {
    try {
      const { service } = request.params;
      const result = await pgPool.query(`
        SELECT * FROM metrics
        WHERE service_name = $1
        AND timestamp > NOW() - INTERVAL '1 hour'
        ORDER BY timestamp DESC
        LIMIT 100
      `, [service]);
      
      return result.rows;
    } catch (error) {
      logger.error('Error fetching service metrics:', error);
      return [];
    }
  }
};
```

### FILE: src/utils/database.ts
```typescript
import { Pool } from 'pg';
import Redis from 'ioredis';
import { MongoClient, Db } from 'mongodb';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { config } from '../config';
import { logger } from './logger';

// PostgreSQL connection pool
export let pgPool: Pool;

// Redis client
export let redisClient: Redis;

// MongoDB client
export let mongoClient: MongoClient;
export let mongoDB: Db;

// Elasticsearch client
export let esClient: ElasticsearchClient;

// InfluxDB client
export let influxDB: InfluxDB;
export let influxWriteApi: any;
export let influxQueryApi: any;

// Initialize PostgreSQL
async function initializePostgreSQL() {
  try {
    pgPool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await pgPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    logger.info('PostgreSQL connected successfully');
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL:', error);
    // Don't throw - allow service to run without DB
  }
}

// Initialize Redis
async function initializeRedis() {
  try {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis error:', err);
    });

    await redisClient.ping();
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
  }
}

// Initialize MongoDB
async function initializeMongoDB() {
  try {
    mongoClient = new MongoClient(config.mongodb.uri);
    await mongoClient.connect();
    mongoDB = mongoClient.db('tickettoken_monitoring');
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
  }
}

// Initialize Elasticsearch
async function initializeElasticsearch() {
  try {
    esClient = new ElasticsearchClient({
      node: config.elasticsearch.node,
    });

    const health = await esClient.cluster.health();
    logger.info('Elasticsearch connected:', health.status);
  } catch (error) {
    logger.error('Failed to connect to Elasticsearch:', error);
  }
}

// Initialize InfluxDB
async function initializeInfluxDB() {
  try {
    influxDB = new InfluxDB({
      url: config.influxdb.url,
      token: config.influxdb.token || 'dummy-token', // Use dummy token if not set
    });

    influxWriteApi = influxDB.getWriteApi(
      config.influxdb.org,
      config.influxdb.bucket,
      'ns'
    );

    influxQueryApi = influxDB.getQueryApi(config.influxdb.org);
    
    logger.info('InfluxDB client initialized');
  } catch (error) {
    logger.error('Failed to initialize InfluxDB:', error);
  }
}

// Initialize all database connections
export async function initializeDatabases() {
  await Promise.all([
    initializePostgreSQL(),
    initializeRedis(),
    initializeMongoDB(),
    initializeElasticsearch(),
    initializeInfluxDB(),
  ]);
}

// Cleanup function
export async function closeDatabases() {
  try {
    if (pgPool) await pgPool.end();
    if (redisClient) await redisClient.quit();
    if (mongoClient) await mongoClient.close();
    logger.info('All database connections closed');
  } catch (error) {
    logger.error('Error closing database connections:', error);
  }
}

// Initialize on module load
initializeDatabases().catch(error => {
  logger.error('Failed to initialize databases:', error);
});
```

### FILE: src/models/Alert.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IAlert {
  id?: string;
  name: string;
  type: 'error' | 'warning' | 'info';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  source: string;
  metadata?: any;
  resolved?: boolean;
  resolved_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class AlertModel {
  private db: Knex;
  private tableName = 'alerts';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IAlert): Promise<IAlert> {
    const [alert] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return alert;
  }

  async findById(id: string): Promise<IAlert | null> {
    const alert = await this.db(this.tableName)
      .where({ id })
      .first();
    return alert || null;
  }

  async findUnresolved(): Promise<IAlert[]> {
    return this.db(this.tableName)
      .where({ resolved: false })
      .orderBy('severity', 'desc')
      .orderBy('created_at', 'desc');
  }

  async update(id: string, data: Partial<IAlert>): Promise<IAlert | null> {
    const [alert] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return alert || null;
  }

  async resolve(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .update({ resolved: true, resolved_at: new Date() });
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default AlertModel;
```

### FILE: src/models/Metric.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IMetric {
  id?: string;
  name: string;
  value: number;
  unit?: string;
  service: string;
  tags?: any;
  timestamp: Date;
  created_at?: Date;
}

export class MetricModel {
  private db: Knex;
  private tableName = 'metrics';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IMetric): Promise<IMetric> {
    const [metric] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return metric;
  }

  async findById(id: string): Promise<IMetric | null> {
    const metric = await this.db(this.tableName)
      .where({ id })
      .first();
    return metric || null;
  }

  async findByService(service: string, startTime?: Date, endTime?: Date): Promise<IMetric[]> {
    let query = this.db(this.tableName).where({ service });
    
    if (startTime) {
      query = query.where('timestamp', '>=', startTime);
    }
    if (endTime) {
      query = query.where('timestamp', '<=', endTime);
    }
    
    return query.orderBy('timestamp', 'desc');
  }

  async findByName(name: string, limit = 100): Promise<IMetric[]> {
    return this.db(this.tableName)
      .where({ name })
      .orderBy('timestamp', 'desc')
      .limit(limit);
  }

  async deleteOlderThan(date: Date): Promise<number> {
    return this.db(this.tableName)
      .where('timestamp', '<', date)
      .del();
  }
}

export default MetricModel;
```

### FILE: src/models/Dashboard.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IDashboard {
  id?: string;
  name: string;
  description?: string;
  widgets?: any[];
  layout?: any;
  owner?: string;
  shared?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class DashboardModel {
  private db: Knex;
  private tableName = 'dashboards';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IDashboard): Promise<IDashboard> {
    const [dashboard] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return dashboard;
  }

  async findById(id: string): Promise<IDashboard | null> {
    const dashboard = await this.db(this.tableName)
      .where({ id })
      .first();
    return dashboard || null;
  }

  async findByOwner(owner: string): Promise<IDashboard[]> {
    return this.db(this.tableName)
      .where({ owner })
      .orWhere({ shared: true })
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IDashboard>): Promise<IDashboard | null> {
    const [dashboard] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return dashboard || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default DashboardModel;
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    venueId?: string;
    role: string;
    permissions?: string[];
  };
}

export async function authenticate(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.status(401).send({ 
        error: 'Authentication required' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    
    request.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };
    
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({ 
        error: 'Token expired' 
      });
    }
    return reply.status(401).send({ 
      error: 'Invalid token' 
    });
  }
}

export function authorize(...roles: string[]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ 
        error: 'Authentication required' 
      });
    }

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ 
        error: 'Insufficient permissions' 
      });
    }
  };
}
```

### FILE: src/analytics/advanced-fraud-ml.ts
```typescript
import * as tf from '@tensorflow/tfjs-node';
import { pgPool } from '../utils/database';
import { kafkaProducer } from '../streaming/kafka-producer';
import { logger } from '../utils/logger';
import { createHash } from 'crypto';

interface FraudPattern {
  userId: string;
  ipAddress: string;
  deviceFingerprint: string;
  behaviorVector: number[];
  riskScore: number;
  patterns: string[];
  timestamp: Date;
}

export class AdvancedFraudDetector {
  private model: tf.LayersModel | null = null;
  private patternCache = new Map<string, FraudPattern[]>();
  private knownScalpers = new Set<string>();
  private suspiciousIPs = new Map<string, number>();

  constructor() {
    this.initializeDeepLearningModel();
    this.loadKnownPatterns();
    this.startRealtimeAnalysis();
  }

  private async initializeDeepLearningModel() {
    // Build neural network for fraud detection
    this.model = tf.sequential({
      layers: [
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          inputShape: [10], // Simplified to 10 features
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({
          units: 64,
          activation: 'relu',
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid',
        }),
      ],
    });

    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });

    logger.info('🧠 Advanced fraud detection neural network initialized');
  }

  private extractFeatures(data: any): number[] {
    // Extract 10 key features for the neural network
    return [
      data.request_count || 0,
      data.time_between_requests || 0,
      data.unique_events_targeted || 0,
      data.total_tickets_attempted || 0,
      data.failed_attempts || 0,
      this.isKnownVPN(data.ip_address) ? 1 : 0,
      this.isSuspiciousUserAgent(data.user_agent) ? 1 : 0,
      data.account_age_days || 0,
      data.payment_methods_used || 0,
      this.calculateVelocityScore(data),
    ];
  }

  async detectFraud(userData: any): Promise<FraudPattern> {
    try {
      const features = this.extractFeatures(userData);
      const featureTensor = tf.tensor2d([features]);
      
      // Get neural network prediction
      const prediction = this.model!.predict(featureTensor) as tf.Tensor;
      const fraudProbability = (await prediction.data())[0];
      
      featureTensor.dispose();
      prediction.dispose();

      const patterns: string[] = [];
      let riskScore = fraudProbability;

      // Check velocity
      if (await this.checkVelocity(userData)) {
        patterns.push('high_velocity');
        riskScore = Math.min(riskScore + 0.3, 1);
      }

      // Check IP reputation
      if (this.getIPRiskScore(userData.ip_address) > 0.5) {
        patterns.push('suspicious_ip');
        riskScore = Math.min(riskScore + 0.2, 1);
      }

      // Check for scalper behaviors
      const scalperScore = await this.detectScalperBehavior(userData);
      if (scalperScore > 0.6) {
        patterns.push('scalper_behavior');
        riskScore = Math.min(riskScore + scalperScore * 0.3, 1);
      }

      const fraudPattern: FraudPattern = {
        userId: userData.user_id,
        ipAddress: userData.ip_address,
        deviceFingerprint: this.generateFingerprint(userData),
        behaviorVector: features,
        riskScore,
        patterns,
        timestamp: new Date(),
      };

      // Send to Kafka if high risk
      if (riskScore > 0.7) {
        await kafkaProducer.sendFraudEvent({
          userId: userData.user_id,
          pattern: patterns.join(', '),
          riskLevel: riskScore > 0.9 ? 'critical' : 'high',
          riskScore,
          timestamp: new Date(),
        });
      }

      return fraudPattern;
    } catch (error) {
      logger.error('Error detecting fraud:', error);
      throw error;
    }
  }

  private async detectScalperBehavior(userData: any): Promise<number> {
    let score = 0;
    
    // Multiple indicators
    if (userData.time_between_requests < 1) score += 0.25;
    if (userData.total_tickets_attempted > 10) score += 0.2;
    if (userData.multiple_ips_used) score += 0.15;
    if (this.detectAutomation(userData)) score += 0.2;
    if (userData.targeting_high_demand) score += 0.2;
    
    return Math.min(score, 1);
  }

  private async checkVelocity(userData: any): Promise<boolean> {
    return userData.request_count && userData.request_count > 30;
  }

  private getIPRiskScore(ipAddress: string): number {
    if (this.suspiciousIPs.has(ipAddress)) {
      return this.suspiciousIPs.get(ipAddress)!;
    }
    
    let score = 0;
    if (this.isKnownVPN(ipAddress)) score += 0.3;
    if (this.isDataCenter(ipAddress)) score += 0.4;
    
    return Math.min(score, 1);
  }

  private isKnownVPN(ip: string): boolean {
    const vpnRanges = ['10.', '172.16.', '192.168.'];
    return vpnRanges.some(range => ip.startsWith(range));
  }

  private isDataCenter(ip: string): boolean {
    // Simplified check
    return false;
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    if (!userAgent) return false;
    const suspicious = ['bot', 'crawler', 'spider', 'scraper', 'curl', 'wget'];
    const ua = userAgent.toLowerCase();
    return suspicious.some(s => ua.includes(s));
  }

  private calculateVelocityScore(data: any): number {
    const velocity = data.request_count / Math.max(data.time_window_minutes || 1, 1);
    return Math.min(velocity / 100, 1);
  }

  private generateFingerprint(userData: any): string {
    const data = `${userData.user_agent}|${userData.ip_address}`;
    return createHash('sha256').update(data).digest('hex');
  }

  private detectAutomation(userData: any): boolean {
    return userData.mouse_movements === 0 && userData.keyboard_events === 0;
  }

  private async loadKnownPatterns() {
    try {
      // Load known bad actors from database
      logger.info('Loading known fraud patterns...');
    } catch (error) {
      logger.error('Error loading patterns:', error);
    }
  }

  private startRealtimeAnalysis() {
    setInterval(async () => {
      try {
        // Real-time fraud analysis
        logger.debug('Running fraud analysis...');
      } catch (error) {
        logger.error('Error in realtime analysis:', error);
      }
    }, 30000);
  }

  async getFraudMetrics() {
    return {
      high_risk_users: this.knownScalpers.size,
      suspicious_ips: this.suspiciousIPs.size,
      patterns_detected: 0,
    };
  }
}

export const fraudDetector = new AdvancedFraudDetector();
```

### FILE: src/analytics/sales-tracker.ts
```typescript
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { pgPool } from '../utils/database';
import { kafkaProducer } from '../streaming/kafka-producer';
import { logger } from '../utils/logger';
import * as tf from '@tensorflow/tfjs-node';
import { EventEmitter } from 'events';

interface SalesVelocity {
  eventId: string;
  ticketsSold: number;
  velocity: number; // tickets per minute
  accelerationRate: number;
  predictedSelloutTime?: Date;
  currentCapacity: number;
  remainingTickets: number;
}

export class EventSalesTracker extends EventEmitter {
  private salesModel: tf.LayersModel | null = null;
  private velocityCache = new Map<string, SalesVelocity[]>();
  private influxClient: InfluxDB;
  private writeApi: any;

  constructor() {
    super();
    this.influxClient = new InfluxDB({
      url: process.env.INFLUXDB_URL || 'http://influxdb:8086',
      token: process.env.INFLUXDB_TOKEN || 'admin-token',
    });
    this.writeApi = this.influxClient.getWriteApi('tickettoken', 'metrics');
    this.initializeModel();
    this.startTracking();
  }

  private async initializeModel() {
    // Build LSTM model for sales prediction
    this.salesModel = tf.sequential({
      layers: [
        tf.layers.lstm({
          units: 128,
          returnSequences: true,
          inputShape: [10, 5], // 10 time steps, 5 features
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.lstm({ units: 64, returnSequences: false }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'linear' }), // Predict minutes to sellout
      ],
    });

    this.salesModel.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae'],
    });

    // Load historical data for training
    await this.trainModel();
    logger.info('📈 Sales prediction model initialized');
  }

  private async trainModel() {
    try {
      const historicalData = await pgPool.query(`
        SELECT 
          event_id,
          DATE_TRUNC('minute', created_at) as minute,
          COUNT(*) as tickets_sold,
          AVG(price) as avg_price,
          MAX(created_at) - MIN(created_at) as time_span
        FROM ticket_sales
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY event_id, minute
        ORDER BY event_id, minute
      `);

      if (historicalData.rows.length > 100) {
        // Prepare training data
        const features: number[][][] = [];
        const labels: number[] = [];

        // Process data into sequences
        const eventGroups = this.groupByEvent(historicalData.rows);
        
        for (const [eventId, sales] of Object.entries(eventGroups)) {
          const sequences = this.createSequences(sales as any[]);
          features.push(...sequences.features);
          labels.push(...sequences.labels);
        }

        if (features.length > 0) {
          const xs = tf.tensor3d(features);
          const ys = tf.tensor1d(labels);

          await this.salesModel!.fit(xs, ys, {
            epochs: 50,
            batchSize: 32,
            validationSplit: 0.2,
            callbacks: {
              onEpochEnd: (epoch, logs) => {
                if (epoch % 10 === 0) {
                  logger.debug(`Sales model training - Epoch ${epoch}: loss = ${logs?.loss}`);
                }
              },
            },
          });

          xs.dispose();
          ys.dispose();
        }
      }
    } catch (error) {
      logger.error('Error training sales model:', error);
    }
  }

  private groupByEvent(rows: any[]): Record<string, any[]> {
    return rows.reduce((acc, row) => {
      if (!acc[row.event_id]) acc[row.event_id] = [];
      acc[row.event_id].push(row);
      return acc;
    }, {} as Record<string, any[]>);
  }

  private createSequences(sales: any[]) {
    const features: number[][][] = [];
    const labels: number[] = [];
    const sequenceLength = 10;

    for (let i = sequenceLength; i < sales.length; i++) {
      const sequence = sales.slice(i - sequenceLength, i).map(s => [
        s.tickets_sold,
        s.avg_price,
        i / sales.length, // Progress through sale
        new Date(s.minute).getHours(), // Hour of day
        new Date(s.minute).getDay(), // Day of week
      ]);
      
      features.push(sequence);
      
      // Label is time to sellout (in minutes)
      const remainingTickets = sales[sales.length - 1].tickets_sold - sales[i].tickets_sold;
      const currentVelocity = sales[i].tickets_sold / (i + 1);
      labels.push(remainingTickets / Math.max(currentVelocity, 0.1));
    }

    return { features, labels };
  }

  async trackSale(eventId: string, ticketData: any) {
    try {
      // Calculate current velocity
      const velocity = await this.calculateVelocity(eventId);
      
      // Predict sellout time
      const prediction = await this.predictSellout(eventId, velocity);
      
      // Stream to Kafka
      await kafkaProducer.sendMetric({
        metric_name: 'event.sales.velocity',
        value: velocity.velocity,
        tags: {
          event_id: eventId,
          remaining_tickets: velocity.remainingTickets,
          predicted_sellout: prediction?.toISOString(),
        },
      });

      // Store in InfluxDB
      const point = new Point('event_sales')
        .tag('event_id', eventId)
        .floatField('velocity', velocity.velocity)
        .floatField('acceleration', velocity.accelerationRate)
        .intField('tickets_sold', velocity.ticketsSold)
        .intField('remaining', velocity.remainingTickets)
        .timestamp(new Date());

      this.writeApi.writePoint(point);

      // Emit alerts for high velocity
      if (velocity.velocity > 10) { // More than 10 tickets per minute
        this.emit('high-velocity', {
          eventId,
          velocity: velocity.velocity,
          predictedSellout: prediction,
        });

        // Send alert to Kafka
        await kafkaProducer.sendAlert({
          title: `High Sales Velocity: ${eventId}`,
          severity: 'warning',
          message: `Selling ${velocity.velocity.toFixed(1)} tickets/min. Predicted sellout: ${prediction?.toLocaleString()}`,
          data: velocity,
        });
      }

      // Check if sellout is imminent
      if (prediction && prediction.getTime() - Date.now() < 3600000) { // Less than 1 hour
        this.emit('sellout-imminent', {
          eventId,
          predictedTime: prediction,
          remainingTickets: velocity.remainingTickets,
        });

        await kafkaProducer.sendAlert({
          title: `Sellout Imminent: ${eventId}`,
          severity: 'critical',
          message: `Event will sell out in ${Math.round((prediction.getTime() - Date.now()) / 60000)} minutes`,
          data: velocity,
        });
      }

      return { velocity, prediction };
    } catch (error) {
      logger.error('Error tracking sale:', error);
      return null;
    }
  }

  private async calculateVelocity(eventId: string): Promise<SalesVelocity> {
    const result = await pgPool.query(`
      WITH sales_data AS (
        SELECT 
          COUNT(*) as total_sold,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 minute') as last_minute,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '5 minutes') as last_5_minutes,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '10 minutes') as last_10_minutes,
          MIN(created_at) as first_sale,
          MAX(created_at) as last_sale
        FROM ticket_sales
        WHERE event_id = $1
      ),
      event_data AS (
        SELECT total_tickets, tickets_sold
        FROM events
        WHERE id = $1
      )
      SELECT 
        s.*,
        e.total_tickets,
        e.total_tickets - e.tickets_sold as remaining_tickets
      FROM sales_data s, event_data e
    `, [eventId]);

    const data = result.rows[0];
    const velocity = data.last_minute || 0;
    const velocity5Min = (data.last_5_minutes || 0) / 5;
    const velocity10Min = (data.last_10_minutes || 0) / 10;
    
    // Calculate acceleration
    const accelerationRate = velocity - velocity10Min;

    return {
      eventId,
      ticketsSold: data.total_sold || 0,
      velocity,
      accelerationRate,
      currentCapacity: data.total_tickets || 0,
      remainingTickets: data.remaining_tickets || 0,
    };
  }

  private async predictSellout(eventId: string, velocity: SalesVelocity): Promise<Date | null> {
    if (!this.salesModel || velocity.remainingTickets <= 0) return null;

    try {
      // Get recent sales pattern
      const recentSales = await pgPool.query(`
        SELECT 
          DATE_TRUNC('minute', created_at) as minute,
          COUNT(*) as tickets_sold,
          AVG(price) as avg_price
        FROM ticket_sales
        WHERE event_id = $1 AND created_at > NOW() - INTERVAL '10 minutes'
        GROUP BY minute
        ORDER BY minute DESC
        LIMIT 10
      `, [eventId]);

      if (recentSales.rows.length < 5) {
        // Simple linear prediction if not enough data
        if (velocity.velocity > 0) {
          const minutesToSellout = velocity.remainingTickets / velocity.velocity;
          return new Date(Date.now() + minutesToSellout * 60000);
        }
        return null;
      }

      // Prepare input for the model
      const input = recentSales.rows.reverse().map(row => [
        row.tickets_sold,
        row.avg_price,
        velocity.ticketsSold / velocity.currentCapacity,
        new Date(row.minute).getHours(),
        new Date(row.minute).getDay(),
      ]);

      // Pad if needed
      while (input.length < 10) {
        input.unshift([0, 0, 0, 0, 0]);
      }

      const prediction = this.salesModel.predict(tf.tensor3d([input])) as tf.Tensor;
      const minutesToSellout = (await prediction.data())[0];
      
      prediction.dispose();

      if (minutesToSellout > 0 && minutesToSellout < 10000) {
        return new Date(Date.now() + minutesToSellout * 60000);
      }
    } catch (error) {
      logger.error('Error predicting sellout:', error);
    }

    return null;
  }

  private startTracking() {
    // Real-time tracking every 30 seconds
    setInterval(async () => {
      try {
        const activeEvents = await pgPool.query(`
          SELECT id, name
          FROM events
          WHERE sale_start < NOW() 
            AND sale_end > NOW()
            AND tickets_sold < total_tickets
        `);

        for (const event of activeEvents.rows) {
          const velocity = await this.calculateVelocity(event.id);
          const prediction = await this.predictSellout(event.id, velocity);
          
          // Cache for quick access
          if (!this.velocityCache.has(event.id)) {
            this.velocityCache.set(event.id, []);
          }
          
          const cache = this.velocityCache.get(event.id)!;
          cache.push({ ...velocity, predictedSelloutTime: prediction || undefined });
          
          // Keep only last 20 data points
          if (cache.length > 20) cache.shift();

          logger.debug(`Event ${event.name}: ${velocity.velocity.toFixed(1)} tickets/min, ${velocity.remainingTickets} remaining`);
        }
      } catch (error) {
        logger.error('Error in sales tracking loop:', error);
      }
    }, 30000);

    logger.info('📊 Event sales tracking started');
  }

  async getEventMetrics(eventId: string) {
    const velocity = await this.calculateVelocity(eventId);
    const prediction = await this.predictSellout(eventId, velocity);
    const cache = this.velocityCache.get(eventId) || [];

    return {
      current: velocity,
      prediction,
      history: cache,
      trend: this.calculateTrend(cache),
    };
  }

  private calculateTrend(history: SalesVelocity[]): 'accelerating' | 'steady' | 'decelerating' | 'unknown' {
    if (history.length < 3) return 'unknown';
    
    const recent = history.slice(-3);
    const avgAcceleration = recent.reduce((sum, v) => sum + v.accelerationRate, 0) / recent.length;
    
    if (avgAcceleration > 0.5) return 'accelerating';
    if (avgAcceleration < -0.5) return 'decelerating';
    return 'steady';
  }
}

export const salesTracker = new EventSalesTracker();
```

### FILE: src/alerting.service.ts
```typescript
import { EventEmitter } from 'events';
import nodemailer from 'nodemailer';
import { WebClient } from '@slack/web-api';
import { logger } from './logger';

interface Alert {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  channels: ('email' | 'slack' | 'pagerduty')[];
  cooldown: number; // minutes
  lastFired?: Date;
}

export class AlertingService extends EventEmitter {
  private alerts: Map<string, Alert> = new Map();
  private emailTransporter: any;
  private slackClient: any;
  
  constructor() {
    super();
    this.setupChannels();
    this.defineAlerts();
  }

  private setupChannels() {
    // Email setup
    if (process.env.SMTP_HOST) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }

    // Slack setup
    if (process.env.SLACK_TOKEN) {
      this.slackClient = new WebClient(process.env.SLACK_TOKEN);
    }
  }

  private defineAlerts() {
    // Critical business alerts
    this.addAlert({
      id: 'high_refund_rate',
      name: 'High Refund Rate',
      condition: 'refund_rate > threshold',
      threshold: 0.1, // 10%
      severity: 'warning',
      channels: ['email', 'slack'],
      cooldown: 60
    });

    this.addAlert({
      id: 'payment_failure_spike',
      name: 'Payment Failure Spike',
      condition: 'payment_failure_rate > threshold',
      threshold: 0.2, // 20%
      severity: 'error',
      channels: ['email', 'slack', 'pagerduty'],
      cooldown: 30
    });

    this.addAlert({
      id: 'database_slow',
      name: 'Database Response Slow',
      condition: 'db_response_time_p95 > threshold',
      threshold: 1000, // 1 second
      severity: 'warning',
      channels: ['slack'],
      cooldown: 15
    });

    this.addAlert({
      id: 'api_error_rate_high',
      name: 'High API Error Rate',
      condition: 'api_error_rate > threshold',
      threshold: 0.05, // 5%
      severity: 'error',
      channels: ['email', 'slack'],
      cooldown: 30
    });

    this.addAlert({
      id: 'solana_network_issues',
      name: 'Solana Network Issues',
      condition: 'solana_error_rate > threshold',
      threshold: 0.1, // 10%
      severity: 'critical',
      channels: ['email', 'slack', 'pagerduty'],
      cooldown: 15
    });

    this.addAlert({
      id: 'queue_backup',
      name: 'Queue Backup Detected',
      condition: 'queue_size > threshold',
      threshold: 1000,
      severity: 'warning',
      channels: ['slack'],
      cooldown: 30
    });

    this.addAlert({
      id: 'revenue_drop',
      name: 'Significant Revenue Drop',
      condition: 'hourly_revenue_change < threshold',
      threshold: -0.5, // 50% drop
      severity: 'info',
      channels: ['email'],
      cooldown: 120
    });

    this.addAlert({
      id: 'concurrent_users_spike',
      name: 'Concurrent Users Spike',
      condition: 'concurrent_users > threshold',
      threshold: 10000,
      severity: 'info',
      channels: ['slack'],
      cooldown: 60
    });
  }

  private addAlert(alert: Alert) {
    this.alerts.set(alert.id, alert);
  }

  async checkAlert(alertId: string, currentValue: number): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) return;

    // Check cooldown
    if (alert.lastFired) {
      const cooldownMs = alert.cooldown * 60 * 1000;
      if (Date.now() - alert.lastFired.getTime() < cooldownMs) {
        return; // Still in cooldown
      }
    }

    // Check threshold
    let shouldFire = false;
    if (alert.condition.includes('>')) {
      shouldFire = currentValue > alert.threshold;
    } else if (alert.condition.includes('<')) {
      shouldFire = currentValue < alert.threshold;
    }

    if (shouldFire) {
      await this.fireAlert(alert, currentValue);
    }
  }

  private async fireAlert(alert: Alert, value: number): Promise<void> {
    logger.warn(`Alert fired: ${alert.name}`, { value, threshold: alert.threshold });

    const message = this.formatAlertMessage(alert, value);

    // Send to configured channels
    const promises = alert.channels.map(channel => {
      switch (channel) {
        case 'email':
          return this.sendEmail(alert, message);
        case 'slack':
          return this.sendSlack(alert, message);
        case 'pagerduty':
          return this.sendPagerDuty(alert, message);
        default:
          return Promise.resolve();
      }
    });

    await Promise.allSettled(promises);

    // Update last fired time
    alert.lastFired = new Date();
    this.emit('alert_fired', { alert, value, timestamp: new Date() });
  }

  private formatAlertMessage(alert: Alert, value: number): string {
    const emoji = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🚨',
      critical: '🔥'
    };

    return `${emoji[alert.severity]} **${alert.name}**
    
Current Value: ${value}
Threshold: ${alert.threshold}
Severity: ${alert.severity.toUpperCase()}
Time: ${new Date().toISOString()}

Please investigate immediately.`;
  }

  private async sendEmail(alert: Alert, message: string): Promise<void> {
    if (!this.emailTransporter) return;

    try {
      await this.emailTransporter.sendMail({
        from: process.env.ALERT_FROM_EMAIL || 'alerts@tickettoken.com',
        to: process.env.ALERT_TO_EMAIL || 'ops@tickettoken.com',
        subject: `[${alert.severity.toUpperCase()}] ${alert.name}`,
        text: message,
        html: message.replace(/\n/g, '<br>')
      });
    } catch (error) {
      logger.error('Failed to send email alert:', error);
    }
  }

  private async sendSlack(alert: Alert, message: string): Promise<void> {
    if (!this.slackClient) return;

    try {
      await this.slackClient.chat.postMessage({
        channel: process.env.SLACK_ALERTS_CHANNEL || '#alerts',
        text: message,
        attachments: [{
          color: alert.severity === 'critical' ? 'danger' : 
                 alert.severity === 'error' ? 'warning' : 'good',
          fields: [
            { title: 'Alert', value: alert.name, short: true },
            { title: 'Severity', value: alert.severity, short: true }
          ]
        }]
      });
    } catch (error) {
      logger.error('Failed to send Slack alert:', error);
    }
  }

  private async sendPagerDuty(alert: Alert, message: string): Promise<void> {
    // PagerDuty integration would go here
    logger.info('PagerDuty alert would be sent:', { alert: alert.name });
  }
}

export const alertingService = new AlertingService();
```

### FILE: src/ml/detectors/anomaly-detector.ts
```typescript
import * as tf from '@tensorflow/tfjs-node';
import { logger } from '../../utils/logger';
import { pgPool } from '../../utils/database';
import { alertService } from '../../services/alert.service';

export class AnomalyDetector {
  private model: tf.LayersModel | null = null;
  private threshold: number = 0.95;
  private historicalData: Map<string, number[]> = new Map();
  
  constructor() {
    this.initializeModel();
  }

  private async initializeModel() {
    try {
      // Create an autoencoder for anomaly detection
      const encoder = tf.sequential({
        layers: [
          tf.layers.dense({ units: 32, activation: 'relu', inputShape: [10] }),
          tf.layers.dense({ units: 16, activation: 'relu' }),
          tf.layers.dense({ units: 8, activation: 'relu' }),
          tf.layers.dense({ units: 4, activation: 'relu' })
        ]
      });

      const decoder = tf.sequential({
        layers: [
          tf.layers.dense({ units: 8, activation: 'relu', inputShape: [4] }),
          tf.layers.dense({ units: 16, activation: 'relu' }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dense({ units: 10, activation: 'sigmoid' })
        ]
      });

      // Combine encoder and decoder
      const input = tf.input({ shape: [10] });
      const encoded = encoder.apply(input) as tf.SymbolicTensor;
      const decoded = decoder.apply(encoded) as tf.SymbolicTensor;
      
      this.model = tf.model({ inputs: input, outputs: decoded });
      
      this.model.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError'
      });

      logger.info('Anomaly detection model initialized');
      
      // Start training with historical data
      await this.trainOnHistoricalData();
    } catch (error) {
      logger.error('Failed to initialize anomaly detection model:', error);
    }
  }

  private async trainOnHistoricalData() {
    try {
      // Fetch historical metrics
      const query = `
        SELECT metric_name, value, timestamp
        FROM metrics
        WHERE timestamp > NOW() - INTERVAL '7 days'
        ORDER BY metric_name, timestamp
      `;
      
      const result = await pgPool.query(query);
      
      // Group by metric name
      const metricGroups = new Map<string, number[]>();
      result.rows.forEach(row => {
        if (!metricGroups.has(row.metric_name)) {
          metricGroups.set(row.metric_name, []);
        }
        metricGroups.get(row.metric_name)!.push(parseFloat(row.value));
      });

      // Store historical data
      this.historicalData = metricGroups;
      
      // Train model if we have enough data
      if (result.rows.length > 100) {
        await this.trainModel(metricGroups);
      }
      
      logger.info(`Trained on ${result.rows.length} historical data points`);
    } catch (error) {
      logger.error('Error training on historical data:', error);
    }
  }

  private async trainModel(data: Map<string, number[]>) {
    if (!this.model) return;

    try {
      // Prepare training data
      const trainingData: number[][] = [];
      
      data.forEach((values, metricName) => {
        // Create sliding windows of 10 values
        for (let i = 0; i < values.length - 10; i++) {
          const window = values.slice(i, i + 10);
          const normalized = this.normalizeData(window);
          trainingData.push(normalized);
        }
      });

      if (trainingData.length === 0) return;

      // Convert to tensors
      const xs = tf.tensor2d(trainingData);
      
      // Train the autoencoder to reconstruct normal patterns
      await this.model.fit(xs, xs, {
        epochs: 50,
        batchSize: 32,
        verbose: 0,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 10 === 0) {
              logger.debug(`Training epoch ${epoch}, loss: ${logs?.loss}`);
            }
          }
        }
      });

      xs.dispose();
      
      logger.info('Anomaly detection model training complete');
    } catch (error) {
      logger.error('Error training model:', error);
    }
  }

  private normalizeData(values: number[]): number[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map(v => (v - min) / range);
  }

  async detectAnomaly(metricName: string, currentValue: number): Promise<{
    isAnomaly: boolean;
    score: number;
    prediction: number;
    confidence: number;
  }> {
    try {
      // Get historical data for this metric
      const history = this.historicalData.get(metricName) || [];
      
      if (history.length < 10) {
        // Not enough data, use simple statistics
        return this.simpleAnomalyDetection(history, currentValue);
      }

      // Use ML model for detection
      if (this.model) {
        // Prepare input
        const recentValues = [...history.slice(-9), currentValue];
        const normalized = this.normalizeData(recentValues);
        const input = tf.tensor2d([normalized]);
        
        // Get reconstruction
        const reconstruction = this.model.predict(input) as tf.Tensor;
        const reconstructedValues = await reconstruction.array() as number[][];
        
        // Calculate reconstruction error
        const error = this.calculateReconstructionError(normalized, reconstructedValues[0]);
        
        // Determine if it's an anomaly
        const isAnomaly = error > this.threshold;
        const confidence = 1 - error;
        
        // Predict next value
        const prediction = this.predictNextValue(history);
        
        input.dispose();
        reconstruction.dispose();
        
        return {
          isAnomaly,
          score: error,
          prediction,
          confidence
        };
      }

      return this.simpleAnomalyDetection(history, currentValue);
    } catch (error) {
      logger.error('Error detecting anomaly:', error);
      return {
        isAnomaly: false,
        score: 0,
        prediction: currentValue,
        confidence: 0
      };
    }
  }

  private calculateReconstructionError(original: number[], reconstructed: number[]): number {
    const mse = original.reduce((sum, val, i) => {
      const diff = val - reconstructed[i];
      return sum + (diff * diff);
    }, 0) / original.length;
    
    return Math.sqrt(mse);
  }

  private simpleAnomalyDetection(history: number[], currentValue: number) {
    if (history.length === 0) {
      return {
        isAnomaly: false,
        score: 0,
        prediction: currentValue,
        confidence: 0
      };
    }

    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const stdDev = Math.sqrt(
      history.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / history.length
    );

    const zScore = Math.abs((currentValue - mean) / (stdDev || 1));
    const isAnomaly = zScore > 3; // 3 standard deviations

    return {
      isAnomaly,
      score: zScore / 10, // Normalize to 0-1 range
      prediction: mean,
      confidence: Math.max(0, 1 - (zScore / 10))
    };
  }

  private predictNextValue(history: number[]): number {
    if (history.length < 3) {
      return history[history.length - 1] || 0;
    }

    // Simple linear regression for prediction
    const n = Math.min(history.length, 10);
    const recentHistory = history.slice(-n);
    
    const xSum = (n * (n - 1)) / 2;
    const ySum = recentHistory.reduce((a, b) => a + b, 0);
    const xySum = recentHistory.reduce((sum, y, x) => sum + x * y, 0);
    const xSquaredSum = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum);
    const intercept = (ySum - slope * xSum) / n;

    return slope * n + intercept;
  }

  async checkAllMetrics() {
    try {
      // Get latest metrics
      const query = `
        SELECT DISTINCT ON (metric_name) 
          metric_name, value, timestamp
        FROM metrics
        WHERE timestamp > NOW() - INTERVAL '5 minutes'
        ORDER BY metric_name, timestamp DESC
      `;

      const result = await pgPool.query(query);
      
      for (const row of result.rows) {
        const detection = await this.detectAnomaly(row.metric_name, parseFloat(row.value));
        
        if (detection.isAnomaly) {
          logger.warn(`🚨 Anomaly detected in ${row.metric_name}: value=${row.value}, expected=${detection.prediction.toFixed(2)}, confidence=${(detection.confidence * 100).toFixed(1)}%`);
          
          // Create alert
          await this.createAnomalyAlert(row.metric_name, row.value, detection);
        }
      }
    } catch (error) {
      logger.error('Error checking metrics for anomalies:', error);
    }
  }

  private async createAnomalyAlert(metricName: string, value: number, detection: any) {
    try {
      const alert = {
        title: `Anomaly Detected: ${metricName}`,
        description: `Unusual pattern detected. Current: ${value}, Expected: ${detection.prediction.toFixed(2)}`,
        severity: detection.score > 5 ? 'critical' : 'warning',
        state: 'firing',
        labels: {
          type: 'anomaly',
          metric: metricName,
          ml_confidence: detection.confidence
        }
      };

      // Store alert in database
      await pgPool.query(
        `INSERT INTO alerts (title, description, severity, state, started_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [alert.title, alert.description, alert.severity, alert.state]
      );

      logger.info(`Created anomaly alert for ${metricName}`);
    } catch (error) {
      logger.error('Error creating anomaly alert:', error);
    }
  }
}

export const anomalyDetector = new AnomalyDetector();
```

### FILE: src/ml/detectors/fraud-ml-detector.ts
```typescript
import { logger } from '../../utils/logger';
import { pgPool } from '../../utils/database';

interface FraudPattern {
  pattern: string;
  score: number;
  confidence: number;
  indicators: string[];
}

export class FraudMLDetector {
  private patterns: Map<string, number[]> = new Map();
  private suspiciousIPs: Set<string> = new Set();
  private botSignatures: Map<string, number> = new Map();

  async detectScalperPattern(data: any): Promise<FraudPattern> {
    const indicators: string[] = [];
    let score = 0;

    // Pattern 1: Rapid sequential requests
    if (data.requestsPerMinute > 60) {
      score += 30;
      indicators.push('Rapid request rate');
    }

    // Pattern 2: Multiple payment methods from same IP
    if (data.paymentMethodCount > 3) {
      score += 25;
      indicators.push('Multiple payment methods');
    }

    // Pattern 3: Bulk ticket purchases
    if (data.ticketCount > 10) {
      score += 35;
      indicators.push('Bulk purchase attempt');
    }

    // Pattern 4: Geographic anomaly
    if (data.geoDistance > 1000) { // km from usual location
      score += 20;
      indicators.push('Geographic anomaly');
    }

    // Pattern 5: Time-based pattern (purchases at exact intervals)
    if (this.detectTimePattern(data.timestamps)) {
      score += 40;
      indicators.push('Automated timing pattern');
    }

    // ML confidence based on historical accuracy
    const confidence = this.calculateConfidence(score, indicators.length);

    return {
      pattern: 'scalper',
      score: Math.min(score, 100),
      confidence,
      indicators
    };
  }

  async detectBotActivity(data: any): Promise<FraudPattern> {
    const indicators: string[] = [];
    let score = 0;

    // Bot detection features
    if (!data.userAgent || data.userAgent.includes('bot')) {
      score += 50;
      indicators.push('Bot user agent');
    }

    if (data.mouseMovements === 0) {
      score += 30;
      indicators.push('No mouse movements');
    }

    if (data.keypressInterval < 10) { // ms
      score += 25;
      indicators.push('Inhuman typing speed');
    }

    if (data.sessionDuration < 5) { // seconds
      score += 20;
      indicators.push('Extremely short session');
    }

    const confidence = this.calculateConfidence(score, indicators.length);

    return {
      pattern: 'bot',
      score: Math.min(score, 100),
      confidence,
      indicators
    };
  }

  private detectTimePattern(timestamps: number[]): boolean {
    if (timestamps.length < 3) return false;

    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    // Check if intervals are suspiciously consistent (automated)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    
    return variance < 100; // Very consistent timing = likely automated
  }

  private calculateConfidence(score: number, indicatorCount: number): number {
    // Base confidence on score and number of indicators
    const scoreConfidence = score / 100;
    const indicatorConfidence = Math.min(indicatorCount / 5, 1);
    
    return (scoreConfidence * 0.7 + indicatorConfidence * 0.3);
  }

  async trainOnHistoricalFraud() {
    try {
      // This would normally load historical fraud data
      // For now, we'll use simulated training
      logger.info('Training fraud ML detector on historical data...');
      
      // Simulate training
      setTimeout(() => {
        logger.info('Fraud ML detector training complete');
      }, 2000);
    } catch (error) {
      logger.error('Error training fraud detector:', error);
    }
  }
}

export const fraudMLDetector = new FraudMLDetector();
```

### FILE: src/ml/predictions/predictive-engine.ts
```typescript
import { logger } from '../../utils/logger';
import { pgPool } from '../../utils/database';

export class PredictiveEngine {
  async predictMetricValue(metricName: string, hoursAhead: number = 1): Promise<{
    prediction: number;
    confidence: number;
    trend: 'up' | 'down' | 'stable';
  }> {
    try {
      // Get historical data
      const query = `
        SELECT value, timestamp
        FROM metrics
        WHERE metric_name = $1
        AND timestamp > NOW() - INTERVAL '7 days'
        ORDER BY timestamp ASC
      `;
      
      const result = await pgPool.query(query, [metricName]);
      
      if (result.rows.length < 10) {
        return {
          prediction: 0,
          confidence: 0,
          trend: 'stable'
        };
      }

      const values = result.rows.map(r => parseFloat(r.value));
      
      // Simple moving average with trend
      const recentValues = values.slice(-24); // Last 24 hours
      const ma = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
      
      // Calculate trend
      const firstHalf = recentValues.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
      const secondHalf = recentValues.slice(12).reduce((a, b) => a + b, 0) / 12;
      
      const trendFactor = (secondHalf - firstHalf) / firstHalf;
      const prediction = ma * (1 + trendFactor * hoursAhead);
      
      const trend = trendFactor > 0.05 ? 'up' : trendFactor < -0.05 ? 'down' : 'stable';
      const confidence = Math.min(0.95, result.rows.length / 100);

      return {
        prediction,
        confidence,
        trend
      };
    } catch (error) {
      logger.error('Error predicting metric value:', error);
      return {
        prediction: 0,
        confidence: 0,
        trend: 'stable'
      };
    }
  }

  async predictSystemFailure(): Promise<{
    probability: number;
    timeToFailure: number; // minutes
    riskFactors: string[];
  }> {
    try {
      const riskFactors: string[] = [];
      let riskScore = 0;

      // Check CPU trend
      const cpuPrediction = await this.predictMetricValue('system_cpu_usage_percent', 0.25);
      if (cpuPrediction.prediction > 80) {
        riskScore += 30;
        riskFactors.push('High CPU usage predicted');
      }

      // Check memory trend
      const memPrediction = await this.predictMetricValue('system_memory_usage_percent', 0.25);
      if (memPrediction.prediction > 85) {
        riskScore += 30;
        riskFactors.push('High memory usage predicted');
      }

      // Check error rate trend
      const errorPrediction = await this.predictMetricValue('http_error_rate', 0.25);
      if (errorPrediction.trend === 'up') {
        riskScore += 25;
        riskFactors.push('Increasing error rate');
      }

      // Check response time
      const responsePrediction = await this.predictMetricValue('http_response_time_ms', 0.25);
      if (responsePrediction.prediction > 2000) {
        riskScore += 15;
        riskFactors.push('Slow response times predicted');
      }

      const probability = Math.min(riskScore / 100, 0.95);
      const timeToFailure = probability > 0.7 ? 15 : probability > 0.5 ? 30 : 60;

      return {
        probability,
        timeToFailure,
        riskFactors
      };
    } catch (error) {
      logger.error('Error predicting system failure:', error);
      return {
        probability: 0,
        timeToFailure: 999,
        riskFactors: []
      };
    }
  }
}

export const predictiveEngine = new PredictiveEngine();
```

### FILE: src/services/metrics.service.ts
```typescript
import { pgPool } from '../utils/database';
import { logger } from '../utils/logger';
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Initialize Prometheus metrics
collectDefaultMetrics();

class MetricsService {
  async pushMetrics(data: any): Promise<void> {
    try {
      // Make sure we have a database connection
      if (!pgPool) {
        logger.error('Database not connected');
        return;
      }

      const query = `
        INSERT INTO metrics (metric_name, service_name, value, metric_type, labels, timestamp)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `;
      
      const metricName = data.metric_name || data.name || 'unknown';
      const serviceName = data.service_name || 'monitoring-service';
      const value = data.value || 0;
      const metricType = data.type || data.metric_type || 'gauge';
      const labels = data.labels || {};
      
      await pgPool.query(query, [
        metricName,
        serviceName,
        value,
        metricType,
        JSON.stringify(labels)
      ]);
      
      logger.debug(`Stored metric: ${metricName} = ${value}`);
    } catch (error) {
      // Type guard for error
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Don't log InfluxDB errors, just PostgreSQL ones
      if (!errorMessage.includes('InfluxDB') && !errorMessage.includes('unauthorized')) {
        logger.error('Error pushing metrics to PostgreSQL:', errorMessage);
      }
    }
  }

  async queryMetrics(query: string): Promise<any[]> {
    try {
      if (!pgPool) {
        logger.error('Database not connected');
        return [];
      }
      const result = await pgPool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error querying metrics:', error);
      return [];
    }
  }

  getPrometheusRegistry() {
    return register;
  }
}

export const metricsService = new MetricsService();

// Import Kafka producer
import { kafkaProducer } from '../streaming/kafka-producer';

// Add method to stream metrics to Kafka
export async function streamMetricToKafka(metric: any) {
  await kafkaProducer.sendMetric(metric);
}
```

### FILE: src/services/alert.service.ts
```typescript
import { pgPool, redisClient } from '../utils/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface Alert {
  id: string;
  rule_id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  state: 'pending' | 'firing' | 'resolved';
  service?: string;
  value?: number;
  threshold?: number;
  started_at: Date;
  resolved_at?: Date;
  acknowledged?: boolean;
  acknowledged_by?: string;
  acknowledged_at?: Date;
}

class AlertService {
  async getActiveAlerts(): Promise<Alert[]> {
    try {
      const result = await pgPool.query(
        `SELECT * FROM alerts 
         WHERE state IN ('pending', 'firing')
         ORDER BY severity, started_at DESC`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting active alerts:', error);
      throw error;
    }
  }

  async getAlert(id: string): Promise<Alert | null> {
    try {
      const result = await pgPool.query(
        'SELECT * FROM alerts WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting alert:', error);
      throw error;
    }
  }

  async acknowledgeAlert(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alerts 
         SET acknowledged = true,
             acknowledged_by = $2,
             acknowledged_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, data.acknowledged_by || 'system']
      );

      if (result.rowCount === 0) {
        throw new Error('Alert not found');
      }

      // Clear from cache
      await redisClient.del(`alert:${id}`);

      return result.rows[0];
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      throw error;
    }
  }

  async resolveAlert(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alerts 
         SET state = 'resolved',
             resolved_at = NOW(),
             resolution_note = $2
         WHERE id = $1
         RETURNING *`,
        [id, data.resolution_note || null]
      );

      if (result.rowCount === 0) {
        throw new Error('Alert not found');
      }

      // Clear from cache
      await redisClient.del(`alert:${id}`);

      return result.rows[0];
    } catch (error) {
      logger.error('Error resolving alert:', error);
      throw error;
    }
  }

  async getAlertHistory(params: any): Promise<any[]> {
    try {
      const limit = params.limit || 100;
      const offset = params.offset || 0;
      
      const result = await pgPool.query(
        `SELECT * FROM alerts 
         WHERE timestamp > NOW() - INTERVAL '30 days'
         ORDER BY started_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Error getting alert history:', error);
      throw error;
    }
  }

  async getAlertRules(): Promise<any[]> {
    try {
      const result = await pgPool.query(
        'SELECT * FROM alert_rules WHERE enabled = true ORDER BY severity, rule_name'
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting alert rules:', error);
      throw error;
    }
  }

  async createAlertRule(data: any): Promise<any> {
    try {
      const id = uuidv4();
      const result = await pgPool.query(
        `INSERT INTO alert_rules (id, rule_name, metric_name, condition, threshold, severity, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, data.rule_name, data.metric_name, data.condition, data.threshold, data.severity, true]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating alert rule:', error);
      throw error;
    }
  }

  async updateAlertRule(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alert_rules 
         SET rule_name = $2,
             metric_name = $3,
             condition = $4,
             threshold = $5,
             severity = $6,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, data.rule_name, data.metric_name, data.condition, data.threshold, data.severity]
      );

      if (result.rowCount === 0) {
        throw new Error('Alert rule not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating alert rule:', error);
      throw error;
    }
  }

  async deleteAlertRule(id: string): Promise<void> {
    try {
      await pgPool.query('DELETE FROM alert_rules WHERE id = $1', [id]);
    } catch (error) {
      logger.error('Error deleting alert rule:', error);
      throw error;
    }
  }
}

export const alertService = new AlertService();
```

### FILE: src/services/dashboard.service.ts
```typescript
import { pgPool } from '../utils/database';
import { healthService } from './health.service';
import { metricsService } from './metrics.service';
import { alertService } from './alert.service';
import { logger } from '../utils/logger';

class DashboardService {
  async getOverview(): Promise<any> {
    try {
      const [health, activeAlerts, recentMetrics] = await Promise.all([
        healthService.getOverallHealth(),
        alertService.getActiveAlerts(),
        this.getRecentMetrics(),
      ]);

      return {
        health,
        alerts: {
          total: activeAlerts.length,
          critical: activeAlerts.filter(a => a.severity === 'critical').length,
          warning: activeAlerts.filter(a => a.severity === 'warning').length,
        },
        metrics: recentMetrics,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting dashboard overview:', error);
      throw error;
    }
  }

  async getSLAMetrics(params: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT 
          service_name,
          AVG(uptime_percentage) as avg_uptime,
          AVG(response_time_p95) as avg_p95_latency,
          SUM(violations) as total_violations
         FROM sla_metrics
         WHERE period_start >= $1
         GROUP BY service_name`,
        [params.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)]
      );

      return {
        services: result.rows,
        period: params.period || '30d',
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting SLA metrics:', error);
      throw error;
    }
  }

  async getPerformanceMetrics(params: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT 
          service_name,
          endpoint,
          AVG(response_time_ms) as avg_response_time,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99,
          COUNT(*) as request_count
         FROM performance_metrics
         WHERE timestamp > NOW() - INTERVAL '1 hour'
         GROUP BY service_name, endpoint
         ORDER BY request_count DESC
         LIMIT 20`
      );

      return {
        endpoints: result.rows,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting performance metrics:', error);
      throw error;
    }
  }

  async getBusinessMetrics(params: any): Promise<any> {
    try {
      // This would connect to your business metrics
      // For now, returning mock data structure
      return {
        revenue: {
          today: 0,
          week: 0,
          month: 0,
        },
        tickets: {
          sold_today: 0,
          active_events: 0,
        },
        venues: {
          active: 0,
          total: 0,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting business metrics:', error);
      throw error;
    }
  }

  async getIncidents(params: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT * FROM incidents 
         WHERE status != 'closed'
         ORDER BY severity, detected_at DESC
         LIMIT 10`
      );

      return {
        incidents: result.rows,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting incidents:', error);
      throw error;
    }
  }

  private async getRecentMetrics(): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT 
          metric_name,
          service_name,
          AVG(value) as avg_value
         FROM metrics
         WHERE timestamp > NOW() - INTERVAL '5 minutes'
         GROUP BY metric_name, service_name`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting recent metrics:', error);
      throw error;
    }
  }
}

export const dashboardService = new DashboardService();
```

### FILE: src/services/solana.service.ts
```typescript
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  sendAndConfirmTransaction,
  TransactionSignature,
  Commitment,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  createMint, 
  mintTo, 
  transfer,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { logger } from '../utils/logger';
import { db } from '../config/database';

interface MintRequest {
  ticketId: string;
  ownerAddress: string;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
    eventId: string;
    venueId: string;
    seatNumber?: string;
    eventDate: string;
  };
}

interface TransferRequest {
  tokenAddress: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
}

export class SolanaService {
  private connection: Connection;
  private metaplex: Metaplex;
  private payerKeypair: Keypair;
  private commitment: Commitment = 'confirmed';
  private maxRetries = 3;
  private retryDelay = 2000; // 2 seconds

  constructor() {
    // Initialize connection to Solana
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, this.commitment);
    
    // Load payer keypair from environment
    const payerSecret = process.env.SOLANA_PAYER_SECRET_KEY;
    if (payerSecret) {
      this.payerKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(payerSecret))
      );
    } else {
      // Generate new keypair for testing
      this.payerKeypair = Keypair.generate();
      logger.warn('Using generated keypair - fund this address:', 
        this.payerKeypair.publicKey.toString());
    }

    // Initialize Metaplex
    this.metaplex = new Metaplex(this.connection);
    this.metaplex.use(keypairIdentity(this.payerKeypair));
  }

  /**
   * Mint NFT ticket with idempotency
   */
  async mintTicketNFT(request: MintRequest): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Check if already minted (idempotency)
      const existing = await this.checkExistingMint(request.ticketId);
      if (existing) {
        logger.info(`Ticket ${request.ticketId} already minted: ${existing}`);
        return existing;
      }

      // Create NFT with Metaplex
      const { nft } = await this.metaplex.nfts().create({
        uri: request.metadata.uri,
        name: request.metadata.name,
        symbol: request.metadata.symbol,
        sellerFeeBasisPoints: 250, // 2.5% royalty
        creators: [
          {
            address: this.payerKeypair.publicKey,
            share: 100
          }
        ],
        isMutable: false, // Tickets shouldn't change
        maxSupply: 1 // Each ticket is unique
      });

      const mintAddress = nft.address.toString();
      
      // Store mint record for idempotency
      await this.storeMintRecord(request.ticketId, mintAddress, nft);

      // Transfer to buyer
      if (request.ownerAddress !== this.payerKeypair.publicKey.toString()) {
        await this.transferNFT({
          tokenAddress: mintAddress,
          fromAddress: this.payerKeypair.publicKey.toString(),
          toAddress: request.ownerAddress,
          amount: 1
        });
      }

      const duration = Date.now() - startTime;
      logger.info(`NFT minted in ${duration}ms: ${mintAddress}`);
      
      // Record metrics
      this.recordMetrics('mint', true, duration);
      
      return mintAddress;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('Mint failed:', error);
      
      // Record metrics
      this.recordMetrics('mint', false, duration, error.message);
      
      // Retry logic
      if (this.shouldRetry(error)) {
        return this.retryMint(request);
      }
      
      throw error;
    }
  }

  /**
   * Transfer NFT with retry logic
   */
  async transferNFT(request: TransferRequest): Promise<string> {
    const startTime = Date.now();
    
    try {
      const fromPubkey = new PublicKey(request.fromAddress);
      const toPubkey = new PublicKey(request.toAddress);
      const mintPubkey = new PublicKey(request.tokenAddress);

      // Get or create associated token accounts
      const fromTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        fromPubkey
      );
      
      const toTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        toPubkey
      );

      // Check if destination account exists
      const toAccountInfo = await this.connection.getAccountInfo(toTokenAccount);
      
      const transaction = new Transaction();
      
      // Create account if it doesn't exist
      if (!toAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.payerKeypair.publicKey,
            toTokenAccount,
            toPubkey,
            mintPubkey
          )
        );
      }

      // Add transfer instruction
      transaction.add(
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          fromTokenAccount,
          toTokenAccount,
          fromPubkey,
          [],
          request.amount
        )
      );

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payerKeypair],
        {
          commitment: this.commitment,
          maxRetries: this.maxRetries
        }
      );

      const duration = Date.now() - startTime;
      logger.info(`NFT transferred in ${duration}ms: ${signature}`);
      
      // Store transfer record
      await this.storeTransferRecord(request, signature);
      
      // Record metrics
      this.recordMetrics('transfer', true, duration);
      
      return signature;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('Transfer failed:', error);
      
      // Record metrics
      this.recordMetrics('transfer', false, duration, error.message);
      
      throw error;
    }
  }

  /**
   * Verify NFT ownership
   */
  async verifyOwnership(tokenAddress: string, ownerAddress: string): Promise<boolean> {
    try {
      const mintPubkey = new PublicKey(tokenAddress);
      const ownerPubkey = new PublicKey(ownerAddress);
      
      const ownerTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        ownerPubkey
      );
      
      const accountInfo = await this.connection.getTokenAccountBalance(ownerTokenAccount);
      
      return accountInfo.value.uiAmount === 1;
      
    } catch (error) {
      logger.error('Ownership verification failed:', error);
      return false;
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(signature: string): Promise<string> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      
      if (!status || !status.value) {
        return 'unknown';
      }
      
      if (status.value.err) {
        return 'failed';
      }
      
      if (status.value.confirmationStatus === 'finalized') {
        return 'finalized';
      }
      
      if (status.value.confirmationStatus === 'confirmed') {
        return 'confirmed';
      }
      
      return 'processing';
      
    } catch (error) {
      logger.error('Failed to get transaction status:', error);
      return 'error';
    }
  }

  /**
   * Check if ticket was already minted (idempotency)
   */
  private async checkExistingMint(ticketId: string): Promise<string | null> {
    try {
      const record = await db('nft_mints')
        .where({ ticket_id: ticketId, status: 'completed' })
        .first();
      
      return record?.mint_address || null;
      
    } catch (error) {
      logger.error('Failed to check existing mint:', error);
      return null;
    }
  }

  /**
   * Store mint record for idempotency
   */
  private async storeMintRecord(ticketId: string, mintAddress: string, nft: any): Promise<void> {
    await db('nft_mints').insert({
      ticket_id: ticketId,
      mint_address: mintAddress,
      metadata: JSON.stringify(nft.json),
      status: 'completed',
      created_at: new Date()
    }).onConflict('ticket_id').merge();
  }

  /**
   * Store transfer record
   */
  private async storeTransferRecord(request: TransferRequest, signature: string): Promise<void> {
    await db('nft_transfers').insert({
      token_address: request.tokenAddress,
      from_address: request.fromAddress,
      to_address: request.toAddress,
      amount: request.amount,
      signature,
      status: 'completed',
      created_at: new Date()
    });
  }

  /**
   * Check if error is retryable
   */
  private shouldRetry(error: any): boolean {
    const retryableErrors = [
      'blockhash not found',
      'node is behind',
      'timeout',
      'ECONNREFUSED',
      'ETIMEDOUT'
    ];
    
    return retryableErrors.some(msg => 
      error.message?.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * Retry mint operation
   */
  private async retryMint(request: MintRequest, attempt = 1): Promise<string> {
    if (attempt > this.maxRetries) {
      throw new Error(`Mint failed after ${this.maxRetries} attempts`);
    }
    
    logger.info(`Retrying mint attempt ${attempt}...`);
    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
    
    try {
      return await this.mintTicketNFT(request);
    } catch (error: any) {
      if (this.shouldRetry(error)) {
        return this.retryMint(request, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Record metrics for monitoring
   */
  private recordMetrics(operation: string, success: boolean, duration: number, error?: string): void {
    // This would integrate with the monitoring service from Phase 8
    if (success) {
      logger.info(`Solana ${operation} successful`, { duration });
    } else {
      logger.error(`Solana ${operation} failed`, { duration, error });
    }
  }

  /**
   * Health check for Solana connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const blockHeight = await this.connection.getBlockHeight();
      const balance = await this.connection.getBalance(this.payerKeypair.publicKey);
      
      logger.info('Solana health check:', {
        blockHeight,
        balance: balance / LAMPORTS_PER_SOL,
        address: this.payerKeypair.publicKey.toString()
      });
      
      return blockHeight > 0;
      
    } catch (error) {
      logger.error('Solana health check failed:', error);
      return false;
    }
  }
}

export const solanaService = new SolanaService();
```

### FILE: src/services/dashboard-aggregator.service.ts
```typescript
import { register } from 'prom-client';
import { healthService } from './health.service';
import { alertService } from './alert.service';
import { pgPool, redisClient } from '../utils/database';
import { logger } from '../utils/logger';

class DashboardAggregatorService {
  async getSystemStatus(): Promise<any> {
    try {
      // Get current metrics from Prometheus registry
      const metrics = await register.getMetricsAsJSON();
      
      // Extract key metrics
      const systemMetrics: any = {};
      for (const metric of metrics) {
        if (metric.name === 'system_cpu_usage_percent') {
          systemMetrics.cpu = metric.values[0]?.value || 0;
        }
        if (metric.name === 'system_memory_usage_percent') {
          systemMetrics.memory = metric.values[0]?.value || 0;
        }
        if (metric.name === 'process_resident_memory_bytes') {
          systemMetrics.processMemory = (metric.values[0]?.value || 0) / (1024 * 1024); // Convert to MB
        }
      }

      // Get service status
      const serviceMetrics: any = {};
      for (const metric of metrics) {
        if (metric.name === 'service_up') {
          for (const value of metric.values) {
            const serviceName = value.labels?.service;
            if (serviceName) {
              serviceMetrics[serviceName] = {
                up: value.value === 1,
                port: value.labels?.port || 'unknown',
              };
            }
          }
        }
      }

      // Get database status
      const databaseStatus: any = {
        postgresql: false,
        redis: false,
        mongodb: false,
      };

      try {
        if (pgPool) {
          await pgPool.query('SELECT 1');
          databaseStatus.postgresql = true;
        }
      } catch (e) {}

      try {
        if (redisClient) {
          await redisClient.ping();
          databaseStatus.redis = true;
        }
      } catch (e) {}

      // Get active alerts
      const activeAlerts = await alertService.getActiveAlerts().catch(() => []);

      return {
        timestamp: new Date(),
        system: {
          cpu: `${systemMetrics.cpu?.toFixed(1) || 0}%`,
          memory: `${systemMetrics.memory?.toFixed(1) || 0}%`,
          processMemory: `${systemMetrics.processMemory?.toFixed(1) || 0} MB`,
        },
        services: serviceMetrics,
        databases: databaseStatus,
        alerts: {
          total: activeAlerts.length,
          critical: activeAlerts.filter((a: any) => a.severity === 'critical').length,
          warning: activeAlerts.filter((a: any) => a.severity === 'warning').length,
        },
        servicesCount: {
          total: Object.keys(serviceMetrics).length,
          up: Object.values(serviceMetrics).filter((s: any) => s.up).length,
          down: Object.values(serviceMetrics).filter((s: any) => !s.up).length,
        },
      };
    } catch (error) {
      logger.error('Error aggregating dashboard data:', error);
      throw error;
    }
  }

  async getMetricsSummary(): Promise<any> {
    try {
      const metrics = await register.getMetricsAsJSON();
      const summary: any = {
        timestamp: new Date(),
        categories: {
          system: [],
          services: [],
          database: [],
          business: [],
        },
      };

      for (const metric of metrics) {
        const metricSummary = {
          name: metric.name,
          type: metric.type,
          value: metric.values[0]?.value,
          help: metric.help,
        };

        if (metric.name.startsWith('system_')) {
          summary.categories.system.push(metricSummary);
        } else if (metric.name.startsWith('service_') || metric.name.startsWith('http_')) {
          summary.categories.services.push(metricSummary);
        } else if (metric.name.includes('postgres') || metric.name.includes('redis') || metric.name.includes('mongo')) {
          summary.categories.database.push(metricSummary);
        } else if (metric.name.startsWith('business_')) {
          summary.categories.business.push(metricSummary);
        }
      }

      return summary;
    } catch (error) {
      logger.error('Error getting metrics summary:', error);
      throw error;
    }
  }
}

export const dashboardAggregatorService = new DashboardAggregatorService();
```

### FILE: src/services/health.service.ts
```typescript
import axios from 'axios';
import { config } from '../config';
import { pgPool, redisClient, mongoClient, esClient } from '../utils/database';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services?: any;
  dependencies?: any;
  uptime?: number;
  details?: any;
}

class HealthService {
  private startTime = Date.now();

  async getOverallHealth(): Promise<HealthStatus> {
    const [services, dependencies] = await Promise.all([
      this.getAllServicesHealth(),
      this.getDependenciesHealth(),
    ]);

    const allHealthy = 
      services.every(s => s.status === 'healthy') &&
      Object.values(dependencies).every((d: any) => d.status === 'healthy');

    const anyUnhealthy = 
      services.some(s => s.status === 'unhealthy') ||
      Object.values(dependencies).some((d: any) => d.status === 'unhealthy');

    return {
      status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date(),
      uptime: Date.now() - this.startTime,
      services: services.length,
      dependencies: Object.keys(dependencies).length,
    };
  }

  async getServiceHealth(serviceName: string): Promise<any> {
    try {
      const serviceUrl = (config.services as any)[serviceName];
      if (!serviceUrl) {
        throw new Error(`Unknown service: ${serviceName}`);
      }

      const response = await axios.get(`${serviceUrl}/health`, {
        timeout: 5000,
      });

      return {
        service: serviceName,
        status: 'healthy',
        responseTime: response.headers['x-response-time'] || null,
        timestamp: new Date(),
        details: response.data,
      };
    } catch (error: any) {
      return {
        service: serviceName,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  async getAllServicesHealth(): Promise<any[]> {
    const services = Object.keys(config.services);
    const healthChecks = await Promise.allSettled(
      services.map(service => this.getServiceHealth(service))
    );

    return healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          service: services[index],
          status: 'unhealthy',
          error: result.reason.message,
          timestamp: new Date(),
        };
      }
    });
  }

  async getDependenciesHealth(): Promise<any> {
    const dependencies: any = {};

    // PostgreSQL
    try {
      await pgPool.query('SELECT 1');
      dependencies.postgresql = { status: 'healthy' };
    } catch (error: any) {
      dependencies.postgresql = { status: 'unhealthy', error: error.message };
    }

    // Redis
    try {
      await redisClient.ping();
      dependencies.redis = { status: 'healthy' };
    } catch (error: any) {
      dependencies.redis = { status: 'unhealthy', error: error.message };
    }

    // MongoDB
    try {
      await mongoClient.db().admin().ping();
      dependencies.mongodb = { status: 'healthy' };
    } catch (error: any) {
      dependencies.mongodb = { status: 'unhealthy', error: error.message };
    }

    // Elasticsearch
    try {
      await esClient.ping();
      dependencies.elasticsearch = { status: 'healthy' };
    } catch (error: any) {
      dependencies.elasticsearch = { status: 'unhealthy', error: error.message };
    }

    return dependencies;
  }
}

export const healthService = new HealthService();
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/streaming/stream-processor.ts
```typescript
import { logger } from '../utils/logger';
import { kafkaProducer } from './kafka-producer';

interface EventWindow {
  startTime: Date;
  endTime: Date;
  events: any[];
  aggregates: Map<string, number>;
}

export class StreamProcessor {
  private windows: Map<string, EventWindow> = new Map();
  private windowSizeMs = 60000; // 1 minute windows

  async processEventStream(events: any[]) {
    const now = new Date();
    const windowKey = Math.floor(now.getTime() / this.windowSizeMs).toString();
    
    if (!this.windows.has(windowKey)) {
      this.windows.set(windowKey, {
        startTime: new Date(parseInt(windowKey) * this.windowSizeMs),
        endTime: new Date((parseInt(windowKey) + 1) * this.windowSizeMs),
        events: [],
        aggregates: new Map(),
      });
    }

    const window = this.windows.get(windowKey)!;
    window.events.push(...events);

    // Perform real-time aggregations
    for (const event of events) {
      this.updateAggregates(window, event);
    }

    // Check for patterns
    await this.detectPatterns(window);

    // Clean old windows
    this.cleanOldWindows();
  }

  private updateAggregates(window: EventWindow, event: any) {
    const key = event.metric_name || event.type;
    const current = window.aggregates.get(key) || 0;
    window.aggregates.set(key, current + (event.value || 1));
  }

  private async detectPatterns(window: EventWindow) {
    // Detect high-frequency patterns
    for (const [key, count] of window.aggregates) {
      if (count > 100) {
        logger.warn(`High frequency pattern detected: ${key} = ${count} events/min`);
        
        await kafkaProducer.sendAlert({
          title: `High Frequency Pattern: ${key}`,
          severity: 'warning',
          pattern: key,
          count,
          window: window.startTime,
        });
      }
    }

    // Detect fraud patterns in real-time
    const fraudEvents = window.events.filter(e => e.type === 'fraud');
    if (fraudEvents.length > 5) {
      logger.error(`🚨 FRAUD SPIKE: ${fraudEvents.length} fraud events in 1 minute!`);
      
      await kafkaProducer.sendAlert({
        title: 'Fraud Spike Detected',
        severity: 'critical',
        count: fraudEvents.length,
        window: window.startTime,
      });
    }
  }

  private cleanOldWindows() {
    const now = Date.now();
    const cutoff = now - (5 * this.windowSizeMs); // Keep 5 minutes of windows
    
    for (const [key, window] of this.windows) {
      if (window.startTime.getTime() < cutoff) {
        this.windows.delete(key);
      }
    }
  }

  getWindowStats(): any {
    const stats = {
      activeWindows: this.windows.size,
      totalEvents: 0,
      topPatterns: [] as any[],
    };

    for (const window of this.windows.values()) {
      stats.totalEvents += window.events.length;
    }

    // Get top patterns across all windows
    const allPatterns = new Map<string, number>();
    for (const window of this.windows.values()) {
      for (const [key, count] of window.aggregates) {
        allPatterns.set(key, (allPatterns.get(key) || 0) + count);
      }
    }

    stats.topPatterns = Array.from(allPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));

    return stats;
  }
}

export const streamProcessor = new StreamProcessor();
```

### FILE: src/models/Alert.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IAlert {
  id?: string;
  name: string;
  type: 'error' | 'warning' | 'info';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  source: string;
  metadata?: any;
  resolved?: boolean;
  resolved_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class AlertModel {
  private db: Knex;
  private tableName = 'alerts';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IAlert): Promise<IAlert> {
    const [alert] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return alert;
  }

  async findById(id: string): Promise<IAlert | null> {
    const alert = await this.db(this.tableName)
      .where({ id })
      .first();
    return alert || null;
  }

  async findUnresolved(): Promise<IAlert[]> {
    return this.db(this.tableName)
      .where({ resolved: false })
      .orderBy('severity', 'desc')
      .orderBy('created_at', 'desc');
  }

  async update(id: string, data: Partial<IAlert>): Promise<IAlert | null> {
    const [alert] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return alert || null;
  }

  async resolve(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .update({ resolved: true, resolved_at: new Date() });
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default AlertModel;
```

### FILE: src/models/Metric.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IMetric {
  id?: string;
  name: string;
  value: number;
  unit?: string;
  service: string;
  tags?: any;
  timestamp: Date;
  created_at?: Date;
}

export class MetricModel {
  private db: Knex;
  private tableName = 'metrics';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IMetric): Promise<IMetric> {
    const [metric] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return metric;
  }

  async findById(id: string): Promise<IMetric | null> {
    const metric = await this.db(this.tableName)
      .where({ id })
      .first();
    return metric || null;
  }

  async findByService(service: string, startTime?: Date, endTime?: Date): Promise<IMetric[]> {
    let query = this.db(this.tableName).where({ service });
    
    if (startTime) {
      query = query.where('timestamp', '>=', startTime);
    }
    if (endTime) {
      query = query.where('timestamp', '<=', endTime);
    }
    
    return query.orderBy('timestamp', 'desc');
  }

  async findByName(name: string, limit = 100): Promise<IMetric[]> {
    return this.db(this.tableName)
      .where({ name })
      .orderBy('timestamp', 'desc')
      .limit(limit);
  }

  async deleteOlderThan(date: Date): Promise<number> {
    return this.db(this.tableName)
      .where('timestamp', '<', date)
      .del();
  }
}

export default MetricModel;
```

### FILE: src/models/Dashboard.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IDashboard {
  id?: string;
  name: string;
  description?: string;
  widgets?: any[];
  layout?: any;
  owner?: string;
  shared?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class DashboardModel {
  private db: Knex;
  private tableName = 'dashboards';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IDashboard): Promise<IDashboard> {
    const [dashboard] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return dashboard;
  }

  async findById(id: string): Promise<IDashboard | null> {
    const dashboard = await this.db(this.tableName)
      .where({ id })
      .first();
    return dashboard || null;
  }

  async findByOwner(owner: string): Promise<IDashboard[]> {
    return this.db(this.tableName)
      .where({ owner })
      .orWhere({ shared: true })
      .orderBy('name', 'asc');
  }

  async update(id: string, data: Partial<IDashboard>): Promise<IDashboard | null> {
    const [dashboard] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return dashboard || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default DashboardModel;
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    venueId?: string;
    role: string;
    permissions?: string[];
  };
}

export async function authenticate(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return reply.status(401).send({ 
        error: 'Authentication required' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    
    request.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };
    
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({ 
        error: 'Token expired' 
      });
    }
    return reply.status(401).send({ 
      error: 'Invalid token' 
    });
  }
}

export function authorize(...roles: string[]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ 
        error: 'Authentication required' 
      });
    }

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ 
        error: 'Insufficient permissions' 
      });
    }
  };
}
```

### FILE: src/analytics/advanced-fraud-ml.ts
```typescript
import * as tf from '@tensorflow/tfjs-node';
import { pgPool } from '../utils/database';
import { kafkaProducer } from '../streaming/kafka-producer';
import { logger } from '../utils/logger';
import { createHash } from 'crypto';

interface FraudPattern {
  userId: string;
  ipAddress: string;
  deviceFingerprint: string;
  behaviorVector: number[];
  riskScore: number;
  patterns: string[];
  timestamp: Date;
}

export class AdvancedFraudDetector {
  private model: tf.LayersModel | null = null;
  private patternCache = new Map<string, FraudPattern[]>();
  private knownScalpers = new Set<string>();
  private suspiciousIPs = new Map<string, number>();

  constructor() {
    this.initializeDeepLearningModel();
    this.loadKnownPatterns();
    this.startRealtimeAnalysis();
  }

  private async initializeDeepLearningModel() {
    // Build neural network for fraud detection
    this.model = tf.sequential({
      layers: [
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          inputShape: [10], // Simplified to 10 features
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({
          units: 64,
          activation: 'relu',
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid',
        }),
      ],
    });

    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });

    logger.info('🧠 Advanced fraud detection neural network initialized');
  }

  private extractFeatures(data: any): number[] {
    // Extract 10 key features for the neural network
    return [
      data.request_count || 0,
      data.time_between_requests || 0,
      data.unique_events_targeted || 0,
      data.total_tickets_attempted || 0,
      data.failed_attempts || 0,
      this.isKnownVPN(data.ip_address) ? 1 : 0,
      this.isSuspiciousUserAgent(data.user_agent) ? 1 : 0,
      data.account_age_days || 0,
      data.payment_methods_used || 0,
      this.calculateVelocityScore(data),
    ];
  }

  async detectFraud(userData: any): Promise<FraudPattern> {
    try {
      const features = this.extractFeatures(userData);
      const featureTensor = tf.tensor2d([features]);
      
      // Get neural network prediction
      const prediction = this.model!.predict(featureTensor) as tf.Tensor;
      const fraudProbability = (await prediction.data())[0];
      
      featureTensor.dispose();
      prediction.dispose();

      const patterns: string[] = [];
      let riskScore = fraudProbability;

      // Check velocity
      if (await this.checkVelocity(userData)) {
        patterns.push('high_velocity');
        riskScore = Math.min(riskScore + 0.3, 1);
      }

      // Check IP reputation
      if (this.getIPRiskScore(userData.ip_address) > 0.5) {
        patterns.push('suspicious_ip');
        riskScore = Math.min(riskScore + 0.2, 1);
      }

      // Check for scalper behaviors
      const scalperScore = await this.detectScalperBehavior(userData);
      if (scalperScore > 0.6) {
        patterns.push('scalper_behavior');
        riskScore = Math.min(riskScore + scalperScore * 0.3, 1);
      }

      const fraudPattern: FraudPattern = {
        userId: userData.user_id,
        ipAddress: userData.ip_address,
        deviceFingerprint: this.generateFingerprint(userData),
        behaviorVector: features,
        riskScore,
        patterns,
        timestamp: new Date(),
      };

      // Send to Kafka if high risk
      if (riskScore > 0.7) {
        await kafkaProducer.sendFraudEvent({
          userId: userData.user_id,
          pattern: patterns.join(', '),
          riskLevel: riskScore > 0.9 ? 'critical' : 'high',
          riskScore,
          timestamp: new Date(),
        });
      }

      return fraudPattern;
    } catch (error) {
      logger.error('Error detecting fraud:', error);
      throw error;
    }
  }

  private async detectScalperBehavior(userData: any): Promise<number> {
    let score = 0;
    
    // Multiple indicators
    if (userData.time_between_requests < 1) score += 0.25;
    if (userData.total_tickets_attempted > 10) score += 0.2;
    if (userData.multiple_ips_used) score += 0.15;
    if (this.detectAutomation(userData)) score += 0.2;
    if (userData.targeting_high_demand) score += 0.2;
    
    return Math.min(score, 1);
  }

  private async checkVelocity(userData: any): Promise<boolean> {
    return userData.request_count && userData.request_count > 30;
  }

  private getIPRiskScore(ipAddress: string): number {
    if (this.suspiciousIPs.has(ipAddress)) {
      return this.suspiciousIPs.get(ipAddress)!;
    }
    
    let score = 0;
    if (this.isKnownVPN(ipAddress)) score += 0.3;
    if (this.isDataCenter(ipAddress)) score += 0.4;
    
    return Math.min(score, 1);
  }

  private isKnownVPN(ip: string): boolean {
    const vpnRanges = ['10.', '172.16.', '192.168.'];
    return vpnRanges.some(range => ip.startsWith(range));
  }

  private isDataCenter(ip: string): boolean {
    // Simplified check
    return false;
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    if (!userAgent) return false;
    const suspicious = ['bot', 'crawler', 'spider', 'scraper', 'curl', 'wget'];
    const ua = userAgent.toLowerCase();
    return suspicious.some(s => ua.includes(s));
  }

  private calculateVelocityScore(data: any): number {
    const velocity = data.request_count / Math.max(data.time_window_minutes || 1, 1);
    return Math.min(velocity / 100, 1);
  }

  private generateFingerprint(userData: any): string {
    const data = `${userData.user_agent}|${userData.ip_address}`;
    return createHash('sha256').update(data).digest('hex');
  }

  private detectAutomation(userData: any): boolean {
    return userData.mouse_movements === 0 && userData.keyboard_events === 0;
  }

  private async loadKnownPatterns() {
    try {
      // Load known bad actors from database
      logger.info('Loading known fraud patterns...');
    } catch (error) {
      logger.error('Error loading patterns:', error);
    }
  }

  private startRealtimeAnalysis() {
    setInterval(async () => {
      try {
        // Real-time fraud analysis
        logger.debug('Running fraud analysis...');
      } catch (error) {
        logger.error('Error in realtime analysis:', error);
      }
    }, 30000);
  }

  async getFraudMetrics() {
    return {
      high_risk_users: this.knownScalpers.size,
      suspicious_ips: this.suspiciousIPs.size,
      patterns_detected: 0,
    };
  }
}

export const fraudDetector = new AdvancedFraudDetector();
```

### FILE: src/analytics/sales-tracker.ts
```typescript
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { pgPool } from '../utils/database';
import { kafkaProducer } from '../streaming/kafka-producer';
import { logger } from '../utils/logger';
import * as tf from '@tensorflow/tfjs-node';
import { EventEmitter } from 'events';

interface SalesVelocity {
  eventId: string;
  ticketsSold: number;
  velocity: number; // tickets per minute
  accelerationRate: number;
  predictedSelloutTime?: Date;
  currentCapacity: number;
  remainingTickets: number;
}

export class EventSalesTracker extends EventEmitter {
  private salesModel: tf.LayersModel | null = null;
  private velocityCache = new Map<string, SalesVelocity[]>();
  private influxClient: InfluxDB;
  private writeApi: any;

  constructor() {
    super();
    this.influxClient = new InfluxDB({
      url: process.env.INFLUXDB_URL || 'http://influxdb:8086',
      token: process.env.INFLUXDB_TOKEN || 'admin-token',
    });
    this.writeApi = this.influxClient.getWriteApi('tickettoken', 'metrics');
    this.initializeModel();
    this.startTracking();
  }

  private async initializeModel() {
    // Build LSTM model for sales prediction
    this.salesModel = tf.sequential({
      layers: [
        tf.layers.lstm({
          units: 128,
          returnSequences: true,
          inputShape: [10, 5], // 10 time steps, 5 features
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.lstm({ units: 64, returnSequences: false }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'linear' }), // Predict minutes to sellout
      ],
    });

    this.salesModel.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae'],
    });

    // Load historical data for training
    await this.trainModel();
    logger.info('📈 Sales prediction model initialized');
  }

  private async trainModel() {
    try {
      const historicalData = await pgPool.query(`
        SELECT 
          event_id,
          DATE_TRUNC('minute', created_at) as minute,
          COUNT(*) as tickets_sold,
          AVG(price) as avg_price,
          MAX(created_at) - MIN(created_at) as time_span
        FROM ticket_sales
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY event_id, minute
        ORDER BY event_id, minute
      `);

      if (historicalData.rows.length > 100) {
        // Prepare training data
        const features: number[][][] = [];
        const labels: number[] = [];

        // Process data into sequences
        const eventGroups = this.groupByEvent(historicalData.rows);
        
        for (const [eventId, sales] of Object.entries(eventGroups)) {
          const sequences = this.createSequences(sales as any[]);
          features.push(...sequences.features);
          labels.push(...sequences.labels);
        }

        if (features.length > 0) {
          const xs = tf.tensor3d(features);
          const ys = tf.tensor1d(labels);

          await this.salesModel!.fit(xs, ys, {
            epochs: 50,
            batchSize: 32,
            validationSplit: 0.2,
            callbacks: {
              onEpochEnd: (epoch, logs) => {
                if (epoch % 10 === 0) {
                  logger.debug(`Sales model training - Epoch ${epoch}: loss = ${logs?.loss}`);
                }
              },
            },
          });

          xs.dispose();
          ys.dispose();
        }
      }
    } catch (error) {
      logger.error('Error training sales model:', error);
    }
  }

  private groupByEvent(rows: any[]): Record<string, any[]> {
    return rows.reduce((acc, row) => {
      if (!acc[row.event_id]) acc[row.event_id] = [];
      acc[row.event_id].push(row);
      return acc;
    }, {} as Record<string, any[]>);
  }

  private createSequences(sales: any[]) {
    const features: number[][][] = [];
    const labels: number[] = [];
    const sequenceLength = 10;

    for (let i = sequenceLength; i < sales.length; i++) {
      const sequence = sales.slice(i - sequenceLength, i).map(s => [
        s.tickets_sold,
        s.avg_price,
        i / sales.length, // Progress through sale
        new Date(s.minute).getHours(), // Hour of day
        new Date(s.minute).getDay(), // Day of week
      ]);
      
      features.push(sequence);
      
      // Label is time to sellout (in minutes)
      const remainingTickets = sales[sales.length - 1].tickets_sold - sales[i].tickets_sold;
      const currentVelocity = sales[i].tickets_sold / (i + 1);
      labels.push(remainingTickets / Math.max(currentVelocity, 0.1));
    }

    return { features, labels };
  }

  async trackSale(eventId: string, ticketData: any) {
    try {
      // Calculate current velocity
      const velocity = await this.calculateVelocity(eventId);
      
      // Predict sellout time
      const prediction = await this.predictSellout(eventId, velocity);
      
      // Stream to Kafka
      await kafkaProducer.sendMetric({
        metric_name: 'event.sales.velocity',
        value: velocity.velocity,
        tags: {
          event_id: eventId,
          remaining_tickets: velocity.remainingTickets,
          predicted_sellout: prediction?.toISOString(),
        },
      });

      // Store in InfluxDB
      const point = new Point('event_sales')
        .tag('event_id', eventId)
        .floatField('velocity', velocity.velocity)
        .floatField('acceleration', velocity.accelerationRate)
        .intField('tickets_sold', velocity.ticketsSold)
        .intField('remaining', velocity.remainingTickets)
        .timestamp(new Date());

      this.writeApi.writePoint(point);

      // Emit alerts for high velocity
      if (velocity.velocity > 10) { // More than 10 tickets per minute
        this.emit('high-velocity', {
          eventId,
          velocity: velocity.velocity,
          predictedSellout: prediction,
        });

        // Send alert to Kafka
        await kafkaProducer.sendAlert({
          title: `High Sales Velocity: ${eventId}`,
          severity: 'warning',
          message: `Selling ${velocity.velocity.toFixed(1)} tickets/min. Predicted sellout: ${prediction?.toLocaleString()}`,
          data: velocity,
        });
      }

      // Check if sellout is imminent
      if (prediction && prediction.getTime() - Date.now() < 3600000) { // Less than 1 hour
        this.emit('sellout-imminent', {
          eventId,
          predictedTime: prediction,
          remainingTickets: velocity.remainingTickets,
        });

        await kafkaProducer.sendAlert({
          title: `Sellout Imminent: ${eventId}`,
          severity: 'critical',
          message: `Event will sell out in ${Math.round((prediction.getTime() - Date.now()) / 60000)} minutes`,
          data: velocity,
        });
      }

      return { velocity, prediction };
    } catch (error) {
      logger.error('Error tracking sale:', error);
      return null;
    }
  }

  private async calculateVelocity(eventId: string): Promise<SalesVelocity> {
    const result = await pgPool.query(`
      WITH sales_data AS (
        SELECT 
          COUNT(*) as total_sold,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 minute') as last_minute,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '5 minutes') as last_5_minutes,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '10 minutes') as last_10_minutes,
          MIN(created_at) as first_sale,
          MAX(created_at) as last_sale
        FROM ticket_sales
        WHERE event_id = $1
      ),
      event_data AS (
        SELECT total_tickets, tickets_sold
        FROM events
        WHERE id = $1
      )
      SELECT 
        s.*,
        e.total_tickets,
        e.total_tickets - e.tickets_sold as remaining_tickets
      FROM sales_data s, event_data e
    `, [eventId]);

    const data = result.rows[0];
    const velocity = data.last_minute || 0;
    const velocity5Min = (data.last_5_minutes || 0) / 5;
    const velocity10Min = (data.last_10_minutes || 0) / 10;
    
    // Calculate acceleration
    const accelerationRate = velocity - velocity10Min;

    return {
      eventId,
      ticketsSold: data.total_sold || 0,
      velocity,
      accelerationRate,
      currentCapacity: data.total_tickets || 0,
      remainingTickets: data.remaining_tickets || 0,
    };
  }

  private async predictSellout(eventId: string, velocity: SalesVelocity): Promise<Date | null> {
    if (!this.salesModel || velocity.remainingTickets <= 0) return null;

    try {
      // Get recent sales pattern
      const recentSales = await pgPool.query(`
        SELECT 
          DATE_TRUNC('minute', created_at) as minute,
          COUNT(*) as tickets_sold,
          AVG(price) as avg_price
        FROM ticket_sales
        WHERE event_id = $1 AND created_at > NOW() - INTERVAL '10 minutes'
        GROUP BY minute
        ORDER BY minute DESC
        LIMIT 10
      `, [eventId]);

      if (recentSales.rows.length < 5) {
        // Simple linear prediction if not enough data
        if (velocity.velocity > 0) {
          const minutesToSellout = velocity.remainingTickets / velocity.velocity;
          return new Date(Date.now() + minutesToSellout * 60000);
        }
        return null;
      }

      // Prepare input for the model
      const input = recentSales.rows.reverse().map(row => [
        row.tickets_sold,
        row.avg_price,
        velocity.ticketsSold / velocity.currentCapacity,
        new Date(row.minute).getHours(),
        new Date(row.minute).getDay(),
      ]);

      // Pad if needed
      while (input.length < 10) {
        input.unshift([0, 0, 0, 0, 0]);
      }

      const prediction = this.salesModel.predict(tf.tensor3d([input])) as tf.Tensor;
      const minutesToSellout = (await prediction.data())[0];
      
      prediction.dispose();

      if (minutesToSellout > 0 && minutesToSellout < 10000) {
        return new Date(Date.now() + minutesToSellout * 60000);
      }
    } catch (error) {
      logger.error('Error predicting sellout:', error);
    }

    return null;
  }

  private startTracking() {
    // Real-time tracking every 30 seconds
    setInterval(async () => {
      try {
        const activeEvents = await pgPool.query(`
          SELECT id, name
          FROM events
          WHERE sale_start < NOW() 
            AND sale_end > NOW()
            AND tickets_sold < total_tickets
        `);

        for (const event of activeEvents.rows) {
          const velocity = await this.calculateVelocity(event.id);
          const prediction = await this.predictSellout(event.id, velocity);
          
          // Cache for quick access
          if (!this.velocityCache.has(event.id)) {
            this.velocityCache.set(event.id, []);
          }
          
          const cache = this.velocityCache.get(event.id)!;
          cache.push({ ...velocity, predictedSelloutTime: prediction || undefined });
          
          // Keep only last 20 data points
          if (cache.length > 20) cache.shift();

          logger.debug(`Event ${event.name}: ${velocity.velocity.toFixed(1)} tickets/min, ${velocity.remainingTickets} remaining`);
        }
      } catch (error) {
        logger.error('Error in sales tracking loop:', error);
      }
    }, 30000);

    logger.info('📊 Event sales tracking started');
  }

  async getEventMetrics(eventId: string) {
    const velocity = await this.calculateVelocity(eventId);
    const prediction = await this.predictSellout(eventId, velocity);
    const cache = this.velocityCache.get(eventId) || [];

    return {
      current: velocity,
      prediction,
      history: cache,
      trend: this.calculateTrend(cache),
    };
  }

  private calculateTrend(history: SalesVelocity[]): 'accelerating' | 'steady' | 'decelerating' | 'unknown' {
    if (history.length < 3) return 'unknown';
    
    const recent = history.slice(-3);
    const avgAcceleration = recent.reduce((sum, v) => sum + v.accelerationRate, 0) / recent.length;
    
    if (avgAcceleration > 0.5) return 'accelerating';
    if (avgAcceleration < -0.5) return 'decelerating';
    return 'steady';
  }
}

export const salesTracker = new EventSalesTracker();
```

### FILE: src/alerting.service.ts
```typescript
import { EventEmitter } from 'events';
import nodemailer from 'nodemailer';
import { WebClient } from '@slack/web-api';
import { logger } from './logger';

interface Alert {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  channels: ('email' | 'slack' | 'pagerduty')[];
  cooldown: number; // minutes
  lastFired?: Date;
}

export class AlertingService extends EventEmitter {
  private alerts: Map<string, Alert> = new Map();
  private emailTransporter: any;
  private slackClient: any;
  
  constructor() {
    super();
    this.setupChannels();
    this.defineAlerts();
  }

  private setupChannels() {
    // Email setup
    if (process.env.SMTP_HOST) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }

    // Slack setup
    if (process.env.SLACK_TOKEN) {
      this.slackClient = new WebClient(process.env.SLACK_TOKEN);
    }
  }

  private defineAlerts() {
    // Critical business alerts
    this.addAlert({
      id: 'high_refund_rate',
      name: 'High Refund Rate',
      condition: 'refund_rate > threshold',
      threshold: 0.1, // 10%
      severity: 'warning',
      channels: ['email', 'slack'],
      cooldown: 60
    });

    this.addAlert({
      id: 'payment_failure_spike',
      name: 'Payment Failure Spike',
      condition: 'payment_failure_rate > threshold',
      threshold: 0.2, // 20%
      severity: 'error',
      channels: ['email', 'slack', 'pagerduty'],
      cooldown: 30
    });

    this.addAlert({
      id: 'database_slow',
      name: 'Database Response Slow',
      condition: 'db_response_time_p95 > threshold',
      threshold: 1000, // 1 second
      severity: 'warning',
      channels: ['slack'],
      cooldown: 15
    });

    this.addAlert({
      id: 'api_error_rate_high',
      name: 'High API Error Rate',
      condition: 'api_error_rate > threshold',
      threshold: 0.05, // 5%
      severity: 'error',
      channels: ['email', 'slack'],
      cooldown: 30
    });

    this.addAlert({
      id: 'solana_network_issues',
      name: 'Solana Network Issues',
      condition: 'solana_error_rate > threshold',
      threshold: 0.1, // 10%
      severity: 'critical',
      channels: ['email', 'slack', 'pagerduty'],
      cooldown: 15
    });

    this.addAlert({
      id: 'queue_backup',
      name: 'Queue Backup Detected',
      condition: 'queue_size > threshold',
      threshold: 1000,
      severity: 'warning',
      channels: ['slack'],
      cooldown: 30
    });

    this.addAlert({
      id: 'revenue_drop',
      name: 'Significant Revenue Drop',
      condition: 'hourly_revenue_change < threshold',
      threshold: -0.5, // 50% drop
      severity: 'info',
      channels: ['email'],
      cooldown: 120
    });

    this.addAlert({
      id: 'concurrent_users_spike',
      name: 'Concurrent Users Spike',
      condition: 'concurrent_users > threshold',
      threshold: 10000,
      severity: 'info',
      channels: ['slack'],
      cooldown: 60
    });
  }

  private addAlert(alert: Alert) {
    this.alerts.set(alert.id, alert);
  }

  async checkAlert(alertId: string, currentValue: number): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) return;

    // Check cooldown
    if (alert.lastFired) {
      const cooldownMs = alert.cooldown * 60 * 1000;
      if (Date.now() - alert.lastFired.getTime() < cooldownMs) {
        return; // Still in cooldown
      }
    }

    // Check threshold
    let shouldFire = false;
    if (alert.condition.includes('>')) {
      shouldFire = currentValue > alert.threshold;
    } else if (alert.condition.includes('<')) {
      shouldFire = currentValue < alert.threshold;
    }

    if (shouldFire) {
      await this.fireAlert(alert, currentValue);
    }
  }

  private async fireAlert(alert: Alert, value: number): Promise<void> {
    logger.warn(`Alert fired: ${alert.name}`, { value, threshold: alert.threshold });

    const message = this.formatAlertMessage(alert, value);

    // Send to configured channels
    const promises = alert.channels.map(channel => {
      switch (channel) {
        case 'email':
          return this.sendEmail(alert, message);
        case 'slack':
          return this.sendSlack(alert, message);
        case 'pagerduty':
          return this.sendPagerDuty(alert, message);
        default:
          return Promise.resolve();
      }
    });

    await Promise.allSettled(promises);

    // Update last fired time
    alert.lastFired = new Date();
    this.emit('alert_fired', { alert, value, timestamp: new Date() });
  }

  private formatAlertMessage(alert: Alert, value: number): string {
    const emoji = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🚨',
      critical: '🔥'
    };

    return `${emoji[alert.severity]} **${alert.name}**
    
Current Value: ${value}
Threshold: ${alert.threshold}
Severity: ${alert.severity.toUpperCase()}
Time: ${new Date().toISOString()}

Please investigate immediately.`;
  }

  private async sendEmail(alert: Alert, message: string): Promise<void> {
    if (!this.emailTransporter) return;

    try {
      await this.emailTransporter.sendMail({
        from: process.env.ALERT_FROM_EMAIL || 'alerts@tickettoken.com',
        to: process.env.ALERT_TO_EMAIL || 'ops@tickettoken.com',
        subject: `[${alert.severity.toUpperCase()}] ${alert.name}`,
        text: message,
        html: message.replace(/\n/g, '<br>')
      });
    } catch (error) {
      logger.error('Failed to send email alert:', error);
    }
  }

  private async sendSlack(alert: Alert, message: string): Promise<void> {
    if (!this.slackClient) return;

    try {
      await this.slackClient.chat.postMessage({
        channel: process.env.SLACK_ALERTS_CHANNEL || '#alerts',
        text: message,
        attachments: [{
          color: alert.severity === 'critical' ? 'danger' : 
                 alert.severity === 'error' ? 'warning' : 'good',
          fields: [
            { title: 'Alert', value: alert.name, short: true },
            { title: 'Severity', value: alert.severity, short: true }
          ]
        }]
      });
    } catch (error) {
      logger.error('Failed to send Slack alert:', error);
    }
  }

  private async sendPagerDuty(alert: Alert, message: string): Promise<void> {
    // PagerDuty integration would go here
    logger.info('PagerDuty alert would be sent:', { alert: alert.name });
  }
}

export const alertingService = new AlertingService();
```

### FILE: src/ml/detectors/fraud-ml-detector.ts
```typescript
import { logger } from '../../utils/logger';
import { pgPool } from '../../utils/database';

interface FraudPattern {
  pattern: string;
  score: number;
  confidence: number;
  indicators: string[];
}

export class FraudMLDetector {
  private patterns: Map<string, number[]> = new Map();
  private suspiciousIPs: Set<string> = new Set();
  private botSignatures: Map<string, number> = new Map();

  async detectScalperPattern(data: any): Promise<FraudPattern> {
    const indicators: string[] = [];
    let score = 0;

    // Pattern 1: Rapid sequential requests
    if (data.requestsPerMinute > 60) {
      score += 30;
      indicators.push('Rapid request rate');
    }

    // Pattern 2: Multiple payment methods from same IP
    if (data.paymentMethodCount > 3) {
      score += 25;
      indicators.push('Multiple payment methods');
    }

    // Pattern 3: Bulk ticket purchases
    if (data.ticketCount > 10) {
      score += 35;
      indicators.push('Bulk purchase attempt');
    }

    // Pattern 4: Geographic anomaly
    if (data.geoDistance > 1000) { // km from usual location
      score += 20;
      indicators.push('Geographic anomaly');
    }

    // Pattern 5: Time-based pattern (purchases at exact intervals)
    if (this.detectTimePattern(data.timestamps)) {
      score += 40;
      indicators.push('Automated timing pattern');
    }

    // ML confidence based on historical accuracy
    const confidence = this.calculateConfidence(score, indicators.length);

    return {
      pattern: 'scalper',
      score: Math.min(score, 100),
      confidence,
      indicators
    };
  }

  async detectBotActivity(data: any): Promise<FraudPattern> {
    const indicators: string[] = [];
    let score = 0;

    // Bot detection features
    if (!data.userAgent || data.userAgent.includes('bot')) {
      score += 50;
      indicators.push('Bot user agent');
    }

    if (data.mouseMovements === 0) {
      score += 30;
      indicators.push('No mouse movements');
    }

    if (data.keypressInterval < 10) { // ms
      score += 25;
      indicators.push('Inhuman typing speed');
    }

    if (data.sessionDuration < 5) { // seconds
      score += 20;
      indicators.push('Extremely short session');
    }

    const confidence = this.calculateConfidence(score, indicators.length);

    return {
      pattern: 'bot',
      score: Math.min(score, 100),
      confidence,
      indicators
    };
  }

  private detectTimePattern(timestamps: number[]): boolean {
    if (timestamps.length < 3) return false;

    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    // Check if intervals are suspiciously consistent (automated)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
    
    return variance < 100; // Very consistent timing = likely automated
  }

  private calculateConfidence(score: number, indicatorCount: number): number {
    // Base confidence on score and number of indicators
    const scoreConfidence = score / 100;
    const indicatorConfidence = Math.min(indicatorCount / 5, 1);
    
    return (scoreConfidence * 0.7 + indicatorConfidence * 0.3);
  }

  async trainOnHistoricalFraud() {
    try {
      // This would normally load historical fraud data
      // For now, we'll use simulated training
      logger.info('Training fraud ML detector on historical data...');
      
      // Simulate training
      setTimeout(() => {
        logger.info('Fraud ML detector training complete');
      }, 2000);
    } catch (error) {
      logger.error('Error training fraud detector:', error);
    }
  }
}

export const fraudMLDetector = new FraudMLDetector();
```

### FILE: src/services/alert.service.ts
```typescript
import { pgPool, redisClient } from '../utils/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface Alert {
  id: string;
  rule_id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  state: 'pending' | 'firing' | 'resolved';
  service?: string;
  value?: number;
  threshold?: number;
  started_at: Date;
  resolved_at?: Date;
  acknowledged?: boolean;
  acknowledged_by?: string;
  acknowledged_at?: Date;
}

class AlertService {
  async getActiveAlerts(): Promise<Alert[]> {
    try {
      const result = await pgPool.query(
        `SELECT * FROM alerts 
         WHERE state IN ('pending', 'firing')
         ORDER BY severity, started_at DESC`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting active alerts:', error);
      throw error;
    }
  }

  async getAlert(id: string): Promise<Alert | null> {
    try {
      const result = await pgPool.query(
        'SELECT * FROM alerts WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting alert:', error);
      throw error;
    }
  }

  async acknowledgeAlert(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alerts 
         SET acknowledged = true,
             acknowledged_by = $2,
             acknowledged_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, data.acknowledged_by || 'system']
      );

      if (result.rowCount === 0) {
        throw new Error('Alert not found');
      }

      // Clear from cache
      await redisClient.del(`alert:${id}`);

      return result.rows[0];
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      throw error;
    }
  }

  async resolveAlert(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alerts 
         SET state = 'resolved',
             resolved_at = NOW(),
             resolution_note = $2
         WHERE id = $1
         RETURNING *`,
        [id, data.resolution_note || null]
      );

      if (result.rowCount === 0) {
        throw new Error('Alert not found');
      }

      // Clear from cache
      await redisClient.del(`alert:${id}`);

      return result.rows[0];
    } catch (error) {
      logger.error('Error resolving alert:', error);
      throw error;
    }
  }

  async getAlertHistory(params: any): Promise<any[]> {
    try {
      const limit = params.limit || 100;
      const offset = params.offset || 0;
      
      const result = await pgPool.query(
        `SELECT * FROM alerts 
         WHERE timestamp > NOW() - INTERVAL '30 days'
         ORDER BY started_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Error getting alert history:', error);
      throw error;
    }
  }

  async getAlertRules(): Promise<any[]> {
    try {
      const result = await pgPool.query(
        'SELECT * FROM alert_rules WHERE enabled = true ORDER BY severity, rule_name'
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting alert rules:', error);
      throw error;
    }
  }

  async createAlertRule(data: any): Promise<any> {
    try {
      const id = uuidv4();
      const result = await pgPool.query(
        `INSERT INTO alert_rules (id, rule_name, metric_name, condition, threshold, severity, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, data.rule_name, data.metric_name, data.condition, data.threshold, data.severity, true]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating alert rule:', error);
      throw error;
    }
  }

  async updateAlertRule(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alert_rules 
         SET rule_name = $2,
             metric_name = $3,
             condition = $4,
             threshold = $5,
             severity = $6,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, data.rule_name, data.metric_name, data.condition, data.threshold, data.severity]
      );

      if (result.rowCount === 0) {
        throw new Error('Alert rule not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating alert rule:', error);
      throw error;
    }
  }

  async deleteAlertRule(id: string): Promise<void> {
    try {
      await pgPool.query('DELETE FROM alert_rules WHERE id = $1', [id]);
    } catch (error) {
      logger.error('Error deleting alert rule:', error);
      throw error;
    }
  }
}

export const alertService = new AlertService();
```

### FILE: src/services/solana.service.ts
```typescript
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  sendAndConfirmTransaction,
  TransactionSignature,
  Commitment,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  createMint, 
  mintTo, 
  transfer,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { logger } from '../utils/logger';
import { db } from '../config/database';

interface MintRequest {
  ticketId: string;
  ownerAddress: string;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
    eventId: string;
    venueId: string;
    seatNumber?: string;
    eventDate: string;
  };
}

interface TransferRequest {
  tokenAddress: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
}

export class SolanaService {
  private connection: Connection;
  private metaplex: Metaplex;
  private payerKeypair: Keypair;
  private commitment: Commitment = 'confirmed';
  private maxRetries = 3;
  private retryDelay = 2000; // 2 seconds

  constructor() {
    // Initialize connection to Solana
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, this.commitment);
    
    // Load payer keypair from environment
    const payerSecret = process.env.SOLANA_PAYER_SECRET_KEY;
    if (payerSecret) {
      this.payerKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(payerSecret))
      );
    } else {
      // Generate new keypair for testing
      this.payerKeypair = Keypair.generate();
      logger.warn('Using generated keypair - fund this address:', 
        this.payerKeypair.publicKey.toString());
    }

    // Initialize Metaplex
    this.metaplex = new Metaplex(this.connection);
    this.metaplex.use(keypairIdentity(this.payerKeypair));
  }

  /**
   * Mint NFT ticket with idempotency
   */
  async mintTicketNFT(request: MintRequest): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Check if already minted (idempotency)
      const existing = await this.checkExistingMint(request.ticketId);
      if (existing) {
        logger.info(`Ticket ${request.ticketId} already minted: ${existing}`);
        return existing;
      }

      // Create NFT with Metaplex
      const { nft } = await this.metaplex.nfts().create({
        uri: request.metadata.uri,
        name: request.metadata.name,
        symbol: request.metadata.symbol,
        sellerFeeBasisPoints: 250, // 2.5% royalty
        creators: [
          {
            address: this.payerKeypair.publicKey,
            share: 100
          }
        ],
        isMutable: false, // Tickets shouldn't change
        maxSupply: 1 // Each ticket is unique
      });

      const mintAddress = nft.address.toString();
      
      // Store mint record for idempotency
      await this.storeMintRecord(request.ticketId, mintAddress, nft);

      // Transfer to buyer
      if (request.ownerAddress !== this.payerKeypair.publicKey.toString()) {
        await this.transferNFT({
          tokenAddress: mintAddress,
          fromAddress: this.payerKeypair.publicKey.toString(),
          toAddress: request.ownerAddress,
          amount: 1
        });
      }

      const duration = Date.now() - startTime;
      logger.info(`NFT minted in ${duration}ms: ${mintAddress}`);
      
      // Record metrics
      this.recordMetrics('mint', true, duration);
      
      return mintAddress;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('Mint failed:', error);
      
      // Record metrics
      this.recordMetrics('mint', false, duration, error.message);
      
      // Retry logic
      if (this.shouldRetry(error)) {
        return this.retryMint(request);
      }
      
      throw error;
    }
  }

  /**
   * Transfer NFT with retry logic
   */
  async transferNFT(request: TransferRequest): Promise<string> {
    const startTime = Date.now();
    
    try {
      const fromPubkey = new PublicKey(request.fromAddress);
      const toPubkey = new PublicKey(request.toAddress);
      const mintPubkey = new PublicKey(request.tokenAddress);

      // Get or create associated token accounts
      const fromTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        fromPubkey
      );
      
      const toTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        toPubkey
      );

      // Check if destination account exists
      const toAccountInfo = await this.connection.getAccountInfo(toTokenAccount);
      
      const transaction = new Transaction();
      
      // Create account if it doesn't exist
      if (!toAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.payerKeypair.publicKey,
            toTokenAccount,
            toPubkey,
            mintPubkey
          )
        );
      }

      // Add transfer instruction
      transaction.add(
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          fromTokenAccount,
          toTokenAccount,
          fromPubkey,
          [],
          request.amount
        )
      );

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payerKeypair],
        {
          commitment: this.commitment,
          maxRetries: this.maxRetries
        }
      );

      const duration = Date.now() - startTime;
      logger.info(`NFT transferred in ${duration}ms: ${signature}`);
      
      // Store transfer record
      await this.storeTransferRecord(request, signature);
      
      // Record metrics
      this.recordMetrics('transfer', true, duration);
      
      return signature;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('Transfer failed:', error);
      
      // Record metrics
      this.recordMetrics('transfer', false, duration, error.message);
      
      throw error;
    }
  }

  /**
   * Verify NFT ownership
   */
  async verifyOwnership(tokenAddress: string, ownerAddress: string): Promise<boolean> {
    try {
      const mintPubkey = new PublicKey(tokenAddress);
      const ownerPubkey = new PublicKey(ownerAddress);
      
      const ownerTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        ownerPubkey
      );
      
      const accountInfo = await this.connection.getTokenAccountBalance(ownerTokenAccount);
      
      return accountInfo.value.uiAmount === 1;
      
    } catch (error) {
      logger.error('Ownership verification failed:', error);
      return false;
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(signature: string): Promise<string> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      
      if (!status || !status.value) {
        return 'unknown';
      }
      
      if (status.value.err) {
        return 'failed';
      }
      
      if (status.value.confirmationStatus === 'finalized') {
        return 'finalized';
      }
      
      if (status.value.confirmationStatus === 'confirmed') {
        return 'confirmed';
      }
      
      return 'processing';
      
    } catch (error) {
      logger.error('Failed to get transaction status:', error);
      return 'error';
    }
  }

  /**
   * Check if ticket was already minted (idempotency)
   */
  private async checkExistingMint(ticketId: string): Promise<string | null> {
    try {
      const record = await db('nft_mints')
        .where({ ticket_id: ticketId, status: 'completed' })
        .first();
      
      return record?.mint_address || null;
      
    } catch (error) {
      logger.error('Failed to check existing mint:', error);
      return null;
    }
  }

  /**
   * Store mint record for idempotency
   */
  private async storeMintRecord(ticketId: string, mintAddress: string, nft: any): Promise<void> {
    await db('nft_mints').insert({
      ticket_id: ticketId,
      mint_address: mintAddress,
      metadata: JSON.stringify(nft.json),
      status: 'completed',
      created_at: new Date()
    }).onConflict('ticket_id').merge();
  }

  /**
   * Store transfer record
   */
  private async storeTransferRecord(request: TransferRequest, signature: string): Promise<void> {
    await db('nft_transfers').insert({
      token_address: request.tokenAddress,
      from_address: request.fromAddress,
      to_address: request.toAddress,
      amount: request.amount,
      signature,
      status: 'completed',
      created_at: new Date()
    });
  }

  /**
   * Check if error is retryable
   */
  private shouldRetry(error: any): boolean {
    const retryableErrors = [
      'blockhash not found',
      'node is behind',
      'timeout',
      'ECONNREFUSED',
      'ETIMEDOUT'
    ];
    
    return retryableErrors.some(msg => 
      error.message?.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * Retry mint operation
   */
  private async retryMint(request: MintRequest, attempt = 1): Promise<string> {
    if (attempt > this.maxRetries) {
      throw new Error(`Mint failed after ${this.maxRetries} attempts`);
    }
    
    logger.info(`Retrying mint attempt ${attempt}...`);
    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
    
    try {
      return await this.mintTicketNFT(request);
    } catch (error: any) {
      if (this.shouldRetry(error)) {
        return this.retryMint(request, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Record metrics for monitoring
   */
  private recordMetrics(operation: string, success: boolean, duration: number, error?: string): void {
    // This would integrate with the monitoring service from Phase 8
    if (success) {
      logger.info(`Solana ${operation} successful`, { duration });
    } else {
      logger.error(`Solana ${operation} failed`, { duration, error });
    }
  }

  /**
   * Health check for Solana connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const blockHeight = await this.connection.getBlockHeight();
      const balance = await this.connection.getBalance(this.payerKeypair.publicKey);
      
      logger.info('Solana health check:', {
        blockHeight,
        balance: balance / LAMPORTS_PER_SOL,
        address: this.payerKeypair.publicKey.toString()
      });
      
      return blockHeight > 0;
      
    } catch (error) {
      logger.error('Solana health check failed:', error);
      return false;
    }
  }
}

export const solanaService = new SolanaService();
```

### FILE: src/services/health.service.ts
```typescript
import axios from 'axios';
import { config } from '../config';
import { pgPool, redisClient, mongoClient, esClient } from '../utils/database';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services?: any;
  dependencies?: any;
  uptime?: number;
  details?: any;
}

class HealthService {
  private startTime = Date.now();

  async getOverallHealth(): Promise<HealthStatus> {
    const [services, dependencies] = await Promise.all([
      this.getAllServicesHealth(),
      this.getDependenciesHealth(),
    ]);

    const allHealthy = 
      services.every(s => s.status === 'healthy') &&
      Object.values(dependencies).every((d: any) => d.status === 'healthy');

    const anyUnhealthy = 
      services.some(s => s.status === 'unhealthy') ||
      Object.values(dependencies).some((d: any) => d.status === 'unhealthy');

    return {
      status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date(),
      uptime: Date.now() - this.startTime,
      services: services.length,
      dependencies: Object.keys(dependencies).length,
    };
  }

  async getServiceHealth(serviceName: string): Promise<any> {
    try {
      const serviceUrl = (config.services as any)[serviceName];
      if (!serviceUrl) {
        throw new Error(`Unknown service: ${serviceName}`);
      }

      const response = await axios.get(`${serviceUrl}/health`, {
        timeout: 5000,
      });

      return {
        service: serviceName,
        status: 'healthy',
        responseTime: response.headers['x-response-time'] || null,
        timestamp: new Date(),
        details: response.data,
      };
    } catch (error: any) {
      return {
        service: serviceName,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  async getAllServicesHealth(): Promise<any[]> {
    const services = Object.keys(config.services);
    const healthChecks = await Promise.allSettled(
      services.map(service => this.getServiceHealth(service))
    );

    return healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          service: services[index],
          status: 'unhealthy',
          error: result.reason.message,
          timestamp: new Date(),
        };
      }
    });
  }

  async getDependenciesHealth(): Promise<any> {
    const dependencies: any = {};

    // PostgreSQL
    try {
      await pgPool.query('SELECT 1');
      dependencies.postgresql = { status: 'healthy' };
    } catch (error: any) {
      dependencies.postgresql = { status: 'unhealthy', error: error.message };
    }

    // Redis
    try {
      await redisClient.ping();
      dependencies.redis = { status: 'healthy' };
    } catch (error: any) {
      dependencies.redis = { status: 'unhealthy', error: error.message };
    }

    // MongoDB
    try {
      await mongoClient.db().admin().ping();
      dependencies.mongodb = { status: 'healthy' };
    } catch (error: any) {
      dependencies.mongodb = { status: 'unhealthy', error: error.message };
    }

    // Elasticsearch
    try {
      await esClient.ping();
      dependencies.elasticsearch = { status: 'healthy' };
    } catch (error: any) {
      dependencies.elasticsearch = { status: 'unhealthy', error: error.message };
    }

    return dependencies;
  }
}

export const healthService = new HealthService();
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/monitoring-service//src/routes/grafana.routes.ts:15:        'SELECT DISTINCT metric_name FROM metrics ORDER BY metric_name'
backend/services/monitoring-service//src/routes/grafana.routes.ts:34:            SELECT 
backend/services/monitoring-service//src/routes/grafana.routes.ts:71:        SELECT 
backend/services/monitoring-service//src/routes/alert.routes.ts:35:  }, alertController.updateAlertRule as any);
backend/services/monitoring-service//src/server.ts:59:    // Update gauge metrics
backend/services/monitoring-service//src/streaming/kafka-consumer.ts:74:        `INSERT INTO fraud_events (user_id, pattern, risk_level, timestamp, data)
backend/services/monitoring-service//src/streaming/stream-processor.ts:33:      this.updateAggregates(window, event);
backend/services/monitoring-service//src/streaming/stream-processor.ts:43:  private updateAggregates(window: EventWindow, event: any) {
backend/services/monitoring-service//src/collectors/index.ts:59:// Update the initialize function (append to existing)
backend/services/monitoring-service//src/collectors/business/revenue.collector.ts:37:        SELECT COUNT(*) as total_venues,
backend/services/monitoring-service//src/collectors/business/revenue.collector.ts:60:        SELECT COUNT(*) as total_events,
backend/services/monitoring-service//src/collectors/business/revenue.collector.ts:76:        SELECT COUNT(*) as tickets_sold
backend/services/monitoring-service//src/collectors/application/database.collector.ts:60:          SELECT pg_database_size('tickettoken_platform') as size
backend/services/monitoring-service//src/controllers/alert.controller.ts:95:  async updateAlertRule(
backend/services/monitoring-service//src/controllers/alert.controller.ts:100:      const rule = await alertService.updateAlertRule(
backend/services/monitoring-service//src/controllers/metrics.controller.ts:13:        SELECT 
backend/services/monitoring-service//src/controllers/metrics.controller.ts:58:        SELECT DISTINCT ON (metric_name, service_name) 
backend/services/monitoring-service//src/controllers/metrics.controller.ts:79:        SELECT * FROM metrics
backend/services/monitoring-service//src/utils/database.ts:43:    await client.query('SELECT NOW()');
backend/services/monitoring-service//src/models/Alert.ts:15:  updated_at?: Date;
backend/services/monitoring-service//src/models/Alert.ts:47:  async update(id: string, data: Partial<IAlert>): Promise<IAlert | null> {
backend/services/monitoring-service//src/models/Alert.ts:50:      .update({ ...data, updated_at: new Date() })
backend/services/monitoring-service//src/models/Alert.ts:58:      .update({ resolved: true, resolved_at: new Date() });
backend/services/monitoring-service//src/models/Dashboard.ts:13:  updated_at?: Date;
backend/services/monitoring-service//src/models/Dashboard.ts:45:  async update(id: string, data: Partial<IDashboard>): Promise<IDashboard | null> {
backend/services/monitoring-service//src/models/Dashboard.ts:48:      .update({ ...data, updated_at: new Date() })
backend/services/monitoring-service//src/analytics/advanced-fraud-ml.ts:195:    return createHash('sha256').update(data).digest('hex');
backend/services/monitoring-service//src/analytics/sales-tracker.ts:66:        SELECT 
backend/services/monitoring-service//src/analytics/sales-tracker.ts:224:        SELECT 
backend/services/monitoring-service//src/analytics/sales-tracker.ts:235:        SELECT total_tickets, tickets_sold
backend/services/monitoring-service//src/analytics/sales-tracker.ts:239:      SELECT 
backend/services/monitoring-service//src/analytics/sales-tracker.ts:270:        SELECT 
backend/services/monitoring-service//src/analytics/sales-tracker.ts:324:          SELECT id, name
backend/services/monitoring-service//src/alerting.service.ts:181:    // Update last fired time
backend/services/monitoring-service//src/ml/detectors/anomaly-detector.ts:61:        SELECT metric_name, value, timestamp
backend/services/monitoring-service//src/ml/detectors/anomaly-detector.ts:260:        SELECT DISTINCT ON (metric_name) 
backend/services/monitoring-service//src/ml/detectors/anomaly-detector.ts:300:        `INSERT INTO alerts (title, description, severity, state, started_at)
backend/services/monitoring-service//src/ml/predictions/predictive-engine.ts:13:        SELECT value, timestamp
backend/services/monitoring-service//src/services/metrics.service.ts:18:        INSERT INTO metrics (metric_name, service_name, value, metric_type, labels, timestamp)
backend/services/monitoring-service//src/services/alert.service.ts:26:        `SELECT * FROM alerts 
backend/services/monitoring-service//src/services/alert.service.ts:40:        'SELECT * FROM alerts WHERE id = $1',
backend/services/monitoring-service//src/services/alert.service.ts:53:        `UPDATE alerts 
backend/services/monitoring-service//src/services/alert.service.ts:79:        `UPDATE alerts 
backend/services/monitoring-service//src/services/alert.service.ts:108:        `SELECT * FROM alerts 
backend/services/monitoring-service//src/services/alert.service.ts:125:        'SELECT * FROM alert_rules WHERE enabled = true ORDER BY severity, rule_name'
backend/services/monitoring-service//src/services/alert.service.ts:138:        `INSERT INTO alert_rules (id, rule_name, metric_name, condition, threshold, severity, enabled)
backend/services/monitoring-service//src/services/alert.service.ts:150:  async updateAlertRule(id: string, data: any): Promise<any> {
backend/services/monitoring-service//src/services/alert.service.ts:153:        `UPDATE alert_rules 
backend/services/monitoring-service//src/services/alert.service.ts:159:             updated_at = NOW()
backend/services/monitoring-service//src/services/alert.service.ts:178:      await pgPool.query('DELETE FROM alert_rules WHERE id = $1', [id]);
backend/services/monitoring-service//src/services/dashboard.service.ts:35:        `SELECT 
backend/services/monitoring-service//src/services/dashboard.service.ts:60:        `SELECT 
backend/services/monitoring-service//src/services/dashboard.service.ts:113:        `SELECT * FROM incidents 
backend/services/monitoring-service//src/services/dashboard.service.ts:132:        `SELECT 
backend/services/monitoring-service//src/services/dashboard-aggregator.service.ts:52:          await pgPool.query('SELECT 1');
backend/services/monitoring-service//src/services/health.service.ts:93:      await pgPool.query('SELECT 1');

### All JOIN operations:
backend/services/monitoring-service//src/analytics/advanced-fraud-ml.ts:128:          pattern: patterns.join(', '),
backend/services/monitoring-service//src/workers/ml-analysis.worker.ts:24:        logger.warn(`Risk factors: ${failure.riskFactors.join(', ')}`);

### All WHERE clauses:
backend/services/monitoring-service//src/routes/grafana.routes.ts:38:            WHERE metric_name = $1
backend/services/monitoring-service//src/routes/grafana.routes.ts:76:        WHERE metric_name LIKE 'fraud_%'
backend/services/monitoring-service//src/collectors/business/revenue.collector.ts:63:        WHERE created_at > NOW() - INTERVAL '30 days'
backend/services/monitoring-service//src/collectors/business/revenue.collector.ts:78:        WHERE status = 'sold'
backend/services/monitoring-service//src/controllers/metrics.controller.ts:20:        WHERE timestamp > NOW() - INTERVAL '5 minutes'
backend/services/monitoring-service//src/controllers/metrics.controller.ts:64:        WHERE timestamp > NOW() - INTERVAL '1 hour'
backend/services/monitoring-service//src/controllers/metrics.controller.ts:80:        WHERE service_name = $1
backend/services/monitoring-service//src/analytics/sales-tracker.ts:73:        WHERE created_at > NOW() - INTERVAL '30 days'
backend/services/monitoring-service//src/analytics/sales-tracker.ts:226:          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 minute') as last_minute,
backend/services/monitoring-service//src/analytics/sales-tracker.ts:227:          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '5 minutes') as last_5_minutes,
backend/services/monitoring-service//src/analytics/sales-tracker.ts:228:          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '10 minutes') as last_10_minutes,
backend/services/monitoring-service//src/analytics/sales-tracker.ts:232:        WHERE event_id = $1
backend/services/monitoring-service//src/analytics/sales-tracker.ts:237:        WHERE id = $1
backend/services/monitoring-service//src/analytics/sales-tracker.ts:275:        WHERE event_id = $1 AND created_at > NOW() - INTERVAL '10 minutes'
backend/services/monitoring-service//src/analytics/sales-tracker.ts:326:          WHERE sale_start < NOW() 
backend/services/monitoring-service//src/ml/detectors/anomaly-detector.ts:63:        WHERE timestamp > NOW() - INTERVAL '7 days'
backend/services/monitoring-service//src/ml/detectors/anomaly-detector.ts:263:        WHERE timestamp > NOW() - INTERVAL '5 minutes'
backend/services/monitoring-service//src/ml/predictions/predictive-engine.ts:15:        WHERE metric_name = $1
backend/services/monitoring-service//src/services/alert.service.ts:27:         WHERE state IN ('pending', 'firing')
backend/services/monitoring-service//src/services/alert.service.ts:40:        'SELECT * FROM alerts WHERE id = $1',
backend/services/monitoring-service//src/services/alert.service.ts:57:         WHERE id = $1
backend/services/monitoring-service//src/services/alert.service.ts:83:         WHERE id = $1
backend/services/monitoring-service//src/services/alert.service.ts:109:         WHERE timestamp > NOW() - INTERVAL '30 days'
backend/services/monitoring-service//src/services/alert.service.ts:125:        'SELECT * FROM alert_rules WHERE enabled = true ORDER BY severity, rule_name'
backend/services/monitoring-service//src/services/alert.service.ts:160:         WHERE id = $1
backend/services/monitoring-service//src/services/alert.service.ts:178:      await pgPool.query('DELETE FROM alert_rules WHERE id = $1', [id]);
backend/services/monitoring-service//src/services/dashboard.service.ts:41:         WHERE period_start >= $1
backend/services/monitoring-service//src/services/dashboard.service.ts:68:         WHERE timestamp > NOW() - INTERVAL '1 hour'
backend/services/monitoring-service//src/services/dashboard.service.ts:114:         WHERE status != 'closed'
backend/services/monitoring-service//src/services/dashboard.service.ts:137:         WHERE timestamp > NOW() - INTERVAL '5 minutes'

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import knex from 'knex';

export const db = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  pool: { min: 2, max: 10 }
});

export default db;
```
### .env.example
```
# ================================================
# MONITORING-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: monitoring-service
# Port: 3014
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=monitoring-service           # Service identifier

# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/checkers/service.checker.ts
```typescript
export class ServiceHealthChecker {
  constructor(private serviceName: string, private serviceUrl: string) {}
  
  getName(): string {
    return `ServiceHealthChecker-${this.serviceName}`;
  }
  
  async check(): Promise<any> {
    // TODO: Implement service health check
    return { status: 'healthy' };
  }
}
```

### FILE: src/alerting.service.ts
```typescript
import { EventEmitter } from 'events';
import nodemailer from 'nodemailer';
import { WebClient } from '@slack/web-api';
import { logger } from './logger';

interface Alert {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  channels: ('email' | 'slack' | 'pagerduty')[];
  cooldown: number; // minutes
  lastFired?: Date;
}

export class AlertingService extends EventEmitter {
  private alerts: Map<string, Alert> = new Map();
  private emailTransporter: any;
  private slackClient: any;
  
  constructor() {
    super();
    this.setupChannels();
    this.defineAlerts();
  }

  private setupChannels() {
    // Email setup
    if (process.env.SMTP_HOST) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }

    // Slack setup
    if (process.env.SLACK_TOKEN) {
      this.slackClient = new WebClient(process.env.SLACK_TOKEN);
    }
  }

  private defineAlerts() {
    // Critical business alerts
    this.addAlert({
      id: 'high_refund_rate',
      name: 'High Refund Rate',
      condition: 'refund_rate > threshold',
      threshold: 0.1, // 10%
      severity: 'warning',
      channels: ['email', 'slack'],
      cooldown: 60
    });

    this.addAlert({
      id: 'payment_failure_spike',
      name: 'Payment Failure Spike',
      condition: 'payment_failure_rate > threshold',
      threshold: 0.2, // 20%
      severity: 'error',
      channels: ['email', 'slack', 'pagerduty'],
      cooldown: 30
    });

    this.addAlert({
      id: 'database_slow',
      name: 'Database Response Slow',
      condition: 'db_response_time_p95 > threshold',
      threshold: 1000, // 1 second
      severity: 'warning',
      channels: ['slack'],
      cooldown: 15
    });

    this.addAlert({
      id: 'api_error_rate_high',
      name: 'High API Error Rate',
      condition: 'api_error_rate > threshold',
      threshold: 0.05, // 5%
      severity: 'error',
      channels: ['email', 'slack'],
      cooldown: 30
    });

    this.addAlert({
      id: 'solana_network_issues',
      name: 'Solana Network Issues',
      condition: 'solana_error_rate > threshold',
      threshold: 0.1, // 10%
      severity: 'critical',
      channels: ['email', 'slack', 'pagerduty'],
      cooldown: 15
    });

    this.addAlert({
      id: 'queue_backup',
      name: 'Queue Backup Detected',
      condition: 'queue_size > threshold',
      threshold: 1000,
      severity: 'warning',
      channels: ['slack'],
      cooldown: 30
    });

    this.addAlert({
      id: 'revenue_drop',
      name: 'Significant Revenue Drop',
      condition: 'hourly_revenue_change < threshold',
      threshold: -0.5, // 50% drop
      severity: 'info',
      channels: ['email'],
      cooldown: 120
    });

    this.addAlert({
      id: 'concurrent_users_spike',
      name: 'Concurrent Users Spike',
      condition: 'concurrent_users > threshold',
      threshold: 10000,
      severity: 'info',
      channels: ['slack'],
      cooldown: 60
    });
  }

  private addAlert(alert: Alert) {
    this.alerts.set(alert.id, alert);
  }

  async checkAlert(alertId: string, currentValue: number): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) return;

    // Check cooldown
    if (alert.lastFired) {
      const cooldownMs = alert.cooldown * 60 * 1000;
      if (Date.now() - alert.lastFired.getTime() < cooldownMs) {
        return; // Still in cooldown
      }
    }

    // Check threshold
    let shouldFire = false;
    if (alert.condition.includes('>')) {
      shouldFire = currentValue > alert.threshold;
    } else if (alert.condition.includes('<')) {
      shouldFire = currentValue < alert.threshold;
    }

    if (shouldFire) {
      await this.fireAlert(alert, currentValue);
    }
  }

  private async fireAlert(alert: Alert, value: number): Promise<void> {
    logger.warn(`Alert fired: ${alert.name}`, { value, threshold: alert.threshold });

    const message = this.formatAlertMessage(alert, value);

    // Send to configured channels
    const promises = alert.channels.map(channel => {
      switch (channel) {
        case 'email':
          return this.sendEmail(alert, message);
        case 'slack':
          return this.sendSlack(alert, message);
        case 'pagerduty':
          return this.sendPagerDuty(alert, message);
        default:
          return Promise.resolve();
      }
    });

    await Promise.allSettled(promises);

    // Update last fired time
    alert.lastFired = new Date();
    this.emit('alert_fired', { alert, value, timestamp: new Date() });
  }

  private formatAlertMessage(alert: Alert, value: number): string {
    const emoji = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '🚨',
      critical: '🔥'
    };

    return `${emoji[alert.severity]} **${alert.name}**
    
Current Value: ${value}
Threshold: ${alert.threshold}
Severity: ${alert.severity.toUpperCase()}
Time: ${new Date().toISOString()}

Please investigate immediately.`;
  }

  private async sendEmail(alert: Alert, message: string): Promise<void> {
    if (!this.emailTransporter) return;

    try {
      await this.emailTransporter.sendMail({
        from: process.env.ALERT_FROM_EMAIL || 'alerts@tickettoken.com',
        to: process.env.ALERT_TO_EMAIL || 'ops@tickettoken.com',
        subject: `[${alert.severity.toUpperCase()}] ${alert.name}`,
        text: message,
        html: message.replace(/\n/g, '<br>')
      });
    } catch (error) {
      logger.error('Failed to send email alert:', error);
    }
  }

  private async sendSlack(alert: Alert, message: string): Promise<void> {
    if (!this.slackClient) return;

    try {
      await this.slackClient.chat.postMessage({
        channel: process.env.SLACK_ALERTS_CHANNEL || '#alerts',
        text: message,
        attachments: [{
          color: alert.severity === 'critical' ? 'danger' : 
                 alert.severity === 'error' ? 'warning' : 'good',
          fields: [
            { title: 'Alert', value: alert.name, short: true },
            { title: 'Severity', value: alert.severity, short: true }
          ]
        }]
      });
    } catch (error) {
      logger.error('Failed to send Slack alert:', error);
    }
  }

  private async sendPagerDuty(alert: Alert, message: string): Promise<void> {
    // PagerDuty integration would go here
    logger.info('PagerDuty alert would be sent:', { alert: alert.name });
  }
}

export const alertingService = new AlertingService();
```

### FILE: src/services/metrics.service.ts
```typescript
import { pgPool } from '../utils/database';
import { logger } from '../utils/logger';
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Initialize Prometheus metrics
collectDefaultMetrics();

class MetricsService {
  async pushMetrics(data: any): Promise<void> {
    try {
      // Make sure we have a database connection
      if (!pgPool) {
        logger.error('Database not connected');
        return;
      }

      const query = `
        INSERT INTO metrics (metric_name, service_name, value, metric_type, labels, timestamp)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `;
      
      const metricName = data.metric_name || data.name || 'unknown';
      const serviceName = data.service_name || 'monitoring-service';
      const value = data.value || 0;
      const metricType = data.type || data.metric_type || 'gauge';
      const labels = data.labels || {};
      
      await pgPool.query(query, [
        metricName,
        serviceName,
        value,
        metricType,
        JSON.stringify(labels)
      ]);
      
      logger.debug(`Stored metric: ${metricName} = ${value}`);
    } catch (error) {
      // Type guard for error
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Don't log InfluxDB errors, just PostgreSQL ones
      if (!errorMessage.includes('InfluxDB') && !errorMessage.includes('unauthorized')) {
        logger.error('Error pushing metrics to PostgreSQL:', errorMessage);
      }
    }
  }

  async queryMetrics(query: string): Promise<any[]> {
    try {
      if (!pgPool) {
        logger.error('Database not connected');
        return [];
      }
      const result = await pgPool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error querying metrics:', error);
      return [];
    }
  }

  getPrometheusRegistry() {
    return register;
  }
}

export const metricsService = new MetricsService();

// Import Kafka producer
import { kafkaProducer } from '../streaming/kafka-producer';

// Add method to stream metrics to Kafka
export async function streamMetricToKafka(metric: any) {
  await kafkaProducer.sendMetric(metric);
}
```

### FILE: src/services/websocket.service.ts
```typescript
import { logger } from '../utils/logger';

class WebSocketService {
  private connections: Set<any> = new Set();

  async initialize(server: any) {
    logger.info('WebSocket service initialized (placeholder)');
    // TODO: Implement actual WebSocket support later
    // For now, this is just a placeholder to avoid errors
  }

  broadcast(data: any) {
    // Placeholder for broadcasting data
    logger.debug('Broadcasting data:', data);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}

export const websocketService = new WebSocketService();
```

### FILE: src/services/alert.service.ts
```typescript
import { pgPool, redisClient } from '../utils/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface Alert {
  id: string;
  rule_id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  state: 'pending' | 'firing' | 'resolved';
  service?: string;
  value?: number;
  threshold?: number;
  started_at: Date;
  resolved_at?: Date;
  acknowledged?: boolean;
  acknowledged_by?: string;
  acknowledged_at?: Date;
}

class AlertService {
  async getActiveAlerts(): Promise<Alert[]> {
    try {
      const result = await pgPool.query(
        `SELECT * FROM alerts 
         WHERE state IN ('pending', 'firing')
         ORDER BY severity, started_at DESC`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting active alerts:', error);
      throw error;
    }
  }

  async getAlert(id: string): Promise<Alert | null> {
    try {
      const result = await pgPool.query(
        'SELECT * FROM alerts WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting alert:', error);
      throw error;
    }
  }

  async acknowledgeAlert(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alerts 
         SET acknowledged = true,
             acknowledged_by = $2,
             acknowledged_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, data.acknowledged_by || 'system']
      );

      if (result.rowCount === 0) {
        throw new Error('Alert not found');
      }

      // Clear from cache
      await redisClient.del(`alert:${id}`);

      return result.rows[0];
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      throw error;
    }
  }

  async resolveAlert(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alerts 
         SET state = 'resolved',
             resolved_at = NOW(),
             resolution_note = $2
         WHERE id = $1
         RETURNING *`,
        [id, data.resolution_note || null]
      );

      if (result.rowCount === 0) {
        throw new Error('Alert not found');
      }

      // Clear from cache
      await redisClient.del(`alert:${id}`);

      return result.rows[0];
    } catch (error) {
      logger.error('Error resolving alert:', error);
      throw error;
    }
  }

  async getAlertHistory(params: any): Promise<any[]> {
    try {
      const limit = params.limit || 100;
      const offset = params.offset || 0;
      
      const result = await pgPool.query(
        `SELECT * FROM alerts 
         WHERE timestamp > NOW() - INTERVAL '30 days'
         ORDER BY started_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Error getting alert history:', error);
      throw error;
    }
  }

  async getAlertRules(): Promise<any[]> {
    try {
      const result = await pgPool.query(
        'SELECT * FROM alert_rules WHERE enabled = true ORDER BY severity, rule_name'
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting alert rules:', error);
      throw error;
    }
  }

  async createAlertRule(data: any): Promise<any> {
    try {
      const id = uuidv4();
      const result = await pgPool.query(
        `INSERT INTO alert_rules (id, rule_name, metric_name, condition, threshold, severity, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, data.rule_name, data.metric_name, data.condition, data.threshold, data.severity, true]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating alert rule:', error);
      throw error;
    }
  }

  async updateAlertRule(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alert_rules 
         SET rule_name = $2,
             metric_name = $3,
             condition = $4,
             threshold = $5,
             severity = $6,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, data.rule_name, data.metric_name, data.condition, data.threshold, data.severity]
      );

      if (result.rowCount === 0) {
        throw new Error('Alert rule not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating alert rule:', error);
      throw error;
    }
  }

  async deleteAlertRule(id: string): Promise<void> {
    try {
      await pgPool.query('DELETE FROM alert_rules WHERE id = $1', [id]);
    } catch (error) {
      logger.error('Error deleting alert rule:', error);
      throw error;
    }
  }
}

export const alertService = new AlertService();
```

### FILE: src/services/dashboard.service.ts
```typescript
import { pgPool } from '../utils/database';
import { healthService } from './health.service';
import { metricsService } from './metrics.service';
import { alertService } from './alert.service';
import { logger } from '../utils/logger';

class DashboardService {
  async getOverview(): Promise<any> {
    try {
      const [health, activeAlerts, recentMetrics] = await Promise.all([
        healthService.getOverallHealth(),
        alertService.getActiveAlerts(),
        this.getRecentMetrics(),
      ]);

      return {
        health,
        alerts: {
          total: activeAlerts.length,
          critical: activeAlerts.filter(a => a.severity === 'critical').length,
          warning: activeAlerts.filter(a => a.severity === 'warning').length,
        },
        metrics: recentMetrics,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting dashboard overview:', error);
      throw error;
    }
  }

  async getSLAMetrics(params: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT 
          service_name,
          AVG(uptime_percentage) as avg_uptime,
          AVG(response_time_p95) as avg_p95_latency,
          SUM(violations) as total_violations
         FROM sla_metrics
         WHERE period_start >= $1
         GROUP BY service_name`,
        [params.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)]
      );

      return {
        services: result.rows,
        period: params.period || '30d',
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting SLA metrics:', error);
      throw error;
    }
  }

  async getPerformanceMetrics(params: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT 
          service_name,
          endpoint,
          AVG(response_time_ms) as avg_response_time,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99,
          COUNT(*) as request_count
         FROM performance_metrics
         WHERE timestamp > NOW() - INTERVAL '1 hour'
         GROUP BY service_name, endpoint
         ORDER BY request_count DESC
         LIMIT 20`
      );

      return {
        endpoints: result.rows,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting performance metrics:', error);
      throw error;
    }
  }

  async getBusinessMetrics(params: any): Promise<any> {
    try {
      // This would connect to your business metrics
      // For now, returning mock data structure
      return {
        revenue: {
          today: 0,
          week: 0,
          month: 0,
        },
        tickets: {
          sold_today: 0,
          active_events: 0,
        },
        venues: {
          active: 0,
          total: 0,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting business metrics:', error);
      throw error;
    }
  }

  async getIncidents(params: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT * FROM incidents 
         WHERE status != 'closed'
         ORDER BY severity, detected_at DESC
         LIMIT 10`
      );

      return {
        incidents: result.rows,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting incidents:', error);
      throw error;
    }
  }

  private async getRecentMetrics(): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT 
          metric_name,
          service_name,
          AVG(value) as avg_value
         FROM metrics
         WHERE timestamp > NOW() - INTERVAL '5 minutes'
         GROUP BY metric_name, service_name`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting recent metrics:', error);
      throw error;
    }
  }
}

export const dashboardService = new DashboardService();
```

### FILE: src/services/solana.service.ts
```typescript
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  sendAndConfirmTransaction,
  TransactionSignature,
  Commitment,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  createMint, 
  mintTo, 
  transfer,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { logger } from '../utils/logger';
import { db } from '../config/database';

interface MintRequest {
  ticketId: string;
  ownerAddress: string;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
    eventId: string;
    venueId: string;
    seatNumber?: string;
    eventDate: string;
  };
}

interface TransferRequest {
  tokenAddress: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
}

export class SolanaService {
  private connection: Connection;
  private metaplex: Metaplex;
  private payerKeypair: Keypair;
  private commitment: Commitment = 'confirmed';
  private maxRetries = 3;
  private retryDelay = 2000; // 2 seconds

  constructor() {
    // Initialize connection to Solana
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, this.commitment);
    
    // Load payer keypair from environment
    const payerSecret = process.env.SOLANA_PAYER_SECRET_KEY;
    if (payerSecret) {
      this.payerKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(payerSecret))
      );
    } else {
      // Generate new keypair for testing
      this.payerKeypair = Keypair.generate();
      logger.warn('Using generated keypair - fund this address:', 
        this.payerKeypair.publicKey.toString());
    }

    // Initialize Metaplex
    this.metaplex = new Metaplex(this.connection);
    this.metaplex.use(keypairIdentity(this.payerKeypair));
  }

  /**
   * Mint NFT ticket with idempotency
   */
  async mintTicketNFT(request: MintRequest): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Check if already minted (idempotency)
      const existing = await this.checkExistingMint(request.ticketId);
      if (existing) {
        logger.info(`Ticket ${request.ticketId} already minted: ${existing}`);
        return existing;
      }

      // Create NFT with Metaplex
      const { nft } = await this.metaplex.nfts().create({
        uri: request.metadata.uri,
        name: request.metadata.name,
        symbol: request.metadata.symbol,
        sellerFeeBasisPoints: 250, // 2.5% royalty
        creators: [
          {
            address: this.payerKeypair.publicKey,
            share: 100
          }
        ],
        isMutable: false, // Tickets shouldn't change
        maxSupply: 1 // Each ticket is unique
      });

      const mintAddress = nft.address.toString();
      
      // Store mint record for idempotency
      await this.storeMintRecord(request.ticketId, mintAddress, nft);

      // Transfer to buyer
      if (request.ownerAddress !== this.payerKeypair.publicKey.toString()) {
        await this.transferNFT({
          tokenAddress: mintAddress,
          fromAddress: this.payerKeypair.publicKey.toString(),
          toAddress: request.ownerAddress,
          amount: 1
        });
      }

      const duration = Date.now() - startTime;
      logger.info(`NFT minted in ${duration}ms: ${mintAddress}`);
      
      // Record metrics
      this.recordMetrics('mint', true, duration);
      
      return mintAddress;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('Mint failed:', error);
      
      // Record metrics
      this.recordMetrics('mint', false, duration, error.message);
      
      // Retry logic
      if (this.shouldRetry(error)) {
        return this.retryMint(request);
      }
      
      throw error;
    }
  }

  /**
   * Transfer NFT with retry logic
   */
  async transferNFT(request: TransferRequest): Promise<string> {
    const startTime = Date.now();
    
    try {
      const fromPubkey = new PublicKey(request.fromAddress);
      const toPubkey = new PublicKey(request.toAddress);
      const mintPubkey = new PublicKey(request.tokenAddress);

      // Get or create associated token accounts
      const fromTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        fromPubkey
      );
      
      const toTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        toPubkey
      );

      // Check if destination account exists
      const toAccountInfo = await this.connection.getAccountInfo(toTokenAccount);
      
      const transaction = new Transaction();
      
      // Create account if it doesn't exist
      if (!toAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.payerKeypair.publicKey,
            toTokenAccount,
            toPubkey,
            mintPubkey
          )
        );
      }

      // Add transfer instruction
      transaction.add(
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          fromTokenAccount,
          toTokenAccount,
          fromPubkey,
          [],
          request.amount
        )
      );

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.payerKeypair],
        {
          commitment: this.commitment,
          maxRetries: this.maxRetries
        }
      );

      const duration = Date.now() - startTime;
      logger.info(`NFT transferred in ${duration}ms: ${signature}`);
      
      // Store transfer record
      await this.storeTransferRecord(request, signature);
      
      // Record metrics
      this.recordMetrics('transfer', true, duration);
      
      return signature;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('Transfer failed:', error);
      
      // Record metrics
      this.recordMetrics('transfer', false, duration, error.message);
      
      throw error;
    }
  }

  /**
   * Verify NFT ownership
   */
  async verifyOwnership(tokenAddress: string, ownerAddress: string): Promise<boolean> {
    try {
      const mintPubkey = new PublicKey(tokenAddress);
      const ownerPubkey = new PublicKey(ownerAddress);
      
      const ownerTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        ownerPubkey
      );
      
      const accountInfo = await this.connection.getTokenAccountBalance(ownerTokenAccount);
      
      return accountInfo.value.uiAmount === 1;
      
    } catch (error) {
      logger.error('Ownership verification failed:', error);
      return false;
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(signature: string): Promise<string> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      
      if (!status || !status.value) {
        return 'unknown';
      }
      
      if (status.value.err) {
        return 'failed';
      }
      
      if (status.value.confirmationStatus === 'finalized') {
        return 'finalized';
      }
      
      if (status.value.confirmationStatus === 'confirmed') {
        return 'confirmed';
      }
      
      return 'processing';
      
    } catch (error) {
      logger.error('Failed to get transaction status:', error);
      return 'error';
    }
  }

  /**
   * Check if ticket was already minted (idempotency)
   */
  private async checkExistingMint(ticketId: string): Promise<string | null> {
    try {
      const record = await db('nft_mints')
        .where({ ticket_id: ticketId, status: 'completed' })
        .first();
      
      return record?.mint_address || null;
      
    } catch (error) {
      logger.error('Failed to check existing mint:', error);
      return null;
    }
  }

  /**
   * Store mint record for idempotency
   */
  private async storeMintRecord(ticketId: string, mintAddress: string, nft: any): Promise<void> {
    await db('nft_mints').insert({
      ticket_id: ticketId,
      mint_address: mintAddress,
      metadata: JSON.stringify(nft.json),
      status: 'completed',
      created_at: new Date()
    }).onConflict('ticket_id').merge();
  }

  /**
   * Store transfer record
   */
  private async storeTransferRecord(request: TransferRequest, signature: string): Promise<void> {
    await db('nft_transfers').insert({
      token_address: request.tokenAddress,
      from_address: request.fromAddress,
      to_address: request.toAddress,
      amount: request.amount,
      signature,
      status: 'completed',
      created_at: new Date()
    });
  }

  /**
   * Check if error is retryable
   */
  private shouldRetry(error: any): boolean {
    const retryableErrors = [
      'blockhash not found',
      'node is behind',
      'timeout',
      'ECONNREFUSED',
      'ETIMEDOUT'
    ];
    
    return retryableErrors.some(msg => 
      error.message?.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * Retry mint operation
   */
  private async retryMint(request: MintRequest, attempt = 1): Promise<string> {
    if (attempt > this.maxRetries) {
      throw new Error(`Mint failed after ${this.maxRetries} attempts`);
    }
    
    logger.info(`Retrying mint attempt ${attempt}...`);
    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
    
    try {
      return await this.mintTicketNFT(request);
    } catch (error: any) {
      if (this.shouldRetry(error)) {
        return this.retryMint(request, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Record metrics for monitoring
   */
  private recordMetrics(operation: string, success: boolean, duration: number, error?: string): void {
    // This would integrate with the monitoring service from Phase 8
    if (success) {
      logger.info(`Solana ${operation} successful`, { duration });
    } else {
      logger.error(`Solana ${operation} failed`, { duration, error });
    }
  }

  /**
   * Health check for Solana connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const blockHeight = await this.connection.getBlockHeight();
      const balance = await this.connection.getBalance(this.payerKeypair.publicKey);
      
      logger.info('Solana health check:', {
        blockHeight,
        balance: balance / LAMPORTS_PER_SOL,
        address: this.payerKeypair.publicKey.toString()
      });
      
      return blockHeight > 0;
      
    } catch (error) {
      logger.error('Solana health check failed:', error);
      return false;
    }
  }
}

export const solanaService = new SolanaService();
```

### FILE: src/services/dashboard-aggregator.service.ts
```typescript
import { register } from 'prom-client';
import { healthService } from './health.service';
import { alertService } from './alert.service';
import { pgPool, redisClient } from '../utils/database';
import { logger } from '../utils/logger';

class DashboardAggregatorService {
  async getSystemStatus(): Promise<any> {
    try {
      // Get current metrics from Prometheus registry
      const metrics = await register.getMetricsAsJSON();
      
      // Extract key metrics
      const systemMetrics: any = {};
      for (const metric of metrics) {
        if (metric.name === 'system_cpu_usage_percent') {
          systemMetrics.cpu = metric.values[0]?.value || 0;
        }
        if (metric.name === 'system_memory_usage_percent') {
          systemMetrics.memory = metric.values[0]?.value || 0;
        }
        if (metric.name === 'process_resident_memory_bytes') {
          systemMetrics.processMemory = (metric.values[0]?.value || 0) / (1024 * 1024); // Convert to MB
        }
      }

      // Get service status
      const serviceMetrics: any = {};
      for (const metric of metrics) {
        if (metric.name === 'service_up') {
          for (const value of metric.values) {
            const serviceName = value.labels?.service;
            if (serviceName) {
              serviceMetrics[serviceName] = {
                up: value.value === 1,
                port: value.labels?.port || 'unknown',
              };
            }
          }
        }
      }

      // Get database status
      const databaseStatus: any = {
        postgresql: false,
        redis: false,
        mongodb: false,
      };

      try {
        if (pgPool) {
          await pgPool.query('SELECT 1');
          databaseStatus.postgresql = true;
        }
      } catch (e) {}

      try {
        if (redisClient) {
          await redisClient.ping();
          databaseStatus.redis = true;
        }
      } catch (e) {}

      // Get active alerts
      const activeAlerts = await alertService.getActiveAlerts().catch(() => []);

      return {
        timestamp: new Date(),
        system: {
          cpu: `${systemMetrics.cpu?.toFixed(1) || 0}%`,
          memory: `${systemMetrics.memory?.toFixed(1) || 0}%`,
          processMemory: `${systemMetrics.processMemory?.toFixed(1) || 0} MB`,
        },
        services: serviceMetrics,
        databases: databaseStatus,
        alerts: {
          total: activeAlerts.length,
          critical: activeAlerts.filter((a: any) => a.severity === 'critical').length,
          warning: activeAlerts.filter((a: any) => a.severity === 'warning').length,
        },
        servicesCount: {
          total: Object.keys(serviceMetrics).length,
          up: Object.values(serviceMetrics).filter((s: any) => s.up).length,
          down: Object.values(serviceMetrics).filter((s: any) => !s.up).length,
        },
      };
    } catch (error) {
      logger.error('Error aggregating dashboard data:', error);
      throw error;
    }
  }

  async getMetricsSummary(): Promise<any> {
    try {
      const metrics = await register.getMetricsAsJSON();
      const summary: any = {
        timestamp: new Date(),
        categories: {
          system: [],
          services: [],
          database: [],
          business: [],
        },
      };

      for (const metric of metrics) {
        const metricSummary = {
          name: metric.name,
          type: metric.type,
          value: metric.values[0]?.value,
          help: metric.help,
        };

        if (metric.name.startsWith('system_')) {
          summary.categories.system.push(metricSummary);
        } else if (metric.name.startsWith('service_') || metric.name.startsWith('http_')) {
          summary.categories.services.push(metricSummary);
        } else if (metric.name.includes('postgres') || metric.name.includes('redis') || metric.name.includes('mongo')) {
          summary.categories.database.push(metricSummary);
        } else if (metric.name.startsWith('business_')) {
          summary.categories.business.push(metricSummary);
        }
      }

      return summary;
    } catch (error) {
      logger.error('Error getting metrics summary:', error);
      throw error;
    }
  }
}

export const dashboardAggregatorService = new DashboardAggregatorService();
```

### FILE: src/services/health.service.ts
```typescript
import axios from 'axios';
import { config } from '../config';
import { pgPool, redisClient, mongoClient, esClient } from '../utils/database';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services?: any;
  dependencies?: any;
  uptime?: number;
  details?: any;
}

class HealthService {
  private startTime = Date.now();

  async getOverallHealth(): Promise<HealthStatus> {
    const [services, dependencies] = await Promise.all([
      this.getAllServicesHealth(),
      this.getDependenciesHealth(),
    ]);

    const allHealthy = 
      services.every(s => s.status === 'healthy') &&
      Object.values(dependencies).every((d: any) => d.status === 'healthy');

    const anyUnhealthy = 
      services.some(s => s.status === 'unhealthy') ||
      Object.values(dependencies).some((d: any) => d.status === 'unhealthy');

    return {
      status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date(),
      uptime: Date.now() - this.startTime,
      services: services.length,
      dependencies: Object.keys(dependencies).length,
    };
  }

  async getServiceHealth(serviceName: string): Promise<any> {
    try {
      const serviceUrl = (config.services as any)[serviceName];
      if (!serviceUrl) {
        throw new Error(`Unknown service: ${serviceName}`);
      }

      const response = await axios.get(`${serviceUrl}/health`, {
        timeout: 5000,
      });

      return {
        service: serviceName,
        status: 'healthy',
        responseTime: response.headers['x-response-time'] || null,
        timestamp: new Date(),
        details: response.data,
      };
    } catch (error: any) {
      return {
        service: serviceName,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  async getAllServicesHealth(): Promise<any[]> {
    const services = Object.keys(config.services);
    const healthChecks = await Promise.allSettled(
      services.map(service => this.getServiceHealth(service))
    );

    return healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          service: services[index],
          status: 'unhealthy',
          error: result.reason.message,
          timestamp: new Date(),
        };
      }
    });
  }

  async getDependenciesHealth(): Promise<any> {
    const dependencies: any = {};

    // PostgreSQL
    try {
      await pgPool.query('SELECT 1');
      dependencies.postgresql = { status: 'healthy' };
    } catch (error: any) {
      dependencies.postgresql = { status: 'unhealthy', error: error.message };
    }

    // Redis
    try {
      await redisClient.ping();
      dependencies.redis = { status: 'healthy' };
    } catch (error: any) {
      dependencies.redis = { status: 'unhealthy', error: error.message };
    }

    // MongoDB
    try {
      await mongoClient.db().admin().ping();
      dependencies.mongodb = { status: 'healthy' };
    } catch (error: any) {
      dependencies.mongodb = { status: 'unhealthy', error: error.message };
    }

    // Elasticsearch
    try {
      await esClient.ping();
      dependencies.elasticsearch = { status: 'healthy' };
    } catch (error: any) {
      dependencies.elasticsearch = { status: 'unhealthy', error: error.message };
    }

    return dependencies;
  }
}

export const healthService = new HealthService();
```

