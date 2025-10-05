# DATABASE AUDIT: monitoring-service
Generated: Thu Oct  2 15:05:55 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.1.0",
    "ml-distance": "^4.0.1",
    "ml-kmeans": "^6.0.0",
--
    "pg": "^8.16.3",
    "prom-client": "^15.1.3",
    "redis": "^5.8.2",
```

## 2. DATABASE CONFIGURATION FILES
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

### database.collector.ts
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
```

### database.ts
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
```

### database.checker.ts
```typescript
export class DatabaseHealthChecker {
  getName(): string {
    return 'DatabaseHealthChecker';
  }
  
  async check(): Promise<any> {
    // TODO: Implement database health check
    return { status: 'healthy' };
  }
}
```


## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/monitoring-service//src/routes/grafana.routes.ts:15:        'SELECT DISTINCT metric_name FROM metrics ORDER BY metric_name'
backend/services/monitoring-service//src/routes/grafana.routes.ts:37:            FROM metrics
backend/services/monitoring-service//src/routes/grafana.routes.ts:75:        FROM metrics
backend/services/monitoring-service//src/streaming/kafka-consumer.ts:74:        `INSERT INTO fraud_events (user_id, pattern, risk_level, timestamp, data)
backend/services/monitoring-service//src/collectors/business/revenue.collector.ts:39:        FROM venues
backend/services/monitoring-service//src/collectors/business/revenue.collector.ts:62:        FROM events
backend/services/monitoring-service//src/collectors/business/revenue.collector.ts:77:        FROM tickets
backend/services/monitoring-service//src/controllers/metrics.controller.ts:19:        FROM metrics
backend/services/monitoring-service//src/controllers/metrics.controller.ts:63:        FROM metrics
backend/services/monitoring-service//src/controllers/metrics.controller.ts:79:        SELECT * FROM metrics
backend/services/monitoring-service//src/analytics/sales-tracker.ts:72:        FROM ticket_sales
backend/services/monitoring-service//src/analytics/sales-tracker.ts:231:        FROM ticket_sales
backend/services/monitoring-service//src/analytics/sales-tracker.ts:236:        FROM events
backend/services/monitoring-service//src/analytics/sales-tracker.ts:243:      FROM sales_data s, event_data e
backend/services/monitoring-service//src/analytics/sales-tracker.ts:274:        FROM ticket_sales
backend/services/monitoring-service//src/analytics/sales-tracker.ts:325:          FROM events
backend/services/monitoring-service//src/ml/detectors/anomaly-detector.ts:62:        FROM metrics
backend/services/monitoring-service//src/ml/detectors/anomaly-detector.ts:262:        FROM metrics
backend/services/monitoring-service//src/ml/detectors/anomaly-detector.ts:300:        `INSERT INTO alerts (title, description, severity, state, started_at)
backend/services/monitoring-service//src/ml/predictions/predictive-engine.ts:14:        FROM metrics
backend/services/monitoring-service//src/services/metrics.service.ts:18:        INSERT INTO metrics (metric_name, service_name, value, metric_type, labels, timestamp)
backend/services/monitoring-service//src/services/alert.service.ts:26:        `SELECT * FROM alerts 
backend/services/monitoring-service//src/services/alert.service.ts:40:        'SELECT * FROM alerts WHERE id = $1',
backend/services/monitoring-service//src/services/alert.service.ts:53:        `UPDATE alerts 
backend/services/monitoring-service//src/services/alert.service.ts:79:        `UPDATE alerts 
backend/services/monitoring-service//src/services/alert.service.ts:108:        `SELECT * FROM alerts 
backend/services/monitoring-service//src/services/alert.service.ts:125:        'SELECT * FROM alert_rules WHERE enabled = true ORDER BY severity, rule_name'
backend/services/monitoring-service//src/services/alert.service.ts:138:        `INSERT INTO alert_rules (id, rule_name, metric_name, condition, threshold, severity, enabled)
backend/services/monitoring-service//src/services/alert.service.ts:153:        `UPDATE alert_rules 
backend/services/monitoring-service//src/services/alert.service.ts:178:      await pgPool.query('DELETE FROM alert_rules WHERE id = $1', [id]);
backend/services/monitoring-service//src/services/dashboard.service.ts:40:         FROM sla_metrics
backend/services/monitoring-service//src/services/dashboard.service.ts:67:         FROM performance_metrics
backend/services/monitoring-service//src/services/dashboard.service.ts:113:        `SELECT * FROM incidents 
backend/services/monitoring-service//src/services/dashboard.service.ts:136:         FROM metrics

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### service.checker.ts
First 100 lines:
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

### alerting.service.ts
First 100 lines:
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
```

### metrics.service.ts
First 100 lines:
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

### websocket.service.ts
First 100 lines:
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

### alert.service.ts
First 100 lines:
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
```

### dashboard.service.ts
First 100 lines:
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
```

### solana.service.ts
First 100 lines:
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
```

### dashboard-aggregator.service.ts
First 100 lines:
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
```

### health.service.ts
First 100 lines:
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
```


## 6. ENVIRONMENT VARIABLES
```
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
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

