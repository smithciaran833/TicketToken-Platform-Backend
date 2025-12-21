# Monitoring Service - Service Overview

**Purpose:** Central monitoring hub providing real-time metrics collection, alerting, fraud detection, SLA tracking, dashboard visualization, anomaly detection using ML, and comprehensive observability for the TicketToken platform.

**Port:** 3009

---

## 📁 Directory Structure

```
src/
├── routes/          # API route definitions
├── controllers/     # Request handlers
├── services/        # Business logic
├── middleware/      # Request middleware
├── config/          # Configuration
├── migrations/      # Database migrations
├── validators/      # (None - validation in middleware)
├── collectors/      # Metric collectors
├── workers/         # Background workers
├── ml/              # Machine learning models
├── alerting/        # Alert management
├── analytics/       # Business analytics
├── streaming/       # Kafka streaming
├── checkers/        # Health checkers
├── models/          # Data models
└── utils/           # Utility functions
```

---

## 🛣️ Routes

### **alert.routes.ts**
| Method | Path | Handler | Middleware | Description |
|--------|------|---------|------------|-------------|
| GET | `/` | `getActiveAlerts` | authenticate | Get active alerts |
| GET | `/:id` | `getAlert` | authenticate | Get specific alert |
| POST | `/:id/acknowledge` | `acknowledgeAlert` | authenticate, authorize(admin/operator) | Acknowledge alert |
| POST | `/:id/resolve` | `resolveAlert` | authenticate, authorize(admin/operator) | Resolve alert |
| GET | `/history` | `getAlertHistory` | authenticate | Get alert history |
| GET | `/rules` | `getAlertRules` | authenticate | List alert rules |
| POST | `/rules` | `createAlertRule` | authenticate, authorize(admin) | Create alert rule |
| PUT | `/rules/:id` | `updateAlertRule` | authenticate, authorize(admin) | Update alert rule |
| DELETE | `/rules/:id` | `deleteAlertRule` | authenticate, authorize(admin) | Delete alert rule |

### **analytics.routes.ts**
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/sales/:eventId` | (inline) | Get sales metrics for event |
| POST | `/sales/track` | (inline) | Track ticket sale |
| POST | `/fraud/check` | (inline) | Check for fraud patterns |
| GET | `/fraud/metrics` | (inline) | Get fraud detection metrics |
| GET | `/dashboard` | (inline) | Combined analytics dashboard |

### **dashboard.routes.ts**
| Method | Path | Handler | Middleware | Description |
|--------|------|---------|------------|-------------|
| GET | `/overview` | `getOverview` | authenticate | Get dashboard overview |
| GET | `/sla` | `getSLAMetrics` | authenticate | Get SLA metrics |
| GET | `/performance` | `getPerformanceMetrics` | authenticate | Get performance metrics |
| GET | `/business` | `getBusinessMetrics` | authenticate | Get business metrics |
| GET | `/incidents` | `getIncidents` | authenticate | Get incidents |

### **grafana.routes.ts** (Grafana Integration)
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/` | (inline) | Grafana health check |
| POST | `/search` | (inline) | Search for metrics |
| POST | `/query` | (inline) | Query time series data |
| POST | `/annotations` | (inline) | Get annotations (fraud events) |

### **health.routes.ts**
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/` | `getHealth` | Overall health status |
| GET | `/:service` | `getServiceHealth` | Specific service health |
| GET | `/services/all` | `getAllServicesHealth` | All services health |
| GET | `/dependencies` | `getDependenciesHealth` | Dependencies health |

### **metrics.routes.ts**
| Method | Path | Handler | Middleware | Description |
|--------|------|---------|------------|-------------|
| GET | `/` | `getMetrics` | authenticate | Get recent metrics |
| GET | `/latest` | `getLatestMetrics` | authenticate | Get latest metric values |
| GET | `/service/:service` | `getMetricsByService` | authenticate | Get metrics for service |
| POST | `/` | `pushMetrics` | authenticate, authorize(admin/monitoring) | Push new metrics |
| GET | `/export` | `exportPrometheusMetrics` | - | Prometheus export (special auth) |

### **status.routes.ts**
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/` | (inline) | Service status and uptime |

---

