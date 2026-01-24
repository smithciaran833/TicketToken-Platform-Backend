# Analytics Service Comprehensive Audit Report

**Generated:** 2026-01-23
**Service:** analytics-service
**Location:** `backend/services/analytics-service/`
**Files Analyzed:** 128 TypeScript source files

---

## 1. SERVICE CAPABILITIES

### Public Endpoints

| Method | Path | Controller | Purpose |
|--------|------|------------|---------|
| GET | `/revenue/summary` | analyticsController.getRevenueSummary | Get revenue summary for date range |
| GET | `/revenue/by-channel` | analyticsController.getRevenueByChannel | Get revenue breakdown by channel |
| GET | `/revenue/projections` | analyticsController.getRevenueProjections | Get revenue projections |
| GET | `/customers/lifetime-value` | analyticsController.getCustomerLifetimeValue | Get CLV metrics |
| GET | `/customers/segments` | analyticsController.getCustomerSegments | Get customer segments |
| GET | `/customers/churn-risk` | analyticsController.getChurnRiskAnalysis | Get churn risk analysis |
| GET | `/sales/metrics` | analyticsController.getSalesMetrics | Get sales metrics |
| GET | `/sales/trends` | analyticsController.getSalesTrends | Get sales trends |
| GET | `/events/performance` | analyticsController.getEventPerformance | Get event performance |
| GET | `/events/top-performing` | analyticsController.getTopPerformingEvents | Get top performing events |
| GET | `/realtime/summary` | analyticsController.getRealtimeSummary | Get real-time summary |
| GET | `/conversions/funnel` | analyticsController.getConversionFunnel | Get conversion funnel |
| POST | `/query` | analyticsController.executeCustomQuery | Execute custom analytics query |
| GET | `/dashboard` | analyticsController.getDashboardData | Get dashboard data |
| GET | `/cache/stats` | inline | Get cache statistics |
| DELETE | `/cache/flush` | inline | Flush cache |

### Internal Endpoints (Health/System)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check endpoint |
| GET | `/health/ready` | Readiness probe |
| GET | `/health/live` | Liveness probe |

### Business Operations

1. **Revenue Analytics**
   - Revenue summary by date range
   - Revenue by sales channel
   - Revenue projections (1-365 days)
   - Revenue by event type

2. **Customer Intelligence**
   - Customer Lifetime Value (CLV) calculation
   - RFM (Recency, Frequency, Monetary) scoring
   - Customer segmentation (VIP, Regular, At-Risk, Lost)
   - Churn risk prediction
   - Cohort analysis

3. **Real-Time Analytics**
   - WebSocket-based live metrics
   - 1-minute, 5-minute, and hourly aggregations
   - Real-time sales velocity tracking
   - Live conversion rate monitoring

4. **Dynamic Pricing**
   - Demand tracking and scoring
   - Price elasticity calculation
   - Optimal price recommendations
   - Automatic/approval-based price adjustments

5. **Predictive Analytics**
   - Demand forecasting (TensorFlow.js)
   - No-show predictions
   - What-if scenario analysis
   - CLV predictions (12/24 months)

6. **Export & Reporting**
   - CSV, XLSX, PDF export formats
   - Scheduled report generation
   - Async export processing

---

## 2. DATABASE ARCHITECTURE

### PostgreSQL Tables (15 Analytics-Owned)

| Table | Purpose | RLS |
|-------|---------|-----|
| `analytics_metrics` | Raw metric storage | Yes |
| `analytics_aggregations` | Pre-computed aggregations | Yes |
| `analytics_alerts` | Alert definitions and instances | Yes |
| `analytics_dashboards` | Dashboard configurations | Yes |
| `analytics_widgets` | Widget configurations | Yes |
| `analytics_exports` | Export job tracking | Yes |
| `customer_rfm_scores` | Computed RFM scores per customer/venue | Yes |
| `customer_segments` | Aggregated segment statistics | Yes |
| `customer_lifetime_value` | CLV predictions and history | Yes |
| `realtime_metrics` | Short-lived real-time metrics | Yes |
| `venue_alerts` | Venue-specific alerts | Yes |
| `price_history` | Dynamic pricing history | Yes |
| `pending_price_changes` | Price change approvals | Yes |
| `venue_analytics_data` | Daily venue analytics cache | Yes |
| `event_analytics` | Daily event analytics cache | Yes |

### PostgreSQL Views (36 Regular + 5 Materialized)

