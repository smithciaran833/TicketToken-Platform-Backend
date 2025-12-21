# Analytics Service - Complete Overview

## Service Purpose
The Analytics Service is a comprehensive data analytics and business intelligence platform that provides real-time metrics, predictive analytics, customer insights, dynamic pricing, campaign attribution, and customizable dashboards for the TicketToken platform.

---

## 📁 Directory Structure

### routes/
All API routes with authentication, authorization, and validation schemas.

#### **analytics.routes.ts**
- `GET /revenue/summary` - Get revenue summary for date range
- `GET /revenue/by-channel` - Get revenue breakdown by channel
- `GET /revenue/projections` - Get revenue projections (days ahead)
- `GET /customers/lifetime-value` - Get customer lifetime value analytics
- `GET /customers/segments` - Get customer segmentation data
- `GET /customers/churn-risk` - Get churn risk analysis
- `GET /sales/metrics` - Get sales metrics with granularity
- `GET /sales/trends` - Get sales trends over time
- `GET /events/performance` - Get event performance metrics
- `GET /events/top-performing` - Get top performing events
- `GET /realtime/summary` - Get real-time summary metrics
- `GET /conversions/funnel` - Get conversion funnel data
- `POST /query` - Execute custom analytics query
- `GET /dashboard` - Get aggregated dashboard data

#### **health.routes.ts**
- `GET /health` - Basic health check
- `GET /health/ready` - Readiness check
- `GET /health/live` - Liveness check
- `GET /health/dependencies` - Service dependencies health check

#### **alerts.routes.ts**
- `GET /venue/:venueId` - Get alerts for a venue (with filters)
- `GET /:alertId` - Get specific alert details
- `POST /` - Create new alert
- `PUT /:alertId` - Update alert configuration
- `DELETE /:alertId` - Delete alert
- `POST /:alertId/toggle` - Enable/disable alert
- `GET /:alertId/instances` - Get alert instances/history
- `POST /instances/:instanceId/acknowledge` - Acknowledge alert instance
- `POST /:alertId/test` - Test alert configuration

#### **customer.routes.ts**
- `GET /venue/:venueId/segments` - Get customer segments for venue
- `GET /venue/:venueId/:customerId` - Get customer profile
- `GET /venue/:venueId/:customerId/insights` - Get customer insights
- `GET /venue/:venueId/:customerId/journey` - Get customer journey
- `GET /venue/:venueId/:customerId/rfm` - Get RFM analysis
- `GET /venue/:venueId/:customerId/clv` - Get customer lifetime value
- `GET /venue/:venueId/search` - Search customers
- `GET /venue/:venueId/segments/:segment/analysis` - Get segment analysis

#### **dashboard.routes.ts**
- `GET /venue/:venueId` - Get all dashboards for venue
- `GET /:dashboardId` - Get specific dashboard
- `POST /` - Create new dashboard
- `PUT /:dashboardId` - Update dashboard
- `DELETE /:dashboardId` - Delete dashboard
- `POST /:dashboardId/clone` - Clone dashboard
- `POST /:dashboardId/share` - Share dashboard with users
- `GET /:dashboardId/permissions` - Get dashboard permissions

#### **campaign.routes.ts**
- `GET /venue/:venueId` - Get campaigns for venue
- `GET /:campaignId` - Get campaign details
- `GET /:campaignId/performance` - Get campaign performance metrics
- `GET /:campaignId/attribution` - Get campaign attribution analysis
- `GET /venue/:venueId/channels` - Get channel performance
- `POST /touchpoint` - Track customer touchpoint
- `GET /:campaignId/roi` - Get campaign ROI analysis

#### **export.routes.ts**
- `GET /venue/:venueId` - Get export history
- `GET /:exportId` - Get export status
- `POST /` - Create new export job
- `GET /:exportId/download` - Download completed export
- `POST /:exportId/cancel` - Cancel pending export
- `POST /:exportId/retry` - Retry failed export