## 🎛️ Controllers

### **AlertController** (`alert.controller.ts`)
- `getActiveAlerts()` - Retrieve currently active alerts
- `getAlert()` - Get specific alert by ID
- `acknowledgeAlert()` - Acknowledge an alert
- `resolveAlert()` - Mark alert as resolved
- `getAlertHistory()` - Get historical alerts
- `getAlertRules()` - List all alert rules
- `createAlertRule()` - Create new alert rule
- `updateAlertRule()` - Update existing alert rule
- `deleteAlertRule()` - Delete alert rule

### **DashboardController** (`dashboard.controller.ts`)
- `getOverview()` - Get comprehensive dashboard overview
- `getSLAMetrics()` - Get SLA compliance metrics
- `getPerformanceMetrics()` - Get performance statistics
- `getBusinessMetrics()` - Get business KPIs
- `getIncidents()` - Get incident reports

### **HealthController** (`health.controller.ts`)
- `getHealth()` - Overall system health
- `getServiceHealth()` - Health of specific service
- `getAllServicesHealth()` - Health status of all microservices
- `getDependenciesHealth()` - Health of external dependencies

### **MetricsController** (`metrics.controller.ts`)
- `getMetrics()` - Retrieve metrics based on query
- `pushMetrics()` - Accept metrics from services
- `exportPrometheusMetrics()` - Export in Prometheus format
- `getLatestMetrics()` - Get latest value for each metric
- `getMetricsByService()` - Get all metrics for specific service

---

## 🔧 Services

### **AlertService** (`alert.service.ts`)
Manages alerts and alert rules.
- `getActiveAlerts()` - Get active alerts
- `getAlert()` - Get alert by ID
- `acknowledgeAlert()` - Acknowledge alert
- `resolveAlert()` - Resolve alert
- `getAlertHistory()` - Get alert history
- `getAlertRules()` - List alert rules
- `createAlertRule()` - Create alert rule
- `updateAlertRule()` - Update alert rule
- `deleteAlertRule()` - Delete alert rule

**Tables Used:** `alerts`, `alert_rules`

### **CacheIntegrationService** (`cache-integration.ts`)
Redis caching layer.
- `get()` - Get cached value with optional fetcher
- `set()` - Set cached value with TTL
- `delete()` - Delete cached keys
- `flush()` - Flush cache

### **DashboardService** (`dashboard.service.ts`)
Dashboard data aggregation.
- `getOverview()` - Get dashboard overview
- `getSLAMetrics()` - Get SLA metrics
- `getPerformanceMetrics()` - Get performance metrics
- `getBusinessMetrics()` - Get business metrics
- `getIncidents()` - Get incidents
- `getRecentMetrics()` - Get recent metrics (private)

**Tables Used:** `metrics`, `alerts`, `incidents`, `sla_metrics`, `performance_metrics`

### **DashboardBuilderService** (`dashboard-builder.service.ts`)
Custom dashboard creation and management.
- `createDashboard()` - Create new dashboard
- `getDashboard()` - Get dashboard by ID
- `listDashboards()` - List user's dashboards
- `updateDashboard()` - Update dashboard
- `deleteDashboard()` - Delete dashboard
- `duplicateDashboard()` - Duplicate dashboard

**Tables Used:** `dashboards`

### **DashboardAggregatorService** (`dashboard-aggregator.service.ts`)
Aggregates system-wide metrics.
- `getSystemStatus()` - Get overall system status
- `getMetricsSummary()` - Get metrics summary

**Tables Used:** `metrics`, `alerts`, `incidents`

### **HealthService** (`health.service.ts`)
Service and dependency health monitoring.
- `getOverallHealth()` - Get overall health status
- `getServiceHealth()` - Get specific service health
- `getAllServicesHealth()` - Get all services health
- `getDependenciesHealth()` - Get dependencies health

**External Calls:** HTTP health checks to all microservices

### **MetricsService** (`metrics.service.ts`)
Metrics collection and querying.
- `pushMetrics()` - Ingest metrics data
- `queryMetrics()` - Query metrics by criteria
- `getPrometheusRegistry()` - Get Prometheus registry
- `streamMetricToKafka()` - Stream metric to Kafka