**Materialized Views:**
- `venue_analytics_mv` - Venue analytics with revenue rank
- `customer_360_materialized` - Full customer 360 view
- `marketplace_activity_materialized` - Marketplace transaction history
- `user_dashboard_materialized` - User dashboard data
- `compliance_reporting_materialized` - Last 30 days compliance data

**Regular Views (by category):**
- Event/Venue: `event_summary`, `venue_analytics`
- Tickets: `ticket_status_details`, `ticket_inventory_summary`
- Financial: `financial_summary`, `daily_revenue_summary` (layered views)
- Customer 360: 8 layered views building to `customer_360`
- Marketplace: 5 layered views building to `marketplace_activity`
- Compliance: 6 layered views building to `compliance_reporting`

### MongoDB Collections (via Mongoose)

| Collection | Purpose | Schema Location |
|------------|---------|-----------------|
| `raw_analytics` | Raw event data storage | `models/mongodb/raw-analytics.schema.ts` |
| `user_behaviors` | User behavior tracking | `models/mongodb/user-behavior.schema.ts` |
| `campaign_analytics` | Campaign performance | `models/mongodb/campaign.schema.ts` |
| `events_analytics` | Event analytics documents | `models/mongodb/event.schema.ts` |

### InfluxDB Measurements

| Measurement | Tags | Fields | Purpose |
|-------------|------|--------|---------|
| `{metric_type}` | `venue_id`, custom dimensions | `value`, custom metadata | Time-series metrics |
| `health_check` | `service=analytics` | `value` | Service health |
| `sales_velocity` | `venue_id`, `event_id` | `value` | Sales rate tracking |

### Redis Data Structures

| Key Pattern | Type | Purpose | TTL |
|-------------|------|---------|-----|
| `analytics:{tenantId}:customer_profile:{userId}` | String (JSON) | Customer profile cache | 1h |
| `analytics:{tenantId}:customer_segments:{venueId}` | String (JSON) | Segment cache | 1h |
| `analytics:{tenantId}:event_preferences:{userId}` | String (JSON) | Event preferences | 6h |
| `analytics:{tenantId}:customer_clv:{customerId}` | String (JSON) | CLV data | 24h |
| `metrics:purchase:{venueId}:{date}` | Hash | Daily purchase metrics | - |
| `metrics:traffic:{venueId}:{date}` | Hash | Daily traffic metrics | - |
| `unique:customers:{venueId}:{date}:{hour}` | Set | Unique customer tracking | - |
| `rfm:lock:*` | String | Distributed locks | 5min |

### Multi-Database Strategy

| Database | Use Case | Rationale |
|----------|----------|-----------|
| **PostgreSQL** | Transactional analytics, dashboards, exports | ACID compliance, RLS, complex aggregations |
| **MongoDB** | Raw event ingestion, user behaviors | Schema flexibility, high write throughput |
| **InfluxDB** | Time-series metrics, real-time data | Purpose-built for time-series, retention policies |
| **Redis** | Caching, real-time counters, distributed locks | Low latency, atomic operations, pub/sub |

### Schema Issues

1. **GOOD:** All PostgreSQL tables have tenant_id and RLS policies
2. **GOOD:** Cache keys include tenant_id for isolation (MT-1, CACHE-2 fixes applied)
3. **CONCERN:** Views reference tables from other services (documented as dependencies)
4. **CONCERN:** Some raw SQL queries use string interpolation for INTERVAL (validated but could be cleaner)

---

## 3. SECURITY ANALYSIS

### A. S2S Authentication

**Authentication Middleware:** `src/middleware/auth.middleware.ts`, `src/middleware/internal-auth.middleware.ts`

The service uses JWT-based authentication with HMAC-SHA256 for S2S calls.

| File | Line | Service | Endpoint | Auth Method | Notes |
|------|------|---------|----------|-------------|-------|
| `message-gateway.service.ts` | 257-267 | RabbitMQ | `messages.*` | N/A (message queue) | Publishes to RabbitMQ exchange |

**No direct HTTP calls to other services found.** The analytics service operates as a read-only layer that:
1. Directly queries shared database tables (read replica pattern)
2. Publishes messages via RabbitMQ for notifications

### B. Service Boundary Violations - CRITICAL

**This analytics service directly queries tables owned by other services.** This is documented and acknowledged as a "READ-REPLICA PATTERN" exception.