#### **insights.routes.ts**
AI-powered insights and customer intelligence:
- `GET /venue/:venueId` - Get AI insights for venue
- `GET /venue/:venueId/customers/:customerId` - Get customer-specific insights
- `GET /:insightId` - Get specific insight
- `POST /:insightId/dismiss` - Dismiss an insight
- `POST /:insightId/action` - Take action on insight
- `GET /venue/:venueId/stats` - Get insight statistics
- `POST /venue/:venueId/refresh` - Refresh insights
- `GET /customers/:userId/profile` - Get customer profile (new)
- `GET /customers/:userId/preferences` - Get customer preferences
- `GET /venue/:venueId/customer-segments` - Get customer segments
- `GET /venue/:venueId/customer-list` - Get filtered customer list
- `GET /venue/:venueId/cohort-analysis` - Get cohort analysis

#### **metrics.routes.ts**
- `POST /` - Record single metric
- `POST /bulk` - Bulk record metrics
- `GET /:venueId` - Get metrics for venue
- `GET /:venueId/realtime` - Get real-time metrics
- `GET /:venueId/trends` - Get metric trends
- `GET /:venueId/compare` - Compare metrics across periods
- `GET /:venueId/aggregate` - Get aggregated metrics

#### **prediction.routes.ts**
Machine learning predictions:
- `POST /demand` - Predict demand for event
- `POST /pricing` - Optimize pricing recommendation
- `POST /churn` - Predict customer churn probability
- `POST /clv` - Predict customer lifetime value
- `POST /no-show` - Predict ticket no-show probability
- `POST /what-if` - Run what-if scenario analysis
- `GET /models/:modelType/performance` - Get ML model performance

#### **realtime.routes.ts**
- `GET /venue/:venueId/metrics` - Get real-time metrics
- `GET /venue/:venueId/subscribe` - Subscribe to metrics (WebSocket)
- `GET /venue/:venueId/sessions` - Get active sessions
- `GET /venue/:venueId/dashboard/:dashboardId` - Get live dashboard stats
- `POST /venue/:venueId/counter` - Update counter
- `GET /venue/:venueId/counter/:counterType` - Get counter value

#### **reports.routes.ts**
- `GET /templates` - Get available report templates
- `GET /venue/:venueId` - Get reports for venue
- `GET /:reportId` - Get specific report
- `POST /generate` - Generate report on-demand
- `POST /schedule` - Schedule recurring report
- `PUT /:reportId/schedule` - Update report schedule
- `DELETE /:reportId` - Delete report
- `GET /venue/:venueId/scheduled` - Get scheduled reports
- `POST /:reportId/schedule/:action` - Pause/resume scheduled report

#### **widget.routes.ts**
Dashboard widget management:
- `GET /dashboard/:dashboardId` - Get widgets for dashboard
- `GET /:widgetId` - Get specific widget
- `GET /:widgetId/data` - Get widget data
- `POST /` - Create new widget
- `PUT /:widgetId` - Update widget
- `DELETE /:widgetId` - Delete widget
- `POST /:widgetId/move` - Move widget to another dashboard
- `POST /:widgetId/duplicate` - Duplicate widget
- `POST /:widgetId/export` - Export widget data

#### **index.ts**
- `GET /cache/stats` - Get cache statistics
- `DELETE /cache/flush` - Flush cache

---

### services/
Business logic and data processing services.

#### **Core Services**

**metrics.service.ts**
- Records metrics to both PostgreSQL and InfluxDB
- Retrieves metrics with time-series support
- Provides real-time metric access
- Handles counter increments
- Aggregates metrics (sum, avg, min, max, count)
- Calculates metric trends
- Supports bulk metric recording
- Gets capacity metrics

**aggregation.service.ts**
- Aggregates metrics by time granularity (hour, day, week, month)
- Performs hourly and daily aggregations
- Calculates trends from time-series data
- Provides comparative metrics across periods
- Groups metrics into time buckets

**influxdb.service.ts**
- Manages InfluxDB write API connection
- Writes metrics to InfluxDB time-series database
- Bulk writes with batching
- Connection health checks
- Flush and close operations

**influxdb-metrics.service.ts**
- Records user actions to InfluxDB
- Records event metrics
- Tracks sales velocity
- Retrieves event sales time series
- Gets venue performance over time

**cache.service.ts**
- Redis-based caching with signatures
- Protected key validation
- TTL management
- Pattern-based deletion
- Cache warmup for venues
- Get-or-set pattern
- Cache statistics

**cache-integration.ts**
- Cache abstraction layer
- Automatic fetcher pattern
- Multi-key deletion support
- Cache flushing

#### **Analytics Services**

