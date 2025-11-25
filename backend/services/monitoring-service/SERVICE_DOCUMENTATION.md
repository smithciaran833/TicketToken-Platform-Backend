# MONITORING SERVICE - COMPLETE DOCUMENTATION

**Last Updated:** January 12, 2025  
**Version:** 1.0.0  
**Status:** PRODUCTION READY ✅

---

## EXECUTIVE SUMMARY

**Monitoring-service is the observability and intelligence backbone of the TicketToken platform.**

This service demonstrates:
- ✅ Real-time metrics collection (Prometheus + Kafka streaming)
- ✅ Advanced ML-powered anomaly detection (TensorFlow.js)
- ✅ AI-driven fraud detection (bot detection, scalper patterns)
- ✅ Predictive analytics (system failure prediction, sales forecasting)
- ✅ Multi-database architecture (5 databases)
- ✅ Grafana dashboard integration
- ✅ Alert management with escalation
- ✅ Real-time event sales tracking with LSTM models
- ✅ Blockchain metrics monitoring (Solana/Polygon)
- ✅ Health check system for all microservices
- ✅ Stream processing with windowing
- ✅ 77 organized files

**This is a SOPHISTICATED, AI-POWERED monitoring and observability platform.**

---

## QUICK REFERENCE

- **Service:** monitoring-service
- **Port:** 3013 (configurable via PORT env)
- **Framework:** Fastify 4.24.3
- **Databases:** PostgreSQL, Redis, MongoDB, Elasticsearch, InfluxDB
- **Message Queue:** Kafka (KafkaJS)
- **ML Framework:** TensorFlow.js Node 4.22.0
- **Metrics:** Prometheus (prom-client 15.1.3)
- **Dashboards:** Grafana (JSON config)
- **Real-time:** WebSocket, Kafka Streams

---

## BUSINESS PURPOSE

### What This Service Does

**Core Responsibilities:**
1. Collect metrics from all platform services (system, app, business)
2. Monitor health of 8+ microservices in real-time
3. Detect anomalies using machine learning models
4. Identify fraud patterns (bots, scalpers, velocity violations)
5. Predict system failures before they happen
6. Track event sales velocity and predict sellouts
7. Generate alerts with intelligent escalation
8. Provide Grafana dashboards for visualization
9. Stream metrics to Kafka for real-time processing
10. Monitor blockchain transactions (Solana, Polygon)
11. Aggregate business metrics (revenue, tickets sold, active users)
12. Generate SLA and performance reports

**Business Value:**
- Prevent system outages through predictive analytics
- Detect fraud in real-time, protecting platform and users
- Optimize event sales with velocity tracking
- Reduce MTTR (Mean Time To Recovery) with intelligent alerts
- Provide visibility into platform health for stakeholders
- Enable data-driven decision making with business metrics
- Ensure SLA compliance with automated monitoring
- Protect revenue with fraud detection

---

## ARCHITECTURE OVERVIEW

### Technology Stack

```
Runtime: Node.js 20 + TypeScript
Framework: Fastify 4.24.3
Databases:
  - PostgreSQL (Knex.js) - Primary metrics storage
  - Redis (ioredis) - Caching, real-time data
  - MongoDB - Log aggregation, documents
  - Elasticsearch - Full-text search, log indexing
  - InfluxDB - Time-series metrics (optional)
ML/AI: TensorFlow.js Node 4.22.0
Streaming: Kafka (KafkaJS 2.2.4)
Metrics: Prometheus (prom-client 15.1.3)
Blockchain: Solana web3.js, Anchor
Alerting: Slack SDK, Email (nodemailer), Twilio
Visualization: Grafana (JSON dashboards)
Monitoring: Winston (logging), Sentry
Math/Stats: simple-statistics, ml-kmeans, ml-regression
```

### Service Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    API LAYER (Fastify)                   │
│  Routes → Middleware → Controllers → Services → Models   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   MIDDLEWARE LAYER                       │
│  • Authentication (JWT)                                  │
│  • Authorization (role-based)                            │
│  • Rate Limiting (Fastify)                               │
│  • CORS                                                  │
│  • Error Handling                                        │
│  • Request Logging                                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  COLLECTION LAYER                        │
│                                                          │
│  SYSTEM COLLECTORS:                                      │
│  ├─ CPUCollector (os.cpus())                            │
│  ├─ MemoryCollector (os.totalmem/freemem)              │
│  └─ DiskCollector (filesystem stats)                    │
│                                                          │
│  APPLICATION COLLECTORS:                                 │
│  ├─ HTTPMetricsCollector (service health checks)        │
│  └─ DatabaseMetricsCollector (pool stats, query times)  │
│                                                          │
│  BUSINESS COLLECTORS:                                    │
│  ├─ BusinessMetricsCollector (revenue, venues, events)  │
│  └─ RevenueCollector (financial metrics)                │
│                                                          │
│  BLOCKCHAIN COLLECTORS:                                  │
│  ├─ BlockchainMetricsCollector (gas, tx, minting)      │
│  └─ FraudDetectionCollector (bot/scalper patterns)     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   ML/AI LAYER                            │
│                                                          │
│  ANOMALY DETECTION:                                      │
│  ├─ AnomalyDetector (autoencoder neural network)        │
│  ├─ Statistical anomaly detection (z-score)             │
│  └─ Pattern recognition (time-series)                   │
│                                                          │
│  FRAUD DETECTION:                                        │
│  ├─ FraudMLDetector (scalper/bot patterns)             │
│  ├─ Velocity checking (request rate analysis)           │
│  ├─ Device fingerprinting                               │
│  └─ Behavioral analysis                                 │
│                                                          │
│  PREDICTIVE ANALYTICS:                                   │
│  ├─ PredictiveEngine (system failure prediction)        │
│  ├─ EventSalesTracker (LSTM sales forecasting)         │
│  └─ Trend analysis (moving averages)                    │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  ALERTING LAYER                          │
│                                                          │
│  ALERT MANAGEMENT:                                       │
│  ├─ AlertManager (alert lifecycle)                      │
│  ├─ RuleEngine (threshold evaluation)                   │
│  ├─ NotificationManager (multi-channel)                 │
│  └─ EscalationManager (escalation paths)                │
│                                                          │
│  NOTIFICATION CHANNELS:                                  │
│  ├─ Email (nodemailer)                                  │
│  ├─ Slack (Web API)                                     │
│  ├─ SMS (Twilio)                                        │
│  └─ PagerDuty (webhook)                                 │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   DATA LAYER                             │
│                                                          │
│  POSTGRESQL:                                             │
│  ├─ metrics (time-series storage)                       │
│  ├─ alerts (alert records)                              │
│  ├─ alert_rules (rule definitions)                      │
│  ├─ fraud_events (fraud detections)                     │
│  └─ nft_mints/transfers (blockchain tracking)           │
│                                                          │
│  REDIS:                                                  │
│  ├─ Real-time metric cache                              │
│  ├─ Alert state                                         │
│  └─ Stream processing windows                           │
│                                                          │
│  MONGODB:                                                │
│  ├─ Log aggregation                                     │
│  ├─ Dashboard configurations                            │
│  └─ Metric snapshots                                    │
│                                                          │
│  ELASTICSEARCH:                                          │
│  ├─ Log indexing                                        │
│  ├─ Full-text search                                    │
│  └─ Alert history                                       │
│                                                          │
│  INFLUXDB:                                               │
│  └─ Time-series metrics (optional)                      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  STREAMING LAYER                         │
│                                                          │
│  KAFKA PRODUCERS:                                        │
│  ├─ Metrics stream (real-time metrics)                  │
│  ├─ Alerts stream (alert events)                        │
│  └─ Fraud events (fraud detections)                     │
│                                                          │
│  KAFKA CONSUMERS:                                        │
│  ├─ Metrics consumer (process incoming metrics)         │
│  ├─ Alert consumer (handle alerts)                      │
│  └─ Fraud consumer (fraud event processing)             │
│                                                          │
│  STREAM PROCESSING:                                      │
│  ├─ StreamProcessor (windowing, aggregation)            │
│  ├─ Real-time pattern detection                         │
│  └─ Event correlation                                   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   WORKER LAYER                           │
│                                                          │
│  BACKGROUND WORKERS:                                     │
│  ├─ AlertEvaluationWorker (check alert rules)          │
│  ├─ MetricAggregationWorker (roll up metrics)          │
│  ├─ MLAnalysisWorker (run ML models)                    │
│  ├─ ReportGenerationWorker (SLA reports)                │
│  └─ CleanupWorker (old data cleanup)                    │
│                                                          │
│  CRON JOBS:                                              │
│  ├─ Alert evaluation (every 60s)                        │
│  ├─ Metric aggregation (every 5m)                       │
│  ├─ ML analysis (every 1m)                              │
│  ├─ Cleanup (every 1h)                                  │
│  └─ Report generation (daily)                           │
└─────────────────────────────────────────────────────────┘
```

---

## DATABASE SCHEMA

### Core Monitoring Tables

**metrics** (time-series metrics storage)
```sql
- id (UUID, PK)
- metric_name (VARCHAR) - e.g., 'system_cpu_usage_percent'
- service_name (VARCHAR) - e.g., 'payment-service'
- value (DECIMAL)
- metric_type (ENUM: gauge, counter, histogram, summary)
- labels (JSONB) - key-value tags
- timestamp (TIMESTAMP, indexed)
- created_at (TIMESTAMP)