| File | Line | Table | Owned By | Query Purpose | Notes |
|------|------|-------|----------|---------------|-------|
| `customer-analytics.ts` | 81-92 | `tickets`, `events` | ticket-service, event-service | CLV calculation | JOIN query |
| `customer-analytics.ts` | 184-196 | `tickets`, `events` | ticket-service, event-service | Churn risk | JOIN query |
| `customer-analytics.ts` | 236-264 | `tickets`, `events` | ticket-service, event-service | RFM segmentation | Raw SQL |
| `customer-insights.service.ts` | 103-122 | `users`, `orders`, `events` | auth-service, order-service, event-service | Customer profile | JOIN query |
| `customer-insights.service.ts` | 327-340 | `orders`, `events` | order-service, event-service | Event preferences | JOIN query |
| `customer-insights.service.ts` | 440-464 | `users`, `orders`, `events` | auth-service, order-service, event-service | Cohort analysis | Raw SQL |
| `demand-tracker.service.ts` | 52 | `events`, `tickets` | event-service, ticket-service | Demand metrics | JOIN query |
| `demand-tracker.service.ts` | 77 | `orders` | order-service | Sales velocity | SELECT count |
| `demand-tracker.service.ts` | 90 | `orders` | order-service | Price elasticity | SELECT aggregation |
| `rfm-calculator.worker.ts` | 66-78 | `venues`, `orders` | venue-service, order-service | Venue list | SELECT distinct |
| `rfm-calculator.worker.ts` | 115-126 | `orders`, `users` | order-service, auth-service | Customer data | JOIN query |
| `pricing-worker.ts` | 29-34 | `events`, `venue_settings` | event-service, venue-service | Events with pricing | JOIN query |
| `dynamic-pricing.service.ts` | 124 | `venue_settings` | venue-service | Pricing rules | SELECT |
| `dynamic-pricing.service.ts` | 146-147 | `events` | event-service | Apply price change | UPDATE |
| `realtime-aggregation.service.ts` | 257-263 | `events` | event-service | Active events count | SELECT count |
| Migration Views | 479-604 | `events`, `tickets`, `users`, `venues`, `payment_transactions`, etc. | Multiple services | Analytics views | CREATE VIEW |

**Total Service Boundary Violations: 15+ direct table accesses**

**Mitigation Applied:**
- Code comments document this as a "PHASE 5c BYPASS EXCEPTION - READ-REPLICA PATTERN"
- Recommendation to use read replica connection strings in production
- All queries are READ-ONLY (SELECT) except `dynamic-pricing.service.ts:147` which UPDATES the `events` table

**CRITICAL ISSUE:** `dynamic-pricing.service.ts:147` performs a WRITE operation (`UPDATE events SET price_cents`) to a table owned by event-service. This violates service boundaries.

### C. Data Privacy

**Anonymization Service:** `src/services/anonymization.service.ts`

| Feature | Implementation | Status |
|---------|----------------|--------|
| Customer ID Hashing | SHA-256 with daily rotating salt | Implemented |
| Email Hashing | SHA-256 with daily rotating salt | Implemented |
| Location Anonymization | Country/region only, postal code truncated to 3 chars | Implemented |
| Device Info Anonymization | Generalized OS/browser only | Implemented |
| Age Grouping | Converted to age groups (18-24, 25-34, etc.) | Implemented |
| PII Removal | firstName, lastName, email, phone, address, DOB, SSN, creditCard | Implemented |

**Privacy Assessment:**
- **GOOD:** Comprehensive anonymization service
- **GOOD:** Daily salt rotation prevents rainbow table attacks
- **CONCERN:** Customer profiles in `customer-insights.service.ts` include PII (email, first_name, last_name) - this data should pass through anonymization before external exposure
- **CONCERN:** No GDPR right-to-erasure implementation visible

---

## 4. ANALYTICS ENGINE

### Architecture (`src/analytics-engine/`)

```
analytics-engine/
├── analytics-engine.ts      # Main orchestrator (placeholder)
├── aggregators/
│   └── metrics-aggregator.ts  # Metric aggregation logic
└── calculators/
    ├── customer-analytics.ts   # CLV, churn, RFM
    ├── predictive-analytics.ts # Forecasting
    └── revenue-calculator.ts   # Revenue calculations
```

### Calculations Performed

| Calculator | Method | Description |
|------------|--------|-------------|
| `RevenueCalculator` | `calculateRevenueByChannel()` | Revenue breakdown by sales channel |
| `RevenueCalculator` | `calculateRevenueByEventType()` | Revenue by event category |
| `RevenueCalculator` | `projectRevenue()` | Future revenue based on 30-day average |
| `CustomerAnalytics` | `calculateCustomerLifetimeValue()` | CLV with segmentation (high/medium/low) |
| `CustomerAnalytics` | `identifyChurnRisk()` | Risk scoring based on recency and purchase history |
| `CustomerAnalytics` | `calculateCustomerSegmentation()` | Full RFM analysis with NTILE scoring |