**Tables Used:** `metrics`
**External Services:** Kafka, Prometheus

### **ReportBuilderService** (`report-builder.service.ts`)
Custom report generation.
- `createReport()` - Create report definition
- `getReport()` - Get report by ID
- `listReports()` - List reports
- `updateReport()` - Update report
- `deleteReport()` - Delete report
- `generateReport()` - Generate report
- `getReportHistory()` - Get report generation history
- `getScheduledReports()` - Get scheduled reports

**Tables Used:** `reports`, `report_history`

### **SolanaService** (`solana.service.ts`)
Solana blockchain monitoring and operations.
- `mintTicketNFT()` - Mint NFT ticket
- `transferNFT()` - Transfer NFT
- `verifyOwnership()` - Verify NFT ownership
- `getTransactionStatus()` - Get transaction status
- `checkExistingMint()` - Check if ticket already minted
- `storeMintRecord()` - Store mint record
- `storeTransferRecord()` - Store transfer record
- `retryMint()` - Retry failed mint
- `recordMetrics()` - Record blockchain metrics
- `healthCheck()` - Check Solana connection health

**Tables Used:** `nft_transfers`, `metrics`
**External Services:** Solana RPC

### **WebSocketService** (`websocket.service.ts`)
Real-time WebSocket connections (basic).
- `initialize()` - Initialize WebSocket server
- `broadcast()` - Broadcast to all clients
- `getConnectionCount()` - Get connection count

### **WebSocketManagerService** (`websocket-manager.service.ts`)
Advanced WebSocket management with subscriptions.
- `initialize()` - Initialize WebSocket server
- `handleConnection()` - Handle new connection
- `handleMessage()` - Process client message
- `handleSubscribe()` - Subscribe to metrics
- `handleUnsubscribe()` - Unsubscribe from metrics
- `handleAuth()` - Authenticate connection
- `handleDisconnection()` - Handle disconnection
- `broadcastMetricUpdate()` - Broadcast metric update
- `broadcastAlert()` - Broadcast alert
- `send()` - Send message to client
- `startHeartbeat()` - Start heartbeat checker
- `getConnectionCount()` - Get connection count
- `getActiveSubscriptions()` - Get subscription stats
- `shutdown()` - Shutdown WebSocket server

---

## 🗄️ Repositories

**Note:** This service does not use a separate repository pattern. Database queries are executed directly within service classes using Knex query builder.

**Tables Queried:**
- `alerts`
- `alert_rules`
- `dashboards`
- `metrics`
- `nft_transfers`
- `fraud_events`
- `incidents`
- `sla_metrics`
- `performance_metrics`
- `reports`
- `report_history`

---

## 🛡️ Middleware

### **auth.middleware.ts**
JWT authentication and authorization.
- `authenticate()` - Verify JWT token
- `authorize(...roles)` - Check user roles

### **metrics-auth.middleware.ts**
Special authentication for Prometheus scrapers.
- `metricsAuth()` - IP whitelist + Basic Auth for `/metrics/export`
- `parseIPWhitelist()` - Parse allowed IPs from env
- `parseBasicAuth()` - Parse Basic Auth credentials
- `getClientIP()` - Extract client IP
- `isIPAllowed()` - Check if IP is whitelisted
- `isIPInCIDR()` - Check if IP in CIDR range
- `checkBasicAuth()` - Verify Basic Auth

### **tenant-context.ts**
Multi-tenant context management.
- `setTenantContext()` - Extract and set tenant ID in context

### **validation.middleware.ts**
Input validation utilities.
- `validate()` - Validate request data against schema
- `sanitizeString()` - Sanitize string input
- `isValidUUID()` - UUID validation
- `isValidDateRange()` - Date range validation

---

## ⚙️ Config

### **database.ts**
PostgreSQL database configuration using Knex.
- Connection pool: 2-10 connections
- PgBouncer on port 6432
- Migrations table: `knex_migrations_monitoring`

### **integration.ts**
Service integration configuration.
- **Marketplace Integration:** Ticket sales, fraud checks
- **Service URLs:** All 10+ microservices
- **Kafka Topics:** 
  - Owned: `metrics-stream`, `fraud-events`, `alerts-stream`
  - Subscribed: `ticket-sales`, `user-activity`, `chain-events`, `smart-contract-calls`