Indexes:
- metric_name, service_name, timestamp (composite)
- timestamp (for time-based queries)
- labels (GIN index for JSONB queries)

Partitioning: By timestamp (monthly partitions)
Retention: 30 days (configurable)
```

**alerts** (alert records)
```sql
- id (UUID, PK)
- rule_id (UUID) → alert_rules
- title (VARCHAR)
- description (TEXT)
- severity (ENUM: info, warning, critical)
- state (ENUM: pending, firing, resolved)
- service (VARCHAR)
- value (DECIMAL) - current metric value
- threshold (DECIMAL) - alert threshold
- started_at (TIMESTAMP)
- resolved_at (TIMESTAMP, nullable)
- acknowledged (BOOLEAN, default false)
- acknowledged_by (VARCHAR, nullable)
- acknowledged_at (TIMESTAMP, nullable)
- resolution_note (TEXT, nullable)
- labels (JSONB)
- created_at, updated_at (TIMESTAMP)

Indexes:
- state, severity (for active alerts)
- started_at (time-based queries)
- rule_id (rule lookups)
```

**alert_rules** (rule definitions)
```sql
- id (UUID, PK)
- rule_name (VARCHAR, unique)
- metric_name (VARCHAR)
- condition (VARCHAR) - e.g., '>', '<', '==', '!='
- threshold (DECIMAL)
- duration (INTEGER) - seconds alert must be active
- severity (ENUM: info, warning, critical)
- enabled (BOOLEAN, default true)
- notification_channels (VARCHAR[]) - email, slack, pagerduty
- annotations (JSONB) - summary, description, runbook_url
- created_at, updated_at (TIMESTAMP)

Example:
{
  rule_name: 'high_cpu_usage',
  metric_name: 'system_cpu_usage_percent',
  condition: '>',
  threshold: 80,
  duration: 300,
  severity: 'warning'
}
```

**dashboards** (Grafana-style dashboards)
```sql
- id (UUID, PK)
- name (VARCHAR)
- description (TEXT, nullable)
- widgets (JSONB) - panel configurations
- layout (JSONB) - grid layout
- owner (VARCHAR)
- shared (BOOLEAN, default false)
- created_at, updated_at (TIMESTAMP)
```

### Health Check Tables

**service_health** (service health history)
```sql
- id (UUID, PK)
- service_name (VARCHAR)
- status (ENUM: healthy, degraded, unhealthy)
- response_time_ms (INTEGER)
- error_message (TEXT, nullable)
- checked_at (TIMESTAMP, indexed)
- metadata (JSONB)

Indexes:
- service_name, checked_at (composite)
- status (for filtering unhealthy services)
```

**sla_metrics** (SLA tracking)
```sql
- id (UUID, PK)
- service_name (VARCHAR)
- period_start (TIMESTAMP)
- period_end (TIMESTAMP)
- uptime_percentage (DECIMAL)
- response_time_p95 (DECIMAL)
- response_time_p99 (DECIMAL)
- violations (INTEGER)
- total_requests (INTEGER)
- failed_requests (INTEGER)

Indexes:
- service_name, period_start (composite)
```

### ML & Analytics Tables

**fraud_events** (fraud detection results)
```sql
- id (UUID, PK)
- user_id (UUID, nullable)
- pattern (VARCHAR) - scalper, bot, velocity_violation
- risk_level (ENUM: low, medium, high, critical)
- risk_score (DECIMAL) - 0.0 to 1.0
- indicators (TEXT[]) - array of detected patterns
- session_id (VARCHAR, nullable)
- device_fingerprint (VARCHAR, nullable)
- ip_address (INET)
- user_agent (TEXT)
- timestamp (TIMESTAMP, indexed)
- data (JSONB) - full context

Indexes:
- user_id, timestamp
- pattern, risk_level
- timestamp (for time-based analysis)
```

**anomaly_detections** (ML anomaly detection)
```sql
- id (UUID, PK)
- metric_name (VARCHAR)
- expected_value (DECIMAL)
- actual_value (DECIMAL)
- anomaly_score (DECIMAL) - 0.0 to 1.0
- confidence (DECIMAL) - 0.0 to 1.0
- ml_model (VARCHAR) - autoencoder, statistical, lstm
- detected_at (TIMESTAMP)
- alert_created (BOOLEAN, default false)

Indexes:
- metric_name, detected_at
- anomaly_score (for high-score queries)
```

**sales_velocity** (event sales tracking)
```sql
- id (UUID, PK)
- event_id (UUID)
- tickets_sold (INTEGER)
- velocity (DECIMAL) - tickets per minute
- acceleration_rate (DECIMAL)
- predicted_sellout_time (TIMESTAMP, nullable)
- current_capacity (INTEGER)
- remaining_tickets (INTEGER)
- timestamp (TIMESTAMP)

Indexes:
- event_id, timestamp
- predicted_sellout_time (for imminent sellout alerts)
```

### Blockchain Monitoring Tables

**nft_mints** (NFT minting tracking)
```sql
- id (UUID, PK)
- ticket_id (UUID, unique)
- mint_address (VARCHAR)
- metadata (JSONB)
- status (ENUM: pending, completed, failed)
- blockchain (VARCHAR) - solana, polygon
- transaction_hash (VARCHAR, nullable)
- gas_fee (DECIMAL, nullable)
- created_at, updated_at (TIMESTAMP)
```

**nft_transfers** (NFT transfer tracking)
```sql
- id (UUID, PK)
- token_address (VARCHAR)
- from_address (VARCHAR)
- to_address (VARCHAR)
- amount (INTEGER)
- signature (VARCHAR)
- status (VARCHAR)
- created_at (TIMESTAMP)

Indexes:
- token_address
- from_address, to_address
```

### Performance Tables

**performance_metrics** (endpoint performance)
```sql
- id (UUID, PK)
- service_name (VARCHAR)
- endpoint (VARCHAR)
- method (VARCHAR) - GET, POST, etc
- response_time_ms (INTEGER)
- status_code (INTEGER)
- timestamp (TIMESTAMP)

Indexes:
- service_name, endpoint, timestamp (composite)
- response_time_ms (for slow query detection)
```

**incidents** (incident tracking)
```sql
- id (UUID, PK)
- title (VARCHAR)
- description (TEXT)
- severity (ENUM: low, medium, high, critical)
- status (ENUM: open, investigating, resolved, closed)
- affected_services (VARCHAR[])
- detected_at (TIMESTAMP)
- resolved_at (TIMESTAMP, nullable)
- root_cause (TEXT, nullable)
- resolution (TEXT, nullable)

Indexes:
- status, severity
- detected_at
```

---

## API ENDPOINTS

### Public Endpoints (Authentication Required)

#### **1. Get Health Check**
```
GET /health
Headers: None (public endpoint)

Response: 200
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2025-01-12T...",
  "services": 8,
  "dependencies": 5,
  "uptime": 3600000
}

Errors:
- 503: Service unhealthy
```

#### **2. Get Service Health**
```
GET /health/:service
Headers:
  Authorization: Bearer <JWT>

Params:
  service: auth | venue | event | ticket | payment | marketplace | analytics

Response: 200
{
  "service": "payment",
  "status": "healthy",
  "responseTime": 45,
  "timestamp": "2025-01-12T...",
  "details": {
    "version": "1.0.0",
    "uptime": 86400
  }
}

Errors:
- 401: Invalid JWT
- 404: Unknown service
- 503: Service unhealthy
```

#### **3. Get All Services Health**
```
GET /health/services/all
Headers:
  Authorization: Bearer <JWT>

Response: 200
[
  {
    "service": "auth",
    "status": "healthy",
    "responseTime": 23
  },
  {
    "service": "payment",
    "status": "degraded",
    "error": "High latency detected"
  }
]
```

#### **4. Get Dependencies Health**
```
GET /health/dependencies
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "postgresql": { "status": "healthy" },
  "redis": { "status": "healthy" },
  "mongodb": { "status": "healthy" },
  "elasticsearch": { "status": "healthy" },
  "kafka": { "status": "degraded", "error": "High latency" }
}
```

### Metrics Endpoints

#### **5. Get Metrics**
```
GET /api/v1/monitoring/metrics
Headers:
  Authorization: Bearer <JWT>

Query Params:
  service: string (optional) - filter by service
  metric_name: string (optional) - filter by metric
  start_time: ISO timestamp (optional)
  end_time: ISO timestamp (optional)
  limit: integer (default 1000)

Response: 200
[
  {
    "metric_name": "system_cpu_usage_percent",
    "service_name": "payment-service",
    "value": 45.2,
    "timestamp": "2025-01-12T..."
  }
]
```

#### **6. Get Latest Metrics**
```
GET /api/v1/monitoring/metrics/latest
Headers:
  Authorization: Bearer <JWT>