### Processing Modes

| Mode | Description | Implementation |
|------|-------------|----------------|
| Real-time | WebSocket-based live metrics | `realtime-aggregation.service.ts` |
| Near real-time | 1-minute, 5-minute aggregations | `setInterval()` in aggregation service |
| Batch | Nightly RFM calculations | `node-schedule` cron at 2 AM |

### Error Handling

- Input validation with explicit bounds checking (date ranges, projection days)
- Safe number parsing with default values (`safeParseFloat`, `safeParseInt`)
- Division by zero protection (`safeDivide`)
- Value clamping for scores (`clamp`)
- Try-catch with logging at all entry points

---

## 5. INFLUXDB INTEGRATION

### Service: `src/services/influxdb.service.ts`

| Method | Purpose |
|--------|---------|
| `writeMetric()` | Write single metric point |
| `bulkWriteMetrics()` | Batch write multiple metrics |
| `queryMetrics()` | Query metrics with time window aggregation |
| `aggregateMetrics()` | Aggregate metrics (sum/avg/min/max/count) |
| `healthCheck()` | Verify InfluxDB connectivity |

### Configuration (`src/config/influxdb.ts`)

```typescript
{
  url: 'http://influxdb:8086',
  org: 'tickettoken',
  bucket: 'metrics',
  token: INFLUXDB_TOKEN
}
```

### Metric Types Stored

- Sales velocity (`sales_velocity`)
- Custom metric types passed from callers
- Health check metrics

### Retention Policies

No explicit retention policies configured in code. Uses InfluxDB bucket defaults.

### Migration Script

`src/scripts/migrate-to-influxdb.ts` - Exists for migrating metrics from PostgreSQL to InfluxDB.

---

## 6. REAL-TIME FEATURES

### WebSocket Implementation (`src/services/websocket.service.ts`)

| Method | Purpose |
|--------|---------|
| `broadcastMetricUpdate()` | Push metric updates to subscribers |
| `broadcastWidgetUpdate()` | Push widget data updates |
| `broadcastToVenue()` | Venue-scoped broadcasts |
| `broadcastToUser()` | User-specific broadcasts |
| `subscribeToMetrics()` | Add socket to metric rooms |
| `getConnectedClients()` | Get connection statistics |

### Real-Time Aggregation (`src/services/realtime-aggregation.service.ts`)

| Window | Interval | Retention | Metrics |
|--------|----------|-----------|---------|
| 1-minute | 60s | 1 hour | Sales rate, traffic rate, conversion |
| 5-minute | 300s | 24 hours | Sales, traffic, conversion with averages |
| Hourly | 3600s | 7 days | Unique customers, active events |

### Event Streaming

- Uses Redis pub/sub for real-time metric distribution
- WebSocket rooms: `venue:{venueId}`, `metrics:{metric}:{venueId}`
- Alert monitoring every 30 seconds

### Performance Considerations

- Lazy database connection initialization
- Configurable aggregation windows
- Interval handles stored for graceful shutdown
- Parallel metric fetching with `Promise.all()`

---

## 7. ML & PREDICTIONS

### Implementation Status

| Directory | Status | Description |
|-----------|--------|-------------|
| `src/ml/models/` | Empty | Placeholder for trained models |
| `src/ml/training/` | Empty | Placeholder for training pipelines |

### Prediction Service (`src/services/prediction.service.ts`)

**Uses TensorFlow.js (`@tensorflow/tfjs-node`)** but with placeholder models only.

| Method | Description | Implementation |
|--------|-------------|----------------|
| `predictDemand()` | Demand forecasting | Deterministic based on day of week |
| `optimizePrice()` | Price optimization | Simple elasticity calculation |
| `predictChurn()` | Churn prediction | Based on RFM profile |
| `predictCustomerLifetimeValue()` | CLV prediction | Monthly spend * retention |
| `predictNoShow()` | No-show prediction | Based on customer behavior |
| `runWhatIfScenario()` | What-if analysis | Price change scenarios |

**Note:** The neural networks are created with placeholder architectures but not trained with real data. Current predictions use rule-based heuristics.

### Model Architecture (Placeholder)