**alert.service.ts**
- Creates and manages analytics alerts
- Monitors metrics against thresholds
- Evaluates alert conditions (>, <, =, etc.)
- Triggers alerts when conditions met
- Executes alert actions (webhooks, notifications)
- Alert lifecycle management (active, resolved, acknowledged)
- Schedule-based alert evaluation
- Alert instance tracking

**customer-insights.service.ts**
- Customer profile aggregation
- RFM (Recency, Frequency, Monetary) scoring
- Customer segmentation (Champions, Loyal, At-Risk, etc.)
- Event preference analysis
- Cohort analysis
- Customer lifetime value calculation
- At-risk customer identification
- Venue customer lists with filtering

**customer-intelligence.service.ts**
- Deep customer profile analysis
- Customer metrics calculation
- Segment determination (VIP, Regular, New, At-Risk)
- Churn probability calculation
- Customer attribute analysis
- AI-powered customer insights generation
- RFM analysis with segment mapping

**attribution.service.ts**
- Tracks customer touchpoints across channels
- Customer journey mapping
- Attribution modeling (first-touch, last-touch, linear, time-decay, data-driven)
- Channel performance analysis
- Campaign ROI calculation
- Conversion tracking

**dynamic-pricing.service.ts**
- Calculates optimal ticket prices
- Demand-based pricing adjustments
- Confidence scoring
- Venue pricing rules management
- Price change tracking with audit trail

**demand-tracker.service.ts**
- Calculates demand metrics for events
- Sales velocity tracking
- Price elasticity calculation
- Demand scoring (0-100)

**prediction.service.ts**
- ML model initialization
- Demand prediction for events
- Price optimization recommendations
- Churn prediction
- Customer lifetime value prediction
- No-show probability
- What-if scenario analysis

#### **Real-time Services**

**realtime-aggregation.service.ts**
- 1-minute metric aggregation pipeline
- 5-minute aggregation
- Hourly aggregation
- Alert condition monitoring
- Auto-trigger alerts based on metrics

**websocket.service.ts**
- Broadcasts metric updates to connected clients
- Widget update broadcasting
- Venue-specific broadcasting
- User-specific messaging
- Client connection management
- Metrics subscription management
- Room-based pub/sub

**event-stream.service.ts**
- Event stream processing from RabbitMQ
- Real-time metric updates
- Purchase metrics tracking
- Scan metrics tracking
- Traffic metrics tracking
- Raw event storage

#### **Export & Reporting**

**export.service.ts**
- Creates export jobs
- Generates CSV, Excel, PDF exports
- Analytics report generation
- Customer list exports
- Financial report exports
- File upload to storage
- Export status tracking
- Async export processing

**data-aggregation.service.ts**
- Venue metrics aggregation by date
- Daily rollup processing

#### **Messaging & Communication**

**message-gateway.service.ts**
- Multi-channel messaging (email, SMS, push, webhook)
- Alert notification sending
- Message templating with interpolation
- Bulk message sending
- Message queue integration
- Message status tracking
- Failed message retry

#### **Validation & Security**

**validation.service.ts**
- Date range validation
- Pagination parameter validation
- Metric type validation
- Export format validation
- Email and phone validation
- UUID validation
- Time granularity validation
- Alert threshold validation
- Widget config validation
- Input sanitization

**anonymization.service.ts**
- Customer ID hashing with daily salt rotation
- Email anonymization
- Location generalization (lat/long rounding)
- Device info anonymization
- OS/browser generalization
- Age group aggregation
- Anonymous ID generation
- GDPR compliance utilities

**metrics-migration.service.ts**
- Dual-write to PostgreSQL and InfluxDB
- Historical data migration
- Migration validation

---

### controllers/
HTTP request handlers that coordinate service calls.

#### **analytics.controller.ts**
Methods: `getRevenueSummary`, `getRevenueByChannel`, `getRevenueProjections`, `getCustomerLifetimeValue`, `getCustomerSegments`, `getChurnRiskAnalysis`, `getSalesMetrics`, `getSalesTrends`, `getEventPerformance`, `getTopPerformingEvents`, `getRealtimeSummary`, `getConversionFunnel`, `executeCustomQuery`, `getDashboardData`

#### **alerts.controller.ts**
Methods: `getAlerts`, `getAlert`, `createAlert`, `updateAlert`, `deleteAlert`, `toggleAlert`, `getAlertInstances`, `acknowledgeAlert`, `testAlert`