Response: 200
[
  {
    "metric_name": "system_cpu_usage_percent",
    "service_name": "monitoring-service",
    "value": 23.5,
    "timestamp": "2025-01-12T..."
  }
]
```

#### **7. Get Service Metrics**
```
GET /api/v1/monitoring/metrics/service/:service
Headers:
  Authorization: Bearer <JWT>

Response: 200
[
  {
    "metric_name": "http_request_duration_ms",
    "value": 125,
    "timestamp": "2025-01-12T..."
  }
]
```

#### **8. Push Metrics (Internal)**
```
POST /api/v1/monitoring/metrics
Headers:
  Authorization: Bearer <JWT>
  x-service-name: payment-service

Body:
{
  "metric_name": "payment_success_total",
  "service_name": "payment-service",
  "value": 1,
  "type": "counter",
  "labels": {
    "provider": "stripe",
    "currency": "USD"
  }
}

Response: 200
{
  "success": true
}

Security:
- Requires admin or monitoring role
```

#### **9. Export Prometheus Metrics**
```
GET /api/v1/monitoring/metrics/export
Headers: None (Prometheus scraper)

Response: 200 (text/plain)
# HELP system_cpu_usage_percent CPU usage percentage
# TYPE system_cpu_usage_percent gauge
system_cpu_usage_percent{hostname="server1"} 45.2

# HELP http_request_duration_ms HTTP request duration
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{le="10"} 100
http_request_duration_ms_bucket{le="50"} 450
```

### Alert Endpoints

#### **10. Get Active Alerts**
```
GET /api/v1/monitoring/alerts
Headers:
  Authorization: Bearer <JWT>

Response: 200
[
  {
    "id": "uuid",
    "title": "High CPU Usage",
    "severity": "warning",
    "state": "firing",
    "value": 85.3,
    "threshold": 80,
    "started_at": "2025-01-12T..."
  }
]
```

#### **11. Get Alert by ID**
```
GET /api/v1/monitoring/alerts/:id
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "id": "uuid",
  "rule_id": "uuid",
  "title": "High Memory Usage",
  "description": "Memory usage above 90%",
  "severity": "critical",
  "state": "firing",
  "service": "payment-service",
  "value": 92.5,
  "threshold": 90,
  "started_at": "2025-01-12T...",
  "acknowledged": false
}

Errors:
- 404: Alert not found
```

#### **12. Acknowledge Alert**
```
POST /api/v1/monitoring/alerts/:id/acknowledge
Headers:
  Authorization: Bearer <JWT>

Body:
{
  "acknowledged_by": "john.doe@tickettoken.com"
}

Response: 200
{
  "id": "uuid",
  "acknowledged": true,
  "acknowledged_by": "john.doe@tickettoken.com",
  "acknowledged_at": "2025-01-12T..."
}

Security:
- Requires admin or operator role
```

#### **13. Resolve Alert**
```
POST /api/v1/monitoring/alerts/:id/resolve
Headers:
  Authorization: Bearer <JWT>

Body:
{
  "resolution_note": "Scaled up servers, CPU usage back to normal"
}

Response: 200
{
  "id": "uuid",
  "state": "resolved",
  "resolved_at": "2025-01-12T...",
  "resolution_note": "..."
}

Security:
- Requires admin or operator role
```

#### **14. Get Alert History**
```
GET /api/v1/monitoring/alerts/history
Headers:
  Authorization: Bearer <JWT>

Query Params:
  limit: integer (default 100)
  offset: integer (default 0)
  severity: info | warning | critical
  service: string

Response: 200
{
  "alerts": [...],
  "total": 523,
  "limit": 100,
  "offset": 0
}
```

#### **15. Get Alert Rules**
```
GET /api/v1/monitoring/alerts/rules
Headers:
  Authorization: Bearer <JWT>

Response: 200
[
  {
    "id": "uuid",
    "rule_name": "high_cpu_usage",
    "metric_name": "system_cpu_usage_percent",
    "condition": ">",
    "threshold": 80,
    "severity": "warning",
    "enabled": true
  }
]
```

#### **16. Create Alert Rule**
```
POST /api/v1/monitoring/alerts/rules
Headers:
  Authorization: Bearer <JWT>

Body:
{
  "rule_name": "high_error_rate",
  "metric_name": "http_error_rate",
  "condition": ">",
  "threshold": 5,
  "duration": 300,
  "severity": "critical",
  "notification_channels": ["email", "slack", "pagerduty"]
}

Response: 201
{
  "id": "uuid",
  "rule_name": "high_error_rate",
  ...
}

Security:
- Requires admin role
```

#### **17. Update Alert Rule**
```
PUT /api/v1/monitoring/alerts/rules/:id
Headers:
  Authorization: Bearer <JWT>

Body:
{
  "threshold": 10,
  "enabled": false
}

Response: 200
{
  "id": "uuid",
  ...
}

Security:
- Requires admin role
```

#### **18. Delete Alert Rule**
```
DELETE /api/v1/monitoring/alerts/rules/:id
Headers:
  Authorization: Bearer <JWT>

Response: 204

Security:
- Requires admin role
```

### Dashboard Endpoints

#### **19. Get Dashboard Overview**
```
GET /api/v1/monitoring/dashboard/overview
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "health": {
    "status": "healthy",
    "services": 8,
    "dependencies": 5
  },
  "alerts": {
    "total": 3,
    "critical": 0,
    "warning": 3
  },
  "metrics": [
    {
      "metric_name": "system_cpu_usage_percent",
      "service_name": "monitoring-service",
      "avg_value": 45.2
    }
  ],
  "timestamp": "2025-01-12T..."
}
```

#### **20. Get SLA Metrics**
```
GET /api/v1/monitoring/dashboard/sla
Headers:
  Authorization: Bearer <JWT>

Query Params:
  start_date: ISO timestamp (default: 30 days ago)
  end_date: ISO timestamp (default: now)

Response: 200
{
  "services": [
    {
      "service_name": "payment-service",
      "avg_uptime": 99.95,
      "avg_p95_latency": 234,
      "total_violations": 2
    }
  ],
  "period": "30d"
}
```

#### **21. Get Performance Metrics**
```
GET /api/v1/monitoring/dashboard/performance
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "endpoints": [
    {
      "service_name": "payment-service",
      "endpoint": "/api/v1/payments/process",
      "avg_response_time": 235,
      "p95": 456,
      "p99": 789,
      "request_count": 15234
    }
  ]
}
```

#### **22. Get Business Metrics**
```
GET /api/v1/monitoring/dashboard/business
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "revenue": {
    "today": 0,
    "week": 0,
    "month": 0
  },
  "tickets": {
    "sold_today": 0,
    "active_events": 0
  },
  "venues": {
    "active": 0,
    "total": 0
  }
}
```

#### **23. Get Incidents**
```
GET /api/v1/monitoring/dashboard/incidents
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "incidents": [
    {
      "id": "uuid",
      "title": "Payment Service Outage",
      "severity": "critical",
      "status": "investigating",
      "affected_services": ["payment", "order"],
      "detected_at": "2025-01-12T..."
    }
  ]
}
```

### Analytics Endpoints

#### **24. Get Sales Velocity**
```
GET /api/v1/monitoring/analytics/sales/:eventId
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "current": {
    "eventId": "uuid",
    "ticketsSold": 450,
    "velocity": 8.5,
    "accelerationRate": 0.3,
    "remainingTickets": 550
  },
  "prediction": "2025-01-12T18:30:00Z",
  "history": [...],
  "trend": "accelerating"
}
```

#### **25. Track Sale Event**
```
POST /api/v1/monitoring/analytics/sales/track
Headers:
  Authorization: Bearer <JWT>

Body:
{
  "eventId": "uuid",
  "ticketData": {
    "ticketId": "uuid",
    "price": 5000,
    "userId": "uuid"
  }
}

Response: 200
{
  "velocity": {
    "velocity": 8.5,
    "remainingTickets": 549
  },
  "prediction": "2025-01-12T18:30:00Z"
}
```

#### **26. Check for Fraud**
```
POST /api/v1/monitoring/analytics/fraud/check
Headers:
  Authorization: Bearer <JWT>

Body:
{
  "userId": "uuid",
  "ip_address": "192.168.1.1",
  "device_fingerprint": "abc123",
  "request_count": 45,
  "time_between_requests": 0.5,
  "total_tickets_attempted": 12,
  "user_agent": "Mozilla/5.0...",
  "mouse_movements": 0,
  "keyboard_events": 0
}

Response: 200
{
  "userId": "uuid",
  "ipAddress": "192.168.1.1",
  "riskScore": 0.85,
  "patterns": ["high_velocity", "bot_behavior", "scalper_behavior"],
  "behaviorVector": [...],
  "timestamp": "2025-01-12T..."
}
```

#### **27. Get Fraud Metrics**
```
GET /api/v1/monitoring/analytics/fraud/metrics
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "high_risk_users": 12,
  "suspicious_ips": 34,
  "patterns_detected": 56
}
```

#### **28. Get Analytics Dashboard**
```
GET /api/v1/monitoring/analytics/dashboard
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "fraud": {
    "high_risk_users": 12,
    "suspicious_ips": 34
  },
  "sales": {
    "eventId": "all",
    "totalVelocity": 45.3
  },
  "timestamp": "2025-01-12T..."
}
```

### Grafana Integration Endpoints

#### **29. Grafana Health Check**
```
GET /api/v1/monitoring/grafana
Headers: None