- **Shared Databases:** PostgreSQL, Redis

### **secrets.ts**
AWS Secrets Manager integration (references shared config).

### **index.ts**
Central configuration export.

---

## 📊 Migrations

### **001_baseline_monitoring_schema.ts**
**Creates 11 tables with full tenant isolation:**

1. **`alerts`** - Alert records
   - Columns: id, name, type, severity, message, source, metadata, resolved, resolved_at, tenant_id
   - Indexes: tenant_id, resolved, severity, type, source, created_at

2. **`alert_rules`** - Alert rule definitions
   - Columns: id, rule_name, metric_name, condition, threshold, severity, enabled, tenant_id
   - Indexes: tenant_id, enabled, metric_name, severity

3. **`dashboards`** - Custom dashboards
   - Columns: id, name, description, widgets, layout, owner, shared, tenant_id
   - Indexes: tenant_id, owner, shared, name

4. **`metrics`** - Time-series metrics
   - Columns: id, name, metric_name, service_name, value, metric_type, unit, service, labels, tags, timestamp, tenant_id
   - Indexes: tenant_id, name, metric_name, service, service_name, timestamp (multiple composite indexes)

5. **`nft_transfers`** - NFT transfer records
   - Columns: id, token_address, from_address, to_address, amount, signature, status, tenant_id
   - Indexes: tenant_id, token_address, from/to addresses, created_at

6. **`fraud_events`** - Fraud detection events
   - Columns: id, user_id, pattern, risk_level, timestamp, data, investigated, investigated_at, tenant_id
   - Indexes: tenant_id, user_id, pattern, risk_level, timestamp, investigated
   - Unique constraint: (user_id, pattern, timestamp)

7. **`incidents`** - System incidents
   - Columns: id, title, description, status, severity, service_name, detected_at, resolved_at, tenant_id
   - Indexes: tenant_id, status, severity, detected_at, service_name, composite index

8. **`sla_metrics`** - SLA compliance tracking
   - Columns: id, service_name, uptime_percentage, response_time_p95, violations, period_start, period_end, tenant_id
   - Indexes: tenant_id, service_name, period_start, composite index

9. **`performance_metrics`** - HTTP performance tracking
   - Columns: id, service_name, endpoint, response_time_ms, status_code, method, timestamp, tenant_id
   - Indexes: tenant_id, service_name, endpoint, timestamp, composite index

10. **`reports`** - Report definitions
    - Columns: id, user_id, name, description, query, format, schedule, is_public, tenant_id
    - Indexes: tenant_id, user_id, is_public, schedule, created_at

11. **`report_history`** - Report generation history
    - Columns: id, report_id, generated_at, status, file_url, error, tenant_id
    - Foreign Key: report_id → reports.id (CASCADE)
    - Indexes: tenant_id, report_id, generated_at, status

**Additional Features:**
- **Row Level Security (RLS):** Enabled on all tables with tenant isolation policies
- **Triggers:** Auto-update `updated_at` columns
- **Cleanup Functions:** 
  - `cleanup_old_metrics()` - Remove metrics older than 90 days
  - `cleanup_old_fraud_events()` - Remove investigated fraud events older than 1 year
- **UUID Extension:** Enabled for primary keys

---

## ✅ Validators

**No dedicated validators folder.** Validation logic is implemented in `validation.middleware.ts` with inline validation functions.

---

## 📦 Other Folders

### **collectors/** - Metric Collectors
Collects metrics from various sources at regular intervals.

**Structure:**
- `application/` - Application-level collectors
  - `database.collector.ts` - Database metrics
  - `http.collector.ts` - HTTP request metrics
- `blockchain/` - Blockchain collectors
  - `blockchain.collector.ts` - Solana blockchain metrics
  - `fraud.collector.ts` - Blockchain fraud patterns
- `business/` - Business metrics
  - `revenue.collector.ts` - Revenue tracking
- `system/` - System metrics
  - `cpu.collector.ts` - CPU utilization
  - `disk.collector.ts` - Disk usage
  - `memory.collector.ts` - Memory usage
