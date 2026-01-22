# Venue Service Support Services Analysis

## Purpose: Integration Testing Documentation

## Source Files
- cache.service.ts
- cache-integration.ts
- analytics.service.ts
- compliance.service.ts
- branding.service.ts
- domain-management.service.ts
- healthCheck.service.ts

## Generated: January 18, 2026

---

## FILE 1: cache.service.ts

### CACHING OPERATIONS

**Redis Key Patterns:**
- `venue:tenant:{tenantId}:{key}` - Tenant-scoped cache keys
- `venue:global:{key}` - Global/system cache keys (fallback)
- `venue:tenant:{tenantId}:{venueId}` - Venue-specific cache
- `venue:tenant:{tenantId}:{venueId}:*` - Venue data with sub-keys
- `venue:tenant:{tenantId}:venues:*{venueId}*` - Venue query caches

**TTLs:**
- Default: 3600s (1 hour)
- Configurable per operation via `set(key, value, ttl)` method
- Test key TTL: 10s (for health checks)

**Cache Invalidation:**
- `clearVenueCache(venueId, tenantId)` - Clears all cache for specific venue
- `clearTenantVenueCache(tenantId)` - Clears all venue caches for entire tenant
- `invalidateKeys(keys[])` - Batch key invalidation
- `del(key, tenantId)` - Single key deletion
- Pattern-based deletion using SCAN (batch size: 100)

**Fallback Behavior:**
- Returns `null` on cache miss
- Logs error but throws `CacheError` on failure
- Circuit breaker wraps operations (timeout: 1000-2000ms)
- Retry mechanism: max 2 retries, 50ms initial delay