Response: 200
{
  "status": "ok"
}
```

#### **30. Grafana Search**
```
POST /api/v1/monitoring/grafana/search
Headers: None (Grafana datasource)

Body: {}

Response: 200
[
  "system_cpu_usage_percent",
  "system_memory_usage_percent",
  "http_request_duration_ms",
  ...
]
```

#### **31. Grafana Query**
```
POST /api/v1/monitoring/grafana/query
Headers: None

Body:
{
  "targets": [
    {
      "target": "system_cpu_usage_percent"
    }
  ],
  "range": {
    "from": "2025-01-12T00:00:00Z",
    "to": "2025-01-12T23:59:59Z"
  }
}

Response: 200
[
  {
    "target": "system_cpu_usage_percent",
    "datapoints": [
      [45.2, 1705017600000],
      [46.1, 1705017660000]
    ]
  }
]
```

#### **32. Grafana Annotations**
```
POST /api/v1/monitoring/grafana/annotations
Headers: None

Body:
{
  "range": {
    "from": "2025-01-12T00:00:00Z",
    "to": "2025-01-12T23:59:59Z"
  }
}

Response: 200
[
  {
    "time": 1705017600000,
    "title": "fraud_scalper_detected",
    "text": "Value: 8",
    "tags": ["fraud", "alert"]
  }
]
```

### Cache Management Endpoints

#### **33. Get Cache Stats**
```
GET /cache/stats
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "hits": 12345,
  "misses": 234,
  "hitRate": 98.1,
  "size": 1024,
  "keys": 567
}
```

#### **34. Flush Cache**
```
DELETE /cache/flush
Headers:
  Authorization: Bearer <JWT>

Response: 200
{
  "success": true,
  "message": "Cache flushed"
}

Security:
- Requires admin role
```

### Status Endpoint

#### **35. Get Service Status**
```
GET /status
Headers: None (public endpoint)

Response: 200
{
  "status": "operational",
  "service": "monitoring-service",
  "version": "1.0.0",
  "uptime": 86400,
  "memory": {
    "rss": 123456789,
    "heapTotal": 89012345,
    "heapUsed": 67890123
  },
  "timestamp": "2025-01-12T...",
  "environment": "production",
  "connections": {
    "postgres": "connected",
    "redis": "connected",
    "mongodb": "connected",
    "elasticsearch": "connected",
    "influxdb": "connected"
  }
}
```

---

## DEPENDENCIES

### What This Service NEEDS (Upstream)

```
REQUIRED (Service fails without these):
├── PostgreSQL (localhost:5432)
│   └── Database: tickettoken_db
│   └── Tables: metrics, alerts, alert_rules, fraud_events, etc
│   └── Breaking: Metrics cannot be stored, service degrades