- `index.ts` - Collector initialization
  - `initializeCollectors()` - Start all collectors
  - `stopCollectors()` - Stop all collectors
  - `initializeBlockchainCollectors()` - Start blockchain collectors

### **workers/** - Background Workers
Scheduled background jobs for processing.

**Workers:**

1. **`alert-evaluation.worker.ts`** - Alert Rule Evaluation
   - `start()` - Start evaluation loop
   - `evaluate()` - Check metrics against alert rules
   - `isInCooldown()` - Check alert cooldown period
   - `recordCooldown()` - Record cooldown

2. **`metric-aggregation.worker.ts`** - Metric Aggregation
   - `start()` - Start aggregation
   - `aggregate()` - Aggregate metrics
   - `aggregateTimeWindow()` - Aggregate by time window (1m, 5m, 1h, 1d)

3. **`ml-analysis.worker.ts`** - ML Analysis
   - `start()` - Start ML analysis
   - `analyze()` - Run ML analysis
   - `analyzePaymentPatterns()` - Analyze payment fraud
   - `analyzeTicketSales()` - Analyze ticket sales patterns
   - `analyzeSystemPerformance()` - Analyze system performance
   - `predictLoad()` - Predict future load

4. **`report-generation.worker.ts`** - Report Generation
   - `start()` - Start report generation
   - `scheduleDailyReports()` - Schedule daily reports
   - `scheduleWeeklyReports()` - Schedule weekly reports
   - `generateDailyReport()` - Generate daily report
   - `generateWeeklyReport()` - Generate weekly report
   - Various metric aggregation methods

5. **`cleanup.worker.ts`** - Data Cleanup
   - `start()` - Start cleanup worker
   - `scheduleDaily()` - Schedule daily cleanup
   - `cleanup()` - Run cleanup
   - `cleanOldAlerts()` - Clean resolved alerts
   - `cleanOldAggregations()` - Clean old aggregated data
   - `cleanElasticsearch()` - Clean Elasticsearch indices

### **ml/** - Machine Learning
ML models for anomaly and fraud detection.

**Structure:**
- `detectors/`
  - **`anomaly-detector.ts`** - Anomaly Detection using Autoencoders
    - `initializeModel()` - Initialize TensorFlow model
    - `trainOnHistoricalData()` - Train on historical metrics
    - `detectAnomaly()` - Detect anomalies in metrics
    - `simpleAnomalyDetection()` - Fallback statistical detection
    - `checkAllMetrics()` - Continuous monitoring
    
  - **`fraud-ml-detector.ts`** - Fraud Pattern Detection
    - `detectScalperPattern()` - Detect ticket scalping
    - `detectBotActivity()` - Detect bot patterns
    - `detectTimePattern()` - Analyze timing patterns
    - `trainOnHistoricalFraud()` - Train on fraud data

- `models/` - ML model storage
- `predictions/` - Prediction engine
  - `predictive-engine.ts` - Predictive analytics
- `trainers/` - Model training utilities

### **alerting/** - Alert Management System
Comprehensive alerting infrastructure.

**Structure:**
- **`alert.manager.ts`** - Central alert manager
- **`default-rules.ts`** - Default alert rules
- `rules/`
  - **`rule.engine.ts`** - Alert rule evaluation engine
- `channels/`
  - **`notification.manager.ts`** - Multi-channel notifications (email, SMS, Slack, PagerDuty)
- `escalation/`
  - **`escalation.manager.ts`** - Alert escalation logic
- `index.ts` - Alerting system initialization

### **analytics/** - Business Analytics
Business intelligence and fraud analytics.

- **`sales-tracker.ts`** - Sales Analytics
  - `getEventMetrics()` - Get event sales metrics
  - `trackSale()` - Track ticket sale
  
- **`advanced-fraud-ml.ts`** - Advanced Fraud Detection
  - `detectFraud()` - ML-based fraud detection
  - `getFraudMetrics()` - Get fraud metrics

### **streaming/** - Kafka Streaming
Real-time event streaming.

- **`kafka-producer.ts`** - Kafka producer
- **`kafka-consumer.ts`** - Kafka consumer
- **`stream-processor.ts`** - Stream processing
- **`kafka-init.ts`** - Kafka initialization
- `index.ts` - Streaming initialization

