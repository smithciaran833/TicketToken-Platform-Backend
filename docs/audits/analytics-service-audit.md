# DATABASE AUDIT: analytics-service
Generated: Thu Oct  2 15:05:54 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^2.5.1",
    "lodash": "^4.17.21",
    "mongodb": "^6.20.0",
    "mongoose": "^7.4.1",
    "morgan": "^1.10.0",
    "node-cron": "^3.0.2",
--
    "pg": "^8.16.3",
    "prom-client": "^15.1.3",
    "redis": "^5.8.2",
```

## 2. DATABASE CONFIGURATION FILES
### mongodb-schemas.ts
```typescript
import { Db } from 'mongodb';
import { logger } from '../utils/logger';

// Define schema validators for each collection
const schemas = {
  raw_analytics: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['venue_id', 'event_type', 'timestamp'],
      properties: {
        venue_id: {
          bsonType: 'string',
          description: 'Venue ID is required'
        },
        event_type: {
          bsonType: 'string',
          enum: [
            'ticket_purchase',
            'ticket_scan',
            'page_view',
            'cart_abandonment',
            'search_query',
            'user_action'
          ],
          description: 'Event type must be valid'
        },
        timestamp: {
          bsonType: 'date',
          description: 'Timestamp is required'
        },
        metadata: {
          bsonType: 'object',
          description: 'Additional event metadata'
        }
      }
    }
  },
  
  user_behavior: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['venue_id', 'session_id', 'timestamp'],
      properties: {
        venue_id: { bsonType: 'string' },
        session_id: { bsonType: 'string' },
        user_hash: { bsonType: 'string' },
        timestamp: { bsonType: 'date' },
        events: {
          bsonType: 'array',
          items: {
```

### mongodb.ts
```typescript
import { MongoClient, Db } from 'mongodb';
import { config } from './index';
import { logger } from '../utils/logger';

let client: MongoClient;
let db: Db;

export async function connectMongoDB() {
  try {
    const options: any = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    if (config.mongodb.user && config.mongodb.password) {
      options.auth = {
        username: config.mongodb.user,
        password: config.mongodb.password,
      };
    }

    client = new MongoClient(config.mongodb.uri, options);
    await client.connect();
    
    db = client.db();
    
    // Create indexes for analytics collections
    await createIndexes();
    
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

async function createIndexes() {
  try {
    // User behavior indexes
    await db.collection('user_behavior').createIndex({ userId: 1, timestamp: -1 });
    await db.collection('user_behavior').createIndex({ venueId: 1, timestamp: -1 });
    
    // Event analytics indexes
    await db.collection('event_analytics').createIndex({ eventId: 1, timestamp: -1 });
    await db.collection('event_analytics').createIndex({ venueId: 1, timestamp: -1 });
    
    // Application logs indexes with TTL
    await db.collection('application_logs').createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days
```

### database.ts
```typescript
import knex from 'knex';
import { config } from './index';
import { logger } from '../utils/logger';

let db: any;
let analyticsDb: any;

export async function connectDatabases() {
  try {
    // Main database connection (through PgBouncer)
    db = knex({
      client: 'postgresql',
      connection: {
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.user,
        password: config.database.password,
      },
      pool: {
        min: config.database.pool.min,
        max: config.database.pool.max,
        createTimeoutMillis: 3000,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 100,
      },
      acquireConnectionTimeout: 30000,
    });

    // Analytics database connection (direct for read replicas)
    analyticsDb = knex({
      client: 'postgresql',
      connection: {
        host: config.analyticsDatabase.host,
        port: config.analyticsDatabase.port,
        database: config.analyticsDatabase.database,
        user: config.analyticsDatabase.user,
        password: config.analyticsDatabase.password,
      },
      pool: {
        min: 2,
        max: 10,
      },
    });

    // SECURITY FIX: Set tenant context using parameterized query
    db.on('query', (query: any) => {
      if ((global as any).currentTenant) {
```


## 3. MODEL/ENTITY FILES
### backend/services/analytics-service//src/models/postgres/dashboard.model.ts
```typescript
import { BaseModel } from './base.model';
import { Dashboard } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class DashboardModel extends BaseModel {
  protected static tableName = 'analytics_dashboards';
  
  static async createDashboard(
    data: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Dashboard> {
    const dashboard = {
      id: uuidv4(),
      ...data,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    return await this.create(dashboard);
  }
  
  static async getDashboardsByVenue(
    venueId: string
  ): Promise<Dashboard[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .orWhere('is_public', true)
      .orderBy('name', 'asc');
  }
  
  static async getDashboardsForUser(
    userId: string,
    venueId: string
  ): Promise<Dashboard[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .andWhere((builder: any) => {
        builder.where('owner_id', userId)
          .orWhere('is_public', true)
          .orWhereRaw(`permissions->'sharedWith' @> '[{"userId": "${userId}"}]'`);
      })
      .orderBy('name', 'asc');
  }
  
  static async updateDashboard(
    id: string,
    data: Partial<Dashboard>
  ): Promise<Dashboard> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async duplicateDashboard(
    dashboardId: string,
    newName: string,
    userId: string
  ): Promise<Dashboard> {
    const original = await this.findById(dashboardId);
    
    if (!original) {
      throw new Error('Dashboard not found');
    }
    
    const duplicate = {
      ...original,
      id: uuidv4(),
      name: newName,
      isDefault: false,
      permissions: {
        ownerId: userId,
        public: false,
        sharedWith: []
      },
      created_at: new Date(),
      updated_at: new Date(),
      created_by: userId,
      updated_by: userId
    };
    
    delete duplicate.id;
    
    return await this.create(duplicate);
  }
  
  static async shareDashboard(
    dashboardId: string,
    shareWith: Array<{
      userId?: string;
      roleId?: string;
      permission: 'view' | 'edit' | 'admin';
    }>
  ): Promise<Dashboard> {
    const dashboard = await this.findById(dashboardId);
    
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }
    
    const permissions = dashboard.permissions;
    permissions.sharedWith = [
      ...permissions.sharedWith,
      ...shareWith
    ];
    
    return await this.update(dashboardId, { permissions });
  }
  
  static async getDefaultDashboard(
    venueId: string
  ): Promise<Dashboard | null> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .where('is_default', true)
      .first();
  }
}
```

### backend/services/analytics-service//src/models/postgres/metric.model.ts
```typescript
import { BaseModel } from './base.model';
import { Metric, MetricType, TimeGranularity } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class MetricModel extends BaseModel {
  protected static tableName = 'analytics_metrics';

  static async createMetric(data: Omit<Metric, 'id'>): Promise<Metric> {
    const metric = {
      id: uuidv4(),
      ...data,
      created_at: new Date()
    };
    return await this.create(metric);
  }

  static async getMetrics(
    venueId: string,
    metricType: MetricType,
    startDate: Date,
    endDate: Date,
    granularity?: TimeGranularity
  ): Promise<Metric[]> {
    const db = this.db();
    let query = db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .whereBetween('timestamp', [startDate, endDate])
      .orderBy('timestamp', 'asc');

    if (granularity) {
      query = query.where('granularity', granularity);
    }

    return await query;
  }

  static async aggregateMetrics(
    venueId: string,
    metricType: MetricType,
    startDate: Date,
    endDate: Date,
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count'
  ): Promise<number> {
    const db = this.db();
    
    // SECURITY FIX: Whitelist aggregation functions
    const validAggregations: Record<string, string> = {
      'sum': 'SUM',
      'avg': 'AVG',
      'min': 'MIN',
      'max': 'MAX',
      'count': 'COUNT'
    };
    
    const aggFunction = validAggregations[aggregation];
    if (!aggFunction) {
      throw new Error(`Invalid aggregation function: ${aggregation}. Must be one of: ${Object.keys(validAggregations).join(', ')}`);
    }
    
    // Now safe to use the whitelisted aggregation function
    const result = await db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .whereBetween('timestamp', [startDate, endDate])
      .select(db.raw(`${aggFunction}(value) as result`))
      .first();

    return result?.result || 0;
  }

  static async getLatestMetric(
    venueId: string,
    metricType: MetricType
  ): Promise<Metric | null> {
    const db = this.db();
    return await db(this.tableName)
      .where('venue_id', venueId)
      .where('metric_type', metricType)
      .orderBy('timestamp', 'desc')
      .first();
  }

  static async bulkInsert(metrics: Omit<Metric, 'id'>[]): Promise<void> {
    const db = this.db();
    const metricsWithIds = metrics.map(metric => ({
      id: uuidv4(),
      ...metric,
      created_at: new Date()
    }));
    await db(this.tableName).insert(metricsWithIds);
  }

  static async deleteOldMetrics(
    retentionDays: number
  ): Promise<number> {
    const db = this.db();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    return await db(this.tableName)
      .where('timestamp', '<', cutoffDate)
      .delete();
  }
}
```

### backend/services/analytics-service//src/models/postgres/aggregation.model.ts
```typescript
import { BaseModel } from './base.model';
import { MetricAggregation, TimeGranularity } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class AggregationModel extends BaseModel {
  protected static tableName = 'analytics_aggregations';
  
  static async createAggregation(
    venueId: string,
    data: MetricAggregation
  ): Promise<MetricAggregation> {
    const aggregation = {
      id: uuidv4(),
      venue_id: venueId,
      metric_type: data.metricType,
      period_start: data.period.startDate,
      period_end: data.period.endDate,
      granularity: JSON.stringify(data.granularity),
      data: JSON.stringify(data.data),
      summary: JSON.stringify(data.summary),
      created_at: new Date()
    };
    
    return await this.create(aggregation);
  }
  
  static async getAggregations(
    venueId: string,
    filters: {
      metricType?: string;
      granularity?: TimeGranularity;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<MetricAggregation[]> {
    const db = this.db();
    let query = db(this.tableName).where('venue_id', venueId);
    
    if (filters.metricType) {
      query = query.where('metric_type', filters.metricType);
    }
    
    if (filters.granularity) {
      query = query.where('granularity', JSON.stringify(filters.granularity));
    }
    
    if (filters.startDate && filters.endDate) {
      query = query.whereBetween('period_start', [
        filters.startDate,
        filters.endDate
      ]);
    }
    
    const results = await query.orderBy('period_start', 'asc');
    
    // Transform back to proper format
    return results.map((row: any) => ({
      metricType: row.metric_type,
      period: {
        startDate: row.period_start,
        endDate: row.period_end
      },
      granularity: JSON.parse(row.granularity),
      data: JSON.parse(row.data),
      summary: JSON.parse(row.summary)
    }));
  }
  
  static async upsertAggregation(
    venueId: string,
    aggregation: MetricAggregation
  ): Promise<MetricAggregation> {
    const db = this.db();
    
    const existing = await db(this.tableName)
      .where({
        venue_id: venueId,
        metric_type: aggregation.metricType,
        period_start: aggregation.period.startDate,
        period_end: aggregation.period.endDate,
        granularity: JSON.stringify(aggregation.granularity)
      })
      .first();
    
    if (existing) {
      return await this.update(existing.id, {
        data: JSON.stringify(aggregation.data),
        summary: JSON.stringify(aggregation.summary),
        updated_at: new Date()
      });
    } else {
      return await this.createAggregation(venueId, aggregation);
    }
  }
  
  static async getHourlyAggregations(
    venueId: string,
    date: Date
  ): Promise<MetricAggregation[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return await this.getAggregations(venueId, {
      granularity: { unit: 'hour', value: 1 },
      startDate: startOfDay,
      endDate: endOfDay
    });
  }
  
  static async getDailyAggregations(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<MetricAggregation[]> {
    return await this.getAggregations(venueId, {
      granularity: { unit: 'day', value: 1 },
      startDate,
      endDate
    });
  }
}
```

### backend/services/analytics-service//src/models/postgres/widget.model.ts
```typescript
import { BaseModel } from './base.model';
import { WidgetConfig, WidgetData } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class WidgetModel extends BaseModel {
  protected static tableName = 'analytics_widgets';
  
  static async createWidget(
    data: Omit<WidgetConfig, 'id'>
  ): Promise<WidgetConfig> {
    const widget = {
      id: uuidv4(),
      ...data,
      created_at: new Date()
    };
    
    return await this.create(widget);
  }
  
  static async getWidgetsByDashboard(
    dashboardId: string
  ): Promise<WidgetConfig[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('dashboard_id', dashboardId)
      .orderBy('position_y', 'asc')
      .orderBy('position_x', 'asc');
  }
  
  static async updateWidget(
    id: string,
    data: Partial<WidgetConfig>
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async updateWidgetPosition(
    id: string,
    position: { x: number; y: number }
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      position,
      updated_at: new Date()
    });
  }
  
  static async updateWidgetSize(
    id: string,
    size: { width: number; height: number }
  ): Promise<WidgetConfig> {
    return await this.update(id, {
      size,
      updated_at: new Date()
    });
  }
  
  static async duplicateWidget(
    widgetId: string
  ): Promise<WidgetConfig> {
    const original = await this.findById(widgetId);
    
    if (!original) {
      throw new Error('Widget not found');
    }
    
    const duplicate = {
      ...original,
      id: uuidv4(),
      title: `${original.title} (Copy)`,
      position: {
        x: original.position.x + 1,
        y: original.position.y + 1
      },
      created_at: new Date()
    };
    
    delete duplicate.id;
    
    return await this.create(duplicate);
  }
  
  static async getWidgetData(
    widgetId: string,
    limit: number = 1
  ): Promise<WidgetData[]> {
    const db = this.db();
    
    return await db('analytics_widget_data')
      .where('widget_id', widgetId)
      .orderBy('timestamp', 'desc')
      .limit(limit);
  }
  
  static async saveWidgetData(
    widgetId: string,
    data: any
  ): Promise<void> {
    const db = this.db();
    
    await db('analytics_widget_data').insert({
      id: uuidv4(),
      widget_id: widgetId,
      data,
      timestamp: new Date()
    });
  }
}
```

### backend/services/analytics-service//src/models/postgres/alert.model.ts
```typescript
import { BaseModel } from './base.model';
import { Alert, AlertInstance, AlertStatus } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class AlertModel extends BaseModel {
  protected static tableName = 'analytics_alerts';
  
  static async createAlert(
    data: Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Alert> {
    const alert = {
      id: uuidv4(),
      ...data,
      trigger_count: 0,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    return await this.create(alert);
  }
  
  static async getAlertsByVenue(
    venueId: string,
    enabled?: boolean
  ): Promise<Alert[]> {
    const db = this.db();
    let query = db(this.tableName).where('venue_id', venueId);
    
    if (enabled !== undefined) {
      query = query.where('enabled', enabled);
    }
    
    return await query.orderBy('severity', 'desc');
  }
  
  static async updateAlert(
    id: string,
    data: Partial<Alert>
  ): Promise<Alert> {
    return await this.update(id, {
      ...data,
      updated_at: new Date()
    });
  }
  
  static async toggleAlert(
    id: string,
    enabled: boolean
  ): Promise<Alert> {
    return await this.updateAlert(id, { enabled });
  }
  
  static async incrementTriggerCount(
    id: string
  ): Promise<void> {
    const db = this.db();
    
    await db(this.tableName)
      .where('id', id)
      .increment('trigger_count', 1)
      .update({
        last_triggered: new Date(),
        status: AlertStatus.TRIGGERED
      });
  }
  
  static async createAlertInstance(
    data: Omit<AlertInstance, 'id'>
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const instance = {
      id: uuidv4(),
      ...data,
      status: 'active'
    };
    
    const [result] = await db('analytics_alert_instances')
      .insert(instance)
      .returning('*');
    
    return result;
  }
  
  static async getAlertInstances(
    alertId: string,
    limit: number = 50
  ): Promise<AlertInstance[]> {
    const db = this.db();
    
    return await db('analytics_alert_instances')
      .where('alert_id', alertId)
      .orderBy('triggered_at', 'desc')
      .limit(limit);
  }
  
  static async acknowledgeAlertInstance(
    instanceId: string,
    userId: string,
    notes?: string
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const [result] = await db('analytics_alert_instances')
      .where('id', instanceId)
      .update({
        status: 'acknowledged',
        acknowledged_by: userId,
        notes,
        updated_at: new Date()
      })
      .returning('*');
    
    return result;
  }
  
  static async resolveAlertInstance(
    instanceId: string
  ): Promise<AlertInstance> {
    const db = this.db();
    
    const [result] = await db('analytics_alert_instances')
      .where('id', instanceId)
      .update({
        status: 'resolved',
        resolved_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    return result;
  }
}
```

### backend/services/analytics-service//src/models/postgres/base.model.ts
```typescript
import { getDb } from '../../config/database';
import { logger } from '../../utils/logger';

export abstract class BaseModel {
  protected static tableName: string;
  protected static db = getDb;
  
  protected static async query(sql: string, params?: any[]): Promise<any> {
    try {
      const db = this.db();
      return await db.raw(sql, params);
    } catch (error) {
      logger.error(`Query error in ${this.tableName}:`, error);
      throw error;
    }
  }
  
  protected static async transaction<T>(
    callback: (trx: any) => Promise<T>
  ): Promise<T> {
    const db = this.db();
    return await db.transaction(callback);
  }
  
  static async findById(id: string): Promise<any> {
    const db = this.db();
    const result = await db(this.tableName)
      .where('id', id)
      .first();
    return result;
  }
  
  static async findAll(
    filters: Record<string, any> = {},
    options: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      order?: 'asc' | 'desc';
    } = {}
  ): Promise<any[]> {
    const db = this.db();
    let query = db(this.tableName).where(filters);
    
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.offset) {
      query = query.offset(options.offset);
    }
    
    if (options.orderBy) {
      query = query.orderBy(options.orderBy, options.order || 'asc');
    }
    
    return await query;
  }
  
  static async create(data: Record<string, any>): Promise<any> {
    const db = this.db();
    const [result] = await db(this.tableName)
      .insert(data)
      .returning('*');
    return result;
  }
  
  static async update(
    id: string,
    data: Record<string, any>
  ): Promise<any> {
    const db = this.db();
    const [result] = await db(this.tableName)
      .where('id', id)
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');
    return result;
  }
  
  static async delete(id: string): Promise<boolean> {
    const db = this.db();
    const result = await db(this.tableName)
      .where('id', id)
      .delete();
    return result > 0;
  }
}
```

### backend/services/analytics-service//src/models/postgres/export.model.ts
```typescript
import { BaseModel } from './base.model';
import { ExportRequest, ExportStatus } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class ExportModel extends BaseModel {
  protected static tableName = 'analytics_exports';
  
  static async createExport(
    data: Omit<ExportRequest, 'id' | 'createdAt'>
  ): Promise<ExportRequest> {
    const exportRequest = {
      id: uuidv4(),
      ...data,
      status: ExportStatus.PENDING,
      progress: 0,
      created_at: new Date()
    };
    
    return await this.create(exportRequest);
  }
  
  static async getExportsByVenue(
    venueId: string,
    limit: number = 50
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('venue_id', venueId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }
  
  static async getExportsByUser(
    userId: string,
    venueId: string,
    limit: number = 50
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('user_id', userId)
      .where('venue_id', venueId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }
  
  static async updateExportStatus(
    id: string,
    status: ExportStatus,
    data?: {
      progress?: number;
      fileUrl?: string;
      fileSize?: number;
      error?: string;
      completedAt?: Date;
    }
  ): Promise<ExportRequest> {
    return await this.update(id, {
      status,
      ...data,
      updated_at: new Date()
    });
  }
  
  static async updateProgress(
    id: string,
    progress: number
  ): Promise<void> {
    const db = this.db();
    
    await db(this.tableName)
      .where('id', id)
      .update({
        progress,
        updated_at: new Date()
      });
  }
  
  static async getPendingExports(
    limit: number = 10
  ): Promise<ExportRequest[]> {
    const db = this.db();
    
    return await db(this.tableName)
      .where('status', ExportStatus.PENDING)
      .orderBy('created_at', 'asc')
      .limit(limit);
  }
  
  static async cleanupExpiredExports(
    expirationDays: number = 7
  ): Promise<number> {
    const db = this.db();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - expirationDays);
    
    return await db(this.tableName)
      .where('status', ExportStatus.COMPLETED)
      .where('created_at', '<', cutoffDate)
      .delete();
  }
}
```

### backend/services/analytics-service//src/models/redis/session.model.ts
```typescript
import { getRedis } from '../../config/redis';
import { v4 as uuidv4 } from 'uuid';

export interface AnalyticsSession {
  sessionId: string;
  userId: string;
  venueId: string;
  startTime: Date;
  lastActivity: Date;
  pageViews: number;
  events: Array<{
    type: string;
    timestamp: Date;
    data?: any;
  }>;
  metadata?: Record<string, any>;
}

export class SessionModel {
  private static redis = getRedis;
  private static SESSION_TTL = 1800; // 30 minutes
  
  static async createSession(
    userId: string,
    venueId: string,
    metadata?: Record<string, any>
  ): Promise<AnalyticsSession> {
    const redis = this.redis();
    const sessionId = uuidv4();
    const key = `session:${sessionId}`;
    
    const session: AnalyticsSession = {
      sessionId,
      userId,
      venueId,
      startTime: new Date(),
      lastActivity: new Date(),
      pageViews: 0,
      events: [],
      metadata
    };
    
    await redis.set(key, JSON.stringify(session));
    await redis.expire(key, this.SESSION_TTL);
    
    // Add to user's active sessions
    await redis.sadd(`user:sessions:${userId}`, sessionId);
    await redis.expire(`user:sessions:${userId}`, this.SESSION_TTL);
    
    return session;
  }
  
  static async getSession(
    sessionId: string
  ): Promise<AnalyticsSession | null> {
    const redis = this.redis();
    const key = `session:${sessionId}`;
    const data = await redis.get(key);
    
    return data ? JSON.parse(data) : null;
  }
  
  static async updateSession(
    sessionId: string,
    updates: Partial<AnalyticsSession>
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    const redis = this.redis();
    const key = `session:${sessionId}`;
    
    const updated = {
      ...session,
      ...updates,
      lastActivity: new Date()
    };
    
    await redis.set(key, JSON.stringify(updated));
    await redis.expire(key, this.SESSION_TTL);
  }
  
  static async trackEvent(
    sessionId: string,
    eventType: string,
    eventData?: any
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    session.events.push({
      type: eventType,
      timestamp: new Date(),
      data: eventData
    });
    
    await this.updateSession(sessionId, {
      events: session.events,
      pageViews: eventType === 'page_view' ? session.pageViews + 1 : session.pageViews
    });
  }
  
  static async getUserSessions(
    userId: string
  ): Promise<string[]> {
    const redis = this.redis();
    return await redis.smembers(`user:sessions:${userId}`);
  }
  
  static async getActiveSessions(
    venueId: string
  ): Promise<number> {
    const redis = this.redis();
    const pattern = `session:*`;
    const keys = await redis.keys(pattern);
    
    let activeCount = 0;
    
    for (const key of keys) {
      const sessionData = await redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        if (session.venueId === venueId) {
          activeCount++;
        }
      }
    }
    
    return activeCount;
  }
  
  static async endSession(
    sessionId: string
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      return;
    }
    
    const redis = this.redis();
    
    // Remove from active sessions
    await redis.srem(`user:sessions:${session.userId}`, sessionId);
    
    // Store session summary for analytics
    const summaryKey = `session:summary:${sessionId}`;
    const summary = {
      sessionId,
      userId: session.userId,
      venueId: session.venueId,
      startTime: session.startTime,
      endTime: new Date(),
      duration: new Date().getTime() - new Date(session.startTime).getTime(),
      pageViews: session.pageViews,
      eventCount: session.events.length
    };
    
    await redis.set(summaryKey, JSON.stringify(summary));
    await redis.expire(summaryKey, 86400); // Keep for 24 hours
    
    // Delete session
    await redis.del(`session:${sessionId}`);
  }
  
  static async getSessionMetrics(
    venueId: string
  ): Promise<any> {
    const redis = this.redis();
    const pattern = `session:summary:*`;
    const keys = await redis.keys(pattern);
    
    const metrics = {
      totalSessions: 0,
      averageDuration: 0,
      averagePageViews: 0,
      totalDuration: 0
    };
    
    for (const key of keys) {
      const summaryData = await redis.get(key);
      if (summaryData) {
        const summary = JSON.parse(summaryData);
        if (summary.venueId === venueId) {
          metrics.totalSessions++;
          metrics.totalDuration += summary.duration;
          metrics.averagePageViews += summary.pageViews;
        }
      }
    }
    
    if (metrics.totalSessions > 0) {
      metrics.averageDuration = metrics.totalDuration / metrics.totalSessions;
      metrics.averagePageViews = metrics.averagePageViews / metrics.totalSessions;
    }
    
    return metrics;
  }
}
```

### backend/services/analytics-service//src/models/redis/cache.model.ts
```typescript
import { getRedis } from '../../config/redis';
import { CONSTANTS } from '../../config/constants';

export class CacheModel {
  private static redis = getRedis;
  
  static async get<T>(key: string): Promise<T | null> {
    const redis = this.redis();
    const value = await redis.get(key);
    
    if (value) {
      try {
        return JSON.parse(value);
      } catch {
        return value as any;
      }
    }
    
    return null;
  }
  
  static async set(
    key: string,
    value: any,
    ttl?: number
  ): Promise<void> {
    const redis = this.redis();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (ttl) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }
  }
  
  static async delete(key: string): Promise<void> {
    const redis = this.redis();
    await redis.del(key);
  }
  
  static async deletePattern(pattern: string): Promise<number> {
    const redis = this.redis();
    const keys = await redis.keys(pattern);
    
    if (keys.length > 0) {
      return await redis.del(...keys);
    }
    
    return 0;
  }
  
  static async exists(key: string): Promise<boolean> {
    const redis = this.redis();
    return (await redis.exists(key)) === 1;
  }
  
  static async expire(key: string, ttl: number): Promise<void> {
    const redis = this.redis();
    await redis.expire(key, ttl);
  }
  
  static async increment(key: string, by: number = 1): Promise<number> {
    const redis = this.redis();
    return await redis.incrby(key, by);
  }
  
  static async decrement(key: string, by: number = 1): Promise<number> {
    const redis = this.redis();
    return await redis.decrby(key, by);
  }
  
  // Cache helpers for specific data types
  static getCacheKey(type: string, ...parts: string[]): string {
    return `analytics:${type}:${parts.join(':')}`;
  }
  
  static async cacheMetric(
    venueId: string,
    metricType: string,
    value: any,
    ttl: number = CONSTANTS.CACHE_TTL.METRICS
  ): Promise<void> {
    const key = this.getCacheKey('metric', venueId, metricType);
    await this.set(key, value, ttl);
  }
  
  static async getCachedMetric<T>(
    venueId: string,
    metricType: string
  ): Promise<T | null> {
    const key = this.getCacheKey('metric', venueId, metricType);
    return await this.get<T>(key);
  }
  
  static async cacheWidget(
    widgetId: string,
    data: any,
    ttl: number = CONSTANTS.CACHE_TTL.DASHBOARD
  ): Promise<void> {
    const key = this.getCacheKey('widget', widgetId);
    await this.set(key, data, ttl);
  }
  
  static async getCachedWidget<T>(
    widgetId: string
  ): Promise<T | null> {
    const key = this.getCacheKey('widget', widgetId);
    return await this.get<T>(key);
  }
  
  static async invalidateVenueCache(venueId: string): Promise<void> {
    const pattern = this.getCacheKey('*', venueId, '*');
    await this.deletePattern(pattern);
  }
}
```

### backend/services/analytics-service//src/models/redis/realtime.model.ts
```typescript
import { getRedis, getPubClient, getSubClient } from '../../config/redis';
import { RealTimeMetric } from '../../types';

export class RealtimeModel {
  private static redis = getRedis;
  private static pub = getPubClient;
  private static sub = getSubClient;
  
  static async updateRealTimeMetric(
    venueId: string,
    metricType: string,
    value: number
  ): Promise<void> {
    const redis = this.redis();
    const key = `realtime:${venueId}:${metricType}`;
    
    // Get previous value
    const previousValue = await redis.get(key);
    const prev = previousValue ? parseFloat(previousValue) : 0;
    
    // Update current value
    await redis.set(key, value.toString());
    await redis.expire(key, 300); // 5 minutes TTL
    
    // Calculate change
    const change = value - prev;
    const changePercent = prev > 0 ? ((change / prev) * 100) : 0;
    
    // Create metric object
    const metric: RealTimeMetric = {
      metricType: metricType as any,
      currentValue: value,
      previousValue: prev,
      change,
      changePercent,
      trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
      lastUpdated: new Date()
    };
    
    // Publish update
    await this.publishMetricUpdate(venueId, metricType, metric);
  }
  
  static async getRealTimeMetric(
    venueId: string,
    metricType: string
  ): Promise<RealTimeMetric | null> {
    const redis = this.redis();
    const key = `realtime:${venueId}:${metricType}`;
    const dataKey = `realtime:data:${venueId}:${metricType}`;
    
    const value = await redis.get(key);
    const data = await redis.get(dataKey);
    
    if (value && data) {
      return JSON.parse(data);
    }
    
    return null;
  }
  
  static async incrementCounter(
    venueId: string,
    counterType: string,
    by: number = 1
  ): Promise<number> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    const value = await redis.incrby(key, by);
    
    // Update real-time metric
    await this.updateRealTimeMetric(venueId, counterType, value);
    
    return value;
  }
  
  static async getCounter(
    venueId: string,
    counterType: string
  ): Promise<number> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    const value = await redis.get(key);
    
    return value ? parseInt(value) : 0;
  }
  
  static async resetCounter(
    venueId: string,
    counterType: string
  ): Promise<void> {
    const redis = this.redis();
    const key = `counter:${venueId}:${counterType}`;
    await redis.set(key, '0');
  }
  
  static async publishMetricUpdate(
    venueId: string,
    metricType: string,
    data: any
  ): Promise<void> {
    const pub = this.pub();
    const channel = `metrics:${venueId}:${metricType}`;
    const dataKey = `realtime:data:${venueId}:${metricType}`;
    
    // Store data for future requests
    const redis = this.redis();
    await redis.set(dataKey, JSON.stringify(data));
    await redis.expire(dataKey, 300);
    
    // Publish to subscribers
    await pub.publish(channel, JSON.stringify(data));
  }
  
  static async subscribeToMetric(
    venueId: string,
    metricType: string,
    callback: (data: any) => void
  ): Promise<void> {
    const sub = this.sub();
    const channel = `metrics:${venueId}:${metricType}`;
    
    await sub.subscribe(channel);
    
    sub.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          console.error('Error parsing metric update:', error);
        }
      }
    });
  }
  
  static async unsubscribeFromMetric(
    venueId: string,
    metricType: string
  ): Promise<void> {
    const sub = this.sub();
    const channel = `metrics:${venueId}:${metricType}`;
    await sub.unsubscribe(channel);
  }
  
  static async setGauge(
    venueId: string,
    gaugeName: string,
    value: number,
    max: number
  ): Promise<void> {
    const redis = this.redis();
    const key = `gauge:${venueId}:${gaugeName}`;
    
    const data = {
      current: value,
      max,
      percentage: (value / max) * 100,
      timestamp: new Date()
    };
    
    await redis.set(key, JSON.stringify(data));
    await redis.expire(key, 300);
    
    // Publish update
    await this.publishMetricUpdate(venueId, `gauge:${gaugeName}`, data);
  }
  
  static async getGauge(
    venueId: string,
    gaugeName: string
  ): Promise<any | null> {
    const redis = this.redis();
    const key = `gauge:${venueId}:${gaugeName}`;
    const value = await redis.get(key);
    
    return value ? JSON.parse(value) : null;
  }
}
```


## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:142:        FROM tickets t
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:143:        JOIN events e ON t.event_id = e.id
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:156:        FROM customer_metrics
backend/services/analytics-service//src/analytics-engine/calculators/customer-analytics.ts:161:      FROM rfm_scores
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:11:        EXTRACT(DOW FROM date) as day_of_week,
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:12:        EXTRACT(MONTH FROM date) as month,
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:16:      FROM venue_analytics
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:65:          EXTRACT(MONTH FROM date) as month,
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:66:          EXTRACT(YEAR FROM date) as year,
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:70:        FROM venue_analytics
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:73:        GROUP BY EXTRACT(MONTH FROM date), EXTRACT(YEAR FROM date)
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:81:      FROM monthly_stats
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:108:        FROM venue_analytics
backend/services/analytics-service//src/analytics-engine/calculators/predictive-analytics.ts:114:      SELECT * FROM price_bands

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### realtime-aggregation.service.ts
First 100 lines:
```typescript
import { getRedis } from '../config/redis';
import { getAnalyticsDb } from '../config/database';
import { logger } from '../utils/logger';
import { emitMetricUpdate, emitAlert } from '../config/websocket';

interface AggregationWindow {
  interval: number; // in seconds
  retention: number; // in seconds
}

export class RealtimeAggregationService {
  private redis = getRedis();
  private analyticsDb = getAnalyticsDb();
  private intervalHandles: NodeJS.Timeout[] = [];
  
  private aggregationWindows: Record<string, AggregationWindow> = {
    '1min': { interval: 60, retention: 3600 },      // 1 hour retention
    '5min': { interval: 300, retention: 86400 },    // 24 hour retention
    '1hour': { interval: 3600, retention: 604800 }, // 7 day retention
  };

  async startAggregationPipeline() {
    logger.info('Starting real-time aggregation pipeline');

    // Set up aggregation intervals
    this.setupAggregationIntervals();

    // Set up alert monitoring
    this.setupAlertMonitoring();
  }

  private setupAggregationIntervals() {
    // Use the configuration to set up intervals
    if (this.aggregationWindows['1min']) {
      const interval = setInterval(
        () => this.aggregate1Minute(), 
        this.aggregationWindows['1min'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started 1-minute aggregation (interval: ${this.aggregationWindows['1min'].interval}s)`);
    }

    if (this.aggregationWindows['5min']) {
      const interval = setInterval(
        () => this.aggregate5Minutes(), 
        this.aggregationWindows['5min'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started 5-minute aggregation (interval: ${this.aggregationWindows['5min'].interval}s)`);
    }

    if (this.aggregationWindows['1hour']) {
      const interval = setInterval(
        () => this.aggregateHourly(), 
        this.aggregationWindows['1hour'].interval * 1000
      );
      this.intervalHandles.push(interval);
      logger.info(`Started hourly aggregation (interval: ${this.aggregationWindows['1hour'].interval}s)`);
    }
  }

  // Method to stop all intervals (useful for cleanup)
  stopAggregationPipeline() {
    this.intervalHandles.forEach(handle => clearInterval(handle));
    this.intervalHandles = [];
    logger.info('Stopped aggregation pipeline');
  }

  private async aggregate1Minute() {
    try {
      const venues = await this.getActiveVenues();
      const retention = this.aggregationWindows['1min'].retention;

      for (const venueId of venues) {
        const metrics = await this.calculate1MinuteMetrics(venueId);

        // Store in real-time metrics table with configured retention
        await this.analyticsDb('realtime_metrics')
          .insert({
            venue_id: venueId,
            metric_type: '1min_summary',
            metric_value: metrics,
            expires_at: new Date(Date.now() + retention * 1000)
          })
          .onConflict(['venue_id', 'metric_type'])
          .merge();

        // Emit to WebSocket
        emitMetricUpdate(venueId, 'realtime-summary', metrics);

        // Check for alerts
        await this.checkAlertConditions(venueId, metrics);
      }
    } catch (error) {
      logger.error('Failed to run 1-minute aggregation', error);
    }
  }

  private async calculate1MinuteMetrics(venueId: string) {
    const now = new Date();
```

### metrics.service.ts
First 100 lines:
```typescript
import { MetricModel } from '../models';
import { RealtimeModel, CacheModel } from '../models';
import { 
  Metric, 
  MetricType, 
  RealTimeMetric, 
  TimeGranularity,
  DateRange 
} from '../types';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../config/constants';

export class MetricsService {
  private static instance: MetricsService;
  private log = logger.child({ component: 'MetricsService' });

  static getInstance(): MetricsService {
    if (!this.instance) {
      this.instance = new MetricsService();
    }
    return this.instance;
  }

  async recordMetric(
    venueId: string,
    metricType: MetricType,
    value: number,
    dimensions?: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<Metric> {
    try {
      // Create metric
      const metric = await MetricModel.createMetric({
        venueId,
        metricType,
        value,
        timestamp: new Date(),
        granularity: { unit: 'minute', value: 1 },
        dimensions,
        metadata
      });

      // Update real-time counter
      await RealtimeModel.updateRealTimeMetric(venueId, metricType, value);

      // Invalidate cache
      await CacheModel.invalidateVenueCache(venueId);

      this.log.debug('Metric recorded', {
        venueId,
        metricType,
        value
      });

      return metric;
    } catch (error) {
      this.log.error('Failed to record metric', { error, venueId, metricType });
      throw error;
    }
  }

  async getMetrics(
    venueId: string,
    metricType: MetricType,
    dateRange: DateRange,
    granularity?: TimeGranularity
  ): Promise<Metric[]> {
    try {
      // Check cache first
      const cacheKey = CacheModel.getCacheKey(
        'metrics',
        venueId,
        metricType,
        dateRange.startDate.toISOString(),
        dateRange.endDate.toISOString()
      );
      
      const cached = await CacheModel.get<Metric[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get from database
      const metrics = await MetricModel.getMetrics(
        venueId,
        metricType,
        dateRange.startDate,
        dateRange.endDate,
        granularity
      );

      // Cache results
      await CacheModel.set(cacheKey, metrics, CONSTANTS.CACHE_TTL.METRICS);

      return metrics;
    } catch (error) {
      this.log.error('Failed to get metrics', { error, venueId, metricType });
      throw error;
    }
  }
```

### attribution.service.ts
First 100 lines:
```typescript
import { CampaignSchema } from '../models';
import {
  MarketingAttribution,
  AttributionPath,
  TouchPoint,
} from '../types';
import { logger } from '../utils/logger';
import { CacheModel } from '../models';
import { CONSTANTS } from '../config/constants';

export class AttributionService {
  private static instance: AttributionService;
  private log = logger.child({ component: 'AttributionService' });

  static getInstance(): AttributionService {
    if (!this.instance) {
      this.instance = new AttributionService();
    }
    return this.instance;
  }

  async trackTouchpoint(
    venueId: string,
    customerId: string,
    touchpoint: TouchPoint
  ): Promise<void> {
    try {
      await CampaignSchema.trackTouchpoint({
        ...touchpoint,
        venueId,
        customerId
      } as any);

      this.log.debug('Touchpoint tracked', {
        venueId,
        customerId,
        channel: touchpoint.channel
      });
    } catch (error) {
      this.log.error('Failed to track touchpoint', { error, venueId });
      throw error;
    }
  }

  async getCustomerJourney(
    venueId: string,
    customerId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TouchPoint[]> {
    try {
      return await CampaignSchema.getCustomerTouchpoints(
        venueId,
        customerId,
        startDate,
        endDate
      );
    } catch (error) {
      this.log.error('Failed to get customer journey', { error, venueId });
      throw error;
    }
  }

  async calculateAttribution(
    venueId: string,
    conversionId: string,
    revenue: number,
    model: 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'data_driven' = 'last_touch'
  ): Promise<AttributionPath> {
    try {
      // Get all touchpoints for this conversion
      const touchpoints = await this.getConversionTouchpoints(venueId, conversionId);

      if (touchpoints.length === 0) {
        throw new Error('No touchpoints found for conversion');
      }

      const attribution = this.applyAttributionModel(touchpoints, revenue, model);

      const path: AttributionPath = {
        customerId: touchpoints[0].customerId || '',
        conversionId,
        revenue,
        touchpoints,
        attribution
      };

      // Cache attribution result
      const cacheKey = CacheModel.getCacheKey('attribution', venueId, conversionId);
      await CacheModel.set(cacheKey, path, CONSTANTS.CACHE_TTL.INSIGHTS);

      return path;
    } catch (error) {
      this.log.error('Failed to calculate attribution', { error, venueId });
      throw error;
    }
  }

  private applyAttributionModel(
    touchpoints: TouchPoint[],
```

### websocket.service.ts
First 100 lines:
```typescript
import { getIO, emitMetricUpdate, emitWidgetUpdate } from '../config/websocket';
import { RealTimeMetric, WidgetData } from '../types';
import { logger } from '../utils/logger';
import { RealtimeModel } from '../models';

export class WebSocketService {
  private static instance: WebSocketService;
  private log = logger.child({ component: 'WebSocketService' });

  static getInstance(): WebSocketService {
    if (!this.instance) {
      this.instance = new WebSocketService();
    }
    return this.instance;
  }

  async broadcastMetricUpdate(
    venueId: string,
    metricType: string,
    data: RealTimeMetric
  ): Promise<void> {
    try {
      // Emit to all subscribers of this metric
      emitMetricUpdate(metricType, venueId, data);
      
      // Also update Redis for future connections
      await RealtimeModel.publishMetricUpdate(venueId, metricType, data);
      
      this.log.debug('Metric update broadcasted', { venueId, metricType });
    } catch (error) {
      this.log.error('Failed to broadcast metric update', { error, venueId, metricType });
    }
  }

  async broadcastWidgetUpdate(
    widgetId: string,
    data: WidgetData
  ): Promise<void> {
    try {
      emitWidgetUpdate(widgetId, data);
      this.log.debug('Widget update broadcasted', { widgetId });
    } catch (error) {
      this.log.error('Failed to broadcast widget update', { error, widgetId });
    }
  }

  async broadcastToVenue(
    venueId: string,
    event: string,
    data: any
  ): Promise<void> {
    try {
      const io = getIO();
      io.to(`venue:${venueId}`).emit(event, data);
      this.log.debug('Event broadcasted to venue', { venueId, event });
    } catch (error) {
      this.log.error('Failed to broadcast to venue', { error, venueId, event });
    }
  }

  async broadcastToUser(
    userId: string,
    event: string,
    data: any
  ): Promise<void> {
    try {
      const io = getIO();
      // Find sockets for this user
      const sockets = await io.fetchSockets();
      const userSockets = sockets.filter(s => s.data.userId === userId);
      
      userSockets.forEach(socket => {
        socket.emit(event, data);
      });
      
      this.log.debug('Event broadcasted to user', { userId, event, socketCount: userSockets.length });
    } catch (error) {
      this.log.error('Failed to broadcast to user', { error, userId, event });
    }
  }

  async getConnectedClients(): Promise<{
    total: number;
    byVenue: Record<string, number>;
  }> {
    try {
      const io = getIO();
      const sockets = await io.fetchSockets();
      
      const byVenue: Record<string, number> = {};
      
      sockets.forEach(socket => {
        const venueId = socket.data.venueId;
        if (venueId) {
          byVenue[venueId] = (byVenue[venueId] || 0) + 1;
        }
      });
      
      return {
        total: sockets.length,
```

### alert.service.ts
First 100 lines:
```typescript
import { AlertModel } from '../models';
import {
  Alert,
  AlertInstance,
  ComparisonOperator
} from '../types';
import { logger } from '../utils/logger';
import { messageGatewayService } from './message-gateway.service';
import { metricsService } from './metrics.service';

export class AlertService {
  private static instance: AlertService;
  private log = logger.child({ component: 'AlertService' });
  private checkInterval: NodeJS.Timeout | null = null;

  static getInstance(): AlertService {
    if (!this.instance) {
      this.instance = new AlertService();
    }
    return this.instance;
  }

  async startMonitoring(): Promise<void> {
    // Check alerts every minute
    this.checkInterval = setInterval(() => {
      this.checkAllAlerts();
    }, 60000);

    this.log.info('Alert monitoring started');
  }

  async stopMonitoring(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.log.info('Alert monitoring stopped');
  }

  async createAlert(
    data: Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Alert> {
    try {
      const alert = await AlertModel.createAlert(data);
      this.log.info('Alert created', { alertId: alert.id, name: alert.name });
      return alert;
    } catch (error) {
      this.log.error('Failed to create alert', { error });
      throw error;
    }
  }

  async updateAlert(
    alertId: string,
    data: Partial<Alert>
  ): Promise<Alert> {
    try {
      const alert = await AlertModel.updateAlert(alertId, data);
      this.log.info('Alert updated', { alertId });
      return alert;
    } catch (error) {
      this.log.error('Failed to update alert', { error, alertId });
      throw error;
    }
  }

  async toggleAlert(alertId: string, enabled: boolean): Promise<Alert> {
    try {
      const alert = await AlertModel.toggleAlert(alertId, enabled);
      this.log.info('Alert toggled', { alertId, enabled });
      return alert;
    } catch (error) {
      this.log.error('Failed to toggle alert', { error, alertId });
      throw error;
    }
  }

  private async checkAllAlerts(): Promise<void> {
    try {
      // Get all enabled alerts
      const venues = await this.getMonitoredVenues();

      for (const venueId of venues) {
        const alerts = await AlertModel.getAlertsByVenue(venueId, true);

        for (const alert of alerts) {
          await this.checkAlert(alert);
        }
      }
    } catch (error) {
      this.log.error('Failed to check alerts', { error });
    }
  }

  private async checkAlert(alert: Alert): Promise<void> {
    try {
      // Check if within schedule
      if (!this.isWithinSchedule(alert)) {
        return;
      }
```

### customer-intelligence.service.ts
First 100 lines:
```typescript
import { EventSchema } from '../models';
import { 
  CustomerProfile,
  CustomerSegment,
  CustomerInsight,
  InsightType,
  RFMAnalysis,
} from '../types';
import { logger } from '../utils/logger';
import { anonymizationService } from './anonymization.service';
import { CacheModel } from '../models';
import { CONSTANTS } from '../config/constants';

export class CustomerIntelligenceService {
  private static instance: CustomerIntelligenceService;
  private log = logger.child({ component: 'CustomerIntelligenceService' });

  static getInstance(): CustomerIntelligenceService {
    if (!this.instance) {
      this.instance = new CustomerIntelligenceService();
    }
    return this.instance;
  }

  async getCustomerProfile(
    venueId: string,
    customerId: string
  ): Promise<CustomerProfile | null> {
    try {
      // Hash the customer ID for privacy
      const hashedCustomerId = await anonymizationService.hashCustomerId(customerId);

      // Check cache
      const cacheKey = CacheModel.getCacheKey('customer', venueId, hashedCustomerId);
      const cached = await CacheModel.get<CustomerProfile>(cacheKey);
      if (cached) {
        return cached;
      }

      // Aggregate customer data from events
      const events = await EventSchema.getEvents(venueId, {
        userId: hashedCustomerId,
        limit: 10000
      });

      if (events.length === 0) {
        return null;
      }

      // Calculate metrics
      const profile = await this.calculateCustomerMetrics(
        venueId,
        hashedCustomerId,
        events
      );

      // Cache profile
      await CacheModel.set(cacheKey, profile, CONSTANTS.CACHE_TTL.CUSTOMER_PROFILE);

      return profile;
    } catch (error) {
      this.log.error('Failed to get customer profile', { error, venueId });
      throw error;
    }
  }

  private async calculateCustomerMetrics(
    venueId: string,
    customerId: string,
    events: any[]
  ): Promise<CustomerProfile> {
    const purchaseEvents = events.filter(e => e.eventType === 'ticket.purchased');
    const firstPurchase = purchaseEvents[0];
    const lastPurchase = purchaseEvents[purchaseEvents.length - 1];

    const totalSpent = purchaseEvents.reduce((sum, e) => 
      sum + (e.properties?.amount || 0), 0
    );
    
    const totalTickets = purchaseEvents.reduce((sum, e) => 
      sum + (e.properties?.quantity || 1), 0
    );

    const averageOrderValue = purchaseEvents.length > 0 
      ? totalSpent / purchaseEvents.length 
      : 0;

    const daysSinceLastPurchase = lastPurchase 
      ? Math.floor((Date.now() - new Date(lastPurchase.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    const purchaseFrequency = purchaseEvents.length > 1
      ? purchaseEvents.length / 
        ((new Date(lastPurchase.timestamp).getTime() - 
          new Date(firstPurchase.timestamp).getTime()) / 
          (1000 * 60 * 60 * 24 * 365))
      : 0;

    // Determine segment
    const segment = this.determineCustomerSegment({
```

### data-aggregation.service.ts
First 100 lines:
```typescript
import { getDb, getAnalyticsDb } from '../config/database';
import { logger } from '../utils/logger';

export class DataAggregationService {
  private mainDb = getDb(); // tickettoken_db
  private analyticsDb = getAnalyticsDb(); // tickettoken_analytics
  
  async aggregateVenueMetrics(venueId: string, date: Date) {
    try {
      // Read from main database
      const ticketsSold = await this.mainDb('tickets')
        .where('venue_id', venueId)
        .whereRaw('DATE(created_at) = ?', [date])
        .count('id as count')
        .first();
        
      const revenue = await this.mainDb('tickets')
        .where('venue_id', venueId)
        .whereRaw('DATE(created_at) = ?', [date])
        .sum('price as total')
        .first();
      
      // Write to analytics database
      await this.analyticsDb('venue_analytics')
        .insert({
          venue_id: venueId,
          date: date,
          tickets_sold: ticketsSold?.count || 0,
          revenue: revenue?.total || 0,
          updated_at: new Date()
        })
        .onConflict(['venue_id', 'date', 'hour'])
        .merge();
        
      logger.info('Aggregated venue metrics', { venueId, date });
    } catch (error) {
      logger.error('Failed to aggregate venue metrics', error);
      throw error;
    }
  }
}
```

### message-gateway.service.ts
First 100 lines:
```typescript
import { AlertInstance } from '../types';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { logger } from '../utils/logger';
import { getChannel } from '../config/rabbitmq';

export interface MessageTemplate {
  id: string;
  name: string;
  channel: 'email' | 'sms' | 'push' | 'slack';
  subject?: string;
  body: string;
  variables: string[];
}

export interface Message {
  id: string;
  channel: 'email' | 'sms' | 'push' | 'slack';
  recipient: string;
  subject?: string;
  body: string;
  metadata?: Record<string, any>;
  scheduledFor?: Date;
  status: 'pending' | 'sent' | 'failed';
}

export class MessageGatewayService {
  private static instance: MessageGatewayService;
  private log = logger.child({ component: 'MessageGatewayService' });
  private templates: Map<string, MessageTemplate> = new Map();

  static getInstance(): MessageGatewayService {
    if (!this.instance) {
      this.instance = new MessageGatewayService();
    }
    return this.instance;
  }

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Alert templates
    this.templates.set('alert-email', {
      id: 'alert-email',
      name: 'Alert Email',
      channel: 'email',
      subject: 'Analytics Alert: {{alertName}}',
      body: `
        <h2>{{alertName}}</h2>
        <p>{{alertDescription}}</p>
        <p><strong>Severity:</strong> {{severity}}</p>
        <p><strong>Triggered at:</strong> {{triggeredAt}}</p>
        <p><strong>Current value:</strong> {{currentValue}}</p>
        <p><strong>Threshold:</strong> {{threshold}}</p>
        <a href="{{dashboardUrl}}">View Dashboard</a>
      `,
      variables: ['alertName', 'alertDescription', 'severity', 'triggeredAt', 'currentValue', 'threshold', 'dashboardUrl']
    });

    this.templates.set('alert-sms', {
      id: 'alert-sms',
      name: 'Alert SMS',
      channel: 'sms',
      body: 'Analytics Alert: {{alertName}} - {{severity}}. Value: {{currentValue}}. Check dashboard for details.',
      variables: ['alertName', 'severity', 'currentValue']
    });

    this.templates.set('alert-slack', {
      id: 'alert-slack',
      name: 'Alert Slack',
      channel: 'slack',
      body: JSON.stringify({
        text: 'Analytics Alert',
        attachments: [{
          color: '{{color}}',
          title: '{{alertName}}',
          text: '{{alertDescription}}',
          fields: [
            { title: 'Severity', value: '{{severity}}', short: true },
            { title: 'Current Value', value: '{{currentValue}}', short: true },
            { title: 'Threshold', value: '{{threshold}}', short: true },
            { title: 'Time', value: '{{triggeredAt}}', short: true }
          ],
          actions: [{
            type: 'button',
            text: 'View Dashboard',
            url: '{{dashboardUrl}}'
          }]
        }]
      }),
      variables: ['color', 'alertName', 'alertDescription', 'severity', 'currentValue', 'threshold', 'triggeredAt', 'dashboardUrl']
    });

    // Report templates
    this.templates.set('report-ready-email', {
      id: 'report-ready-email',
      name: 'Report Ready Email',
      channel: 'email',
      subject: 'Your Analytics Report is Ready',
```

### event-stream.service.ts
First 100 lines:
```typescript
import { EventEmitter } from 'events';
import Bull from 'bull';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { emitMetricUpdate } from '../config/websocket';
import { getAnalyticsDb } from '../config/database';

export interface StreamEvent {
  type: string;
  venueId: string;
  data: any;
  timestamp: Date;
}

export class EventStreamService extends EventEmitter {
  private queues: Map<string, Bull.Queue> = new Map();
  private redis: any; // Lazy loaded
  private analyticsDb: any; // Lazy loaded
  private initialized = false;

  constructor() {
    super();
  }

  private async initialize() {
    if (this.initialized) return;
    
    this.redis = getRedis();
    this.analyticsDb = getAnalyticsDb();
    this.initializeQueues();
    this.initialized = true;
  }

  private initializeQueues() {
    // Create queues for different event types
    const eventTypes = [
      'ticket-purchase',
      'ticket-scan', 
      'page-view',
      'cart-update',
      'venue-update'
    ];

    eventTypes.forEach(type => {
      const queue = new Bull(type, {
        redis: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      });

      queue.process(async (job) => {
        await this.processEvent(type, job.data);
      });

      this.queues.set(type, queue);
    });
  }

  // Process incoming events
  async processEvent(type: string, data: StreamEvent) {
    try {
      logger.debug('Processing event', { type, venueId: data.venueId });

      // Emit event for real-time processing
      this.emit(type, data);

      // Update real-time metrics
      await this.updateRealTimeMetrics(type, data);

      // Emit to WebSocket clients (only if WebSocket is initialized)
      try {
        emitMetricUpdate(data.venueId, type, data);
      } catch (e) {
        // WebSocket might not be initialized in tests
      }

      // Store raw event for later processing
      await this.storeRawEvent(type, data);

    } catch (error) {
      logger.error('Failed to process event', { type, error });
    }
  }

  private async updateRealTimeMetrics(type: string, event: StreamEvent) {
    const { venueId, data } = event;

    switch (type) {
      case 'ticket-purchase':
        await this.updatePurchaseMetrics(venueId, data);
        break;
      
      case 'ticket-scan':
        await this.updateScanMetrics(venueId, data);
        break;
      
      case 'page-view':
        await this.updateTrafficMetrics(venueId, data);
        break;
```

### prediction.service.ts
First 100 lines:
```typescript
import { 
  ModelType,
  DemandForecast,
  PriceOptimization,
  ChurnPrediction,
  CustomerLifetimeValue,
  NoShowPrediction,
  WhatIfScenario
} from '../types';
import { logger } from '../utils/logger';
import { customerIntelligenceService } from './customer-intelligence.service';
import * as tf from '@tensorflow/tfjs-node';

export class PredictionService {
  private static instance: PredictionService;
  private log = logger.child({ component: 'PredictionService' });
  private models: Map<ModelType, tf.LayersModel> = new Map();

  static getInstance(): PredictionService {
    if (!this.instance) {
      this.instance = new PredictionService();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Load pre-trained models
      // In production, these would be loaded from model storage
      this.log.info('Initializing prediction models...');
      
      // For now, we'll create simple placeholder models
      await this.initializePlaceholderModels();
      
      this.log.info('Prediction models initialized');
    } catch (error) {
      this.log.error('Failed to initialize prediction models', { error });
    }
  }

  private async initializePlaceholderModels(): Promise<void> {
    // Create simple neural networks for each model type
    const modelTypes = Object.values(ModelType);
    
    for (const modelType of modelTypes) {
      const model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [10], units: 64, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'sigmoid' })
        ]
      });
      
      model.compile({
        optimizer: 'adam',
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });
      
      this.models.set(modelType, model);
    }
  }

  async predictDemand(
    venueId: string,
    eventId: string,
    daysAhead: number = 30
  ): Promise<DemandForecast> {
    try {
      // Get historical data
      
      // Generate predictions
      const predictions = [];
      const today = new Date();
      
      for (let i = 0; i < daysAhead; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        
        // Simple demand prediction based on day of week and historical average
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const baseDemand = isWeekend ? 150 : 100;
        const variance = Math.random() * 50 - 25;
        const predictedDemand = Math.max(0, baseDemand + variance);
        
        predictions.push({
          date,
          ticketTypeId: 'general',
          predictedDemand: Math.round(predictedDemand),
          confidenceInterval: {
            lower: Math.round(predictedDemand * 0.8),
            upper: Math.round(predictedDemand * 1.2)
          },
          factors: [
            { name: 'Day of Week', impact: isWeekend ? 1.5 : 1.0 },
            { name: 'Seasonality', impact: 1.0 },
            { name: 'Marketing', impact: 1.1 }
          ]
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
# ==== Analytics Database (Optional) ====
ANALYTICS_DB_HOST=localhost                    # Analytics DB host
ANALYTICS_DB_PORT=5432                        # Analytics DB port
ANALYTICS_DB_NAME=tickettoken_analytics       # Analytics DB name
ANALYTICS_DB_USER=analytics_user              # Analytics DB user
ANALYTICS_DB_PASSWORD=<CHANGE_ME>             # Analytics DB password
# ==== MongoDB Configuration (Optional) ====
MONGODB_URI=mongodb://localhost:27017/analytics
MONGODB_HOST=localhost                        # MongoDB host
MONGODB_PORT=27017                           # MongoDB port
MONGODB_DB=tickettoken_analytics             # MongoDB database
MONGODB_USER=<MONGO_USER>                    # MongoDB user
MONGODB_PASSWORD=<MONGO_PASSWORD>            # MongoDB password
```

---