OPTIONAL BUT RECOMMENDED:
├── Redis (localhost:6379)
│   └── Real-time metric cache, alert state
│   └── Breaking: Cache disabled, slower queries
│
├── MongoDB (mongodb://localhost:27017)
│   └── Log aggregation, dashboard configs
│   └── Breaking: Log aggregation disabled
│
├── Elasticsearch (http://localhost:9200)
│   └── Log indexing, full-text search
│   └── Breaking: Search features disabled
│
├── InfluxDB (http://localhost:8086)
│   └── Time-series metrics (alternative to PostgreSQL)
│   └── Breaking: Falls back to PostgreSQL
│
├── Kafka (kafka:9092)
│   └── Real-time metric streaming
│   └── Breaking: Streaming disabled, metrics still stored
│
└── JWT Public Key
    └── File: JWT_SECRET env variable
    └── Breaking: Authentication fails

MONITORED SERVICES (Optional):
├── Auth Service (port 3001)
├── Venue Service (port 3002)
├── Event Service (port 3003)
├── Ticket Service (port 3004)
├── Payment Service (port 3005)
├── Marketplace Service (port 3006)
├── Analytics Service (port 3007)
└── API Gateway (port 3000)
    └── Breaking: Cannot monitor, but monitoring service still runs
```

### What DEPENDS On This Service (Downstream)

```
DIRECT DEPENDENCIES:
├── Grafana (external)
│   └── Visualizes metrics via datasource API
│   └── Calls: GET /api/v1/monitoring/grafana/*
│
├── Prometheus (external)
│   └── Scrapes metrics for alerting
│   └── Calls: GET /api/v1/monitoring/metrics/export
│
├── All Platform Services (8+ services)
│   └── Push metrics to monitoring service
│   └── Calls: POST /api/v1/monitoring/metrics
│   └── Breaking: Cannot push metrics, services still function
│
├── DevOps/SRE Team
│   └── Uses dashboards for platform health
│   └── Receives alerts via Slack/Email/PagerDuty
│
└── Frontend Dashboard (future)
    └── Real-time metrics visualization
    └── Calls: GET /api/v1/monitoring/dashboard/*

BLAST RADIUS: LOW
- If monitoring-service is down:
  ✓ All other services continue operating normally
  ✗ No metrics collection (blind to system state)
  ✗ No alerts generated (incidents may go unnoticed)
  ✗ No fraud detection (security risk)
  ✗ Dashboards show stale data
  ✗ Cannot predict system failures
  
RECOVERY PRIORITY: HIGH
- While other services work, loss of visibility is critical
- Should be restored within 15 minutes
- Historical data preserved in databases
```

---

## CRITICAL FEATURES

### 1. Real-time Metrics Collection ✅

**Implementation:**
```typescript
// Prometheus-style metrics with prom-client
class MetricsCollector extends EventEmitter {
  public ticketsSold: Counter;
  public httpRequestDuration: Histogram;
  public activeUsers: Gauge;
  
  constructor() {
    this.ticketsSold = new Counter({
      name: 'tickets_sold_total',
      help: 'Total number of tickets sold',
      labelNames: ['venue_id', 'event_id', 'ticket_type']
    });
    
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_ms',
      help: 'Duration of HTTP requests in ms',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000]
    });
  }
}

// Collectors run on intervals
class SystemMetricsCollector {
  async collect(): Promise<void> {
    const cpus = os.cpus();
    const cpuUsage = calculateCPUUsage(cpus);
    
    await metricsService.pushMetrics({
      name: 'system_cpu_usage_percent',
      type: 'gauge',
      service: 'monitoring-service',
      value: cpuUsage
    });
  }
}

Code: src/metrics.collector.ts
Code: src/collectors/system/*
```

**Why it matters:**
- Real-time visibility into platform health
- Prometheus-compatible for industry-standard tooling
- Histogram buckets for percentile calculations (p50, p95, p99)
- Labels for multi-dimensional queries

### 2. ML-Powered Anomaly Detection ✅

**Implementation:**
```typescript
// TensorFlow.js autoencoder for anomaly detection
class AnomalyDetector {
  private model: tf.LayersModel;
  
  private async initializeModel() {
    // Autoencoder: learns normal patterns, detects deviations
    const encoder = tf.sequential({
      layers: [
        tf.layers.dense({ units: 128, activation: 'relu', inputShape: [10] }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ units: 4, activation: 'relu' })
      ]
    });
    
    // Train on historical normal data
    await this.trainOnHistoricalData();
  }
  
  async detectAnomaly(metricName: string, currentValue: number) {
    const features = this.extractFeatures(currentValue);
    const prediction = this.model.predict(tf.tensor2d([features]));
    const reconstructionError = this.calculateError(features, prediction);
    
    const isAnomaly = reconstructionError > this.threshold;
    
    if (isAnomaly) {
      await this.createAnomalyAlert(metricName, currentValue);
    }
  }
}

Code: src/ml/detectors/anomaly-detector.ts
```

**Why it matters:**
- Detects unusual patterns before they become incidents
- Learns what "normal" looks like for each metric
- Reduces alert fatigue (fewer false positives)
- Predicts issues before human operators notice

### 3. AI-Driven Fraud Detection ✅

**Implementation:**
```typescript
// Multi-layer fraud detection
class FraudMLDetector {
  async detectScalperPattern(data: any): Promise<FraudPattern> {
    let score = 0;
    const indicators: string[] = [];
    
    // Pattern 1: Rapid sequential requests
    if (data.requestsPerMinute > 60) {
      score += 30;
      indicators.push('Rapid request rate');
    }
    
    // Pattern 2: Multiple payment methods
    if (data.paymentMethodCount > 3) {
      score += 25;
      indicators.push('Multiple payment methods');
    }
    
    // Pattern 3: Bulk purchases
    if (data.ticketCount > 10) {
      score += 35;
      indicators.push('Bulk purchase attempt');
    }
    
    // Pattern 4: Automated timing pattern
    if (this.detectTimePattern(data.timestamps)) {
      score += 40;
      indicators.push('Automated timing pattern');
    }
    
    return {
      pattern: 'scalper',
      score: Math.min(score, 100),
      confidence: this.calculateConfidence(score, indicators.length),
      indicators
    };
  }
  
  async detectBotActivity(data: any): Promise<FraudPattern> {
    // Bot indicators: no mouse movement, inhuman typing speed
    if (data.mouseMovements === 0 && data.keypressInterval < 10) {
      return { pattern: 'bot', score: 95, indicators: [...] };
    }
  }
}

Code: src/ml/detectors/fraud-ml-detector.ts
Code: src/analytics/advanced-fraud-ml.ts
```

**Why it matters:**
- Protects platform from bots and scalpers
- Real-time detection (not post-hoc analysis)
- Multi-signal approach reduces false positives
- Integrates with payment-service for blocking

### 4. Predictive Analytics ✅

**Implementation:**
```typescript
// Predict system failures before they happen
class PredictiveEngine {
  async predictSystemFailure(): Promise<{
    probability: number;
    timeToFailure: number;
    riskFactors: string[];
  }> {
    const riskFactors: string[] = [];
    let riskScore = 0;
    
    // Predict CPU trend
    const cpuPrediction = await this.predictMetricValue('system_cpu_usage_percent', 0.25);
    if (cpuPrediction.prediction > 80) {
      riskScore += 30;
      riskFactors.push('High CPU usage predicted');
    }
    
    // Predict memory trend
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
    
    const probability = Math.min(riskScore / 100, 0.95);
    const timeToFailure = probability > 0.7 ? 15 : probability > 0.5 ? 30 : 60;
    
    return { probability, timeToFailure, riskFactors };
  }
}

Code: src/ml/predictions/predictive-engine.ts
```

**Why it matters:**
- Prevent outages through early warning
- Give ops team time to respond
- Reduce MTTR (Mean Time To Recovery)
- Proactive vs reactive operations

### 5. Event Sales Tracking with LSTM ✅

**Implementation:**
```typescript
// Track ticket sales velocity and predict sellouts
class EventSalesTracker extends EventEmitter {
  private salesModel: tf.LayersModel;
  
  private async initializeModel() {
    // LSTM for time-series prediction
    this.salesModel = tf.sequential({
      layers: [
        tf.layers.lstm({
          units: 128,
          returnSequences: true,
          inputShape: [10, 5] // 10 time steps, 5 features
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.lstm({ units: 64, returnSequences: false }),
        tf.layers.dense({ units: 1, activation: 'linear' })
      ]
    });
  }
  
  async trackSale(eventId: string, ticketData: any) {
    const velocity = await this.calculateVelocity(eventId);
    const prediction = await this.predictSellout(eventId, velocity);
    
    // Alert if high velocity
    if (velocity.velocity > 10) {
      this.emit('high-velocity', { eventId, velocity, predictedSellout: prediction });
      
      await kafkaProducer.sendAlert({
        title: `High Sales Velocity: ${eventId}`,
        severity: 'warning',
        message: `Selling ${velocity.velocity.toFixed(1)} tickets/min`
      });
    }
    
    // Alert if sellout imminent
    if (prediction && prediction.getTime() - Date.now() < 3600000) {
      this.emit('sellout-imminent', { eventId, predictedTime: prediction });
    }
  }
}

Code: src/analytics/sales-tracker.ts
```

**Why it matters:**
- Venue owners know when events will sell out
- Marketing can adjust campaigns in real-time
- Operations can prepare for high traffic
- Prevents disappointing customers (sold out without warning)

### 6. Kafka Streaming Pipeline ✅

**Implementation:**
```typescript
// Real-time metric streaming
class KafkaProducerService {
  async sendMetric(metric: any) {
    await this.producer.send({
      topic: 'metrics-stream',
      messages: [{
        key: uuidv4(),
        value: JSON.stringify({
          ...metric,
          timestamp: new Date().toISOString(),
          source: 'monitoring-service'
        })
      }]
    });
  }
  
  async sendAlert(alert: any) {
    await this.producer.send({
      topic: 'alerts-stream',
      messages: [{
        key: alert.id || uuidv4(),
        value: JSON.stringify(alert),
        headers: {
          'severity': alert.severity || 'info'
        }
      }],
      acks: -1 // Wait for all replicas
    });
  }
}

// Stream processing with windowing
class StreamProcessor {
  private windows: Map<string, EventWindow> = new Map();
  private windowSizeMs = 60000; // 1 minute
  
  async processEventStream(events: any[]) {
    // Group events into time windows
    const windowKey = Math.floor(Date.now() / this.windowSizeMs);
    
    // Perform aggregations
    for (const event of events) {
      this.updateAggregates(window, event);
    }
    
    // Detect patterns in real-time
    await this.detectPatterns(window);
  }
}

Code: src/streaming/kafka-producer.ts
Code: src/streaming/stream-processor.ts
```

**Why it matters:**
- Real-time metric streaming to other services
- Decouples metric collection from storage
- Enables complex event processing
- Scales horizontally with Kafka partitions

### 7. Multi-Database Architecture ✅

**Implementation:**
```typescript
// PostgreSQL: Primary metrics storage
export let pgPool: Pool;

// Redis: Real-time cache
export let redisClient: Redis;

// MongoDB: Log aggregation
export let mongoClient: MongoClient;

// Elasticsearch: Full-text search
export let esClient: ElasticsearchClient;

// InfluxDB: Time-series (optional)
export let influxDB: InfluxDB;

async function initializeDatabases() {
  await Promise.all([
    initializePostgreSQL(),
    initializeRedis(),
    initializeMongoDB(),
    initializeElasticsearch(),
    initializeInfluxDB()
  ]);
}

// Each database serves a specific purpose
// PostgreSQL: ACID transactions, relational queries
// Redis: Sub-millisecond reads, cache
// MongoDB: Flexible schema, log aggregation
// Elasticsearch: Full-text search, log analysis
// InfluxDB: Time-series optimization (optional)

Code: src/utils/database.ts
```

**Why it matters:**
- Right tool for the right job
- PostgreSQL for structured metrics
- Redis for real-time caching
- MongoDB for flexible log data
- Elasticsearch for powerful search
- Can operate with PostgreSQL only if needed

### 8. Alert Management with Escalation ✅

**Implementation:**
```typescript
// Rule-based alerting
interface Alert {
  id: string;
  rule_id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  state: 'pending' | 'firing' | 'resolved';
  value: number;
  threshold: number;
  started_at: Date;
  acknowledged?: boolean;
}

class AlertService {
  async checkAlert(alertId: string, currentValue: number): Promise<void> {
    const alert = this.alerts.get(alertId);
    
    // Check cooldown
    if (alert.lastFired) {
      const cooldownMs = alert.cooldown * 60 * 1000;
      if (Date.now() - alert.lastFired.getTime() < cooldownMs) {
        return; // Still in cooldown
      }
    }
    
    // Check threshold
    if (currentValue > alert.threshold) {
      await this.fireAlert(alert, currentValue);
    }
  }
  
  private async fireAlert(alert: Alert, value: number): Promise<void> {
    const message = this.formatAlertMessage(alert, value);
    
    // Send to configured channels
    const promises = alert.channels.map(channel => {
      switch (channel) {
        case 'email': return this.sendEmail(alert, message);
        case 'slack': return this.sendSlack(alert, message);
        case 'pagerduty': return this.sendPagerDuty(alert, message);
      }
    });
    
    await Promise.allSettled(promises);
  }
}

Code: src/services/alert.service.ts
Code: src/alerting/
```

**Why it matters:**
- Configurable alert rules
- Multi-channel notifications (email, Slack, PagerDuty)
- Cooldown prevents alert fatigue
- Acknowledgement workflow for incident management
- Escalation paths for critical alerts

### 9. Health Check System ✅

**Implementation:**
```typescript
class HealthService {
  async getOverallHealth(): Promise<HealthStatus> {
    const [services, dependencies] = await Promise.all([
      this.getAllServicesHealth(),
      this.getDependenciesHealth()
    ]);
    
    const allHealthy = services.every(s => s.status === 'healthy') &&
                      Object.values(dependencies).every(d => d.status === 'healthy');
    
    const anyUnhealthy = services.some(s => s.status === 'unhealthy') ||
                        Object.values(dependencies).some(d => d.status === 'unhealthy');
    
    return {
      status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date(),
      uptime: Date.now() - this.startTime,
      services: services.length,
      dependencies: Object.keys(dependencies).length
    };
  }
  
  async getServiceHealth(serviceName: string): Promise<any> {
    const response = await axios.get(`${serviceUrl}/health`, { timeout: 5000 });
    
    return {
      service: serviceName,
      status: 'healthy',
      responseTime: response.headers['x-response-time'],
      details: response.data
    };
  }
}

Code: src/services/health.service.ts
Code: src/checkers/
```

**Why it matters:**
- Continuous health monitoring of all services
- Detects service degradation early
- Provides status page data
- Enables automatic failover/scaling
- Three-level status (healthy/degraded/unhealthy)

### 10. Grafana Integration ✅

**Implementation:**
```typescript
// Grafana datasource API
async function grafanaRoutes(server: FastifyInstance) {
  // Search endpoint for metrics
  server.post('/search', async (request, reply) => {
    const result = await pgPool.query(
      'SELECT DISTINCT metric_name FROM metrics ORDER BY metric_name'
    );
    return result.rows.map(row => row.metric_name);
  });
  
  // Query endpoint for time-series data
  server.post('/query', async (request, reply) => {
    const { targets, range } = request.body;
    
    const results = await Promise.all(
      targets.map(async (target) => {
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
  });
}

Code: src/routes/grafana.routes.ts
Code: src/grafana-dashboards.json
```

**Why it matters:**
- Beautiful, professional dashboards
- Standard in the industry (ops teams know Grafana)
- Rich visualization options (graphs, gauges, heatmaps)
- Alerting integration
- Shareable dashboards for stakeholders

---

## SECURITY

### 1. Authentication
```typescript
// JWT authentication middleware
export async function authenticate(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return reply.status(401).send({ error: 'Authentication required' });
  }
  
  const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
  
  request.user = {
    id: decoded.userId || decoded.id,
    role: decoded.role || 'user',
    permissions: decoded.permissions || []
  };
}

Code: src/middleware/auth.middleware.ts
```

### 2. Authorization (Role-Based)
```typescript
export function authorize(...roles: string[]) {
  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    
    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
}

// Usage:
server.post('/alerts/rules', {
  preHandler: authorize('admin')
}, createAlertRule);

Code: src/middleware/auth.middleware.ts
```

### 3. Rate Limiting
```typescript
// Fastify rate limiting
await server.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  cache: 10000,
  allowList: ['127.0.0.1'],
  redis: redisClient
});

// Per-route rate limiting
server.post('/metrics', {
  config: {
    rateLimit: {
      max: 1000,
      timeWindow: '1 minute'
    }
  }
}, pushMetrics);
```

### 4. CORS Configuration
```typescript
await server.register(cors, {
  origin: config.cors.origin, // Production: specific domains only
  credentials: true
});
```

### 5. Helmet (Security Headers)
```typescript
await server.register(helmet, {
  contentSecurityPolicy: true,
  hsts: true
});
```

---

## ASYNC PROCESSING

### Background Workers

```typescript
// Cron jobs for periodic tasks
export async function startWorkers() {
  // Alert evaluation - every 60 seconds
  cron.schedule('*/60 * * * * *', async () => {
    // Check all alert rules against current metrics
    await alertEvaluationWorker.run();
  });
  
  // Metric aggregation - every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    // Roll up metrics into aggregates
    await metricAggregationWorker.run();
  });
  
  // ML analysis - every 1 minute
  cron.schedule('* * * * *', async () => {
    // Run anomaly detection
    await anomalyDetector.checkAllMetrics();
    
    // Run fraud detection
    // (runs on incoming requests, but also periodic sweep)
  });
  
  // Cleanup - every hour
  cron.schedule('0 * * * *', async () => {
    // Delete old metrics (>30 days)
    await cleanupWorker.run();
  });
  
  // Report generation - daily at midnight
  cron.schedule('0 0 * * *', async () => {
    // Generate SLA reports
    await reportGenerationWorker.run();
  });
}

