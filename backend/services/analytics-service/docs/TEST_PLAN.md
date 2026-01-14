# Analytics Service Test Plan

## Overview

This document outlines comprehensive testing requirements for the TicketToken Analytics Service. The goal is 100% test coverage with compelling justification for any untested code.

**Service Stats:**
- 125 TypeScript files
- 24 services, 14 models, 9 middleware, 14 route files (112 endpoints)
- 18 controllers, 12 config files
- 5 analytics engine files, 8 utils, 2 workers

---

## Table of Contents

1. [Test Strategy](#test-strategy)
2. [Critical Issues to Fix First](#critical-issues-to-fix-first)
3. [Config Tests](#config-tests)
4. [Controller Tests](#controller-tests)
5. [Service Tests](#service-tests)
6. [Model Tests](#model-tests)
7. [Middleware Tests](#middleware-tests)
8. [Route Tests](#route-tests)
9. [Utils Tests](#utils-tests)
10. [Workers Tests](#workers-tests)
11. [Analytics Engine Tests](#analytics-engine-tests)
12. [Schemas Tests](#schemas-tests)
13. [App Entry Points Tests](#app-entry-points-tests)
14. [E2E Test Scenarios](#e2e-test-scenarios)

---

## Test Strategy

### Test Types

| Type | Purpose | Location | Runner |
|------|---------|----------|--------|
| Unit | Test isolated functions/methods with mocked deps | `__tests__/unit/` | Jest |
| Integration | Test components with real dependencies | `__tests__/integration/` | Jest + Testcontainers |
| E2E | Test full user workflows | `__tests__/e2e/` | Jest + Supertest |

### Coverage Requirements

- **Minimum:** 80% line coverage
- **Target:** 95% line coverage
- **Critical paths:** 100% coverage (auth, tenant isolation, payments)

### Files Excluded from Coverage (with justification)

| File | Justification |
|------|---------------|
| `src/models/index.ts` | Re-exports only |
| `src/services/index.ts` | Re-exports only |
| `src/controllers/index.ts` | Re-exports only |
| `src/routes/index.ts` | Route registration only |
| `src/types/*.ts` | Type definitions only, no runtime code |
| `src/middleware/auth.ts` | Intentionally disabled (throws error) |
| `src/config/constants.ts` | Static configuration, no logic |
| `src/errors/index.ts` | Re-exports + simple class |
| `src/processors/index.ts` | Placeholder only |

---

## Critical Issues to Fix First

### Mock Data / Incomplete Implementations (MUST FIX)

These return hardcoded/mock data and will cause incorrect behavior in production:

| Priority | File | Method | Issue |
|----------|------|--------|-------|
| **P0** | `controllers/prediction.controller.ts` | `getModelPerformance()` | Returns RANDOM data with `Math.random()` |
| **P0** | `services/alert.service.ts` | `getMonitoredVenues()` | Hardcoded `['venue-1', 'venue-2']` |
| **P0** | `services/attribution.service.ts` | `getConversionTouchpoints()` | Mock touchpoints |
| **P0** | `services/attribution.service.ts` | `getConversions()` | Mock conversions |
| **P1** | `services/export.service.ts` | `fetchAnalyticsData()` | Mock data |
| **P1** | `services/export.service.ts` | `fetchCustomerData()` | Mock data |
| **P1** | `services/export.service.ts` | `fetchFinancialData()` | Mock data |
| **P1** | `services/export.service.ts` | `uploadToStorage()` | Mock URL |
| **P1** | `services/metrics.service.ts` | `getCapacityMetrics()` | Mock metrics |
| **P1** | `services/customer-intelligence.service.ts` | `getCustomerSegments()` | Mock segments |
| **P2** | `services/prediction.service.ts` | All methods | Placeholder models, random variance |
| **P2** | `services/realtime-aggregation.service.ts` | `aggregate5Minutes()` | TODO - not implemented |
| **P2** | `services/realtime-aggregation.service.ts` | `calculateHourlyMetrics()` | Returns zeros |
| **P2** | `services/message-gateway.service.ts` | `getMessageStatus()` | Returns null |
| **P2** | `services/message-gateway.service.ts` | `retryFailedMessages()` | Returns 0 |
| **P2** | `models/postgres/alert.model.ts` | `createAlertInstance()` | Returns mock, not persisted |

### Potential Bugs (SHOULD FIX)

| File | Issue |
|------|-------|
| `config/influxdb.ts` | Uses `INFLUX_URL` but `config/index.ts` uses `INFLUXDB_URL` |
| `config/mongodb.ts` vs `config/mongodb-schemas.ts` | Both create indexes - potential conflict |
| `services/demand-tracker.service.ts` | SQL `INTERVAL '? hours'` may not interpolate correctly |
| `services/data-aggregation.service.ts` | Gets DB at construction time - fails if not initialized |
| `controllers/analytics.controller.ts` | `request.venue!.id` non-null assertion crashes if undefined |
| `controllers/health.controller.ts` | Deep property access could throw on undefined |
| `models/mongodb/campaign.schema.ts` | Date filter `$or` logic may not find overlapping campaigns correctly |
| `models/redis/session.model.ts` | Mixed `getRedis()` and `getRedisClient()` usage - inconsistent |

### Security Concerns (MUST FIX)

| File | Issue |
|------|-------|
| `config/websocket.ts` | CORS `origin: '*'` in production |
| `config/secrets.ts` | Fragile relative path `../../../../shared/...` |

---

## Config Tests

### `src/config/database.ts`

**Unit Tests:**
```
□ isValidTenantId() accepts valid UUIDs
□ isValidTenantId() rejects invalid formats
□ isValidTenantId() rejects empty string
□ isValidTenantId() rejects SQL injection attempts
□ escapeTenantId() strips dangerous characters
□ getDb() throws when not initialized
□ getAnalyticsDb() throws when not initialized
```

**Integration Tests:**
```
□ connectDatabases() connects successfully
□ connectDatabases() retries on failure (5 retries, exponential backoff)
□ connectDatabases() applies SSL in production
□ Tenant context set correctly via parameterized queries
```

### `src/config/dependencies.ts`

**Unit Tests:**
```
□ setDependency() stores value
□ getDependency() retrieves value
□ getDependency() returns undefined for missing keys
□ getAllDependencies() returns full object
```

### `src/config/index.ts`

**Unit Tests:**
```
□ Defaults applied when env vars missing
□ Env vars override defaults
□ parseInt handles invalid PORT
□ Boolean parsing for ML_TRAINING_ENABLED
```

### `src/config/influxdb.ts`

**Unit Tests:**
```
□ getWriteApi() returns WriteApi instance
□ getQueryApi() returns QueryApi instance
```

**Integration Tests:**
```
□ Write and query test data
```

### `src/config/mongodb-schemas.ts`

**Unit Tests:**
```
□ schemas object has correct shape
```

**Integration Tests:**
```
□ applyMongoSchemas() creates collections
□ Indexes created correctly
□ TTL indexes expire documents
```

### `src/config/mongodb.ts`

**Unit Tests:**
```
□ getMongoDB() throws when not initialized
□ getMongoClient() throws when not initialized
```

**Integration Tests:**
```
□ connectMongoDB() establishes connection
□ Auth works with credentials
□ Indexes created on collections
```

### `src/config/rabbitmq.ts`

**Unit Tests:**
```
□ getChannel() throws when not initialized
```

**Integration Tests:**
```
□ connectRabbitMQ() establishes connection
□ Exchange created (topic, durable)
□ Queue created correctly
□ publishEvent() messages can be consumed
```

**E2E Tests:**
```
□ Full event flow - publish → consume → process
```

### `src/config/redis-cache-strategies.ts`

**Unit Tests:**
```
□ generateKey() produces correct format
□ Unknown strategy warns and returns null
```

**Integration Tests:**
```
□ set() stores with correct TTL
□ get() retrieves and parses JSON
□ invalidate() deletes matching keys
□ getOrSet() cache-aside pattern works
□ mget() handles partial hits
```

### `src/config/redis.ts`

**Unit Tests:**
```
□ getRedis() throws when not initialized
□ getPub() throws when not initialized
□ getSub() throws when not initialized
□ initRedis() is idempotent
```

**Integration Tests:**
```
□ initRedis() connects successfully
□ checkRedisHealth() returns healthy:true when connected
□ checkRedisHealth() returns healthy:false when disconnected
□ closeRedisConnections() cleans up all connections
```

### `src/config/secrets.ts`

**Unit Tests:**
```
□ Throws when secrets unavailable
```

**Integration Tests:**
```
□ Loads secrets in test environment
```

### `src/config/websocket.ts`

**Unit Tests:**
```
□ getIO() throws when not initialized
□ emitMetricUpdate() no-ops when io is null
□ emitAlert() no-ops when io is null
□ emitWidgetUpdate() no-ops when io is null
```

**Integration Tests:**
```
□ Client can connect
□ Subscribe joins correct rooms
□ Unsubscribe leaves room
□ Emit reaches subscribed clients only
```

**E2E Tests:**
```
□ Full realtime flow - data change → websocket update → client receives
```

---

## Controller Tests

### `src/controllers/base.controller.ts`

**Unit Tests:**
```
□ handleError() extracts statusCode (default 500)
□ handleError() extracts message (default "Internal Server Error")
□ success() returns correct shape with data
□ notFound() returns 404 with message
□ badRequest() returns 400 with message
□ unauthorized() returns 401 with message
□ forbidden() returns 403 with message
```

### `src/controllers/alerts.controller.ts`

**Unit Tests:**
```
□ getAlerts() calls service with venueId
□ getAlert() returns 404 when not found
□ createAlert() uses request.user?.id fallback
□ deleteAlert() returns 404 when not found
□ acknowledgeAlert() passes userId and notes
```

**Integration Tests:**
```
□ Full CRUD flow with database
□ Alert instance lifecycle
```

### `src/controllers/analytics.controller.ts`

**Unit Tests:**
```
□ getRevenueProjections() dynamic import works
□ getTopPerformingEvents() respects limit parameter
□ getRealtimeSummary() calculates conversionRate correctly
□ getRealtimeSummary() handles division by zero
□ getDashboardData() period calculation for 24h, 7d, 30d, 90d
```

**Integration Tests:**
```
□ Full query flow with analyticsEngine
```

### `src/controllers/campaign.controller.ts`

**Unit Tests:**
```
□ getCampaigns() passes status/type filters
□ getCampaign() returns 404 when not found
□ getCampaignAttribution() returns 400 if venueId missing
□ getCampaignAttribution() calculates conversionRate correctly
□ trackTouchpoint() builds touchpoint object correctly
□ getCampaignROI() returns 400 if venueId missing
```

### `src/controllers/customer-insights.controller.ts`

**Unit Tests:**
```
□ getCustomerProfile() returns 401 if no user
□ getCustomerProfile() returns 403 if non-admin accessing other user
□ getCustomerProfile() allows admin to access any profile
□ getCustomerProfile() returns 404 if not found
□ getVenueCustomerSegments() returns 401 if no user
□ getCohortAnalysis() defaults date range to last year
```

### `src/controllers/customer.controller.ts`

**Unit Tests:**
```
□ getCustomerProfile() returns 404 when not found
□ getCustomerLifetimeValue() returns 404 when not found
□ searchCustomers() filters by query string
□ searchCustomers() handles empty query
□ getSegmentAnalysis() calculates metrics correctly
□ getSegmentRecommendations() returns correct recommendations per segment
```

### `src/controllers/dashboard.controller.ts`

**Unit Tests:**
```
□ getDashboard() returns 404 when not found
□ updateDashboard() returns 404 when not found
□ deleteDashboard() returns 404 when not found
□ cloneDashboard() copies all fields except id/is_default
□ shareDashboard() updates visibility and maps permissions
□ getDashboardPermissions() extracts from layout.sharedWith
```

### `src/controllers/export.controller.ts`

**Unit Tests:**
```
□ getExportStatus() returns 404 when not found
□ createExport() maps type/format to enums
□ downloadExport() returns 404 when export not found
□ downloadExport() returns 400 when not completed
□ cancelExport() validates status before cancelling
□ retryExport() creates new export with same params
```

### `src/controllers/health.controller.ts`

**Unit Tests:**
```
□ health() returns correct shape
□ liveness() returns uptime
□ readiness() returns 503 if critical dep unhealthy
□ testMongoDBConnection() returns disabled when MONGODB_ENABLED !== 'true'
```

**Integration Tests:**
```
□ All dependency checks with real connections
```

### `src/controllers/insights.controller.ts`

**Unit Tests:**
```
□ getInsights() filters by type/priority/actionable
□ getInsight() returns 404 when not found
□ dismissInsight() updates correct fields
□ takeAction() records action and handles different types
□ getInsightStats() calculates totals correctly
□ refreshInsights() returns 202 with estimated count
```

### `src/controllers/metrics.controller.ts`

**Unit Tests:**
```
□ recordMetric() passes all params to service
□ bulkRecordMetrics() converts metricType to enum
□ getMetrics() parses granularity correctly
□ getMetricTrends() calculates date range from periods
□ compareMetrics() builds DateRange objects correctly
□ getAggregatedMetric() extracts total from summary
```

### `src/controllers/prediction.controller.ts`

**Unit Tests:**
```
□ predictDemand() defaults daysAhead to 30
□ runWhatIfScenario() restructures scenario object correctly
□ getModelPerformance() - NEEDS REAL IMPLEMENTATION (currently returns random)
```

### `src/controllers/pricing.controller.ts`

**Unit Tests:**
```
□ getPriceRecommendation() returns 401 if no user
□ getPriceRecommendation() returns 404 if event not found
□ approvePriceChange() applies price when approved=true
□ approvePriceChange() records rejection when approved=false
□ getDemandMetrics() returns 401 if no user
```

### `src/controllers/realtime.controller.ts`

**Unit Tests:**
```
□ getRealTimeMetrics() uses default metrics when none specified
□ getRealTimeMetrics() parses comma-separated metrics
□ subscribeToMetrics() returns WebSocket URL
□ getActiveSessions() limits to 100
□ updateCounter() defaults increment to 1
□ getCounter() defaults to 0 when not found
```

### `src/controllers/reports.controller.ts`

**Unit Tests:**
```
□ getReportTemplates() returns REPORT_TEMPLATES constant
□ generateReport() validates template exists
□ scheduleReport() calculates next run time
□ calculateNextRunTime() handles daily frequency
□ calculateNextRunTime() handles weekly frequency
□ calculateNextRunTime() handles monthly frequency
□ updateReportSchedule() recalculates next run
□ toggleScheduledReport() sets is_active correctly
```

### `src/controllers/widget.controller.ts`

**Unit Tests:**
```
□ getWidget() returns 404 when not found
□ getWidgetData() defaults date range to 30 days
□ deleteWidget() returns 404 when not found
□ moveWidget() updates dashboard_id
□ duplicateWidget() offsets position and appends "(Copy)"
□ exportWidgetData() returns 404 when not found
```

---

## Service Tests

### `src/services/aggregation.service.ts`

**Unit Tests:**
```
□ getBucketKey() returns correct key for minute granularity
□ getBucketKey() returns correct key for hour granularity
□ getBucketKey() returns correct key for day granularity
□ getBucketKey() returns correct key for week granularity (start of week)
□ getBucketKey() returns correct key for month granularity
□ getBucketKey() returns correct key for quarter granularity
□ getBucketKey() returns correct key for year granularity
□ calculateTrend() returns 0 for < 2 data points
□ calculateTrend() calculates correct slope (linear regression)
□ aggregateByGranularity() groups data correctly
□ aggregateByGranularity() calculates change between periods
□ aggregateByGranularity() calculates changePercent correctly
□ aggregateByGranularity() handles division by zero
□ Summary stats calculates total correctly
□ Summary stats calculates average correctly
□ Summary stats calculates min correctly
□ Summary stats calculates max correctly
□ Summary stats handles empty array
□ Cache hit returns cached value without recalculating
```

**Integration Tests:**
```
□ Full aggregation flow with real database
□ performHourlyAggregation() processes all metric types
□ performDailyAggregation() calculates correct date range
```

### `src/services/alert.service.ts`

**Unit Tests:**
```
□ mapDBAlertToAlert() transforms database record correctly
□ evaluateCondition() returns true for equals when values match
□ evaluateCondition() returns true for not_equals when values differ
□ evaluateCondition() returns true for greater_than when value exceeds threshold
□ evaluateCondition() returns true for less_than when value below threshold
□ evaluateCondition() returns true for greater_than_or_equals
□ evaluateCondition() returns true for less_than_or_equals
□ isWithinSchedule() returns true when no schedule defined
□ isWithinSchedule() checks active days correctly
□ isWithinSchedule() checks active hours correctly
□ generateAlertMessage() formats message with metric values
□ checkAlert() skips if outside schedule
□ checkAlert() skips if already triggered within cooldown
□ executeActions() applies delay before sending
□ executeActions() handles email action type
□ executeActions() handles sms action type
□ executeActions() handles slack action type
□ executeActions() handles webhook action type
```

**Integration Tests:**
```
□ Full alert lifecycle (create → trigger → acknowledge → resolve)
□ Alert monitoring interval fires correctly
```

### `src/services/anonymization.service.ts`

**Unit Tests:**
```
□ hashCustomerId() produces consistent output for same day
□ hashCustomerId() produces different output for different days
□ hashEmail() normalizes input (lowercase, trim)
□ anonymizeLocation() returns null for null input
□ anonymizeLocation() truncates postal code to 3 chars
□ generalizeOS() maps Windows correctly
□ generalizeOS() maps Mac correctly
□ generalizeOS() maps Linux correctly
□ generalizeOS() maps Android correctly
□ generalizeOS() maps iOS correctly
□ generalizeOS() returns 'Other' for unknown OS
□ generalizeBrowser() maps Chrome correctly
□ generalizeBrowser() maps Firefox correctly
□ generalizeBrowser() maps Safari correctly
□ generalizeBrowser() maps Edge correctly
□ generalizeBrowser() maps Opera correctly
□ aggregateAgeGroup() returns correct bucket for each age range
□ aggregateAgeGroup() returns undefined for undefined input
□ anonymizeCustomerData() removes all PII fields
□ generateAnonymousId() returns 32-char hex string
□ checkAndUpdateSalt() rotates salt at day boundary
```

### `src/services/attribution.service.ts`

**Unit Tests:**
```
□ applyAttributionModel() first_touch gives 100% to first touchpoint
□ applyAttributionModel() last_touch gives 100% to last touchpoint
□ applyAttributionModel() linear distributes equally
□ applyAttributionModel() time_decay applies exponential with half-life
□ applyAttributionModel() data_driven weights by channel performance
□ Attribution revenue sums to total conversion value
□ Attribution handles single touchpoint correctly
□ ROI calculation: (revenue - cost) / cost * 100
□ CPA calculation: cost / conversions
□ Handles zero cost (ROI = 0)
□ Handles zero conversions (CPA = 0)
```

**Integration Tests:**
```
□ Full attribution flow (AFTER fixing mock data)
```

### `src/services/cache-integration.ts`

**Unit Tests:**
```
□ serviceCache.get() returns cached value on hit
□ serviceCache.get() calls fetcher on miss
□ serviceCache.set() stores with correct TTL
□ serviceCache.delete() handles string key
□ serviceCache.delete() handles array of keys
```

### `src/services/cache.service.ts`

**Unit Tests:**
```
□ generateSignature() produces consistent output
□ validateSignature() returns true for valid signature
□ validateSignature() returns false for tampered data
□ isProtectedKey() identifies protected prefixes
□ validateWritePermission() restricts writes by service ID
□ get() validates signature for protected keys
□ get() deletes and returns null on signature mismatch
□ set() signs protected data before storing
□ set() throws on unauthorized write attempt
□ increment() maintains integrity for protected keys
□ flushAll() only allowed in test/admin mode
```

### `src/services/customer-insights.service.ts`

**Unit Tests:**
```
□ makeCacheKey() includes tenant ID in key
□ makeCacheKey() throws on empty tenant ID
□ makeCacheKey() validates safe pattern (no injection)
□ All methods throw on missing tenant ID
□ Cache hit returns cached value
□ Stale data (> 24 hours) triggers recalculation
□ clearTenantCache() uses pattern deletion
```

**Integration Tests:**
```
□ Full profile retrieval with database
□ RFM score calculation
□ Cohort analysis with real data
```

### `src/services/customer-intelligence.service.ts`

**Unit Tests:**
```
□ determineCustomerSegment() returns NEW for 0 tickets
□ determineCustomerSegment() returns LOST for > 365 days inactive
□ determineCustomerSegment() returns DORMANT for > 180 days inactive
□ determineCustomerSegment() returns AT_RISK for > 90 days inactive
□ determineCustomerSegment() returns VIP for high spend + frequency
□ determineCustomerSegment() returns REGULAR for frequency > 2
□ calculateChurnProbability() returns value in valid range
□ calculateChurnProbability() adjusts for frequency
□ scoreRecency() returns 1-5 based on days since last purchase
□ scoreFrequency() returns 1-5 based on purchase frequency
□ scoreMonetary() returns 1-5 based on total spend
□ getRFMSegment() maps known score combinations
□ getRFMSegment() returns 'Other' for unknown combinations
□ generateCustomerInsights() creates churn insight for high risk
□ generateCustomerInsights() creates inactive insight for > 90 days
□ generateCustomerInsights() creates VIP insight for high spend
```

### `src/services/data-aggregation.service.ts`

**Unit Tests:**
```
□ Handles zero tickets gracefully
□ Handles zero revenue gracefully
```

**Integration Tests:**
```
□ Cross-database write (main DB to analytics DB)
□ Upsert on conflict works correctly
```

### `src/services/demand-tracker.service.ts`

**Unit Tests:**
```
□ calculateDemand() throws on event not found
□ timeUntilEvent calculation is correct
□ sellThroughRate calculation is correct
□ getSalesVelocity() returns 0 on error
□ calculatePriceElasticity() returns 1.0 for < 2 data points
□ Elasticity calculation handles zero price change
```

**Integration Tests:**
```
□ Full demand calculation with database
□ InfluxDB metric write
```

### `src/services/dynamic-pricing.service.ts`

**Unit Tests:**
```
□ Returns base price when dynamic pricing disabled
□ Velocity score calculation (capped at 30)
□ Sell-through score calculation
□ Time score for different time windows
□ Inventory pressure score calculation
□ Multiplier for high demand (> 70)
□ Multiplier for low demand (< 30)
□ Multiplier clamped to min/max bounds
□ Price elasticity adjustment applied correctly
□ calculateConfidence() scoring logic
□ Default pricing rules used when none found
```

### `src/services/event-stream.service.ts`

**Unit Tests:**
```
□ initialize() only runs once (idempotent)
□ processEvent() emits correct event type
□ updatePurchaseMetrics() increments counters
□ updatePurchaseMetrics() sets TTL on keys
□ updateScanMetrics() increments correct key
□ updateTrafficMetrics() uses HyperLogLog for unique visitors
□ pushEvent() calls initialize if not initialized
□ Handles WebSocket not initialized gracefully
```

**Integration Tests:**
```
□ Bull queue processing
□ Redis counter updates
□ Database aggregation upsert
```

### `src/services/export.service.ts`

**Unit Tests:**
```
□ mapDBExportToExportRequest() transforms correctly
□ formatFileSize() formats bytes correctly
□ formatFileSize() formats kilobytes correctly
□ formatFileSize() formats megabytes correctly
□ formatFileSize() formats gigabytes correctly
□ generateCSV() produces valid CSV output
□ generateExcel() handles array data
□ generateExcel() handles customer report structure
□ generatePDF() produces valid PDF buffer
□ Unsupported format throws error
□ Unsupported export type throws error
```

**Integration Tests:**
```
□ Full export lifecycle (AFTER fixing mock data)
□ Failed export updates status correctly
□ Notification sent on completion
□ Temp file cleanup after export
```

### `src/services/influxdb-metrics.service.ts`

**Unit Tests:**
```
□ sanitizeId() accepts valid UUIDs
□ sanitizeId() accepts alphanumeric with hyphens/underscores
□ sanitizeId() rejects special characters
□ sanitizeId() rejects empty string
□ sanitizeId() rejects strings > 100 chars
□ sanitizeNumber() validates within range
□ sanitizeNumber() rejects NaN
□ escapeFluxString() escapes backslash
□ escapeFluxString() escapes quotes
□ escapeFluxString() escapes newlines
□ getBucketName() validates bucket pattern
□ All record methods validate inputs before writing
```

**Integration Tests:**
```
□ Write and query InfluxDB
□ Time series query returns correct shape
```

### `src/services/influxdb.service.ts`

**Unit Tests:**
```
□ writeMetric() creates Point with correct tags
□ writeMetric() creates Point with correct fields
□ writeMetric() handles dimensions as tags
□ writeMetric() handles metadata by type
□ bulkWriteMetrics() processes all metrics
□ getConnectionStatus() reflects actual connection state
```

**Integration Tests:**
```
□ Write and flush to InfluxDB
□ healthCheck() returns true when connected
□ healthCheck() returns false when disconnected
```

### `src/services/message-gateway.service.ts`

**Unit Tests:**
```
□ interpolateTemplate() replaces variables correctly
□ interpolateTemplate() handles missing variables gracefully
□ maskRecipient() masks email correctly (shows first/last + domain)
□ maskRecipient() masks phone correctly (shows last 4 digits)
□ maskRecipient() handles other formats
□ sendMessage() throws on unknown template
□ sendAlertNotification() uses correct template per channel
□ sendAlertNotification() sets correct color per severity
□ sendBulkMessages() returns array of successful messages
□ sendBulkMessages() logs failures but doesn't throw
```

**Integration Tests:**
```
□ Message queued to RabbitMQ
```

### `src/services/metrics-migration.service.ts`

**Unit Tests:**
```
□ recordMetric() handles InfluxDB failure gracefully
□ recordMetric() handles MongoDB failure gracefully
□ recordMetric() routes to correct InfluxDB method by type
```

**Integration Tests:**
```
□ Dual write to both databases
□ Historical migration
□ Validation compares databases correctly
```

### `src/services/metrics.service.ts`

**Unit Tests:**
```
□ recordMetric() writes to postgres when backend='postgres'
□ recordMetric() writes to influx when backend='influxdb'
□ recordMetric() writes to both when backend='dual'
□ recordMetric() continues on InfluxDB failure in dual mode
□ recordMetric() throws on InfluxDB failure when not failSilently
□ getMetrics() returns cached value on cache hit
□ getMetrics() queries DB and caches on miss
□ getMetricTrend() calculates periods for hour unit
□ getMetricTrend() calculates periods for day unit
□ getMetricTrend() calculates periods for week unit
□ getMetricTrend() calculates periods for month unit
□ getMetricTrend() calculates change percentage
□ getMetricTrend() handles zero previous value
□ bulkRecordMetrics() handles both backends
```

### `src/services/prediction.service.ts`

**Unit Tests:**
```
□ predictDemand() generates correct number of predictions
□ predictDemand() applies weekend factor
□ predictDemand() calculates confidence intervals
□ optimizePrice() tests multiple price points
□ optimizePrice() finds optimal by revenue
□ predictChurn() throws on missing profile
□ predictChurn() maps probability to risk level correctly
□ predictChurn() generates actions per risk level
□ predictCustomerLifetimeValue() throws on missing profile
□ predictCustomerLifetimeValue() calculates CLV correctly
□ predictNoShow() accumulates risk factors
□ predictNoShow() caps probability at 1.0
□ runWhatIfScenario() generates scenarios for pricing type
```

### `src/services/realtime-aggregation.service.ts`

**Unit Tests:**
```
□ calculate1MinuteMetrics() calculates rates correctly
□ calculate1MinuteMetrics() handles missing Redis data
□ checkAlertConditions() triggers high_traffic alert
□ checkAlertConditions() triggers low_conversion alert
□ stopAggregationPipeline() clears all intervals
```

**Integration Tests:**
```
□ Full aggregation pipeline
□ Alert creation and WebSocket emit
```

### `src/services/validation.service.ts`

**Unit Tests:**
```
□ validateDateRange() throws on start > end
□ validateDateRange() throws on > 1 year range
□ validatePaginationParams() throws on page < 1
□ validatePaginationParams() throws on limit < 1
□ validatePaginationParams() throws on limit > 100
□ validateMetricType() throws on invalid type
□ validateExportFormat() throws on invalid format
□ validateEmail() accepts valid email patterns
□ validateEmail() rejects invalid email patterns
□ validatePhoneNumber() accepts valid phone patterns
□ validatePhoneNumber() rejects invalid phone patterns
□ validateUUID() accepts valid UUID format
□ validateUUID() rejects invalid UUID format
□ validateTimeGranularity() validates unit
□ validateTimeGranularity() validates value
□ validateAlertThreshold() checks min bound
□ validateAlertThreshold() checks max bound
□ validateWidgetConfig() checks all required fields
□ validateDashboardName() checks length
□ validateDashboardName() checks allowed characters
□ validateCampaignDates() rejects past start date
□ validateBudget() rejects negative budget
□ validateBudget() rejects excessive budget
□ sanitizeInput() removes XSS patterns
□ validateSearchQuery() detects SQL injection attempts
```

### `src/services/websocket.service.ts`

**Unit Tests:**
```
□ broadcastMetricUpdate() calls emit and Redis publish
□ broadcastWidgetUpdate() calls emitWidgetUpdate
□ broadcastToVenue() emits to correct room
□ broadcastToUser() finds and emits to user sockets
□ broadcastToUser() handles no sockets gracefully
□ getConnectedClients() aggregates by venue
□ getConnectedClients() returns 0 on error
□ disconnectUser() disconnects all matching sockets
□ subscribeToMetrics() joins correct rooms
□ subscribeToMetrics() sends current values
□ subscribeToMetrics() throws on socket not found
□ unsubscribeFromMetrics() leaves rooms
□ unsubscribeFromMetrics() handles missing socket gracefully
```

---

## Model Tests

### PostgreSQL Models

#### `src/models/postgres/aggregation.model.ts`

**Unit Tests:**
```
□ upsert() inserts new record
□ upsert() updates on conflict
□ findByPeriod() applies optional filters
□ findByDateRange() filters correctly
□ upsertAggregation() maps legacy field names
□ All methods enforce tenant isolation
```

#### `src/models/postgres/alert.model.ts`

**Unit Tests:**
```
□ createAlert() maps legacy fields
□ updateAlert() updates correct fields
□ toggleAlert() sets status correctly
□ getAlertsByVenue() filters by activeOnly
□ acknowledgeAlertInstance() appends to metadata JSONB
□ resolve() sets resolved_at and resolved_by
□ All methods enforce tenant isolation
```

#### `src/models/postgres/base.model.ts`

**Unit Tests (via concrete implementation):**
```
□ All methods enforce tenant_id filter
□ findAll() applies limit correctly
□ findAll() applies offset correctly
□ count() with additional conditions
```

#### `src/models/postgres/dashboard.model.ts`

**Unit Tests:**
```
□ findByTenant() applies type filter
□ findByTenant() applies createdBy filter
□ findByTenant() applies visibility filter
□ findDefault() returns default dashboard
□ setDefault() unsets other defaults first
□ setDefault() returns null if not found
□ All methods enforce tenant isolation
```

#### `src/models/postgres/export.model.ts`

**Unit Tests:**
```
□ createExport() maps legacy fields
□ updateExportStatus() updates correct fields
□ findById() works with tenantId
□ findById() works without tenantId
□ deleteExpired() deletes records past expires_at
□ findExpired() returns correct records
```

#### `src/models/postgres/metric.model.ts`

**Unit Tests:**
```
□ createMetric() maps legacy fields
□ findByType() applies date range filters
□ aggregateMetrics() returns sum
□ aggregateMetrics() returns avg
□ aggregateMetrics() returns min
□ aggregateMetrics() returns max
□ aggregateMetrics() returns count
□ bulkInsert() inserts multiple records
□ deleteOld() calculates cutoff correctly
□ All methods enforce tenant isolation
```

#### `src/models/postgres/widget.model.ts`

**Unit Tests:**
```
□ findByDashboard() returns widgets for dashboard
□ deleteByDashboard() deletes all widgets for dashboard
□ All methods enforce tenant isolation
```

### MongoDB Models

#### `src/models/mongodb/campaign.schema.ts`

**Unit Tests:**
```
□ createCampaign() generates UUID
□ getCampaigns() applies status filter
□ getCampaigns() applies type filter
□ getCampaigns() applies date filters
□ bulkTrackTouchpoints() adds timestamps
□ getCustomerTouchpoints() filters by date range
□ getCampaignPerformance() aggregation counts correctly
```

#### `src/models/mongodb/event.schema.ts`

**Unit Tests:**
```
□ createEvent() generates UUID
□ createEvent() generates timestamp
□ bulkCreateEvents() processes all events
□ getEvents() applies eventType filter
□ getEvents() applies date filters
□ getEvents() applies userId filter
□ getEvents() applies eventId filter
□ getEvents() default limit is 1000
□ aggregateEvents() prepends venueId match stage
□ getEventCounts() groups by specified field
```

#### `src/models/mongodb/raw-analytics.schema.ts`

**Unit Tests:**
```
□ storeRawData() sets processed=false
□ storeRawData() sets processingAttempts=0
□ getUnprocessedData() filters by processed flag
□ getUnprocessedData() filters by maxAttempts
□ markAsProcessed() increments processingAttempts
□ markAsProcessed() sets processed=true on success
□ markAsProcessed() sets lastProcessingError on failure
□ cleanupOldData() only deletes processed data
□ getDataStats() groups correctly
```

#### `src/models/mongodb/user-behavior.schema.ts`

**Unit Tests:**
```
□ trackBehavior() generates UUID
□ trackBehavior() generates timestamp
□ getUserJourney() filters by venueId
□ getUserJourney() filters by userId
□ getSessionActivity() sorted by timestamp asc
□ getPageViews() calculates unique users correctly
□ getDeviceStats() groups by device type
□ getDeviceStats() groups by OS
□ getDeviceStats() groups by browser
```

### Redis Models

#### `src/models/redis/cache.model.ts`

**Unit Tests:**
```
□ getCacheKey() formats key correctly
□ cacheMetric() uses correct key format
□ cacheWidget() uses correct key format
□ invalidateVenueCache() generates correct pattern
□ expire() re-sets with new TTL
□ exists() returns true when key exists
□ exists() returns false when key missing
```

#### `src/models/redis/realtime.model.ts`

**Unit Tests:**
```
□ updateRealTimeMetric() calculates change correctly
□ updateRealTimeMetric() handles zero previous value
□ updateRealTimeMetric() sets trend to 'up' when increasing
□ updateRealTimeMetric() sets trend to 'down' when decreasing
□ updateRealTimeMetric() sets trend to 'stable' when unchanged
□ incrementCounter() returns new value
□ incrementCounter() triggers real-time update
□ setGauge() calculates percentage correctly
□ publishMetricUpdate() stores data and publishes to channel
□ subscribeToMetric() sets up callback correctly
```

#### `src/models/redis/session.model.ts`

**Unit Tests:**
```
□ createSession() generates UUID
□ createSession() adds to user's sessions set
□ getSession() maps SessionData to AnalyticsSession
□ updateSession() throws if session not found
□ trackEvent() increments pageViews for page_view event
□ getActiveSessions() uses SCAN (not blocking KEYS)
□ endSession() creates summary
□ endSession() deletes session data
□ getSessionMetrics() calculates averages correctly
```

---

## Middleware Tests

### `src/middleware/auth.middleware.ts`

**Unit Tests:**
```
□ Rejects missing Authorization header
□ Rejects non-Bearer tokens
□ Rejects empty tokens
□ Validates JWT algorithm (rejects 'none')
□ Validates issuer
□ Validates audience
□ Falls back on missing issuer/audience with warning log
□ Extracts userId from userId field
□ Extracts userId from id field
□ Extracts userId from sub field
□ Extracts tenantId from tenantId field
□ Extracts tenantId from tenant_id field
□ Sets request.user correctly
□ Sets request.venue when present in token
□ Handles TokenExpiredError
□ Handles JsonWebTokenError
□ Handles NotBeforeError
□ authorize() bypasses for admin role
□ authorize() bypasses for super_admin role
□ authorize() checks wildcard permission
□ authorize() rejects insufficient permissions
□ requireTenant() rejects missing tenantId
```

### `src/middleware/auth.ts`

**Unit Tests:**
```
□ Import throws security error
```

### `src/middleware/error-handler.ts`

**Unit Tests:**
```
□ AppError sets statusCode correctly
□ AppError sets code correctly
□ ValidationError sets 400 status
□ NotFoundError sets 404 status
□ UnauthorizedError sets 401 status
□ ForbiddenError sets 403 status
□ errorHandler() returns correct response for AppError
□ errorHandler() hides internal details for non-AppError
□ errorHandler() calls next() if headers already sent
```

### `src/middleware/idempotency.ts`

**Unit Tests:**
```
□ Skips GET requests
□ Skips DELETE requests
□ Skips OPTIONS requests
□ Allows requests without idempotency key
□ Rejects invalid key format (< 8 chars)
□ Rejects invalid key format (> 64 chars)
□ Returns cached response for completed request
□ Returns 409 for in-progress request
□ Allows retry for failed request
□ Detects request payload mismatch
□ Uses atomic NX set for locking
□ Sets x-idempotent-replayed header on cache hit
□ requireIdempotencyKey() rejects missing key
□ Continues gracefully on Redis errors
```

### `src/middleware/internal-auth.ts`

**Unit Tests:**
```
□ Skips external requests (no internal headers)
□ Rejects unknown service names
□ Rejects missing signature
□ Rejects missing timestamp
□ Rejects expired timestamps (> 5 min old)
□ Rejects invalid signatures
□ Uses timing-safe comparison
□ Trusts headers in service mesh mode (mTLS)
□ generateSignature() creates consistent signatures
□ generateInternalAuthHeaders() returns correct headers
□ requireInternalAuth() rejects external requests
```

### `src/middleware/rate-limit.middleware.ts`

**Unit Tests:**
```
□ Skips /health path
□ Skips /ws-health path
□ Increments counter correctly
□ Sets TTL on first request of window
□ Sets X-RateLimit-Limit header
□ Sets X-RateLimit-Remaining header
□ Sets X-RateLimit-Reset header
□ Returns 429 when limit exceeded
□ Sets Retry-After header on 429
□ Returns RFC 7807 response body on 429
□ Continues gracefully on Redis errors
□ createRateLimiter() uses custom options
□ Custom keyGenerator works correctly
```

### `src/middleware/request-id.ts`

**Unit Tests:**
```
□ Generates requestId if not provided
□ Propagates requestId from x-request-id header
□ Generates correlationId from requestId
□ Propagates correlationId from x-correlation-id header
□ Generates traceId if not provided
□ Propagates traceId from x-trace-id header
□ Sets all IDs on request object
□ Sets all IDs in response headers
```

### `src/middleware/request-logger.ts`

**Unit Tests:**
```
□ sanitizeHeaders() redacts authorization header
□ sanitizeHeaders() redacts cookie header
□ sanitizeHeaders() redacts x-api-key header
□ sanitizeHeaders() redacts x-internal-signature header
□ sanitizeHeaders() preserves other headers
□ Skips /health path
□ Skips /ready path
□ Skips /live path
□ Skips /metrics path
□ Logs request_started event
□ Logs request_completed event with duration
```

### `src/middleware/tenant-context.ts`

**Unit Tests:**
```
□ isValidTenantId() accepts valid UUIDs
□ isValidTenantId() accepts system tenant ID
□ isValidTenantId() rejects invalid formats
□ Extracts tenant from JWT
□ Falls back to header when no JWT tenant
□ JWT tenant takes precedence over header
□ Rejects tenant mismatch between JWT and header
□ Sets full tenant context on request
□ requireTenant() runs middleware if not already run
□ requireTenant() rejects missing tenant
□ requireSystemAdmin() rejects non-admin users
□ requirePermission() checks specific permission
□ requirePermission() allows system admin
□ getTenantId() throws if no context set
□ isTenant() compares tenant IDs correctly
□ setDatabaseTenantContext() executes RLS query
```

---

## Route Tests

All route files need integration tests for:
- Each endpoint with valid inputs
- Schema validation rejects invalid data
- Auth/authz enforcement
- Error responses (400, 401, 403, 404, 500)

### Endpoints Summary

| Route File | Endpoints | Permissions Used |
|------------|-----------|------------------|
| alerts.routes.ts | 9 | analytics.read, analytics.write, analytics.delete |
| analytics.routes.ts | 14 | analytics.read, analytics.write |
| campaign.routes.ts | 7 | analytics.read, analytics.write |
| customer.routes.ts | 8 | analytics.read |
| dashboard.routes.ts | 8 | analytics.read, analytics.write, analytics.delete, analytics.share |
| export.routes.ts | 6 | analytics.read, analytics.export |
| health.routes.ts | 8 | none (public) |
| insights.routes.ts | 12 | analytics.read, analytics.write |
| metrics.routes.ts | 7 | analytics.read, analytics.write |
| prediction.routes.ts | 7 | analytics.read, analytics.admin |
| realtime.routes.ts | 6 | analytics.read, analytics.write |
| reports.routes.ts | 9 | analytics.read, analytics.write, analytics.delete |
| widget.routes.ts | 9 | analytics.read, analytics.write, analytics.delete, analytics.export |

**Total: 112 endpoints**

### Route Integration Test Template

For each route file, test:
```
□ GET endpoints return correct data structure
□ POST endpoints create resources and return 201
□ PUT/PATCH endpoints update resources
□ DELETE endpoints remove resources and return 204
□ Invalid UUID returns 400
□ Missing required fields returns 400
□ Invalid field values returns 400
□ Missing auth token returns 401
□ Invalid auth token returns 401
□ Expired auth token returns 401
□ Missing permission returns 403
□ Resource not found returns 404
□ Pagination works correctly
□ Filtering works correctly
□ Sorting works correctly
```

---

## Utils Tests

### `src/utils/api-error.ts`

**Unit Tests:**
```
□ Constructor sets statusCode
□ Constructor sets message
□ Constructor sets errors array
□ Error.captureStackTrace is called
□ Inherits from Error
```

### `src/utils/circuit-breaker.ts`

**Unit Tests:**
```
□ Initial state is CLOSED
□ Successful execution stays CLOSED
□ Failures increment failure count
□ Opens after failureThreshold reached (with volumeThreshold met)
□ Throws CircuitOpenError when OPEN
□ CircuitOpenError contains circuitName
□ CircuitOpenError contains retryAfterMs
□ Transitions to HALF_OPEN after timeout elapsed
□ HALF_OPEN → CLOSED after successThreshold successes
□ HALF_OPEN → OPEN on single failure
□ errorFilter excludes filtered errors from count
□ forceState() changes state immediately
□ reset() clears all stats
□ reset() sets state to CLOSED
□ getStats() returns copy of stats (not reference)
□ getOrCreateCircuit() returns existing circuit by name
□ getOrCreateCircuit() creates new circuit if not exists
□ getAllCircuits() returns map copy
□ influxDBCircuit errorFilter ignores 400 errors
□ influxDBCircuit errorFilter ignores 404 errors
□ influxDBCircuit errorFilter counts other errors
```

**Integration Tests:**
```
□ Full circuit lifecycle with real failures
□ Timeout-based recovery from OPEN to HALF_OPEN
```

### `src/utils/distributed-lock.ts`

**Unit Tests:**
```
□ acquire() returns Lock object on success
□ acquire() returns null when already locked
□ acquire() retries specified number of times
□ acquire() generates unique value with pid:timestamp:random format
□ acquire() respects TTL parameter
□ release() deletes key only if value matches (Lua script)
□ release() returns false if value mismatch
□ release() returns false for null lock
□ extend() extends TTL when caller is owner
□ extend() returns false if not owner
□ isLocked() returns true when lock exists
□ isLocked() returns false when lock doesn't exist
□ releaseAll() releases all locks held by instance
□ withLock() acquires lock, executes function, releases lock
□ withLock() returns null when lock not acquired
□ withLock() releases lock even on function error
□ acquireRFMLock() generates correct lock key for venue
□ acquireRFMLock() generates correct lock key for global
□ acquireReportLock() generates correct lock key
□ acquireExportLock() generates correct lock key
□ acquireAggregationLock() generates correct lock key
```

**Integration Tests:**
```
□ Full lock lifecycle with real Redis
□ Concurrent lock attempts - only one succeeds
□ Lock expiration after TTL
```

### `src/utils/errors.ts`

**Unit Tests:**
```
□ AppError sets statusCode
□ AppError sets code
□ AppError sets message
□ AppError handles string code signature
□ AppError handles ProblemDetailOptions signature
□ AppError.toJSON() returns RFC 7807 structure
□ AppError.toJSON() includes type field
□ AppError.toJSON() includes title field
□ AppError.toJSON() includes status field
□ AppError.toJSON() includes additionalProperties
□ AppError.toJSON() excludes undefined detail
□ AppError.toJSON() excludes undefined instance
□ ValidationError sets 400 status
□ ValidationError sets VALIDATION_ERROR code
□ NotFoundError sets 404 status
□ NotFoundError formats message with resource name
□ ConflictError sets 409 status
□ UnauthorizedError sets 401 status
□ UnauthorizedError has default message
□ ForbiddenError sets 403 status
□ ForbiddenError has default message
□ TooManyRequestsError sets 429 status
□ ServiceUnavailableError sets 503 status
□ BadGatewayError sets 502 status
□ BadRequestError is alias for ValidationError
```

### `src/utils/logger.ts`

**Unit Tests:**
```
□ Logger has correct name ('analytics-service')
□ Logger level is 'debug' in non-production
□ Logger level is 'info' in production
□ createLogger() creates child logger with component field
```

### `src/utils/metrics.ts`

**Unit Tests:**
```
□ incrementCounter() creates new entry for new metric
□ incrementCounter() increments existing entry
□ incrementCounter() handles labels correctly
□ setGauge() creates entry with timestamp
□ setGauge() updates existing entry
□ incrementGauge() increments value
□ decrementGauge() decrements value
□ observeHistogram() updates sum
□ observeHistogram() updates count
□ observeHistogram() updates correct buckets
□ startTimer() returns function
□ startTimer() returned function calculates duration in seconds
□ timeAsync() records success with duration
□ timeAsync() records error status
□ timeAsync() rethrows error
□ getPrometheusMetrics() formats counters correctly
□ getPrometheusMetrics() formats gauges correctly
□ getPrometheusMetrics() formats histogram buckets
□ getPrometheusMetrics() formats histogram sum
□ getPrometheusMetrics() formats histogram count
□ getPrometheusMetrics() includes circuit breaker status
□ getMetricsStatus() returns counters
□ getMetricsStatus() returns gauges
□ getMetricsStatus() returns circuit status
□ analyticsMetrics.requestsTotal() increments correct counter
□ analyticsMetrics.requestDuration() observes histogram
□ analyticsMetrics.cacheHit() increments correct counter
□ analyticsMetrics.cacheMiss() increments correct counter
```

### `src/utils/response-filter.ts`

**Unit Tests:**
```
□ filterResponse() removes password fields
□ filterResponse() removes secret fields
□ filterResponse() removes token fields
□ filterResponse() removes api_key fields
□ filterResponse() removes apiKey fields
□ filterResponse() removes credit_card fields
□ filterResponse() removes creditCard fields
□ filterResponse() removes ssn fields
□ filterResponse() removes _id fields
□ filterResponse() removes __v fields
□ filterResponse() masks phone partially (shows last 4)
□ filterResponse() masks email partially
□ filterResponse() handles nested objects recursively
□ filterResponse() handles arrays
□ filterResponse() handles null
□ filterResponse() handles undefined
□ filterResponse() stops at depth 10 (prevents infinite recursion)
□ maskString() shows last 4 chars for long strings
□ maskString() returns **** for strings <= 4 chars
□ filterError() removes stack in production
□ filterError() removes stackTrace in production
□ filterError() removes cause in production
□ filterError() removes originalError in production
□ filterError() keeps all fields in non-production
□ safeResponse() combines filtering
□ safeResponse() removes null values when includeNull=false
□ safeResponse() keeps null values when includeNull=true
```

### `src/utils/scheduler.ts`

**Unit Tests:**
```
□ startScheduledJobs() logs start message
□ startScheduledJobs() logs completion message
□ startScheduledJobs() returns without error
```

---

## Workers Tests

### `src/workers/pricing-worker.ts`

**Unit Tests:**
```
□ start() sets isRunning to true
□ stop() sets isRunning to false
□ processEvents() queries events with dynamic pricing enabled
□ processEvents() filters events within 30 days
□ processEvents() filters active events only
□ processEvent() gets venue pricing rules
□ processEvent() calculates optimal price
□ processEvent() skips if change < 5%
□ processEvent() inserts pending_price_changes when requireApproval
□ processEvent() calls applyPriceChange when auto-apply
□ sleep() waits correct duration
```

**Integration Tests:**
```
□ Full pricing cycle with database
□ Pending price changes created correctly
□ Auto-applied prices update event
```

### `src/workers/rfm-calculator.worker.ts`

**Unit Tests:**
```
□ start() schedules job for 2 AM
□ start() runs initial calculation after 5 second delay
□ stop() cancels scheduled job
□ stop() releases all locks
□ calculateAllVenueRFM() acquires distributed lock
□ calculateAllVenueRFM() skips if lock not acquired
□ calculateAllVenueRFM() releases lock after completion
□ calculateAllVenueRFM() releases lock on error
□ calculateVenueRFM() queries customer data correctly
□ calculateVenueRFM() handles empty customer data
□ scoreRecency() returns 5 for <= 30 days
□ scoreRecency() returns 4 for <= 60 days
□ scoreRecency() returns 3 for <= 90 days
□ scoreRecency() returns 2 for <= 180 days
□ scoreRecency() returns 1 for > 180 days
□ scoreFrequency() returns 5 for >= 10 purchases
□ scoreFrequency() returns 4 for >= 7 purchases
□ scoreFrequency() returns 3 for >= 4 purchases
□ scoreFrequency() returns 2 for >= 2 purchases
□ scoreFrequency() returns 1 for < 2 purchases
□ scoreMonetary() returns 5 for top 20% spenders
□ scoreMonetary() returns 1 for bottom 20% spenders
□ determineSegment() returns VIP for score >= 12
□ determineSegment() returns Regular for score >= 8
□ determineSegment() returns At-Risk for score >= 5 and recent
□ determineSegment() returns Lost for low score
□ calculateChurnRisk() returns high for > 180 days + 3 purchases
□ calculateChurnRisk() returns medium for > 90 days + 2 purchases
□ calculateChurnRisk() returns low otherwise
□ updateSegmentSummary() calculates segment stats
□ calculateCLVForVenue() calculates CLV metrics
□ calculateCLVForVenue() calculates predictions
□ calculateCLVForVenue() calculates churn probability
```

**Integration Tests:**
```
□ Full RFM calculation with database
□ customer_rfm_scores table updated correctly
□ customer_segments table updated correctly
□ customer_lifetime_value table updated correctly
□ Distributed lock prevents concurrent execution
```

---

## Analytics Engine Tests

### `src/analytics-engine/analytics-engine.ts`

**Unit Tests:**
```
□ query() checks cache first
□ query() returns cached value on hit
□ query() executes query on cache miss
□ query() caches results after query
□ executeQuery() handles revenue metric
□ executeQuery() handles ticketSales metric
□ executeQuery() handles conversionRate metric
□ executeQuery() handles customerMetrics metric
□ executeQuery() handles topEvents metric
□ executeQuery() handles salesTrends metric
□ executeQuery() logs warning for unknown metric
□ generateCacheKey() includes venueId
□ generateCacheKey() includes metrics
□ generateCacheKey() includes time range
□ getDateRange() generates correct array of dates
□ calculateRevenue() calls RevenueCalculator
□ calculateTicketSales() calls MetricsAggregator
□ calculateConversionRate() queries Redis for traffic/purchase data
□ calculateConversionRate() calculates rate correctly
□ calculateConversionRate() handles zero page views
□ calculateCustomerMetrics() calls CustomerAnalytics methods
□ getTopEvents() calls MetricsAggregator
□ calculateSalesTrends() calls PredictiveAnalytics
```

**Integration Tests:**
```
□ Full query flow with all metrics
□ Cache integration
□ Real database queries
```

### `src/analytics-engine/calculators/customer-analytics.ts`

**Unit Tests:**
```
□ validateVenueId() throws on null
□ validateVenueId() throws on non-string
□ validateVenueId() throws on short string (< 36 chars)
□ validateDaysThreshold() throws on non-integer
□ validateDaysThreshold() throws on < 1
□ validateDaysThreshold() throws on > 730
□ safeDivide() returns result for valid division
□ safeDivide() returns default for zero denominator
□ safeDivide() returns default for infinite denominator
□ clamp() clamps to min
□ clamp() clamps to max
□ clamp() returns value when in range
□ calculateCustomerLifetimeValue() returns empty result for no customers
□ calculateCustomerLifetimeValue() calculates avgClv correctly
□ calculateCustomerLifetimeValue() segments customers by CLV
□ identifyChurnRisk() validates inputs
□ identifyChurnRisk() calculates daysSinceLastPurchase
□ identifyChurnRisk() calculates risk score
□ identifyChurnRisk() adjusts score for purchase history
□ identifyChurnRisk() clamps score to 0-100
□ identifyChurnRisk() categorizes by risk level
□ calculateCustomerSegmentation() returns empty for no data
□ calculateCustomerSegmentation() calculates RFM scores
□ calculateCustomerSegmentation() categorizes segments (champions, loyal, etc.)
□ getSegmentCharacteristics() returns description for each segment
```

**Integration Tests:**
```
□ CLV calculation with real database
□ Churn risk identification with real data
□ RFM segmentation with real data
```

### `src/analytics-engine/calculators/predictive-analytics.ts`

**Unit Tests:**
```
□ predictTicketDemand() returns error for < 30 historical events
□ predictTicketDemand() returns error for no similar events
□ predictTicketDemand() filters by day of week
□ predictTicketDemand() filters by month (± 1)
□ predictTicketDemand() calculates average predictions
□ predictTicketDemand() calculates trend
□ predictTicketDemand() applies trend to predictions
□ calculateConfidence() returns Low for < 5 samples
□ calculateConfidence() returns Medium for < 20 samples
□ calculateConfidence() returns Medium for high trend variance
□ calculateConfidence() returns High otherwise
□ predictSeasonalTrends() aggregates by month
□ predictSeasonalTrends() calculates volatility
□ categorizeSeasonality() returns Peak Season for > 1.2x average
□ categorizeSeasonality() returns Normal Season for > 0.8x average
□ categorizeSeasonality() returns Off Season for <= 0.8x average
□ predictOptimalPricing() groups by price bands
□ predictOptimalPricing() finds optimal by revenue
□ predictOptimalPricing() calculates price elasticity
□ generatePricingRecommendation() recommends dynamic pricing for elastic demand
□ generatePricingRecommendation() recommends price increase for inelastic demand
```

**Integration Tests:**
```
□ Demand prediction with real historical data
□ Seasonal trends with real data
□ Pricing optimization with real data
```

### `src/analytics-engine/calculators/revenue-calculator.ts`

**Unit Tests:**
```
□ validateVenueId() throws on null
□ validateVenueId() throws on non-string
□ validateVenueId() throws on short string
□ validateDateRange() throws on invalid start date
□ validateDateRange() throws on invalid end date
□ validateDateRange() throws on start >= end
□ validateDateRange() throws on > 730 day range
□ validateProjectionDays() throws on non-integer
□ validateProjectionDays() throws on < 1
□ validateProjectionDays() throws on > 365
□ safeParseFloat() returns parsed value
□ safeParseFloat() returns default for invalid
□ safeParseInt() returns parsed value
□ safeParseInt() returns default for invalid
□ calculateRevenueByChannel() validates inputs
□ calculateRevenueByChannel() aggregates correctly
□ calculateRevenueByEventType() validates inputs
□ calculateRevenueByEventType() groups correctly
□ projectRevenue() validates inputs
□ projectRevenue() calculates from 30-day average
```

**Integration Tests:**
```
□ Revenue by channel with real data
□ Revenue by event type with real data
□ Revenue projection with real data
```

### `src/analytics-engine/aggregators/metrics-aggregator.ts`

**Unit Tests:**
```
□ aggregateSalesMetrics() validates granularity (whitelist)
□ aggregateSalesMetrics() throws on invalid granularity
□ aggregateSalesMetrics() uses correct DATE_TRUNC for hour
□ aggregateSalesMetrics() uses correct DATE_TRUNC for day
□ aggregateSalesMetrics() uses correct DATE_TRUNC for week
□ aggregateSalesMetrics() uses correct DATE_TRUNC for month
□ aggregateSalesMetrics() filters by venue and date range
□ aggregateSalesMetrics() groups by period
□ aggregateCustomerMetrics() calculates segment counts
□ aggregateCustomerMetrics() identifies new customers (< 30 days)
□ aggregateCustomerMetrics() identifies returning customers (> 1 purchase)
□ aggregateCustomerMetrics() identifies VIP customers (> $500)
□ aggregateCustomerMetrics() identifies at-risk customers (> 90 days)
□ aggregateCustomerMetrics() calculates avgOrderValue
□ aggregateCustomerMetrics() calculates avgPurchaseFrequency
□ aggregateEventPerformance() orders by revenue desc
□ aggregateEventPerformance() limits to 20 events
□ aggregateEventPerformance() calculates capacity utilization
□ getDateTruncExpression() returns correct SQL for each granularity
□ enhanceWithCalculatedMetrics() calculates growth from previous period
□ enhanceWithCalculatedMetrics() handles first period (no previous)
```

**Integration Tests:**
```
□ Sales metrics aggregation with real data
□ Customer metrics aggregation with real data
□ Event performance aggregation with real data
```

---

## Schemas Tests

### `src/schemas/validation.ts`

**Unit Tests:**
```
□ uuidSchema accepts valid UUID
□ uuidSchema rejects invalid UUID
□ tenantIdSchema accepts valid UUID
□ dateStringSchema accepts valid ISO 8601
□ dateStringSchema rejects invalid date
□ positiveIntSchema accepts positive integers
□ positiveIntSchema rejects zero
□ positiveIntSchema rejects negative
□ nonNegativeIntSchema accepts zero
□ nonNegativeIntSchema accepts positive
□ nonNegativeIntSchema rejects negative
□ paginationSchema defaults page to 1
□ paginationSchema defaults limit to 20
□ paginationSchema coerces string to number
□ paginationSchema enforces max limit of 100
□ dateRangeSchema validates startDate before endDate
□ analyticsQuerySchema validates granularity enum
□ analyticsQuerySchema defaults granularity to 'day'
□ metricsQuerySchema validates aggregation enum
□ dashboardConfigSchema validates layout enum
□ dashboardConfigSchema validates widget types
□ dashboardConfigSchema validates position constraints
□ customerQuerySchema validates RFM score ranges (1-5)
□ rfmConfigSchema validates breakpoint array lengths
□ reportRequestSchema validates report types
□ reportRequestSchema validates format enum
□ scheduledReportSchema validates frequency enum
□ scheduledReportSchema validates time format (HH:mm)
□ alertConfigSchema validates operator enum
□ alertConfigSchema validates severity enum
□ alertConfigSchema validates channels array
□ exportRequestSchema validates type enum
□ exportRequestSchema validates format enum
□ campaignQuerySchema validates status enum
□ validateRequest() returns parsed data on success
□ validateRequest() throws ZodError on failure
□ safeValidate() returns success:true with data on valid
□ safeValidate() returns success:false with errors on invalid
```

---

## App Entry Points Tests

### `src/app.ts`

**Unit Tests:**
```
□ buildApp() returns FastifyInstance
□ CORS configured correctly
□ Helmet configured correctly
□ Rate limiting configured (100 per 15 min)
□ All routes registered with correct prefixes
□ Error handler converts AppError to RFC 7807
□ Error handler converts validation errors to RFC 7807
□ Error handler maps HTTP status codes correctly
□ Error handler hides internal details in production
□ Not found handler returns RFC 7807 response
```

**Integration Tests:**
```
□ App starts successfully
□ Health endpoint accessible
□ Database connections established
□ All route prefixes accessible
```

### `src/index.ts`

**Unit Tests:**
```
□ startService() connects to databases
□ startService() initializes Redis
□ startService() connects to RabbitMQ
□ startService() conditionally connects to MongoDB
□ startService() starts WebSocket server
□ startService() starts event processors
□ startService() starts scheduled jobs
□ startService() starts RFM calculator worker
□ Graceful shutdown on SIGTERM
□ Graceful shutdown on SIGINT
□ Exits with code 1 on startup failure
```

**Integration Tests:**
```
□ Full service startup
□ Graceful shutdown
```

### `src/server.ts`

**Unit Tests:**
```
□ createServer() calls buildApp()
□ createServer() returns FastifyInstance
```

---

## E2E Test Scenarios

### Critical User Flows
```
□ Authentication flow
  - Login → Get JWT → Access protected endpoint → Logout/Token expiry

□ Dashboard workflow
  - Create dashboard → Add widgets → Configure widgets → View data → Share → Clone → Delete

□ Alert lifecycle
  - Create alert → Configure conditions → Trigger condition → Notification sent → Acknowledge → Resolve

□ Export workflow
  - Create export request → Process in background → Status polling → Download file → File expiry

□ Real-time metrics
  - Record metric → WebSocket update → Dashboard reflects change → Historical query

□ Customer insights
  - Track behavior → Calculate RFM scores → Generate insights → Take action → Track outcome

□ Campaign attribution
  - Create campaign → Track touchpoints → Conversion event → Attribution calculated → ROI report

□ Prediction workflow
  - Collect historical data → Generate prediction → Display recommendation → Track accuracy

□ Report generation
  - Select template → Configure parameters → Generate → Download/Email → Schedule recurring
```

### Multi-Tenant Isolation
```
□ Tenant A cannot access Tenant B's dashboards
□ Tenant A cannot access Tenant B's metrics
□ Tenant A cannot access Tenant B's exports
□ Tenant A cannot access Tenant B's alerts
□ Tenant A cannot access Tenant B's customers
□ API calls without tenant context are rejected
□ Database queries always filter by tenant_id
□ Cache keys include tenant_id
□ WebSocket rooms isolated by tenant
```

### Error Handling
```
□ Invalid JWT returns 401 with RFC 7807 body
□ Expired JWT returns 401 with clear message
□ Missing permissions returns 403
□ Resource not found returns 404
□ Validation errors return 400 with field details
□ Rate limited returns 429 with Retry-After header
□ Server errors return 500 without internal details
□ Database connection failure returns 503
□ External service timeout handled gracefully
```

### Performance & Reliability
```
□ High volume metric recording (1000/sec)
□ Large export generation (100k rows)
□ Concurrent dashboard access (100 users)
□ WebSocket connection scaling (1000 connections)
□ Cache invalidation under load
□ Circuit breaker trips and recovers
□ Graceful degradation when Redis unavailable
□ Graceful degradation when InfluxDB unavailable
```

---

## Test Execution

### Running Tests
```bash
# Unit tests
npm run test:unit

# Integration tests (requires Docker)
npm run test:integration

# E2E tests
npm run test:e2e

# All tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Specific file
npm run test -- path/to/test.ts

# Specific pattern
npm run test -- --grep "circuit breaker"
```

### Coverage Report

After running tests, coverage report available at:
- HTML: `coverage/lcov-report/index.html`
- LCOV: `coverage/lcov.info`
- Console summary printed after test run

### CI Pipeline
```yaml
test:
  - npm run lint
  - npm run test:unit
  - npm run test:integration
  - npm run test:e2e
  - npm run test:coverage
  - Upload coverage to Codecov
```

---

## Appendix A: Test File Structure
```
__tests__/
├── unit/
│   ├── config/
│   │   ├── database.test.ts
│   │   ├── redis.test.ts
│   │   └── ...
│   ├── controllers/
│   │   ├── alerts.controller.test.ts
│   │   ├── analytics.controller.test.ts
│   │   └── ...
│   ├── services/
│   │   ├── aggregation.service.test.ts
│   │   ├── alert.service.test.ts
│   │   └── ...
│   ├── models/
│   │   ├── postgres/
│   │   ├── mongodb/
│   │   └── redis/
│   ├── middleware/
│   │   ├── auth.middleware.test.ts
│   │   ├── tenant-context.test.ts
│   │   └── ...
│   ├── utils/
│   │   ├── circuit-breaker.test.ts
│   │   ├── distributed-lock.test.ts
│   │   └── ...
│   ├── workers/
│   │   ├── pricing-worker.test.ts
│   │   └── rfm-calculator.worker.test.ts
│   └── analytics-engine/
│       ├── analytics-engine.test.ts
│       ├── calculators/
│       └── aggregators/
├── integration/
│   ├── routes/
│   │   ├── alerts.routes.test.ts
│   │   ├── analytics.routes.test.ts
│   │   └── ...
│   ├── services/
│   │   ├── export.service.test.ts
│   │   └── ...
│   ├── models/
│   │   ├── postgres.test.ts
│   │   ├── mongodb.test.ts
│   │   └── redis.test.ts
│   └── websocket/
│       └── realtime.test.ts
├── e2e/
│   ├── auth.e2e.test.ts
│   ├── dashboard.e2e.test.ts
│   ├── alerts.e2e.test.ts
│   ├── exports.e2e.test.ts
│   ├── realtime.e2e.test.ts
│   ├── customer-insights.e2e.test.ts
│   ├── campaigns.e2e.test.ts
│   └── tenant-isolation.e2e.test.ts
├── fixtures/
│   ├── users.ts
│   ├── venues.ts
│   ├── tenants.ts
│   ├── dashboards.ts
│   ├── metrics.ts
│   ├── alerts.ts
│   └── exports.ts
├── helpers/
│   ├── db.ts
│   ├── auth.ts
│   ├── factories.ts
│   ├── mocks.ts
│   └── assertions.ts
└── setup/
    ├── jest.setup.ts
    ├── jest.config.js
    └── testcontainers.ts
```

---

## Appendix B: Test Utilities

### Database Helpers
```typescript
// helpers/db.ts
export async function setupTestDatabase() { ... }
export async function teardownTestDatabase() { ... }
export async function seedTestData(fixtures: any) { ... }
export async function clearAllTables() { ... }
```

### Auth Helpers
```typescript
// helpers/auth.ts
export function generateTestToken(payload: Partial<JWTPayload>) { ... }
export function generateExpiredToken() { ... }
export function generateAdminToken(tenantId: string) { ... }
export function generateUserToken(tenantId: string, permissions: string[]) { ... }
```

### Factory Helpers
```typescript
// helpers/factories.ts
export function createTestUser(overrides?: Partial<User>) { ... }
export function createTestVenue(overrides?: Partial<Venue>) { ... }
export function createTestDashboard(overrides?: Partial<Dashboard>) { ... }
export function createTestAlert(overrides?: Partial<Alert>) { ... }
export function createTestMetric(overrides?: Partial<Metric>) { ... }
```

---

## Appendix C: Mocking Strategy

### External Services

| Service | Mock Strategy |
|---------|--------------|
| PostgreSQL | Testcontainers or jest.mock |
| MongoDB | Testcontainers or mongodb-memory-server |
| Redis | Testcontainers or ioredis-mock |
| InfluxDB | Testcontainers or jest.mock |
| RabbitMQ | Testcontainers or jest.mock |
| WebSocket | socket.io-mock |

### Internal Dependencies

| Dependency | Mock Strategy |
|------------|--------------|
| Logger | jest.mock with spy |
| Config | jest.mock with test values |
| Services | jest.mock per service |
| Models | jest.mock per model |

---

*Generated: 2025-01-06*
*Service: analytics-service*
*Version: 1.0.0*
*Total Files: 125*
*Total Test Cases: ~850 unit + ~150 integration + ~50 E2E*