```
Input Layer:  10 units
Hidden Layer: 64 units (ReLU) + 20% Dropout
Hidden Layer: 32 units (ReLU)
Output Layer: 1 unit (Sigmoid)
```

---

## 8. WORKERS & BACKGROUND JOBS

### Pricing Worker (`src/workers/pricing-worker.ts`)

| Aspect | Details |
|--------|---------|
| Schedule | Every 15 minutes |
| Trigger | setInterval loop |
| Scope | Events with dynamic pricing enabled, starting within 30 days |
| Actions | Calculate optimal price, queue for approval or auto-apply |

**Process Flow:**
1. Query events with `dynamic_pricing_enabled = true`
2. Get venue pricing rules
3. Calculate optimal price using demand service
4. Skip if change < 5%
5. If `requireApproval`: insert to `pending_price_changes`
6. If auto-approve: update `price_history` and `events.price_cents`

### RFM Calculator Worker (`src/workers/rfm-calculator.worker.ts`)

| Aspect | Details |
|--------|---------|
| Schedule | Daily at 2 AM + on startup |
| Trigger | `node-schedule` cron |
| Scope | All venues with purchase history |
| Distributed Lock | Redis-based (5 min TTL, no retry) |

**Process Flow:**
1. Acquire distributed lock (prevents duplicate runs)
2. Get all venues
3. For each venue:
   - Query customer purchase data
   - Calculate R, F, M scores (1-5 scale)
   - Determine segment and churn risk
   - Upsert to `customer_rfm_scores`
4. Update segment summaries
5. Calculate CLV for all customers
6. Release lock

**Scoring Logic:**
- Recency: ≤30d=5, ≤60d=4, ≤90d=3, ≤180d=2, >180d=1
- Frequency: ≥10=5, ≥7=4, ≥4=3, ≥2=2, 1=1
- Monetary: Percentile-based (top 20%=5, etc.)

---

## 9. RABBITMQ EVENT CONSUMPTION

### Configuration (`src/config/rabbitmq.ts`)

```typescript
Exchange: config.rabbitmq.exchange (topic)
Queue: config.rabbitmq.queue (durable, non-exclusive)
Binding: '#' (all routing keys)
```

### Event Processors (`src/processors/index.ts`)

**Status:** Placeholder implementation

```typescript
export async function startEventProcessors() {
  logger.info('Starting event processors...');
  // Placeholder - processors not implemented
  logger.info('Event processors started');
}
```

**Planned processors (not implemented):**
- Ticket event processor
- Venue event processor
- Payment event processor
- Marketplace event processor
- User event processor

### Message Publishing

The service **publishes** messages but does not consume them:

| Publisher | Routing Key | Purpose |
|-----------|-------------|---------|
| `message-gateway.service.ts` | `messages.{channel}` | Email/SMS/push notifications |

---

## 10. EXPORT & REPORTING

### Export Service (`src/services/export.service.ts`)

| Export Type | Formats | Description |
|-------------|---------|-------------|
| `ANALYTICS_REPORT` | CSV, XLSX, PDF | Analytics data export |
| `CUSTOMER_LIST` | CSV, XLSX | Customer data with segments |
| `FINANCIAL_REPORT` | XLSX, PDF | Financial summary |

### Export Process

1. Create export record (status: PENDING)
2. Process async (status: PROCESSING)
3. Generate file based on type and format
4. Upload to storage (mock implementation)
5. Update record (status: COMPLETED/FAILED)
6. Send notification via RabbitMQ

### File Generation

| Format | Library | Implementation |
|--------|---------|----------------|
| CSV | `json2csv` | `Parser().parse(data)` |
| XLSX | `exceljs` | Workbook with multiple sheets |
| PDF | `pdfkit` | Basic text layout |

### Large Dataset Handling

- Async processing (non-blocking)
- Temp file storage (`/tmp/`)
- File cleanup after upload
- File size tracking
- 7-day expiration for downloads

---

## 11. CODE QUALITY

### TODO/FIXME Comments

**None found** - The codebase has no TODO or FIXME comments.

### `any` Type Usage

**61 files contain `any` type usage.** Notable occurrences:

| File | Context |
|------|---------|
| `config/database.ts:9` | `db: any`, `analyticsDb: any` |
| `config/dependencies.ts:5-15` | All dependency interface properties |
| `config/rabbitmq.ts:5-6` | `connection: any`, `channel: any` |
| `workers/pricing-worker.ts:47` | Event processing parameter |
| `workers/rfm-calculator.worker.ts:79` | Venue mapping |
| Most controllers | Request/response handlers |