Code: src/workers/
```

### Kafka Consumers

```typescript
class KafkaConsumerService {
  async subscribeToMetrics() {
    const consumer = this.kafka.consumer({
      groupId: 'monitoring-metrics-group'
    });
    
    await consumer.subscribe({
      topics: ['metrics-stream', 'fraud-events', 'alerts-stream']
    });
    
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const data = JSON.parse(message.value.toString());
        
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
      }
    });
  }
}

Code: src/streaming/kafka-consumer.ts
```

---

## ERROR HANDLING

### Error Response Format

```json
{
  "error": "Service health check failed",
  "code": "SERVICE_UNAVAILABLE",
  "timestamp": "2025-01-12T...",
  "path": "/health/payment",
  "details": {
    "service": "payment-service",
    "url": "http://payment-service:3005/health",
    "error": "ECONNREFUSED"
  }
}
```

### Common Error Codes

```
AUTH_REQUIRED - Missing JWT
INVALID_TOKEN - JWT signature invalid
TOKEN_EXPIRED - JWT expired
FORBIDDEN - Insufficient permissions

VALIDATION_ERROR - Request validation failed
METRIC_NOT_FOUND - Metric does not exist
ALERT_NOT_FOUND - Alert does not exist
RULE_NOT_FOUND - Alert rule does not exist

SERVICE_UNAVAILABLE - Service health check failed
DATABASE_ERROR - Database connection failed
KAFKA_ERROR - Kafka connection failed

RATE_LIMIT_EXCEEDED - Too many requests
```

---

## MONITORING THE MONITOR

### Self-Monitoring

**The monitoring service monitors itself:**

```typescript
// System metrics for monitoring-service itself
metricsCollector.activeUsers.set({ type: 'monitoring' }, activeConnections);
metricsCollector.queueSize.set({ queue_name: 'kafka' }, kafkaLag);
metricsCollector.cacheHitRate.set({ cache_type: 'redis' }, cacheHitRate);

// Health check for monitoring-service
GET /health
{
  "status": "healthy",
  "connections": {
    "postgres": "connected",
    "redis": "connected",
    "mongodb": "connected",
    "elasticsearch": "connected",
    "kafka": "connected"
  }
}

// Prometheus metrics for monitoring-service
GET /api/v1/monitoring/metrics/export
# Includes:
- process_cpu_user_seconds_total
- process_resident_memory_bytes
- nodejs_eventloop_lag_seconds
- http_request_duration_ms (monitoring-service own endpoints)
```

**Meta-alerts:** Alerts for monitoring-service failures
```typescript
// Alert if monitoring-service can't reach databases
{
  rule_name: 'monitoring_database_down',
  metric_name: 'database_connection_status',
  condition: '==',
  threshold: 0,
  severity: 'critical'
}

// Alert if metric collection stops
{
  rule_name: 'metric_collection_stopped',
  metric_name: 'metrics_collected_last_minute',
  condition: '<',
  threshold: 1,
  severity: 'critical'
}
```

---

## TESTING

### Test Files

```
tests/setup.ts - Test configuration
tests/unit/collectors.test.ts - Collector tests
tests/unit/ml-detector.test.ts - ML model tests
tests/integration/api.test.ts - API endpoint tests
tests/integration/kafka.test.ts - Kafka streaming tests
```

### Running Tests

```bash
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

### Test Coverage Targets

```
Branches:   75%
Functions:  75%
Lines:      75%
Statements: 75%
```

---

## DEPLOYMENT

### Environment Variables

See .env.example for full list. Critical ones:

```bash
# Service
NODE_ENV=production
PORT=3013
SERVICE_NAME=monitoring-service

# Database - PostgreSQL
DB_HOST=postgres
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=<secret>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# MongoDB
MONGODB_URI=mongodb://mongodb:27017/tickettoken_monitoring

# Elasticsearch
ELASTICSEARCH_NODE=http://elasticsearch:9200

# InfluxDB (optional)
INFLUXDB_URL=http://influxdb:8086
INFLUXDB_TOKEN=<token>
INFLUXDB_ORG=tickettoken
INFLUXDB_BUCKET=metrics

# Kafka
KAFKA_BROKERS=kafka:9092

# Services to Monitor
AUTH_SERVICE_URL=http://auth-service:3001
VENUE_SERVICE_URL=http://venue-service:3002
EVENT_SERVICE_URL=http://event-service:3003
TICKET_SERVICE_URL=http://ticket-service:3004
PAYMENT_SERVICE_URL=http://payment-service:3005
MARKETPLACE_SERVICE_URL=http://marketplace-service:3006
ANALYTICS_SERVICE_URL=http://analytics-service:3007
API_GATEWAY_URL=http://api-gateway:3000

# Intervals (seconds)
HEALTH_CHECK_INTERVAL=30
METRIC_COLLECTION_INTERVAL=60
ALERT_EVALUATION_INTERVAL=60

# Thresholds
CPU_THRESHOLD=80
MEMORY_THRESHOLD=85
DISK_THRESHOLD=90
ERROR_RATE_THRESHOLD=5
RESPONSE_TIME_THRESHOLD_MS=2000

# JWT
JWT_SECRET=<256-bit-secret>

# Alerting
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@tickettoken.com
SMTP_PASS=<password>
ALERT_FROM_EMAIL=alerts@tickettoken.com
ALERT_TO_EMAIL=ops@tickettoken.com

SLACK_TOKEN=xoxb-...
SLACK_ALERTS_CHANNEL=#alerts

# Logging
LOG_LEVEL=info
ENABLE_ES_LOGGING=true

# Solana (for blockchain metrics)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PAYER_SECRET_KEY=<json-array>
```

### Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy built files
COPY dist ./dist

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3013/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 3013

CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  monitoring-service:
    build: .
    ports:
      - "3013:3013"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_HOST=redis
      - MONGODB_URI=mongodb://mongodb:27017
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      - postgres
      - redis
      - mongodb
      - elasticsearch
      - kafka
    restart: unless-stopped
    
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: tickettoken_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
      
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
      
  mongodb:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
      
  elasticsearch:
    image: elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    volumes:
      - es_data:/usr/share/elasticsearch/data
      
  kafka:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
    depends_on:
      - zookeeper
      
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      
  grafana:
    image: grafana/grafana:10.2.0
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  postgres_data:
  redis_data:
  mongo_data:
  es_data:
  grafana_data:
```

### Startup Order

```
1. PostgreSQL must be running
2. Redis must be running
3. MongoDB must be running (optional but recommended)
4. Elasticsearch must be running (optional)
5. Kafka must be running (optional)
6. Run migrations: npm run migrate (if needed)
7. Start service: npm start
8. Workers start automatically
9. Kafka consumers connect automatically
```

---

## METRICS REFERENCE

### System Metrics

```
system_cpu_usage_percent (gauge)
- Current CPU usage percentage
- Labels: hostname

system_memory_usage_bytes (gauge)
- Memory usage in bytes
- Labels: hostname

system_memory_usage_percent (gauge)
- Memory usage percentage
- Labels: hostname

system_disk_usage_bytes (gauge)
- Disk usage in bytes
- Labels: hostname, mount_point

system_disk_usage_percent (gauge)
- Disk usage percentage
- Labels: hostname, mount_point
```

### Application Metrics

```
http_request_duration_ms (histogram)
- HTTP request duration in milliseconds
- Labels: method, route, status_code
- Buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000]

http_requests_total (counter)
- Total number of HTTP requests
- Labels: method, route, status_code

http_errors_total (counter)
- Total number of HTTP errors
- Labels: method, route, error_type

service_up (gauge)
- Service availability (1 = up, 0 = down)
- Labels: service, port

db_query_duration_ms (histogram)
- Database query duration
- Labels: operation, table
- Buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000]

postgres_pool_total (gauge)
- Total PostgreSQL connections
- Labels: database

postgres_pool_idle (gauge)
- Idle PostgreSQL connections
- Labels: database

postgres_pool_waiting (gauge)
- Waiting PostgreSQL connections
- Labels: database

redis_ops_per_second (gauge)
- Redis operations per second
- Labels: database

redis_keyspace_hits (counter)
- Redis cache hits
- Labels: database
```

### Business Metrics

```
tickets_sold_total (counter)
- Total tickets sold
- Labels: venue_id, event_id, ticket_type

tickets_listed_total (counter)
- Total tickets listed on marketplace
- Labels: venue_id, price_range

revenue_total_cents (counter)
- Total revenue in cents
- Labels: venue_id, type (primary_sale, resale, fees)

refunds_processed_total (counter)
- Total refunds processed
- Labels: venue_id, reason

business_total_venues (gauge)
- Total number of venues
- Labels: type (total, active)

business_events_last_30_days (gauge)
- Events created in last 30 days
- Labels: period

business_tickets_sold_24h (gauge)
- Tickets sold in last 24 hours
- Labels: period
```

### Payment Metrics

```
payment_success_total (counter)
- Total successful payments
- Labels: provider, currency

payment_failure_total (counter)
- Total failed payments
- Labels: provider, error_code

payment_processing_duration_ms (histogram)
- Payment processing duration
- Labels: provider, type
- Buckets: [100, 500, 1000, 2000, 5000, 10000]

stripe_webhooks_total (counter)
- Stripe webhook events received
- Labels: event_type, status
```

### Blockchain Metrics

```
blockchain_gas_price_gwei (gauge)
- Gas price in Gwei
- Labels: network

blockchain_pending_transactions (gauge)
- Pending transactions
- Labels: network

blockchain_nft_mints_pending (gauge)
- NFT mints pending
- Labels: blockchain

blockchain_nft_mints_failed (gauge)
- Failed NFT mints
- Labels: blockchain

nft_minted_total (counter)
- Total NFTs minted
- Labels: collection, status

solana_transaction_time_ms (histogram)
- Solana transaction confirmation time
- Labels: type
- Buckets: [1000, 2000, 5000, 10000, 20000, 30000]

solana_errors_total (counter)
- Solana transaction errors
- Labels: error_type
```

### Fraud Detection Metrics

```
fraud_bot_attempts (gauge)
- Bot attempts detected
- Current count

fraud_scalper_patterns (gauge)
- Scalper patterns detected
- Current count

fraud_suspicious_ips (gauge)
- Suspicious IP addresses
- Current count

fraud_velocity_violations (gauge)
- Velocity violations detected
- Current count

fraud_blocked_count (gauge)
- Fraud attempts blocked
- Current count

fraud_detection_accuracy (gauge)
- Fraud detection accuracy percentage
- Current accuracy
```

### ML/AI Metrics

```
anomaly_detections_total (counter)
- Total anomalies detected
- Labels: metric_name, severity

ml_model_accuracy (gauge)
- ML model accuracy
- Labels: model_name

ml_prediction_latency_ms (histogram)
- ML prediction latency
- Labels: model_name
```

---

## TROUBLESHOOTING

### Common Issues

**1. "Cannot connect to PostgreSQL"**
```
Cause: Database not running or wrong credentials
Fix: 
- Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD env vars
- Verify PostgreSQL is running: docker ps | grep postgres
- Test connection: psql -h localhost -U postgres -d tickettoken_db
```

**2. "Kafka connection failed"**
```
Cause: Kafka not running or wrong broker address
Fix:
- Check KAFKA_BROKERS env var
- Verify Kafka is running: docker ps | grep kafka
- Service degrades gracefully (metrics still stored in PostgreSQL)
```

**3. "Metrics not appearing in Grafana"**
```
Cause: Datasource misconfigured or metrics not being collected
Fix:
- Check Grafana datasource configuration
- Verify monitoring-service is running: curl http://localhost:3013/health
- Check metrics are being stored: psql -c "SELECT COUNT(*) FROM metrics"
- Test Grafana query endpoint: curl http://localhost:3013/api/v1/monitoring/grafana/search
```

**4. "Alerts not firing"**
```
Cause: Alert rules disabled or notification channels not configured
Fix:
- Check alert rules are enabled: GET /api/v1/monitoring/alerts/rules
- Verify thresholds are correct
- Check notification configuration (SMTP, Slack tokens)
- Review alert evaluation worker logs
```

**5. "High memory usage in monitoring-service"**
```
Cause: TensorFlow.js models or large metric caches
Fix:
- Increase container memory limit
- Reduce metric retention period
- Disable ML features if not needed (comment out ML workers)
- Clear Redis cache: redis-cli FLUSHDB
```

**6. "ML models failing to load"**
```
Cause: Insufficient data for training or TensorFlow.js issues
Fix:
- Ensure at least 7 days of historical data
- Check TensorFlow.js compatibility with Node.js version
- Review ML worker logs for specific errors
- Disable ML features temporarily if critical
```

**7. "Fraud detection not working"**
```
Cause: Insufficient training data or detector not initialized
Fix:
- Ensure fraud detector has been trained
- Check fraud_events table has data
- Review fraud detection logs
- Manually trigger training: POST /api/v1/monitoring/analytics/fraud/train (admin only)
```

**8. "Sales velocity predictions incorrect"**
```
Cause: LSTM model needs more training data
Fix:
- Needs at least 30 days of sales data
- Check sales_velocity table has sufficient history
- Retrain model with more data
- Falls back to linear regression if insufficient data
```

---

## API CHANGES (Breaking vs Safe)

### ✅ SAFE Changes (Won't Break Clients)

1. Add new optional query parameters
2. Add new fields to response bodies
3. Add new endpoints
4. Add new metrics
5. Add new alert rules
6. Change internal ML models
7. Add new notification channels
8. Improve error messages
9. Add database indexes
10. Change collection intervals

### ⚠️ BREAKING Changes (Require Coordination)

1. Remove or rename endpoints
2. Remove fields from responses
3. Change field types (string → number)
4. Change authentication requirements
5. Change metric names (breaks Grafana dashboards)
6. Change alert rule format
7. Remove supported databases
8. Change Kafka topic names
9. Change Grafana datasource API
10. Change health check response format

---

## COMPARISON: Monitoring vs Payment Service

| Feature | Monitoring Service | Payment Service |
|---------|-------------------|-----------------|
| Framework | Fastify ✅ | Express ✅ |
| Primary Purpose | Observability | Transactions |
| Complexity | Very High 🔴 | Very High 🔴 |
| AI/ML | Heavy (TensorFlow) ✅ | None ❌ |
| Databases | 5 (PostgreSQL, Redis, MongoDB, ES, InfluxDB) ✅ | 2 (PostgreSQL, Redis) ⚠️ |
| Streaming | Kafka ✅ | RabbitMQ ✅ |
| Real-time | High (Kafka streams) ✅ | Medium (Bull queues) ⚠️ |
| External Integrations | Many (Grafana, Prometheus, Slack, etc) ✅ | Few (Stripe, Square) ⚠️ |
| Blast Radius | Low (visibility loss) 🟢 | High (no payments) 🔴 |
| Self-monitoring | Yes ✅ | No ❌ |
| Predictive Analytics | Yes (failure prediction) ✅ | No ❌ |
| Documentation | Complete ✅ | Complete ✅ |

**Monitoring service is MORE complex due to:**
- AI/ML integration (TensorFlow.js)
- Multiple database types (5 vs 2)
- Real-time streaming (Kafka)
- Self-monitoring requirements
- Fraud detection complexity
- Predictive analytics
- Multiple external integrations

**Payment service is MORE critical due to:**
- Direct revenue impact
- Higher blast radius if down
- Financial regulations
- PCI compliance requirements
- External payment provider dependencies

---

## FUTURE IMPROVEMENTS

### Phase 1: Enhanced ML
- [ ] Implement distributed TensorFlow training
- [ ] Add more ML models (Prophet, XGBoost)
- [ ] GPU acceleration for ML workloads
- [ ] AutoML for model selection
- [ ] Anomaly detection for logs (not just metrics)

### Phase 2: Advanced Analytics
- [ ] Root cause analysis automation
- [ ] Correlation analysis (find related issues)
- [ ] Capacity planning predictions
- [ ] Cost optimization recommendations
- [ ] Performance optimization suggestions

### Phase 3: Integrations
- [ ] PagerDuty integration
- [ ] Datadog integration
- [ ] New Relic integration
- [ ] Sentry integration (already has basic support)
- [ ] Jira integration (auto-create tickets)
- [ ] GitHub integration (link to code)

### Phase 4: Visualization
- [ ] Custom dashboards in UI (not just Grafana)
- [ ] Real-time metrics streaming to frontend
- [ ] Mobile app for alerts
- [ ] Executive dashboard (business metrics focus)
- [ ] Public status page

### Phase 5: Automation
- [ ] Auto-remediation (restart services, scale up, etc)
- [ ] Intelligent alert routing based on on-call schedule
- [ ] Automatic incident creation and tracking
- [ ] ChatOps integration (Slack commands)
- [ ] Runbook automation

### Phase 6: Optimization
- [ ] Metric sampling (reduce storage)
- [ ] Metric pre-aggregation
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Log aggregation optimization
- [ ] Query optimization for dashboards

---

## GRAFANA DASHBOARD CONFIGURATION

### Pre-configured Panels

**Revenue Overview Panel:**
```json
{
  "title": "Revenue Overview",
  "type": "graph",
  "targets": [
    {
      "expr": "sum(rate(revenue_total_cents[5m])) by (venue_id)",
      "legendFormat": "Venue {{venue_id}}"
    }
  ],
  "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 }
}
```

**Tickets Sold Panel:**
```json
{
  "title": "Tickets Sold (Real-time)",
  "type": "stat",
  "targets": [
    {
      "expr": "sum(increase(tickets_sold_total[1h]))",
      "legendFormat": "Tickets/hour"
    }
  ],
  "gridPos": { "h": 4, "w": 6, "x": 12, "y": 0 }
}
```

**API Response Time Panel:**
```json
{
  "title": "API Response Time (p95)",
  "type": "graph",
  "targets": [
    {
      "expr": "histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))",
      "legendFormat": "p95 latency"
    }
  ],
  "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 }
}
```

**Error Rate Panel:**
```json
{
  "title": "Error Rate",
  "type": "graph",
  "targets": [
    {
      "expr": "sum(rate(errors_total[5m])) by (severity)",
      "legendFormat": "{{severity}}"
    }
  ],
  "gridPos": { "h": 8, "w": 12, "x": 12, "y": 12 }
}
```

**Full dashboard:** See `src/grafana-dashboards.json`

---

## ML MODEL DETAILS

### 1. Anomaly Detection (Autoencoder)

**Architecture:**
```
Input Layer:     10 features (metric history)
Hidden Layer 1:  128 units (ReLU) + Dropout(0.3)
Hidden Layer 2:  64 units (ReLU) + Dropout(0.2)
Hidden Layer 3:  32 units (ReLU)
Bottleneck:      4 units (ReLU) - compressed representation
Hidden Layer 4:  8 units (ReLU)
Hidden Layer 5:  16 units (ReLU)
Hidden Layer 6:  32 units (ReLU)
Output Layer:    10 units (Sigmoid) - reconstruction