#### **customer.controller.ts**
Methods: `getCustomerSegments`, `getCustomerProfile`, `getCustomerInsights`, `getCustomerJourney`, `getRFMAnalysis`, `getCustomerLifetimeValue`, `searchCustomers`, `getSegmentAnalysis`

#### **customer-insights.controller.ts**
Methods: `getCustomerProfile`, `getVenueCustomerSegments`, `getCustomerPreferences`, `getVenueCustomerList`, `getCohortAnalysis`

#### **dashboard.controller.ts**
Methods: Dashboard CRUD operations, cloning, sharing, permissions management

#### **campaign.controller.ts**
Methods: Campaign management, performance tracking, attribution, ROI analysis

#### **export.controller.ts**
Methods: `getExports`, `getExportStatus`, `createExport`, `downloadExport`, `cancelExport`, `retryExport`

#### **insights.controller.ts**
Methods: AI insight management, dismissal, action execution, statistics

#### **metrics.controller.ts**
Methods: `recordMetric`, `bulkRecordMetrics`, `getMetrics`, `getRealTimeMetrics`, `getMetricTrends`, `compareMetrics`, `getAggregatedMetric`

#### **prediction.controller.ts**
Methods: `predictDemand`, `optimizePricing`, `predictChurn`, `predictCLV`, `predictNoShow`, `runWhatIfScenario`, `getModelPerformance`

#### **pricing.controller.ts**
Methods: `getPriceRecommendation`, `getPendingPriceChanges`, `approvePriceChange`, `getDemandMetrics`

#### **realtime.controller.ts**
Methods: Real-time metrics, WebSocket subscriptions, active sessions, counters

#### **reports.controller.ts**
Methods: Report templates, generation, scheduling, management

#### **widget.controller.ts**
Methods: Widget CRUD, data retrieval, moving, duplication, export

#### **health.controller.ts**
Methods: `health`, `readiness`, `liveness`, `dependencies`
Tests connections to: PostgreSQL, Redis, RabbitMQ, MongoDB

#### **base.controller.ts**
Base class providing: `handleError`, `success` response helpers

---

### models/ (Repositories)
Data access layer with models for different databases.

#### **postgres/**
PostgreSQL models using Knex query builder:

- **aggregation.model.ts** - `analytics_aggregations` table queries
- **alert.model.ts** - `analytics_alerts` table queries (CRUD, by venue, by status)
- **dashboard.model.ts** - `analytics_dashboards` table queries
- **export.model.ts** - `analytics_exports` table queries
- **metric.model.ts** - `analytics_metrics` table queries (time-series queries)
- **widget.model.ts** - `analytics_widgets` table queries
- **base.model.ts** - Base model with common database operations

#### **mongodb/**
MongoDB schemas using Mongoose:

- **campaign.schema.ts** - Campaign tracking and attribution data
- **event.schema.ts** - Event analytics and metadata
- **raw-analytics.schema.ts** - Raw event/action logs
- **user-behavior.schema.ts** - User behavior tracking

#### **redis/**
Redis data models:

- **cache.model.ts** - Cache key patterns and operations
- **realtime.model.ts** - Real-time metric storage patterns
- **session.model.ts** - User session tracking

---

### middleware/

#### **auth.middleware.ts**
- `authenticate` - Validates JWT tokens, extracts user info
- `authorize` - Permission-based access control (checks required permissions)

#### **error-handler.ts**
Global error handling middleware:
- Catches unhandled errors
- Formats error responses
- Logs errors
- Returns appropriate HTTP status codes

#### **rate-limit.middleware.ts**
API rate limiting:
- Redis-based rate limiting
- Configurable windows and limits
- Per-user/IP rate limits

---

### config/
External service configurations and connection management.

#### **database.ts**
- PostgreSQL connection via Knex
- Connection pooling configuration
- Migration settings
- RLS (Row Level Security) support

#### **influxdb.ts**
- InfluxDB connection setup
- Time-series database configuration
- Bucket and organization settings
- Write API configuration

#### **mongodb.ts**
- MongoDB connection via Mongoose
- Connection pooling
- Database and collection configuration

#### **rabbitmq.ts**
- RabbitMQ connection setup
- Exchange and queue configuration
- Message routing
- Consumer setup

#### **redis.ts**
- Redis connection configuration
- Connection pooling
- Cache and session store setup