**Cache Warming:**
- `warmCache(entries[])` method accepts array of entries
- Fire-and-forget pattern (doesn't block operations)
- Uses `Promise.allSettled()` for parallel loading
- Failures logged but don't throw errors

### DATABASE OPERATIONS
- None (pure caching service)

### ANALYTICS
- None

### COMPLIANCE
- None

### HEALTH CHECKS
- None (but used by health check service)

### CROSS-FILE DEPENDENCIES
- `ioredis` - Redis client
- `utils/logger` - Logging
- `utils/circuitBreaker` - Fault tolerance
- `utils/retry` - Retry logic
- `utils/errors` - CacheError class

### ERROR HANDLING
- All operations wrapped with circuit breakers (1-2s timeouts)
- Retry on failures (2 attempts, 50ms delay)
- Throws `CacheError` with operation type
- `getOrSet()` catches cache write failures without blocking
- Pattern deletion errors logged per batch

### POTENTIAL ISSUES

🚨 **CRITICAL:**
- `getOrSet()` fire-and-forget cache write could hide persistent failures
- No TTL validation (could set extremely long or 0 TTL)
- `clearByPattern()` could block if too many keys match (needs pagination warning)
- Legacy pattern support in `clearVenueCache()` could cause cross-tenant data leaks during migration

⚠️ **WARNINGS:**
- No metrics on cache hit/miss rates
- Circuit breaker state not exposed for monitoring
- SCAN cursor iteration could be slow for large keysets
- No bulk get/set operations for efficiency

---

## FILE 2: cache-integration.ts

### CACHING OPERATIONS

**Status:** ⚠️ STUB IMPLEMENTATION - NOT PRODUCTION READY

All methods return no-op responses:
- `get(key)` → `null`
- `set(key, value, ttl)` → `true`
- `delete(key)` → `true`
- `flush()` → `true`
- `getStats()` → `{ hits: 0, misses: 0, sets: 0, deletes: 0 }`

### DATABASE OPERATIONS
- None

### ANALYTICS
- None

### COMPLIANCE
- None

### HEALTH CHECKS
- None

### CROSS-FILE DEPENDENCIES
- None (standalone stub)

### ERROR HANDLING
- None (always succeeds)

### POTENTIAL ISSUES

🚨 **CRITICAL:**
- This is a placeholder stub - NOT PRODUCTION READY
- No actual caching logic implemented
- Tests using this will pass without testing real cache behavior
- Needs replacement with actual cache service or proper mock
- Could mask cache-related bugs in production

---

## FILE 3: analytics.service.ts

### CACHING OPERATIONS
- None

### DATABASE OPERATIONS
- None (external HTTP service)

### ANALYTICS

**Metrics Collected:**
- Venue analytics data (delegated to external Analytics Service)
- Event tracking data (delegated to external Analytics Service)

**Data Aggregation Logic:**
- All aggregation handled by external Analytics Service
- No local aggregation

**Time-based Queries:**
- Options parameter passed to `getVenueAnalytics(venueId, options)`
- Time ranges handled by external service

**Methods:**
- `getVenueAnalytics(venueId, options)` - GET `/venues/${venueId}/analytics`
- `trackEvent(eventData)` - POST `/events`

### COMPLIANCE
- None

### HEALTH CHECKS
- None (but analytics service availability should be monitored)

### CROSS-FILE DEPENDENCIES
- `utils/httpClient` - HTTP client wrapper
- `config/index` - Service URL configuration
- Logger for error tracking

### ERROR HANDLING
- Logs errors but re-throws (no fallback)
- No retry logic visible (likely in HttpClient)
- No graceful degradation on analytics service failure
- Failed requests bubble up to caller

### POTENTIAL ISSUES

🚨 **MISSING:**
- No caching of analytics data (could reduce external API calls)
- No circuit breaker pattern visible
- No timeout configuration
- Failed event tracking throws error (should be fire-and-forget)
- No batch event tracking capability
- No fallback for analytics service downtime

⚠️ **WARNINGS:**
- External dependency not checked in health endpoints
- No rate limiting on analytics requests
- Options parameter not validated

---

## FILE 4: compliance.service.ts

### CACHING OPERATIONS
- None (should cache compliance reports)

### DATABASE OPERATIONS

**Tables Touched:**
- `venues` - Venue metadata, pricing tier, custom_domain
- `venue_compliance` - Compliance settings storage (GDPR, retention, age verification, accessibility)
- `venue_compliance_reports` - Generated compliance reports (JSON)
- `venue_compliance_reviews` - Scheduled compliance reviews
- `venue_documents` - License and tax documents (business_license, entertainment_license, tax_id)
- `venue_integrations` - Payment provider verification (stripe, square)
- `venue_staff` - Staff emails for notifications (owner, admin roles)
- `notifications` - Compliance notifications
- `email_queue` - Email notifications
- `venue_tier_history` - Tier change tracking
- `white_label_pricing` - Pricing tier configuration
- `custom_domains` - Domain suspension on tier downgrade

**Query Patterns:**
- Single venue lookups by ID: `venues.where({ id: venueId }).first()`
- Document status checks: `venue_documents.where({ venue_id, document_type, status: 'approved' })`
- Staff role-based queries: `venue_staff.where({ venue_id }).whereIn('role', ['owner', 'admin'])`
- Integration type queries: `venue_integrations.where({ venue_id, is_active: true }).whereIn('integration_type', ['stripe', 'square'])`
- Compliance settings: `venue_compliance.where({ venue_id }).first()`

**Aggregations:**
- None (mostly single-record queries and document counts)

### ANALYTICS

**Metrics Collected:**
- Compliance status per category (compliant/non_compliant/review_needed)
- Check results with pass/fail status
- Severity levels (critical/high/medium/low)
- Recommendation priority (immediate/high/medium/low)

**Data Aggregation Logic:**
- Aggregates check results across categories
- Determines overall status from category statuses
- Generates prioritized recommendations
- Calculates due dates based on severity

**Time-based Queries:**
- Next review date: current + 90 days
- Due date calculation: severity-based (7/30/60/90 days)
- Compliance review scheduling

### COMPLIANCE

**Data Retention Rules:**
- Customer data retention days (configurable per venue via `venue_compliance.settings.dataRetention`)
- Compliance reports stored indefinitely
- Review history tracked permanently
- No automatic data deletion implemented

**GDPR Considerations:**
- GDPR compliance flag per venue (`settings.gdpr.enabled`)
- Privacy policy URL required when GDPR enabled
- Data retention policy configuration
- Data encryption at rest (assumed, not verified in code)
- No data export/deletion endpoints visible

**Audit Requirements:**
- Compliance report generation with timestamps
- Tier change history with reason and changed_by
- Review scheduling with status tracking
- Notification records for critical changes
- Email queue for audit trail
- All changes logged with context

**Categories Checked:**
1. **Data Protection:**
   - GDPR compliance (critical)
   - Data retention policy (high)
   - Data encryption (critical)

2. **Age Verification:**
   - Age verification system (critical for bars/nightclubs/casinos)
   - Verification method (high for age-restricted venues)

3. **Accessibility:**
   - Wheelchair accessibility (high)
   - Accessibility information provided (medium)

4. **Financial Reporting:**
   - Tax reporting configuration (critical)
   - Payout compliance (high)

5. **Licensing:**
   - Business license (critical)
   - Entertainment license (high for comedy clubs/theaters)

### HEALTH CHECKS
- None (but compliance checks could be part of health)

### CROSS-FILE DEPENDENCIES
- Database (Knex)
- Logger
- Config service (`compliance.teamEmail`)

### ERROR HANDLING
- Database errors logged and thrown
- Notification failures logged but don't block operations
- Missing venue throws error
- Invalid tier throws error
- Graceful warning system for missing config
- Email queue errors logged but don't fail compliance updates

### POTENTIAL ISSUES

🚨 **CRITICAL:**
- No caching of compliance reports (expensive to regenerate)
- `triggerComplianceReviewNotification()` could fail silently
- No transaction wrapping for tier changes (partial failures possible)
- Tier downgrade suspends domains but doesn't notify users proactively
- No rate limiting on compliance report generation
- Email queue could grow unbounded (no cleanup)
- No validation of email addresses before queuing
- Compliance settings changes trigger immediate review (could be abused)

⚠️ **WARNINGS:**
- Hard-coded retention period (90 days for reviews)
- Compliance checks run sequentially (could parallelize)
- SSL expiry not checked in compliance
- No cost estimation for compliance operations
- Missing foreign key validations
- No audit log for failed compliance checks

---

## FILE 5: branding.service.ts

### CACHING OPERATIONS
- None (should cache branding config - queried frequently)

### DATABASE OPERATIONS

**Tables Touched:**
- `venues` - Pricing tier validation, custom domain
- `venue_branding` - Branding configuration (colors, fonts, logos, CSS)
- `white_label_pricing` - Tier features and domain limits
- `venue_tier_history` - Tier change audit
- `custom_domains` - Domain suspension on tier downgrade

**Query Patterns:**
- Single venue by ID: `venues.where('id', venueId).first()`
- Single venue by custom_domain: `venues.where('custom_domain', domain).first()`
- Branding by venue_id: `venue_branding.where('venue_id', venueId).first()`
- Pricing tier by name: `white_label_pricing.where('tier_name', tierName).first()`
- All pricing tiers: `white_label_pricing.orderBy('monthly_fee', 'asc')`
- Tier history: `venue_tier_history.where('venue_id', venueId).orderBy('changed_at', 'desc')`

**Aggregations:**
- None

### ANALYTICS
- Tier history tracking
- Branding update timestamps

### COMPLIANCE
- Tier validation (branding requires white-label tier)
- Tier downgrade affects custom domains

### HEALTH CHECKS
- None

### CROSS-FILE DEPENDENCIES
- Database (Knex)
- Logger

### ERROR HANDLING
- Missing venue throws error
- Tier validation before branding changes
- Hex color validation with regex: `/^#[0-9A-F]{6}$/i`
- Automatic downgrade handling (removes custom domain)
- Default branding returned if none configured
- Invalid tier throws error during tier change

### POTENTIAL ISSUES

🚨 **CRITICAL:**
- No caching of branding config (queried on every page load)
- **CSS injection risk** in `custom_css` field (needs sanitization/sandboxing)
- No validation on URL fields (logoUrl, faviconUrl, etc.) - could be malformed/malicious
- Font family not validated (could inject CSS via font-family)
- Tier change affects domain without notification
- No transaction wrapping for tier changes with branding updates

⚠️ **WARNINGS:**
- Snake_case/camelCase conversion is brittle (manual mapping table)
- No validation of image URLs (could be malformed/malicious)
- Default branding hard-coded (should be configurable)
- No version tracking for branding changes
- No preview mode for branding changes
- `generateCssVariables()` doesn't escape special characters
- No limits on custom CSS length

---

## FILE 6: domain-management.service.ts

### CACHING OPERATIONS
- None (DNS verification results not cached)

### DATABASE OPERATIONS

**Tables Touched:**
- `venues` - Pricing tier validation, custom_domain update
- `custom_domains` - Domain records, verification tokens, SSL status
- `white_label_pricing` - Domain limits per tier

**Query Patterns:**
- Single venue by ID: `venues.where('id', venueId).first()`
- Domain by domain name: `custom_domains.where('domain', domain).first()`
- Domain by ID: `custom_domains.where('id', domainId).first()`
- All domains for venue: `custom_domains.where('venue_id', venueId).orderBy('created_at', 'desc')`
- Count active domains: `custom_domains.where('venue_id', venueId).where('status', 'active').count('* as count')`

**Aggregations:**
- Count of active domains per venue (for tier limit check)

### ANALYTICS
- Domain verification tracking
- SSL certificate lifecycle tracking
- Last checked timestamps
- Error message tracking

### COMPLIANCE
- Tier-based domain limits enforcement

### HEALTH CHECKS
- None (but DNS and SSL should be monitored)

### CROSS-FILE DEPENDENCIES
- Database (Knex)
- Logger
- Node crypto (token generation)
- Node dns/promises (DNS verification)

### ERROR HANDLING
- Domain format validation with regex
- Prevents tickettoken.com domain usage
- DNS lookup errors caught and recorded in database
- SSL request failures recorded in ssl_error_message field
- Graceful degradation: records error_message in domain record
- Invalid domain format throws error
- Domain limit exceeded throws error

### POTENTIAL ISSUES

🚨 **CRITICAL:**
- DNS verification could be slow (no timeout specified - could hang)
- **SSL certificate generation is mocked** (just sets dates, no actual Let's Encrypt integration)
- No actual Let's Encrypt integration
- Domain removal doesn't delete, just suspends (data grows indefinitely)
- No notification on domain verification success/failure
- Verification token exposed in API responses (should be internal only)
- No validation of DNS TXT record TTL
- SSL expiry not monitored after initial setup

⚠️ **WARNINGS:**
- DNS verification runs on-demand (no background job)
- No rate limiting on verification attempts (could be abused)
- SSL expiry set to 90 days and never renewed
- No CNAME validation (only TXT record checked)
- No caching of DNS results (repeated lookups)
- No bulk domain operations
- Required DNS records stored as JSON (not queryable)

---

## FILE 7: healthCheck.service.ts

### CACHING OPERATIONS
- RabbitMQ health check results cached for 10 seconds
- Test cache operations (set/get/delete) in full health check

### DATABASE OPERATIONS
- `SELECT 1` query for basic connectivity
- Venue count query: `venues.count('id as count').first()`
- Migration status queries via Knex migrate API

**Tables Touched:**
- `venues` - For business logic health check
- Migration system tables (implicit via Knex)

**Query Patterns:**
- Simple connectivity: `db.raw('SELECT 1')`
- Count query for business validation
- Migration version check
- Migration list check (applied and pending)

### ANALYTICS
- Response time tracking per check
- Uptime calculation from service start time
- Venue count reporting
- Migration status reporting

### COMPLIANCE
- None

### HEALTH CHECKS

**Dependencies Checked:**
1. **Database (Knex)** - `SELECT 1` query
   - Status: ok/error
   - Timeout: Not explicitly set (relies on connection timeout)
   
2. **Redis** - PING command
   - Status: ok/error
   - Timeout: Not explicitly set

3. **RabbitMQ** - Connection status (optional)
   - Status: ok/warning (never error)
   - Cached for 10 seconds
   - Service can operate without RabbitMQ

4. **Business Logic:**
   - Venue query capability
   - Cache operations (set/get/delete with test key)
   - Database migrations status

**Timeout Thresholds:**
- No explicit timeouts set in this service
- Relies on underlying connection timeouts
- RabbitMQ check cached for 10 seconds (CACHE_TTL constant)

**Health Status Logic:**
- `healthy` - All checks pass
- `degraded` - Redis or RabbitMQ down (non-critical)
- `unhealthy` - Database down (critical dependency)
- RabbitMQ always returns warning (never error) since it's optional
- Migration warnings don't affect overall status

**Status Endpoints:**
- `/liveness` - Simple alive check (always returns alive)
- `/readiness` - Database + Redis connectivity
- `/health` (full) - All checks including business logic and migrations

### CROSS-FILE DEPENDENCIES
- Database (Knex)
- Redis (ioredis)
- Queue Service (RabbitMQ) - optional
- Logger
- Config service (RabbitMQ host, service version)

### ERROR HANDLING
- Each check isolated with try-catch
- Errors captured with message + response time
- Migration check failures logged but non-blocking
- RabbitMQ check cached to avoid hammering
- Graceful degradation for non-critical services

### POTENTIAL ISSUES

🚨 **CRITICAL:**
- Pending migrations return "warning" but service stays healthy (should be degraded)
- No integration with actual monitoring systems (Prometheus, DataDog, etc.)
- Health checks could overwhelm database if called too frequently (no rate limiting)
- No circuit breaker on health check queries themselves
- Cache test key could collide if multiple health checks run simultaneously

⚠️ **HEALTH CHECK GAPS:**
- No check for external service dependencies (Analytics Service)
- No check for file storage/uploads
- No check for event publisher connection quality
- No memory/CPU usage monitoring
- No disk space checks
- No check for compliance service dependencies
- Database connection pool exhaustion not checked
- Redis memory usage not checked
- No alert thresholds (when to page ops)
- No dependency on domain DNS resolution
- No SSL certificate expiry checks

---

## CROSS-CUTTING INTEGRATION CONCERNS

### Missing Cache Invalidation Scenarios
1. Branding changes don't invalidate cached branding configurations
2. Compliance settings changes don't clear related caches
3. Domain verification success doesn't clear domain status cache
4. Tier changes don't invalidate venue cache entries
5. Analytics data never cached (could benefit from short TTL cache)

### Stale Data Scenarios
1. Cached branding could show old colors/fonts after update
2. Compliance reports cached indefinitely (should have TTL)
3. Domain status cached for 10s in health check only (status changes could be missed)
4. Analytics not cached (could show inconsistent data on rapid queries)
5. Tier changes don't propagate immediately to all services

### Missing Error Handling
1. Analytics service failures crash operations (no fallback data)
2. Email queue failures logged but not alerted (silent failures)
3. SSL certificate generation failure silent (just logs)
4. DNS timeout not configured (could hang indefinitely)
5. No bulk operation error handling
6. No rollback mechanism for partial failures

### Transaction Boundaries
1. Tier changes update multiple tables without transactions
2. Domain verification updates venue + custom_domains separately
3. Compliance notification sending not atomic with settings update
4. Branding updates not transactional with tier checks

---

## ISSUES FOUND

### CRITICAL ISSUES

1. **cache-integration.ts** - Stub implementation not production-ready
   - Impact: Tests pass without actually testing cache behavior
   - Risk: HIGH - Could mask cache-related bugs

2. **branding.service.ts** - CSS Injection Vulnerability
   - Impact: `custom_css` field allows arbitrary CSS injection
   - Risk: HIGH - XSS and UI manipulation attacks
   - Recommendation: Sanitize CSS or use CSS-in-JS with sandboxing

3. **domain-management.service.ts** - Mocked SSL Certificate Generation
   - Impact: No actual Let's Encrypt integration
   - Risk: HIGH - HTTPS will not work on custom domains
   - Recommendation: Implement actual SSL certificate provisioning

4. **compliance.service.ts** - No Cache for Expensive Operations
   - Impact: Compliance reports regenerated on every request
   - Risk: MEDIUM - Performance degradation under load
   - Recommendation: Cache reports with 1-hour TTL

5. **domain-management.service.ts** - DNS Verification Timeout Missing
   - Impact: DNS lookups could hang indefinitely
   - Risk: MEDIUM - Service could become unresponsive
   - Recommendation: Add timeout to DNS resolution (5-10 seconds)

### HIGH ISSUES

6. **analytics.service.ts** - No Fallback for External Service
   - Impact: Analytics service downtime breaks venue operations
   - Risk: MEDIUM - Cascading failures
   - Recommendation: Add circuit breaker and graceful degradation

7. **branding.service.ts** - No URL Validation
   - Impact: Malformed/malicious URLs in logo/image fields
   - Risk: MEDIUM - Could serve malware or break UI
   - Recommendation: Validate URLs with whitelist and content-type check

8. **compliance.service.ts** - Email Queue Growth Unbounded
   - Impact: Email queue could grow infinitely
   - Risk: MEDIUM - Database bloat
   - Recommendation: Add cleanup job for old/sent emails

9. **healthCheck.service.ts** - Pending Migrations Don't Fail Health
   - Impact: Service reports healthy with pending migrations
   - Risk: MEDIUM - Could deploy incompatible code
   - Recommendation: Return degraded/unhealthy status for pending migrations

### MEDIUM ISSUES

10. **cache.service.ts** - Fire-and-Forget Cache Write Hides Errors
    - Impact: `getOrSet()` pattern could hide persistent cache failures
    - Risk: LOW - Reduced cache effectiveness
    - Recommendation: Add metrics for cache write failures

11. **All Services** - Missing Cache Invalidation Hooks
    - Impact: Stale data after updates
    - Risk: LOW - User confusion
    - Recommendation: Add cache invalidation to update operations

12. **healthCheck.service.ts** - No External Service Health Checks
    - Impact: Analytics service status not monitored
    - Risk: LOW - Poor observability
    - Recommendation: Add checks for all external dependencies

---

## INTEGRATION TEST FILE MAPPING

| Service | Test File | Priority | Rationale |
|---------|-----------|----------|-----------|
| cache.service.ts | (covered by other tests) | LOW | Utility service tested via consumers |
| analytics.service.ts | venue-analytics.integration.test.ts | MEDIUM | External HTTP service - test error handling |
| compliance.service.ts | venue-compliance.integration.test.ts | HIGH | Complex multi-table operations, notifications |
| branding.service.ts | venue-branding.integration.test.ts | LOW | Simple CRUD with validation |
| domain-management.service.ts | venue-domains.integration.test.ts | MEDIUM | DNS verification, SSL lifecycle |
| healthCheck.service.ts | health-check.integration.test.ts | LOW | Simple dependency checks |

### Key Integration Test Scenarios

**compliance.service.ts:**
- Tier downgrade cascades (domain suspension, email notifications)
- Compliance report generation with real database state
- Multi-category check aggregation
- Email queue integration

**analytics.service.ts:**
- External service timeout/failure handling
- Event tracking fire-and-forget behavior
- Circuit breaker integration

**domain-management.service.ts:**
- DNS verification workflow (TXT record check)
- Domain limit enforcement by tier
- SSL certificate lifecycle (mocked but testable)

**branding.service.ts:**
- CSS sanitization (if implemented)
- Tier validation before branding changes
- Default branding fallback

**healthCheck.service.ts:**
- Degraded state with Redis down
- Unhealthy state with database down
- Migration warning reporting

---

## RECOMMENDATIONS FOR INTEGRATION TESTING

1. **Test Tenant Isolation** - Verify cache keys prevent cross-tenant data leaks
2. **Test Circuit Breakers** - Ensure analytics failures don't crash operations
3. **Test Cascading Updates** - Tier changes should propagate correctly
4. **Test Email Queue** - Verify compliance notifications are sent
5. **Test Domain Limits** - Enforce tier-based domain count limits
6. **Test Health Degradation** - Verify service continues with degraded dependencies
7. **Test Transaction Boundaries** - Ensure partial failures don't leave inconsistent state
8. **Test Cache Invalidation** - Verify updates clear related cache entries