### **checkers/** - Health Checkers
Service health checking utilities.

- **`database.checker.ts`** - Database health
- **`redis.checker.ts`** - Redis health
- **`service.checker.ts`** - Microservice health
- `index.ts` - Checker initialization

### **models/** - Data Models
TypeScript interfaces and types.

- **`Alert.ts`** - Alert model
- **`Dashboard.ts`** - Dashboard model
- **`Metric.ts`** - Metric model

### **aggregators/** - Data Aggregation
Metric aggregation logic (separate from workers).

### **utils/** - Utilities
- **`database.ts`** - Database utilities
- **`logger.ts`** - Logging utilities

---

## 🗄️ Database Tables Owned by This Service

Based on migrations, this service owns **11 tables**:

1. **`alerts`** - Alert records
2. **`alert_rules`** - Alert rule definitions
3. **`dashboards`** - Custom dashboard configurations
4. **`metrics`** - Time-series metrics data
5. **`nft_transfers`** - NFT transfer tracking
6. **`fraud_events`** - Fraud detection events
7. **`incidents`** - System incidents
8. **`sla_metrics`** - SLA compliance metrics
9. **`performance_metrics`** - API performance tracking
10. **`reports`** - Report definitions
11. **`report_history`** - Report generation history

**All tables include:**
- `tenant_id` column for multi-tenant isolation
- Row Level Security (RLS) policies
- Comprehensive indexes for performance
- `created_at` and `updated_at` timestamps where applicable

---

## 🔗 External Service Integrations

### **Configured in Code:**

1. **PostgreSQL** (database.ts)
   - Primary data store
   - PgBouncer on port 6432
   - Pool: 2-10 connections

2. **Redis** (cache-integration, integration.ts)
   - Caching layer
   - Session storage
   - Rate limiting

3. **Kafka** (streaming/, integration.ts)
   - Real-time event streaming
   - Topics: `metrics-stream`, `fraud-events`, `alerts-stream`
   - Consumer for: `ticket-sales`, `user-activity`, `chain-events`

4. **Elasticsearch** (cleanup.worker.ts)
   - Log aggregation
   - Full-text search
   - Data cleanup

5. **MongoDB** (status.routes.ts)
   - Document storage
   - Health monitoring

6. **InfluxDB** (status.routes.ts)
   - Time-series database
   - Metrics storage

7. **Grafana** (grafana.routes.ts)
   - Visualization dashboards
   - Custom data source endpoints

8. **Prometheus** (metrics.service.ts)
   - Metrics export
   - Scraping endpoint

9. **Solana RPC** (solana.service.ts)
   - Blockchain monitoring
   - NFT operations
   - Transaction tracking

10. **All Microservices** (health.service.ts, integration.ts)
    - Auth Service (port 3001)
    - Venue Service (port 3002)
    - Event Service (port 3003)
    - Ticket Service (port 3004)
    - Payment Service (port 3006)
    - Marketplace Service (port 3006)
    - Notification Service (port 3010)
    - Blockchain Service (port 3011)
    - Analytics Service (port 3016)
    - And more...

11. **Notification Channels** (alerting/channels/)
    - Email (SendGrid/SMTP)
    - SMS (Twilio)
    - Slack
    - PagerDuty

---

## 📝 Key Features

### **✅ Implemented:**
1. **Real-Time Metrics Collection** - Multi-source metric ingestion
2. **Alert Management** - Rule-based alerting with escalation
3. **SLA Monitoring** - Uptime and performance tracking
4. **Fraud Detection** - ML-based fraud pattern detection
5. **Anomaly Detection** - Autoencoder-based anomaly detection
6. **Custom Dashboards** - User-created dashboard builder
7. **Grafana Integration** - Complete Grafana data source API
8. **Prometheus Export** - Prometheus scraping endpoint
9. **WebSocket Streaming** - Real-time metric updates
10. **Incident Management** - Incident tracking and resolution
11. **Report Generation** - Scheduled and on-demand reports
12. **Health Monitoring** - Comprehensive health checks
13. **NFT Tracking** - Solana NFT minting and transfer monitoring
14. **Kafka Streaming** - Event-driven architecture
15. **Multi-Tenant Isolation** - Complete tenant data segregation
16. **Performance Tracking** - HTTP request performance monitoring
17. **Background Workers** - Automated data processing
18. **Data Retention** - Automated cleanup of old data
19. **ML Analytics** - Predictive load forecasting
20. **Sales Analytics** - Business metrics tracking