#### **websocket.ts**
- WebSocket server configuration
- Socket.io setup
- Room management
- Authentication

#### **secrets.ts**
- Environment variable loading
- Secrets management
- Configuration validation

#### **constants.ts**
- Application constants
- Metric types
- Time granularities
- Status codes

#### **dependencies.ts**
- Service dependency injection setup
- Singleton instances

#### **redis-cache-strategies.ts**
- Cache TTL strategies
- Cache key patterns
- Invalidation rules

#### **mongodb-schemas.ts**
- MongoDB schema definitions
- Validation rules

---

### migrations/
Database schema migrations using Knex.

#### **001_analytics_baseline.ts**
Creates core analytics tables:
- `analytics_metrics` - Time-series metrics storage
- `analytics_aggregations` - Pre-aggregated metrics
- `analytics_alerts` - Alert definitions and instances
- `analytics_dashboards` - Dashboard configurations
- `analytics_widgets` - Widget configurations
- `analytics_exports` - Export job tracking
- `customer_rfm_scores` - RFM segmentation scores
- `customer_segments` - Segment definitions
- `customer_lifetime_value` - CLV calculations
- `realtime_metrics` - Real-time metric cache
- `venue_alerts` - Venue-specific alerts
- `price_history` - Dynamic pricing history
- `pending_price_changes` - Price change approvals

Creates analytics views:
- `event_summary` - Event performance overview
- `venue_analytics` - Venue metrics aggregation
- `ticket_status_details` - Ticket inventory
- `financial_summary` - Financial reporting
- `customer_360` - Complete customer view with segments
- `marketplace_activity` - Secondary market analytics
- `user_dashboard_view` - User profile dashboard
- `compliance_reporting` - Audit and compliance tracking

Creates materialized views for performance:
- `venue_analytics_mv`
- `customer_360_materialized`
- `marketplace_activity_materialized`
- `user_dashboard_materialized`
- `compliance_reporting_materialized`

Enables Row Level Security (RLS) on all tables

#### **002_create_external_analytics_tables.ts**
Creates:
- `venue_analytics` - Daily venue metrics
- `event_analytics` - Daily event metrics

#### **003_add_rls_to_price_tables.ts**
Adds Row Level Security policies to pricing tables

---

### validators/
**Empty folder** - Validation is handled inline in routes using Fastify JSON schemas

---

### analytics-engine/
Advanced analytics computation engine.

#### **analytics-engine.ts**
Core analytics engine that coordinates calculators and aggregators

#### **aggregators/**
- **metrics-aggregator.ts** - Time-series metric aggregation logic

#### **calculators/**
- **customer-analytics.ts** - Customer segmentation, RFM, CLV calculations
- **predictive-analytics.ts** - ML-based predictions and forecasting
- **revenue-calculator.ts** - Revenue analytics and projections

---

### workers/
Background job processors.

#### **pricing-worker.ts**
- Background worker for dynamic pricing calculations
- Processes pricing recommendations
- Updates price history

#### **rfm-calculator.worker.ts**
- Background RFM score calculation
- Batch customer segmentation
- Scheduled recalculation jobs

---

### ml/
Machine learning models and training.

#### **models/** - Trained ML model artifacts
#### **training/** - Model training scripts and pipelines

---

### processors/
Event and data processors for stream processing.

---

### events/
Event emitters and handlers for internal event bus.

---

### types/
TypeScript type definitions and interfaces.

---

### utils/
Utility functions and helpers.

#### **logger.ts** - Structured logging with Winston
#### **errors.ts** - Custom error classes
#### **api-error.ts** - API error formatting
#### **scheduler.ts** - Job scheduling utilities

---

### scripts/
Utility scripts for maintenance and operations.

#### **migrate-to-influxdb.ts**
Script to migrate historical metrics from PostgreSQL to InfluxDB

---

## Database Tables Owned by This Service

### PostgreSQL Tables
1. **analytics_metrics** - Raw metrics with dimensions
2. **analytics_aggregations** - Pre-aggregated metrics by time period
3. **analytics_alerts** - Alert definitions and configurations
4. **analytics_dashboards** - Dashboard configurations
5. **analytics_widgets** - Widget definitions
6. **analytics_exports** - Export job tracking
7. **customer_rfm_scores** - RFM segmentation data
8. **customer_segments** - Customer segment definitions
9. **customer_lifetime_value** - CLV calculations
10. **realtime_metrics** - Real-time metric cache
11. **venue_alerts** - Venue-specific alert instances
12. **price_history** - Dynamic pricing audit trail
13. **pending_price_changes** - Price change approval queue
14. **venue_analytics** - Daily venue aggregates
15. **event_analytics** - Daily event aggregates