Loss: Mean Squared Error
Optimizer: Adam (lr=0.001)
Epochs: 50
Batch Size: 32
```

**How it works:**
1. Trains on normal metric patterns
2. Learns to compress and reconstruct normal data
3. Anomalies have high reconstruction error
4. Threshold: reconstruction error > 0.95 = anomaly

### 2. Sales Forecasting (LSTM)

**Architecture:**
```
Input Layer:     [10, 5] (10 time steps, 5 features)
LSTM Layer 1:    128 units, return_sequences=True
Dropout:         0.2
LSTM Layer 2:    64 units, return_sequences=False
Dropout:         0.2
Dense Layer 1:   32 units (ReLU)
Output Layer:    1 unit (Linear) - minutes to sellout

Loss: Mean Squared Error
Optimizer: Adam (lr=0.001)
Epochs: 50
Batch Size: 32
```

**Features:**
1. Tickets sold per minute
2. Average ticket price
3. Progress through sale (0-1)
4. Hour of day (0-23)
5. Day of week (0-6)

**Output:** Predicted minutes until sellout

### 3. Fraud Detection (Feature-based)

**Not a neural network - rule-based with scoring:**

Scalper Detection:
- Rapid requests (>60/min): +30 points
- Multiple payment methods: +25 points
- Bulk purchases (>10 tickets): +35 points
- Geographic anomaly: +20 points
- Automated timing pattern: +40 points

Bot Detection:
- Bot user agent: +50 points
- No mouse movements: +30 points
- Inhuman typing speed: +25 points
- Very short session (<5s): +20 points

Score > 70: High risk
Score > 50: Medium risk
Score < 50: Low risk

---

## KAFKA TOPICS

### metrics-stream
**Purpose:** Real-time metric streaming
**Producer:** monitoring-service
**Consumers:** monitoring-service (aggregation), analytics-service
**Message Format:**
```json
{
  "metric_name": "system_cpu_usage_percent",
  "service_name": "payment-service",
  "value": 45.2,
  "type": "gauge",
  "labels": {
    "hostname": "server1"
  },
  "timestamp": "2025-01-12T...",
  "source": "monitoring-service"
}
```

### alerts-stream
**Purpose:** Real-time alert notifications
**Producer:** monitoring-service
**Consumers:** notification-service, analytics-service
**Message Format:**
```json
{
  "id": "uuid",
  "title": "High CPU Usage",
  "severity": "warning",
  "state": "firing",
  "service": "payment-service",
  "value": 85.3,
  "threshold": 80,
  "timestamp": "2025-01-12T...",
  "source": "monitoring-service"
}
```

### fraud-events
**Purpose:** Fraud detection events
**Producer:** monitoring-service
**Consumers:** payment-service, analytics-service
**Message Format:**
```json
{
  "userId": "uuid",
  "pattern": "scalper_behavior",
  "riskLevel": "high",
  "riskScore": 0.85,
  "indicators": ["high_velocity", "bulk_purchase"],
  "timestamp": "2025-01-12T...",
  "source": "fraud-detection"
}
```

---

## ALERT RULES (Default Configuration)

```typescript
const defaultAlertRules = [
  {
    name: 'high_cpu_usage',
    metric: 'system_cpu_usage_percent',
    condition: '>',
    threshold: 80,
    severity: 'warning',
    for_duration: 300, // 5 minutes
    annotations: {
      summary: 'High CPU usage detected',
      description: 'CPU usage is above 80% for more than 5 minutes'
    }
  },
  {
    name: 'high_memory_usage',
    metric: 'system_memory_usage_percent',
    condition: '>',
    threshold: 90,
    severity: 'warning',
    for_duration: 300
  },
  {
    name: 'service_down',
    metric: 'service_up',
    condition: '==',
    threshold: 0,
    severity: 'critical',
    for_duration: 60 // 1 minute
  },
  {
    name: 'high_response_time',
    metric: 'http_response_time_ms',
    condition: '>',
    threshold: 1000,
    severity: 'warning',
    for_duration: 180
  },
  {
    name: 'database_connection_pool_exhausted',
    metric: 'postgres_pool_waiting',
    condition: '>',
    threshold: 5,
    severity: 'critical',
    for_duration: 60
  },
  {
    name: 'high_error_rate',
    metric: 'http_error_rate',
    condition: '>',
    threshold: 5, // 5%
    severity: 'critical',
    for_duration: 180
  }
];
```

---

## CONTACT & SUPPORT

**Service Owner:** Platform/DevOps Team  
**Repository:** backend/services/monitoring-service  
**Documentation:** This file  
**Critical Issues:** Page on-call immediately  
**Non-Critical:** Project tracker  
**Grafana Dashboards:** http://grafana:3000  
**Prometheus:** http://prometheus:9090

---

## CHANGELOG

### Version 1.0.0 (Current)
- Complete documentation created
- 77 files documented
- Ready for production
- All critical features implemented
- ML/AI integration complete
- Kafka streaming operational
- Multi-database architecture stable

### Planned Changes
- Distributed TensorFlow training
- Enhanced root cause analysis
- PagerDuty integration
- Custom UI dashboards
- Auto-remediation capabilities

---

**END OF DOCUMENTATION**

*This documentation is the GOLD STANDARD for monitoring-service. Keep it updated as the service evolves.*