### **🎯 Advanced Features:**
- **Machine Learning:**  TensorFlow.js anomaly detection
- **Fraud Detection:** Pattern recognition for scalpers and bots
- **Predictive Analytics:** Load forecasting
- **Auto-scaling Triggers:** Based on metrics
- **Alert Escalation:** Multi-level alert routing
- **Report Scheduling:** Daily/weekly automated reports

---

## 🔐 Security Features

1. **JWT Authentication** - Token-based auth for API endpoints
2. **Role-Based Authorization** - Admin/operator/monitoring roles
3. **Row Level Security (RLS)** - Tenant isolation at DB level
4. **IP Whitelisting** - For Prometheus scraper
5. **Basic Auth** - For metrics export endpoint
6. **Tenant Context Middleware** - Automatic tenant detection
7. **Input Validation** - Sanitization and validation
8. **WebSocket Authentication** - Token-based WS auth

---

## 📈 Monitoring & Observability

1. **Self-Monitoring** - Monitors own health
2. **Metrics Collection** - From all microservices
3. **Grafana Dashboards** - Real-time visualization
4. **Prometheus Export** - Industry-standard format
5. **Alert Rules** - Configurable thresholds
6. **Health Checks** - Comprehensive dependency checks
7. **Performance Tracking** - API response times
8. **SLA Compliance** - Uptime tracking
9. **Incident Tracking** - Incident lifecycle management

---

## 🚀 Getting Started

### **Prerequisites:**
- PostgreSQL 14+ (via PgBouncer on port 6432)
- Redis 6+
- Kafka 2.8+
- Elasticsearch 7+ (optional)
- InfluxDB 2+ (optional)
- MongoDB 4+ (optional)
- Solana RPC endpoint
- All TicketToken microservices running

### **Environment Variables:**
```env
# Database
DB_HOST=postgres
DB_PORT=6432
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=<password>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Kafka
KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=monitoring-service

# Service URLs (for health checks)
AUTH_SERVICE_URL=http://auth-service:3001
VENUE_SERVICE_URL=http://venue-service:3002
# ... etc for all services

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WALLET_PRIVATE_KEY=<wallet-key>

# Monitoring
METRICS_IP_WHITELIST=10.0.0.0/8,172.16.0.0/12
METRICS_BASIC_AUTH_USER=prometheus
METRICS_BASIC_AUTH_PASS=<password>

# Notifications
SENDGRID_API_KEY=<key>
TWILIO_ACCOUNT_SID=<sid>
TWILIO_AUTH_TOKEN=<token>
SLACK_WEBHOOK_URL=<url>
PAGERDUTY_API_KEY=<key>

# Service
PORT=3009
NODE_ENV=production
SERVICE_NAME=monitoring-service
```

### **Running Migrations:**
```bash
npm run migrate:latest
```

### **Starting Service:**
```bash
npm run dev          # Development
npm run build        # Build
npm start            # Production
```

### **Starting Workers:**
Workers start automatically with the service.

---

## 📚 Additional Notes

- **Central Hub:** Monitors all TicketToken services
- **No Repository Pattern:** Direct Knex queries in services
- **Multi-Database:** PostgreSQL (primary), Redis, Kafka, Elasticsearch, InfluxDB, MongoDB
- **Real-Time:** WebSocket streaming for live updates
- **ML-Powered:** TensorFlow.js for anomaly and fraud detection
- **Grafana-Compatible:** Full Grafana data source API
- **Prometheus-Compatible:** Standard Prometheus export
- **Multi-Tenant:** Complete tenant isolation with RLS
- **Scalable:** Kafka-based event streaming
- **Self-Healing:** Automated alerting and escalation
- **Data Retention:** Automated cleanup (90 days for metrics)

---

**Last Updated:** 2025-12-21  
**Service Version:** Production-Ready with ML