### InfluxDB Buckets
- User actions time-series
- Event metrics time-series
- Sales velocity time-series

### MongoDB Collections
- Campaigns (attribution data)
- Events (analytics metadata)
- Raw analytics events
- User behavior tracking

### Redis Keys
- Cache keys (`analytics:*`)
- Real-time metrics (`realtime:*`)
- Session data (`session:*`)
- Counters

---

## External Services Configured

### **PostgreSQL**
- Primary relational database
- Stores structured analytics data
- Views and materialized views

### **InfluxDB**
- Time-series database
- High-frequency metrics storage
- Real-time metrics queries

### **MongoDB**
- Document store for unstructured data
- Campaign data
- Raw event logs
- User behavior tracking

### **Redis**
- Caching layer
- Real-time metric storage
- Session management
- Pub/sub for WebSocket

### **RabbitMQ**
- Message queue for event streaming
- Async job processing
- Inter-service communication

### **WebSocket (Socket.io)**
- Real-time metric broadcasting
- Dashboard live updates
- Alert notifications

### **File Storage (S3/Compatible)**
- Export file storage
- Report storage

---

## Key Features

### 📊 **Real-Time Analytics**
- Live metric streaming via WebSocket
- Sub-second metric aggregation
- Active session tracking
- Real-time dashboards

### 📈 **Predictive Analytics**
- Demand forecasting
- Churn prediction
- Customer lifetime value prediction
- Dynamic pricing optimization
- No-show probability

### 👥 **Customer Intelligence**
- 360-degree customer view
- RFM segmentation
- Customer journey mapping
- Behavioral analysis
- Churn risk scoring
- Cohort analysis

### 💰 **Revenue Analytics**
- Revenue tracking and projections
- Channel attribution
- Campaign ROI
- Pricing optimization
- Sales funnel analysis

### 🔔 **Intelligent Alerting**
- Custom alert rules
- Threshold monitoring
- Multi-channel notifications
- Alert acknowledgment workflow
- Scheduled alert checks

### 📊 **Customizable Dashboards**
- Drag-and-drop widgets
- Multiple dashboard types
- Sharing and permissions
- Real-time data refresh
- Export capabilities

### 📄 **Reporting & Export**
- On-demand report generation
- Scheduled reports
- Multiple formats (PDF, CSV, Excel)
- Email delivery
- Custom report templates

### 🔐 **Security & Compliance**
- Row-Level Security (RLS) for multi-tenancy
- Data anonymization (GDPR compliant)
- Audit logging
- Rate limiting
- Permission-based access control

---

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Fastify
- **Databases**: PostgreSQL, InfluxDB, MongoDB, Redis
- **Message Queue**: RabbitMQ
- **Real-Time**: Socket.io (WebSocket)
- **ORM/Query Builders**: Knex (PostgreSQL), Mongoose (MongoDB)
- **Caching**: Redis with TTL strategies
- **Authentication**: JWT-based
- **ML/AI**: Placeholder models (ready for TensorFlow/PyTorch integration)

---

## Performance Optimizations

1. **Materialized Views** - Pre-aggregated analytics for fast queries
2. **Time-Series Database** - InfluxDB for high-frequency metrics
3. **Redis Caching** - Multi-layer caching strategy
4. **Connection Pooling** - Optimized database connections
5. **Batch Processing** - Bulk metric writes
6. **Indexed Queries** - Strategic indexing on all tables
7. **Aggregation Pipeline** - Background aggregation workers

---

## Monitoring & Observability

- Health check endpoints for all dependencies
- Structured logging with Winston
- Metric recording of service operations
- Error tracking and alerting
- Connection health monitoring

---

## Multi-Tenancy

All tables implement Row-Level Security (RLS) policies that enforce tenant isolation using `current_setting('app.current_tenant')`. This ensures data is automatically filtered by tenant context.

---

## Future Enhancements

- Advanced ML model integration (TensorFlow/PyTorch)
- A/B testing framework
- Advanced anomaly detection
- Natural language query interface
- Automated insight recommendations
- Extended predictive models