### Error Handling Patterns

- **Good:** Try-catch with structured logging
- **Good:** Custom error classes (`BadRequestError`)
- **Good:** Error propagation with context
- **Concern:** Some catch blocks only log without rethrowing

### Dependencies

**Production dependencies:** 35+
**Key frameworks:**
- Fastify 4.26.0
- Knex 3.1.0 (PostgreSQL)
- Mongoose 7.4.1 (MongoDB)
- ioredis 5.3.2 (Redis)
- @influxdata/influxdb-client 1.35.0
- @tensorflow/tfjs-node 4.22.0
- Socket.io 4.8.1
- amqplib 0.10.9

---

## 12. COMPARISON WITH PREVIOUS AUDITS

| Aspect | marketplace-service | notification-service | analytics-service |
|--------|---------------------|----------------------|-------------------|
| Total Files | ~80 | ~60 | 128 |
| Service Boundary Violations | 5-10 | 2-3 | **15+ (HIGHEST)** |
| Multi-tenant RLS | Yes | Yes | Yes |
| HMAC Auth | Yes | Yes | Yes |
| Cache Tenant Isolation | Partial | Yes | Yes (fixed) |
| ML Integration | No | No | **Yes (TensorFlow)** |
| Real-time WebSocket | No | Yes | **Yes** |
| InfluxDB | No | No | **Yes** |
| Background Workers | Yes | Yes | **Yes (2 workers)** |

---

## FINAL SUMMARY

### CRITICAL ISSUES

1. **SERVICE BOUNDARY VIOLATION (WRITE):** `dynamic-pricing.service.ts:147` performs `UPDATE events SET price_cents` - this writes to a table owned by event-service. Should use internal API call instead.

2. **EXTENSIVE READ VIOLATIONS:** 15+ direct table accesses to auth-service, order-service, event-service, venue-service, ticket-service, payment-service, and marketplace-service tables.

### HIGH PRIORITY

1. **ML Models Not Trained:** TensorFlow.js is installed but models use placeholder weights. Predictions are rule-based heuristics.

2. **Event Processors Not Implemented:** RabbitMQ consumers are placeholder code only.

3. **PII Exposure Risk:** Customer profile queries return raw PII (email, name) without passing through anonymization service.

4. **No GDPR Right-to-Erasure:** No implementation for deleting customer analytics data on request.

### MEDIUM PRIORITY

1. **61 files with `any` type** - Reduces type safety
2. **Export storage is mock** - `uploadToStorage()` returns fake URLs
3. **No InfluxDB retention policies** configured in code
4. **Redis connection error handling** could cause silent failures

### DATA ARCHITECTURE

| Assessment | Rating |
|------------|--------|
| Multi-database strategy | **Excellent** - Appropriate DB for each workload |
| Tenant isolation | **Good** - RLS + cache key prefixing |
| Read replica pattern | **Documented** - Exception acknowledged but concerning |
| Materialized views | **Well-designed** - Refresh functions included |

### SERVICE BOUNDARY VIOLATIONS

| Category | Count | Severity |
|----------|-------|----------|
| READ operations to external tables | 14 | Medium (documented exception) |
| WRITE operations to external tables | 1 | **Critical** |
| Views depending on external tables | 25+ | Medium (migration-time only) |

---

## METRICS

```
Files Analyzed:        128
Critical Issues:       1 (WRITE to external table)
High Priority Issues:  4
Medium Priority Issues: 4
Service Boundary Violations: 15+ (1 critical write, 14+ reads)
TODO/FIXME Comments:   0
Files with `any` type: 61
PostgreSQL Tables:     15 (analytics-owned)
PostgreSQL Views:      36 + 5 materialized
MongoDB Collections:   4
Background Workers:    2
External Table Access: HIGH (by design as read-replica pattern)
Assessment:            COMPLEX SERVICE - Well-architected multi-DB analytics
                       platform with acknowledged service boundary exceptions.
                       The single WRITE violation is critical and must be fixed.
```

---

## RECOMMENDATIONS

1. **CRITICAL:** Convert `dynamic-pricing.service.ts:147` UPDATE to internal API call to event-service
2. **HIGH:** Implement RabbitMQ event consumers to replace direct DB reads
3. **HIGH:** Add anonymization wrapper to customer profile endpoints
4. **MEDIUM:** Train actual ML models or remove TensorFlow dependency
5. **MEDIUM:** Add GDPR data deletion capability
6. **LOW:** Reduce `any` type usage with proper interfaces
