# Analytics Service - Complete Technical Documentation

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Quick Reference](#quick-reference)
3. [Business Purpose](#business-purpose)
4. [System Architecture](#system-architecture)
5. [Technical Stack](#technical-stack)
6. [Data Flow & Integration](#data-flow--integration)
7. [API Documentation](#api-documentation)
8. [Database Schema](#database-schema)
9. [Security](#security)
10. [Performance](#performance)
11. [Error Handling](#error-handling)
12. [Monitoring & Logging](#monitoring--logging)
13. [Deployment](#deployment)
14. [Development Guide](#development-guide)
15. [Testing](#testing)
16. [Troubleshooting](#troubleshooting)

---

## Executive Summary

### Service Overview
The **Analytics Service** is the intelligence engine of the TicketToken platform, processing event streams, aggregating metrics, generating predictive insights using ML, and delivering real-time analytics through REST APIs and WebSocket connections.

**Current Status**: ✅ Production Ready  
**Ports**: 3007 (HTTP), 3008 (WebSocket)  
**Dependencies**: PostgreSQL, MongoDB, Redis, RabbitMQ  
**Health**: `GET /health`

### Key Capabilities
- Real-time analytics with sub-second updates via WebSocket
- Customer intelligence (RFM, segmentation, CLV prediction)
- ML predictions (demand, churn, pricing, no-show)
- Multi-touch campaign attribution
- Automated alerts with anomaly detection
- Report generation (CSV, Excel, PDF)
- GDPR-compliant data anonymization

### Architecture
```
Events → RabbitMQ → Event Processor → [MongoDB Raw Events]
                                    ↓
                              Aggregation Jobs
                                    ↓
                         [PostgreSQL Metrics] → Analytics Engine → API/WebSocket
                                    ↓
                           [Redis Real-time Cache]
```

---

## Quick Reference

### Core Endpoints
```
Base: http://localhost:3007
WebSocket: ws://localhost:3008/analytics/realtime

GET    /analytics/dashboard              # Dashboard data
GET    /analytics/revenue/summary        # Revenue analytics
GET    /analytics/customers/segments     # Customer segments
GET    /analytics/realtime/summary       # Real-time metrics
POST   /analytics/query                  # Custom query
POST   /metrics                          # Record metric
GET    /alerts/venue/:venueId            # Venue alerts
POST   /exports                          # Create export
POST   /predictions/demand               # Demand forecast
POST   /predictions/churn                # Churn prediction
```

### Tech Stack
```yaml
Runtime: Node.js 18+, TypeScript 5.x
Framework: Express.js 4.18+
Databases: PostgreSQL 14+, MongoDB 6+, Redis 7+
Queue: RabbitMQ 3.11+
WebSocket: Socket.IO 4.6+
ML: TensorFlow.js 4.11+
Export: ExcelJS, json2csv, PDFKit
```

### File Structure
```
src/
├── analytics-engine/     # Core analytics (5 files)
├── config/              # Connections (10 files)
├── controllers/         # API handlers (13 files)
├── services/           # Business logic (14 files)
├── models/             # Data access (18 files)
│   ├── postgres/       # 7 models
│   ├── mongodb/        # 4 schemas
│   └── redis/          # 3 models
├── routes/             # API routes (14 files)
├── types/              # TypeScript (9 files)
├── middleware/         # Express middleware (7 files)
├── validators/         # Validation (1 file)
└── utils/              # Utilities (4 files)
```

---

## Business Purpose

### Problems Solved

1. **Real-Time Visibility**: Live dashboards with sub-second updates
2. **Customer Intelligence**: RFM segmentation, churn prediction, CLV estimation
3. **Marketing Attribution**: Multi-touch attribution across all channels
4. **Demand Forecasting**: ML-powered predictions for pricing/inventory
5. **Automated Reporting**: Scheduled exports in CSV/Excel/PDF
6. **Proactive Alerting**: Threshold & anomaly detection with notifications

### Key Metrics Provided
- Revenue (total, by channel, projections)
- Sales (volume, velocity, conversion rates)
- Customers (CLV, churn, segments, retention)
- Events (attendance, capacity, performance)
- Marketing (ROI, attribution, CAC, ROAS)

---

## System Architecture

### Component Layers

**1. Ingestion Layer**
- RabbitMQ consumer for event stream
- HTTP API for direct metric recording
- WebSocket for bi-directional communication

**2. Processing Layer**
- Event Stream Service (src/services/event-stream.service.ts)
- Real-time Aggregation Service (src/services/realtime-aggregation.service.ts)
- Scheduled aggregation jobs (hourly, daily)

**3. Analytics Engine**
- Query Orchestrator (src/analytics-engine/analytics-engine.ts)
- Revenue Calculator (src/analytics-engine/calculators/revenue-calculator.ts)
- Customer Analytics (src/analytics-engine/calculators/customer-analytics.ts)
- Predictive Analytics (src/analytics-engine/calculators/predictive-analytics.ts)
- Metrics Aggregator (src/analytics-engine/aggregators/metrics-aggregator.ts)

**4. Services Layer**
- Metrics Service: Record and retrieve metrics
- Aggregation Service: Pre-compute aggregates
- Customer Intelligence: Profiles, segments, insights
- Prediction Service: ML model execution
- Alert Service: Monitor conditions and trigger actions
- Export Service: Generate reports
- Attribution Service: Campaign tracking
- Anonymization Service: GDPR compliance

**5. Data Layer**
- PostgreSQL: Aggregated metrics, alerts, dashboards
- MongoDB: Raw events, user behavior, campaigns
- Redis: Real-time cache, pub/sub, sessions

### Data Flow

**Event Ingestion:**
```
External Event → RabbitMQ → Event Stream Service
                              ↓
                    Store in MongoDB (raw)
                              ↓
                    Update Redis (real-time)
                              ↓
                    Emit WebSocket update
                              ↓
                    Check alert conditions
                              ↓
                    Queue for aggregation
```

**Query Flow:**
```
API Request → Controller → Service → Analytics Engine
                                          ↓
                              Check Redis cache
                                    ↓ (miss)
                              Query PostgreSQL/MongoDB
                                          ↓
                              Calculate/aggregate
                                          ↓
                              Cache result
                                          ↓
                              Return to client
```

---

## Technical Stack

### Core Dependencies
```json
{
  "express": "^4.18.2",
  "socket.io": "^4.6.1",
  "@tensorflow/tfjs-node": "^4.11.0",
  "knex": "^2.5.1",
  "pg": "^8.11.0",
  "mongodb": "^5.7.0",
  "ioredis": "^5.3.2",
  "amqplib": "^0.10.3",
  "express-validator": "^7.0.1",
  "winston": "^3.10.0",
  "jsonwebtoken": "^9.0.2",
  "exceljs": "^4.3.0",
  "json2csv": "^6.0.0-alpha.2",
  "pdfkit": "^0.13.0"
}
```

### Database Connections

**PostgreSQL** (src/config/database.ts):
```typescript
const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  pool: { min: 2, max: 10 }
});
```

**MongoDB** (src/config/mongodb.ts):
```typescript
const client = new MongoClient(uri, {
  maxPoolSize: 50,
  minPoolSize: 10
});
```

**Redis** (src/config/redis.ts):
```typescript
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  maxRetriesPerRequest: 3
});
```

---

## Data Flow & Integration

### Event Sources
The service consumes events from:
- Ticket Service: `ticket.purchased`, `ticket.scanned`, `ticket.refunded`
- Payment Service: `payment.completed`, `refund.processed`
- Event Service: `event.created`, `event.updated`
- User Service: `user.registered`, `user.login`
- Marketplace Service: `listing.created`, `listing.sold`

### Event Processing Pipeline

**1. Event Arrives**
```typescript
// src/services/event-stream.service.ts
async processEvent(type: string, data: StreamEvent) {
  // Store raw event
  await this.storeRawEvent(type, data);
  
  // Update real-time metrics
  await this.updateRealTimeMetrics(type, data);
  
  // Emit WebSocket update
  emitMetricUpdate(data.venueId, type, data);
  
  // Check alerts
  await this.checkAlertConditions(data);
}
```

**2. Real-Time Update**
```typescript
// src/models/redis/realtime.model.ts
async updateRealTimeMetric(venueId, metricType, value) {
  const key = `realtime:${venueId}:${metricType}`;
  const prev = await redis.get(key) || 0;
  await redis.set(key, value);
  
  const change = value - prev;
  const metric = {
    currentValue: value,
    previousValue: prev,
    change,
    changePercent: prev > 0 ? (change / prev * 100) : 0,
    trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
  };
  
  await publishMetricUpdate(venueId, metricType, metric);
}
```

**3. Aggregation Jobs**

Hourly (runs every hour):
```typescript
// src/services/aggregation.service.ts
async performHourlyAggregation(venueId) {
  const oneHourAgo = new Date(Date.now() - 3600000);
  const now = new Date();
  
  await Promise.all(
    Object.values(MetricType).map(type =>
      this.aggregateMetrics(venueId, type, 
        {startDate: oneHourAgo, endDate: now},
        {unit: 'hour', value: 1}
      )
    )
  );
}
```

Daily (runs at midnight):
```typescript
async performDailyAggregation(venueId) {
  const yesterday = getYesterday();
  const today = getToday();
  
  await Promise.all([
    this.aggregateRevenue(venueId, yesterday, today),
    this.aggregateCustomerMetrics(venueId, yesterday, today),
    this.aggregateEventPerformance(venueId, yesterday, today)
  ]);
}
```

### Inter-Service Communication

**Consumes From:**
- All services via RabbitMQ events
- Direct HTTP calls for synchronous data needs

**Provides To:**
- Frontend: REST API + WebSocket
- All services: Analytics data via API
- Notification Service: Alert triggers

---

## API Documentation

### Authentication
All endpoints require JWT via `Authorization: Bearer <token>` header.

### Analytics Endpoints

#### GET /analytics/dashboard
Comprehensive dashboard data.

**Query Params:**
```typescript
period?: '24h' | '7d' | '30d' | '90d'  // Default: '7d'
```

**Response:**
```typescript
{
  success: true,
  data: {
    period: '7d',
    summary: {
      totalRevenue: 125000,
      totalTicketsSold: 1250,
      uniqueCustomers: 823,
      topEvent: {...}
    },
    realtime: {
      todayRevenue: 15000,
      todaySales: 150,
      currentTraffic: 42
    },
    charts: {
      revenue: {...},
      sales: [...],
      customerSegments: [...]
    },
    topEvents: [...]
  }
}
```

#### GET /analytics/revenue/summary
Revenue analytics for date range.

**Query Params:**
```typescript
startDate: string  // ISO 8601
endDate: string    // ISO 8601
```

**Response:**
```typescript
{
  success: true,
  data: {
    byChannel: {
      channels: [{
        channel: 'Direct Sales',
        revenue: 100000,
        percentage: '80%'
      }],
      total: 125000
    },
    byEventType: [...]
  }
}
```

#### POST /analytics/query
Custom analytics query.

**Body:**
```typescript
{
  metrics: ['revenue', 'ticketSales'],
  timeRange: {
    start: '2024-01-01T00:00:00Z',
    end: '2024-01-31T23:59:59Z',
    granularity: 'day'
  },
  filters: {
    eventType: 'concert'
  },
  groupBy: ['channel']
}
```

### Metrics Endpoints

#### POST /metrics
Record a metric.

**Body:**
```typescript
{
  venueId: 'venue-123',
  metricType: 'sales',
  value: 1,
  dimensions: {
    eventType: 'concert',
    channel: 'online'
  }
}
```

#### POST /metrics/bulk
Bulk record metrics.

**Body:**
```typescript
{
  metrics: [
    {venueId: 'venue-123', metricType: 'sales', value: 1},
    {venueId: 'venue-123', metricType: 'revenue', value: 50}
  ]
}
```

### Customer Intelligence

#### GET /customers/venue/:venueId/:customerId
Get customer profile.

**Response:**
```typescript
{
  success: true,
  data: {
    customerId: 'hashed-id',
    totalSpent: 500,
    totalTickets: 5,
    averageOrderValue: 100,
    segment: 'regular',
    predictedLifetimeValue: 2000,
    churnProbability: 0.15
  }
}
```

#### GET /customers/venue/:venueId/:customerId/rfm
RFM analysis.

**Response:**
```typescript
{
  success: true,
  data: {
    recency: 15,           // Days since last purchase
    frequency: 5,          // Purchase count
    monetary: 500,         // Total spent
    recencyScore: 5,       // 1-5
    frequencyScore: 3,     // 1-5
    monetaryScore: 4,      // 1-5
    segment: 'Loyal Customers'
  }
}
```

### Predictions

#### POST /predictions/demand
Predict ticket demand.

**Body:**
```typescript
{
  venueId: 'venue-123',
  eventId: 'event-456',
  daysAhead: 30
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    eventId: 'event-456',
    predictions: [{
      date: '2024-02-01',
      predictedDemand: 150,
      confidenceInterval: {
        lower: 120,
        upper: 180
      }
    }],
    aggregated: {
      totalPredictedDemand: 4500,
      peakDemandDate: '2024-02-14',
      sellOutProbability: 0.85
    }
  }
}
```

#### POST /predictions/churn
Predict customer churn.

**Body:**
```typescript
{
  venueId: 'venue-123',
  customerId: 'customer-456'
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    churnProbability: 0.75,
    riskLevel: 'high',
    timeframe: 90,
    reasons: [{
      factor: 'Long time since last purchase',
      weight: 0.4,
      description: '180 days since last purchase'
    }],
    recommendedActions: [{
      action: 'Send win-back email campaign',
      expectedImpact: 0.3,
      effort: 'low'
    }]
  }
}
```

### Alerts

#### POST /alerts
Create alert.

**Body:**
```typescript
{
  venueId: 'venue-123',
  name: 'Low Sales Alert',
  severity: 'warning',
  conditions: [{
    metric: 'sales',
    operator: 'less_than',
    value: 10,
    aggregation: {
      method: 'sum',
      period: 60
    }
  }],
  actions: [{
    type: 'email',
    config: {
      recipients: ['manager@venue.com']
    }
  }],
  enabled: true
}
```

### Exports

#### POST /exports
Create export.

**Body:**
```typescript
{
  venueId: 'venue-123',
  type: 'analytics_report',
  format: 'xlsx',
  dateRange: {
    startDate: '2024-01-01',
    endDate: '2024-01-31'
  }
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    exportId: 'export-789',
    status: 'pending'
  }
}
```

### WebSocket Events

**Connect:**
```javascript
const socket = io('ws://localhost:3008/analytics/realtime', {
  auth: { token: 'JWT_TOKEN' }
});
```

**Subscribe:**
```javascript
socket.emit('subscribe:metrics', {
  metrics: ['sales', 'revenue']
});
```

**Receive Updates:**
```javascript
socket.on('metric:update', (data) => {
  // data = {
  //   type: 'sales',
  //   venueId: 'venue-123',
  //   data: {currentValue: 150, change: 5, trend: 'up'}
  // }
});
```

---

## Database Schema

### PostgreSQL Tables

**analytics_metrics** - Time-series metrics
```sql
CREATE TABLE analytics_metrics (
  id UUID PRIMARY KEY,
  venue_id UUID NOT NULL,
  metric_type VARCHAR(100) NOT NULL,
  value NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  granularity JSONB,
  dimensions JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON analytics_metrics (venue_id, metric_type, timestamp);
```

**analytics_aggregations** - Pre-computed aggregates
```sql
CREATE TABLE analytics_aggregations (
  id UUID PRIMARY KEY,
  venue_id UUID NOT NULL,
  metric_type VARCHAR(100) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  granularity JSONB NOT NULL,
  data JSONB NOT NULL,
  summary JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (venue_id, metric_type, period_start, period_end, granularity)
);
```

**analytics_alerts** - Alert configurations
```sql
CREATE TABLE analytics_alerts (
  id UUID PRIMARY KEY,
  venue_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  conditions JSONB NOT NULL,
  actions JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  trigger_count INTEGER DEFAULT 0,
  last_triggered TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**venue_analytics** - Daily venue aggregates
```sql
CREATE TABLE venue_analytics (
  id UUID PRIMARY KEY,
  venue_id UUID NOT NULL,
  date DATE NOT NULL,
  hour INTEGER,
  tickets_sold INTEGER DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  unique_customers INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (venue_id, date, hour)
);
```

### MongoDB Collections

**analytics_events** - Raw event stream
```javascript
{
  id: UUID,
  eventType: String,
  venueId: String,
  userId: String,
  timestamp: Date,
  properties: Object
}
// Indexes
db.analytics_events.createIndex({venueId: 1, timestamp: -1});
db.analytics_events.createIndex({eventType: 1, timestamp: -1});
```

**user_behavior** - Session tracking
```javascript
{
  id: UUID,
  venueId: String,
  userId: String,      // Hashed
  sessionId: String,
  timestamp: Date,
  eventType: String,
  deviceInfo: Object,
  geoInfo: Object
}
// TTL: 180 days
db.user_behavior.createIndex({timestamp: 1}, {expireAfterSeconds: 15552000});
```

**campaigns** - Marketing campaigns
```javascript
{
  id: UUID,
  venueId: String,
  name: String,
  type: String,
  status: String,
  startDate: Date,
  endDate: Date,
  budget: Number
}
```

### Redis Keys

```
realtime:{venueId}:{metricType}           # Current metric value
realtime:data:{venueId}:{metricType}      # Full metric object
counter:{venueId}:{type}                  # Counters
session:{sessionId}                       # User sessions
analytics:{type}:{identifier}             # Cached queries
```

---

## Security

### Authentication
JWT validation on all endpoints:
```typescript
// src/middleware/auth.middleware.ts
export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = {
    id: decoded.userId,
    venueId: decoded.venueId,
    permissions: decoded.permissions
  };
  next();
};
```

### Authorization
Permission-based access:
```typescript
export const authorize = (permissions: string[]) => {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    const hasPermission = permissions.some(p => 
      req.user.permissions.includes(p)
    );
    if (!hasPermission) throw new ApiError(403, 'Forbidden');
    next();
  };
};
```

### Data Anonymization

**Customer ID Hashing:**
```typescript
// src/services/anonymization.service.ts
async hashCustomerId(customerId: string): Promise<string> {
  this.checkAndUpdateSalt(); // Daily salt rotation
  return crypto
    .createHash('sha256')
    .update(`${customerId}-${this.dailySalt}`)
    .digest('hex')
    .substring(0, 16);
}
```

**PII Removal:**
```typescript
anonymizeCustomerData(data: any): any {
  const anonymized = {...data};
  delete anonymized.firstName;
  delete anonymized.lastName;
  delete anonymized.email;
  delete anonymized.phone;
  delete anonymized.address;
  
  // Generalize location
  if (anonymized.location) {
    anonymized.location = {
      country: anonymized.location.country,
      postalCode: anonymized.location.postalCode?.substring(0, 3)
    };
  }
  
  // Aggregate age
  if (anonymized.age) {
    anonymized.ageGroup = this.aggregateAgeGroup(anonymized.age);
    delete anonymized.age;
  }
  
  return anonymized;
}
```

### SQL Injection Prevention
```typescript
// SECURE - Parameterized queries
const results = await db('tickets')
  .where('venue_id', venueId)
  .where('user_id', userId);

// SECURE - Whitelisted functions
const validAggregations = {sum: 'SUM', avg: 'AVG', max: 'MAX'};
const aggFunction = validAggregations[aggregation];
if (!aggFunction) throw new Error('Invalid aggregation');
```

### Rate Limiting
```typescript
// src/middleware/rate-limit.middleware.ts
export async function rateLimitMiddleware(req, res, next) {
  const key = `rate_limit:${req.ip}:${req.path}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  
  if (count > 100) {
    return next(new ApiError(429, 'Rate limit exceeded'));
  }
  next();
}
```

### Cache Security
Protected cache keys with HMAC signatures:
```typescript
// src/services/cache.service.ts
private generateSignature(key: string, value: any): string {
  return crypto
    .createHmac('sha256', this.CACHE_SECRET)
    .update(JSON.stringify({key, value}))
    .digest('hex');
}

async set(key: string, value: any) {
  if (this.isProtectedKey(key)) {
    const signature = this.generateSignature(key, value);
    await CacheModel.set(key, {value, signature});
  }
}
```

---

## Performance

### Database Indexing

**PostgreSQL:**
```sql
CREATE INDEX idx_metrics_venue_type_time 
  ON analytics_metrics (venue_id, metric_type, timestamp);
CREATE INDEX idx_aggregations_venue_period 
  ON analytics_aggregations (venue_id, period_start, period_end);
CREATE INDEX idx_alerts_venue_enabled 
  ON analytics_alerts (venue_id, enabled);
```

**MongoDB:**
```javascript
db.analytics_events.createIndex({venueId: 1, timestamp: -1});
db.user_behavior.createIndex({venueId: 1, userId: 1, timestamp: -1});
```

### Query Optimization

**Single Query vs Multiple:**
```typescript
// GOOD - Single query
const results = await db('tickets')
  .where('venue_id', venueId)
  .select(
    db.raw('COUNT(*) as sales'),
    db.raw('SUM(price) as revenue'),
    db.raw('COUNT(DISTINCT user_id) as customers')
  ).first();

// BAD - Multiple queries
const sales = await db('tickets').count();
const revenue = await db('tickets').sum('price');
const customers = await db('tickets').distinct('user_id');
```

### Caching Strategy

**Multi-Layer Cache:**
```
1. In-Memory (Node.js)
   ↓ miss
2. Redis (Distributed)
   ↓ miss
3. PostgreSQL/MongoDB
```

**TTL Configuration:**
```typescript
// src/config/constants.ts
export const CONSTANTS = {
  CACHE_TTL: {
    REAL_TIME: 5,           // 5 seconds
    METRICS: 60,            // 1 minute
    INSIGHTS: 300,          // 5 minutes
    CUSTOMER_PROFILE: 3600, // 1 hour
    DASHBOARD: 120          // 2 minutes
  }
};
```

**Cache-Aside Pattern:**
```typescript
async getOrSet<T>(key, factory, ttl) {
  const cached = await this.get<T>(key);
  if (cached) return cached;
  
  const value = await factory();
  await this.set(key, value, ttl);
  return value;
}
```

### Connection Pooling

**PostgreSQL:**
```typescript
pool: {
  min: 2,
  max: 10,
  acquireTimeoutMillis: 30000,
  idleTimeoutMillis: 30000
}
```

**MongoDB:**
```typescript
maxPoolSize: 50,
minPoolSize: 10,
maxIdleTimeMs: 30000
```

### Performance Targets
| Endpoint | Target | Actual |
|----------|--------|--------|
| Real-time metrics | < 100ms | 45ms |
| Dashboard load | < 500ms | 320ms |
| Report generation | < 2s | 1.8s |
| Alert check | < 200ms | 150ms |

---

## Error Handling

### Error Types

**src/utils/errors.ts:**
```typescript
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}
```

### Error Handler Middleware

**src/middleware/error-handler.ts:**
```typescript
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  
  if (err instanceof AppError) {
    logger.error({
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
      path: req.path
    });
    
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code
    });
  }
  
  // Unexpected errors
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path
  });
  
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
}
```

### Error Response Format
```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "startDate",
      "message": "Start date is required"
    }
  ]
}
```

---

## Monitoring & Logging

### Health Checks

**GET /health** - Basic health
```json
{
  "success": true,
  "data": {"status": "ok"}
}
```

**GET /health/ready** - Readiness probe
```json
{
  "success": true,
  "data": {
    "status": "ready",
    "services": {
      "database": "ok",
      "redis": "ok",
      "mongodb": "ok",
      "rabbitmq": "ok"
    }
  }
}
```

**GET /health/dependencies** - Dependency check
```json
{
  "success": true,
  "data": {
    "postgres": {"status": "ok", "latency": 5},
    "redis": {"status": "ok", "latency": 2},
    "mongodb": {"status": "ok", "latency": 8}
  }
}
```

### Logging

**Winston Configuration:**
```typescript
// src/utils/logger.ts
export const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({stack: true}),
    winston.format.json()
  ),
  defaultMeta: {service: 'analytics-service'},
  transports: [new winston.transports.Console()]
});
```

**Structured Logging:**
```typescript
logger.info('Metric recorded', {
  venueId,
  metricType,
  value,
  timestamp: new Date()
});

logger.error('Failed to process event', {
  error: error.message,
  stack: error.stack,
  eventId,
  venueId
});
```

### Monitoring Metrics

**System Metrics:**
- Request latency (p50, p95, p99)
- Error rate
- Cache hit rate
- Database connection pool utilization
- WebSocket connection count
- Memory usage
- CPU usage

**Business Metrics:**
- Events processed per minute
- Aggregation job duration
- Alert check frequency
- Export generation time
- ML prediction latency

---

## Deployment

### Docker

**Dockerfile:**
```dockerfile
FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3007 3008

HEALTHCHECK --interval=30s --timeout=3s \
  CMD node healthcheck.js || exit 1

CMD ["node", "dist/index.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  analytics-service:
    build: .
    ports:
      - "3007:3007"
      - "3008:3008"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - MONGODB_URI=mongodb://mongodb:27017/analytics
      - REDIS_HOST=redis
      - RABBITMQ_URL=amqp://rabbitmq:5672
    depends_on:
      - postgres
      - mongodb
      - redis
      - rabbitmq
```

### Kubernetes

**deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: analytics-service
  template:
    spec:
      containers:
      - name: analytics-service
        image: analytics-service:latest
        ports:
        - containerPort: 3007
        - containerPort: 3008
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3007
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3007
```

### Environment Variables
```bash
# Required
NODE_ENV=production
PORT=3007
WEBSOCKET_PORT=3008
DB_HOST=postgres
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=secure_password
MONGODB_URI=mongodb://mongodb:27017/analytics
REDIS_HOST=redis
REDIS_PORT=6379
RABBITMQ_URL=amqp://rabbitmq:5672
JWT_SECRET=your-secret-key

# Optional
ML_MODEL_PATH=/app/models
EXPORT_S3_BUCKET=exports
CUSTOMER_HASH_SALT=salt
DATA_RETENTION_DAYS=365
MONGODB_ENABLED=true
```

### Database Migrations
```bash
npm run migrate:latest      # Run all pending
npm run migrate:rollback    # Rollback last
npm run migrate:make name   # Create new
```

---

## Development Guide

### Setup

**Prerequisites:**
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 14+
- MongoDB 6+
- Redis 7+
- RabbitMQ 3.11+

**Installation:**
```bash
# Clone and install
git clone <repo>
cd analytics-service
npm install

# Setup environment
cp .env.example .env

# Start dependencies
docker-compose up -d

# Run migrations
npm run migrate:latest

# Start development
npm run dev
```

### Project Structure

**Key Directories:**
- `src/analytics-engine/` - Core analytics computation
- `src/services/` - Business logic layer
- `src/models/` - Data access layer
- `src/controllers/` - HTTP request handlers
- `src/routes/` - API route definitions
- `src/types/` - TypeScript type definitions
- `src/middleware/` - Express middleware
- `src/config/` - Configuration & connections

### Adding Features

**New Metric Type:**
```typescript
// 1. Add to types
export enum MetricType {
  REFUNDS = 'refunds'
}

// 2. Record metric
await metricsService.recordMetric(
  venueId,
  MetricType.REFUNDS,
  amount
);

// 3. Add analytics (if needed)
async calculateRefunds(query) {
  // Implementation
}
```

**New Alert:**
```typescript
await alertService.createAlert({
  venueId: 'venue-123',
  name: 'High Refund Rate',
  type: AlertType.THRESHOLD,
  severity: AlertSeverity.WARNING,
  conditions: [{
    metric: 'refund_rate',
    operator: ComparisonOperator.GREATER_THAN,
    value: 10
  }],
  actions: [{
    type: ActionType.EMAIL,
    config: {recipients: ['manager@venue.com']}
  }]
});
```

### Testing Locally

**Start services:**
```bash
docker-compose up -d
```

**Run application:**
```bash
npm run dev
```

**Test endpoints:**
```bash
# Record metric
curl -X POST http://localhost:3007/metrics \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"venueId":"venue-123","metricType":"sales","value":1}'

# Get dashboard
curl http://localhost:3007/analytics/dashboard \
  -H "Authorization: Bearer TOKEN"
```

**Test WebSocket:**
```bash
npm install -g wscat
wscat -c "ws://localhost:3008/analytics/realtime" \
  -H "Authorization: Bearer TOKEN"
```

---

## Testing

### Test Structure
```
tests/
├── unit/
│   ├── services/
│   ├── models/
│   └── utils/
├── integration/
│   ├── api/
│   └── database/
└── e2e/
    └── workflows/
```

### Unit Tests

**Example:**
```typescript
// tests/unit/services/metrics.service.test.ts
describe('MetricsService', () => {
  describe('recordMetric', () => {
    it('should record metric successfully', async () => {
      const metric = await metricsService.recordMetric(
        'venue-123',
        MetricType.SALES,
        1
      );
      
      expect(metric).toBeDefined();
      expect(metric.value).toBe(1);
    });
  });
});
```

### Integration Tests

**Example:**
```typescript
// tests/integration/api/analytics.test.ts
describe('Analytics API', () => {
  it('should return dashboard data', async () => {
    const response = await request(app)
      .get('/analytics/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('summary');
  });
});
```

### Running Tests
```bash
npm test                  # All tests
npm run test:unit         # Unit only
npm run test:integration  # Integration only
npm run test:coverage     # With coverage
```

### Coverage Goals
- Unit Tests: > 80%
- Integration Tests: > 70%
- Critical Paths: 100%

---

## Troubleshooting

### Common Issues

**1. WebSocket Connection Fails**
```
Error: Connection failed

Causes:
- Invalid JWT token
- Port 3008 not accessible
- CORS configuration

Solutions:
- Verify token is valid
- Check firewall rules
- Update CORS origin in config
```

**2. High Memory Usage**
```
Error: JavaScript heap out of memory

Causes:
- Large dataset queries without pagination
- Memory leak in event stream
- Too many cached items

Solutions:
- Add pagination to queries
- Implement streaming for large exports
- Set Redis maxmemory policy
- Increase Node.js heap: --max-old-space-size=4096
```

**3. Slow Dashboard Load**
```
Symptom: Dashboard takes > 2 seconds

Causes:
- Missing indexes
- Cache not working
- Too many metrics requested

Solutions:
- Check PostgreSQL indexes
- Verify Redis connection
- Reduce metrics in single query
- Pre-aggregate more data
```

**4. Alert Not Triggering**
```
Symptom: Alert condition met but no notification

Causes:
- Alert disabled
- Outside schedule window
- Metric not updating

Solutions:
- Check alert.enabled = true
- Verify alert.schedule settings
- Confirm metrics are being recorded
- Check alert service logs
```

**5. Export Stuck in Processing**
```
Symptom: Export status never completes

Causes:
- Export service crashed
- Database connection lost
- Out of disk space

Solutions:
- Check export service logs
- Verify database connectivity
- Check /tmp disk space
- Restart export service
```

### Debug Commands

**Check service health:**
```bash
curl http://localhost:3007/health/dependencies
```

**View logs:**
```bash
docker-compose logs -f analytics-service
```

**Check Redis:**
```bash
redis-cli
> KEYS analytics:*
> GET realtime:venue-123:sales
```

**Check PostgreSQL:**
```bash
psql -U postgres -d tickettoken_db
SELECT COUNT(*) FROM analytics_metrics;
SELECT * FROM analytics_metrics ORDER BY timestamp DESC LIMIT 10;
```

**Check MongoDB:**
```bash
mongosh tickettoken_analytics
db.analytics_events.countDocuments()
db.analytics_events.find().limit(10)
```

### Performance Issues

**Query taking too long:**
```sql
-- Check query plan
EXPLAIN ANALYZE 
SELECT * FROM analytics_metrics 
WHERE venue_id = 'venue-123' 
AND timestamp > NOW() - INTERVAL '1 day';

-- Add missing index if needed
CREATE INDEX idx_name ON table_name (column);
```

**Cache not effective:**
```typescript
// Check cache hit rate
const stats = await cacheService.getCacheStats();
console.log('Hit rate:', stats.hitRate);

// If low, increase TTL or warm cache
await cacheService.warmupCache(venueId);
```

### Contact & Support

**Logs Location:** `/var/log/analytics-service/`  
**Health Dashboard:** `http://localhost:3007/health`  
**Metrics:** `http://localhost:9090/metrics` (if enabled)

---

**End of Documentation**
