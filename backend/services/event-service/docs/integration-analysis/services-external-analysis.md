# Event Service External/Infrastructure Services Analysis
## Purpose: Integration Testing Documentation
## Source: blockchain.service.ts, venue-service.client.ts, cache-integration.ts, databaseService.ts, healthCheck.service.ts, reservation-cleanup.service.ts
## Generated: January 20, 2026

---

## EXECUTIVE SUMMARY

This document analyzes the external/infrastructure integration layer of the event-service. These files handle connections to external systems (blockchain, databases, HTTP services) and provide resilience patterns for the core service layer.

**Key Findings:**
- ✅ **Gold Standard**: `venue-service.client.ts` - Excellent circuit breaker, retry, and fallback implementation
- 🔴 **Critical Gap**: `cache-integration.ts` - Missing tenant isolation in Redis keys
- 🔴 **Critical Gap**: `blockchain.service.ts` - No tenant validation before blockchain operations
- ⚠️ **High Priority**: Most services missing circuit breakers and timeouts

---

## ORPHANED FILES (Not Analyzed)

**None detected** - All 6 files are imported and actively used by the event-service.

---

## FILE ANALYSIS

---

### 📄 blockchain.service.ts

**Location**: `src/services/blockchain.service.ts`

#### PURPOSE
- Wraps shared `@tickettoken/shared` BlockchainClient with event-specific logic
- Creates immutable on-chain event accounts on Solana blockchain
- Manages royalty splits (artist/venue percentages) stored on-chain
- **Core Dependencies**: Event creation flows (`event.service.ts`) depend on this for blockchain registration

#### EXTERNAL CONNECTIONS
| Type | Endpoint/Resource | Configuration |
|------|------------------|---------------|
| Solana RPC | `SOLANA_RPC_URL` | Default: https://api.devnet.solana.com |
| Program ID | `TICKETTOKEN_PROGRAM_ID` | Default: BnYanHjkV6bBDFYfC7F76TyYk6NA9p3wvcAfY1XZCXYS |
| Wallet File | `PLATFORM_WALLET_PATH` | Filesystem read for signing transactions |
| No HTTP endpoints | Uses Solana web3.js SDK directly | Connection via RPC only |

#### RESILIENCE PATTERNS
⚠️ **CRITICAL GAPS - NO RESILIENCE**:
- ❌ **NO circuit breaker** for blockchain calls
- ❌ **NO retry logic** implemented
- ❌ **NO timeout configuration** on blockchain operations
- ❌ **NO fallback behavior** when blockchain unavailable
- ✅ Lazy initialization (client created on first use only)
- ❌ No differentiation between retryable vs non-retryable blockchain errors

**Impact**: Blockchain failures could hang indefinitely or cascade to event creation failures.

#### ERROR HANDLING
| Pattern | Status | Details |
|---------|--------|---------|
| Custom Errors | ✅ | Throws `BlockchainError` for consistent error handling |
| Logging | ✅ | Detailed pino logging with eventId, venueId, error context |
| Validation | ✅ | Validates total royalty ≤ 100% before blockchain call |
| Error Recovery | ❌ | No retry or fallback on blockchain failures |
| Error Classification | ❌ | Doesn't distinguish transient vs permanent failures |

#### TENANT ISOLATION
🔴 **CRITICAL SECURITY ISSUE**:
- ❌ **NO tenant_id passed through** to blockchain operations
- ❌ No validation that venue belongs to tenant before creating on-chain event
- ❌ Could create events for venues outside tenant's scope
- ❌ Blockchain event PDA uses only `venueId`, not tenant-scoped

**Risk**: Tenant A could create blockchain events for Tenant B's venues if validation is bypassed upstream.

#### POTENTIAL ISSUES
| Severity | Issue | Impact |
|----------|-------|--------|
| 🔴 CRITICAL | Missing tenant validation before blockchain operations | Data isolation breach |
| 🔴 CRITICAL | No tenant_id in blockchain event accounts | Cross-tenant event creation possible |
| ⚠️ HIGH | No timeout on blockchain transactions | Operations could hang indefinitely |
| ⚠️ HIGH | No retry logic for transient network failures | Reduced reliability |
| ⚠️ HIGH | No circuit breaker | Cascading failures when Solana RPC is down |
| 🟡 MEDIUM | Reads wallet from filesystem without error handling | Startup failures possible |
| 🟡 MEDIUM | No validation that venue exists before blockchain creation | Orphaned on-chain accounts |

---

### 📄 venue-service.client.ts

**Location**: `src/services/venue-service.client.ts`

#### PURPOSE
- Service-to-service client for venue-service HTTP API
- Validates venue access and retrieves venue details for event creation
- **Core Dependencies**: Event creation/validation flows depend on venue existence checks
- **Key Operations**: `validateVenueAccess()`, `getVenue()`, `healthCheck()`

#### EXTERNAL CONNECTIONS
| Type | Endpoint/Resource | Configuration |
|------|------------------|---------------|
| HTTP/HTTPS | `VENUE_SERVICE_URL` | Default: http://venue-service:3002 |
| HTTPS Enforcement | Converts HTTP→HTTPS in production | Override: `ALLOW_INSECURE_SERVICE_CALLS=true` |
| S2S Authentication | Service credentials via `getS2SHeaders()` | JWT-based service identity |
| Tenant Context | Passes `X-Tenant-ID` header | Ensures RLS enforcement |

#### RESILIENCE PATTERNS
✅ **GOLD STANDARD IMPLEMENTATION**:
- ✅ **Circuit breaker** (opossum) with intelligent thresholds:
  - Timeout: 5000ms per request
  - Error threshold: 50% failure rate
  - Reset timeout: 30s (half-open state)
  - Volume threshold: 5 requests minimum
- ✅ **Retry logic** with exponential backoff:
  - Max retries: 3
  - Initial delay: 500ms
  - Max delay: 5000ms
  - Smart retry: Doesn't retry 4xx errors (except 429)
- ✅ **Fallback behavior**:
  - In-memory cache with tenant-aware keys
  - Degraded mode allows operations with cached/default data
  - Prevents total service failure
- ✅ **Idempotency keys** for mutating operations:
  - Format: `event-svc:{operation}:{resourceId}:{timestamp}:{nonce}`
  - Prevents duplicate operations on retry
- ✅ **Circuit breaker events** logged (open/close/halfOpen/fallback)

#### ERROR HANDLING
| Pattern | Status | Details |
|---------|--------|---------|
| Custom Errors | ✅ | `NotFoundError`, `ForbiddenError`, `ValidationError` |
| Status Code Handling | ✅ | Proper differentiation (404, 403, 429, 5xx) |
| Retry Strategy | ✅ | Doesn't retry 4xx (except 429), retries 5xx/network errors |
| Logging | ✅ | Detailed context: venueId, tenantId, status, error message |
| Error Propagation | ✅ | Converts HTTP errors to domain-specific exceptions |

#### TENANT ISOLATION
✅ **EXCELLENT TENANT-AWARE DESIGN**:
- ✅ Tenant-aware caching: `getCacheKey(tenantId, venueId)` → `${tenantId}:${venueId}`
- ✅ Passes `X-Tenant-ID` header on all HTTP requests
- ✅ Cache invalidation respects tenant boundaries
- ✅ Fallback responses maintain tenant context
- ✅ Prevents cross-tenant data leakage in cache

**Cache Example:**
```typescript
// Cache key format ensures tenant isolation
function getCacheKey(tenantId: string, venueId: string): string {
  return `${tenantId}:${venueId}`;
}
```

#### POTENTIAL ISSUES
| Severity | Issue | Impact |
|----------|-------|--------|
| 🟡 MEDIUM | In-memory cache doesn't scale across instances | Cache misses on different pods |
| 🟡 MEDIUM | Degraded mode allows operations without venue verification | Security trade-off for availability |
| 🟡 MEDIUM | HTTPS enforcement can be bypassed with env flag | Production security concern |
| 🟢 LOW | Overall excellent implementation | Minimal risk |

**Recommendation**: Migrate in-memory cache to Redis with tenant prefixing for multi-instance deployments.

---

### 📄 cache-integration.ts

**Location**: `src/services/cache-integration.ts`

#### PURPOSE
- Redis wrapper for caching service data
- Provides `get()`, `set()`, `delete()`, `invalidateCache()`, `flush()` operations
- **Core Dependencies**: Used throughout event-service for performance optimization
- **Export**: Singleton `serviceCache` instance

#### EXTERNAL CONNECTIONS
| Type | Endpoint/Resource | Configuration |
|------|------------------|---------------|
| Redis | `REDIS_HOST:REDIS_PORT` | Default: localhost:6379 |
| Password | `REDIS_PASSWORD` | Optional authentication |
| Connection | Single Redis client | No pooling configured |

#### RESILIENCE PATTERNS
⚠️ **PARTIAL IMPLEMENTATION**:
- ✅ **Retry strategy**: Exponential backoff (50ms × attempt, max 2000ms)
- ✅ **Max retries per request**: 3
- ✅ **Graceful degradation**: Returns `null` on errors (doesn't throw)
- ❌ **NO timeout configured** - Operations could hang indefinitely
- ❌ **NO circuit breaker** for Redis failures
- ❌ No connection pooling
- ❌ No monitoring/metrics

**Impact**: Redis failures won't crash the app but could cause performance degradation.

#### ERROR HANDLING
| Pattern | Status | Details |
|---------|--------|---------|
| Try-Catch Blocks | ✅ | All operations wrapped in error handling |
| Error Logging | ✅ | Logs with context (key, TTL, error) |
| Silent Failures | ✅ | Returns `null` instead of throwing |
| Error Metrics | ❌ | No metrics/alerting for Redis failures |

#### TENANT ISOLATION
🔴 **CRITICAL SECURITY VULNERABILITY**:
- ❌ **NO tenant prefixing in cache keys**
- ❌ Cache keys are NOT tenant-aware
- ❌ `flush()` would clear ALL tenants' data
- ❌ Pattern-based deletion (`keys *`) could affect all tenants
- ❌ No tenant scoping in any method

**SECURITY RISK**: Tenant A could potentially access Tenant B's cached data if cache keys collide.

**Example Vulnerability:**
```typescript
// CURRENT (VULNERABLE):
await serviceCache.set('event:123', eventData); // No tenant context!

// SHOULD BE:
await serviceCache.set(`tenant:${tenantId}:event:123`, eventData);
```

#### POTENTIAL ISSUES
| Severity | Issue | Impact |
|----------|-------|--------|
| 🔴 CRITICAL | Missing tenant isolation in Redis keys | Cross-tenant data leakage |
| 🔴 CRITICAL | `flush()` method is dangerous | Clears all tenants' data |
| 🔴 CRITICAL | Wildcard pattern matching (`keys *`) dangerous | Affects all tenants |
| ⚠️ HIGH | No timeout on Redis operations | Operations could hang |
| ⚠️ HIGH | No circuit breaker for Redis failures | Cascading failures possible |
| ⚠️ HIGH | Uses `keys` command (blocks Redis) | Performance issue in production |
| 🟡 MEDIUM | No connection pooling configuration | Scalability concern |
| 🟡 MEDIUM | No monitoring/alerting | Ops blind to Redis issues |

**REQUIRED FIX**: Add tenant prefixing to ALL cache operations immediately.

---

### 📄 databaseService.ts

**Location**: `src/services/databaseService.ts`

#### PURPOSE
- PostgreSQL connection pool manager
- Foundation for ALL database operations in event-service
- **Core Dependencies**: Used by all repositories/models for database access
- **Key Operations**: `initialize()`, `getPool()`

#### EXTERNAL CONNECTIONS
| Type | Endpoint/Resource | Configuration |
|------|------------------|---------------|
| PostgreSQL | `DATABASE_URL` or individual params | Default: tickettoken-postgres:5432 |
| Database | `DB_NAME` | Default: tickettoken_db |
| Credentials | `DB_USER`, `DB_PASSWORD` | Default: postgres/localdev123 |

#### RESILIENCE PATTERNS
❌ **NO RESILIENCE IMPLEMENTED**:
- ❌ **NO retry logic** on connection failures
- ❌ **NO circuit breaker**
- ❌ **NO timeout configuration**
- ❌ **NO connection pool limits** configured (uses pg defaults)
- ❌ **NO health checks** or connection validation
- ❌ **NO fallback behavior**
- ❌ **NO connection retry on disconnect**

**Impact**: Database connection failures will immediately crash queries with no recovery.

#### ERROR HANDLING
| Pattern | Status | Details |
|---------|--------|---------|
| Initialization Check | ✅ | Throws error if pool not initialized |
| Connection Test | ✅ | `SELECT NOW()` on initialization |
| Error Recovery | ❌ | No retry or reconnection logic |
| Graceful Degradation | ❌ | No fallback behavior |
| Connection Monitoring | ❌ | No health checks after initialization |

#### TENANT ISOLATION
✅ **RLS-Based Isolation**:
- ℹ️ Database uses Row Level Security (RLS) per platform architecture
- ℹ️ This service doesn't enforce tenant context (relies on RLS policies)
- ℹ️ Tenant isolation handled at query level via `set_config('app.tenant_id', ...)`, not connection level
- ✅ Proper design: Connection pool is tenant-agnostic

**Note**: This is correct architecture - tenant enforcement happens in query layer, not connection layer.

#### POTENTIAL ISSUES
| Severity | Issue | Impact |
|----------|-------|--------|
| ⚠️ HIGH | No connection pool configuration | Max connections, idle timeout not set |
| ⚠️ HIGH | No retry logic for failed connections | Service crashes on DB outage |
| ⚠️ HIGH | No circuit breaker for database failures | Cascading failures |
| ⚠️ HIGH | No timeout configuration | Queries could hang indefinitely |
| 🟡 MEDIUM | No connection health monitoring | Can't detect stale connections |
| 🟡 MEDIUM | No graceful shutdown handling | Potential connection leaks |
| 🟡 MEDIUM | Minimal error handling on initialization failure | Poor startup diagnostics |

**REQUIRED FIX**: Add connection pool limits, retry logic, and health monitoring.

---

### 📄 healthCheck.service.ts

**Location**: `src/services/healthCheck.service.ts`

#### PURPOSE
- Kubernetes liveness, readiness, and startup probes
- Monitoring dashboard health checks
- **Core Dependencies**: Used by k8s orchestration and monitoring systems
- **Key Operations**: `performLivenessCheck()`, `performReadinessCheck()`, `performHealthCheck()`

#### EXTERNAL CONNECTIONS
| Type | Endpoint/Resource | Configuration |
|------|------------------|---------------|
| Database | Health check queries (`SELECT 1`) | Required for readiness |
| Redis | Ping checks | Required for readiness |
| External (Optional) | Venue-service, auth-service | Cached, non-critical checks |

#### RESILIENCE PATTERNS
✅ **EXCELLENT ARCHITECTURE** (Audit fixes already applied):
- ✅ **Timeouts**: DB 2s, Redis 1s (prevents hanging probes)
- ✅ **Degraded state detection**: Slow response thresholds
  - DB > 1000ms = degraded
  - Redis > 500ms = degraded
- ✅ **Prevents cascading failures**: External dependencies don't affect readiness
- ✅ **Caching for external checks**: 30s TTL (reduces check frequency)
- ✅ **Clock drift detection**: 5s tolerance (audit fix TSO-1)
- ✅ **Fast liveness**: <100ms, no dependency checks

**Design Pattern:**
```typescript
// CRITICAL: External services don't affect health status
async performHealthCheck(db, redis, includeExternalDeps = false) {
  // Only LOCAL dependencies affect status
  const status = allLocalUp ? 'healthy' : 'unhealthy';
  
  // External deps are INFORMATIONAL ONLY
  if (includeExternalDeps) {
    result.dependencies = await this.checkExternalDependencies();
  }
}
```

#### ERROR HANDLING
| Pattern | Status | Details |
|---------|--------|---------|
| Try-Catch All Checks | ✅ | No uncaught exceptions |
| Structured Error Codes | ✅ | Returns codes, not internal messages |
| Status Levels | ✅ | up/degraded/down (3-level status) |
| Logging | ✅ | Detailed diagnostics without exposing secrets |
| Timeout Enforcement | ✅ | All checks have timeouts |

#### TENANT ISOLATION
✅ **PROPER DESIGN**:
- N/A - Health checks are service-level, not tenant-specific
- ✅ No tenant data exposed in health responses
- ✅ Properly scoped to infrastructure health

#### POTENTIAL ISSUES
| Severity | Issue | Impact |
|----------|-------|--------|
| 🟡 MEDIUM | `performDetailedHealthCheck()` includes sensitive info | Memory, PID exposed - should require admin auth |
| 🟡 MEDIUM | External service checks use `fetch` without circuit breaker | Could slow health checks |
| 🟢 LOW | Overall well-designed | Minimal risk |

**Note**: This is one of the best-designed files in the codebase.

---

### 📄 reservation-cleanup.service.ts

**Location**: `src/services/reservation-cleanup.service.ts`

#### PURPOSE
- Background job to release expired ticket reservations
- Ensures capacity is freed when users don't complete purchases
- **Core Dependencies**: Depends on `CapacityService` for cleanup logic
- **Key Operations**: `start()`, `stop()`, `runCleanup()`, `triggerCleanup()`

#### EXTERNAL CONNECTIONS
| Type | Endpoint/Resource | Configuration |
|------|------------------|---------------|
| Database | Indirect via `CapacityService` (Knex) | Queries reservation tables |
| No HTTP calls | Internal service only | - |

#### RESILIENCE PATTERNS
⚠️ **MINIMAL RESILIENCE**:
- ❌ **NO timeout** on cleanup operations
- ❌ **NO circuit breaker**
- ✅ Error handling prevents job from crashing
- ✅ Runs on interval (configurable, default 1 minute)
- ❌ **NO retry logic** if cleanup fails
- ❌ **NO dead letter queue** for failed cleanups
- ❌ **NO backoff** if database is struggling

**Impact**: Background job continues hitting DB even if overwhelmed or down.

#### ERROR HANDLING
| Pattern | Status | Details |
|---------|--------|---------|
| Try-Catch Around Cleanup | ✅ | Prevents job crash |
| Logs Errors | ✅ | Error + stack trace logged |
| Continues After Errors | ✅ | Job keeps running |
| Alerting on Failures | ❌ | No alerting for repeated failures |
| Circuit Breaker | ❌ | Doesn't stop if DB is down |

#### TENANT ISOLATION
⚠️ **UNCLEAR - DEPENDS ON CAPACITYSERVICE**:
- ⚠️ This file doesn't show tenant filtering logic
- ⚠️ **Need to verify**: Does `CapacityService.releaseExpiredReservations()` include tenant scoping?
- 🔴 **FLAG**: If CapacityService doesn't filter by tenant, this could release ALL tenants' reservations

**Required Action**: Audit `CapacityService` implementation to verify tenant isolation.

#### POTENTIAL ISSUES
| Severity | Issue | Impact |
|----------|-------|--------|
| 🔴 CRITICAL | Tenant isolation unclear | Need to verify CapacityService |
| ⚠️ HIGH | No timeout on cleanup operations | Could block indefinitely |
| ⚠️ HIGH | No circuit breaker | Continues hitting DB even if down |
| ⚠️ HIGH | No monitoring/alerting for failed cleanups | Ops blind to failures |
| 🟡 MEDIUM | Fixed 1-minute interval | May be too aggressive for large datasets |
| 🟡 MEDIUM | No graceful handling if cleanup > interval | Overlapping cleanups possible |
| 🟡 MEDIUM | No metrics on cleanup performance | Can't detect degradation |

**REQUIRED ACTION**: 
1. Verify tenant isolation in CapacityService
2. Add circuit breaker to stop job if DB is down
3. Add alerting for repeated cleanup failures

---

## GOLD STANDARD

### 🏆 venue-service.client.ts - Reference Implementation

This file demonstrates **excellent resilience patterns** and should be used as a template for other external integrations:

#### What Makes It Gold Standard

1. **Circuit Breaker (opossum)**
   - Prevents cascading failures
   - Configurable thresholds (50% error rate, 5 request minimum)
   - Automatic recovery with half-open state
   - Event logging for observability

2. **Retry Logic with Exponential Backoff**
   - Max 3 retries with increasing delays (500ms → 5000ms)
   - Smart retry: Doesn't retry 4xx errors (except 429)
   - Prevents thundering herd

3. **Fallback Behavior**
   - In-memory cache for degraded mode
   - Returns cached/default data when service unavailable
   - Graceful degradation instead of hard failures

4. **Idempotency Keys**
   - Prevents duplicate operations on retry
   - Format: `event-svc:{operation}:{resourceId}:{timestamp}:{nonce}`
   - Only added for mutating operations (POST/PUT/PATCH/DELETE)

5. **Tenant Isolation**
   - Tenant-aware cache keys: `${tenantId}:${venueId}`
   - Passes `X-Tenant-ID` header on all requests
   - Prevents cross-tenant data leakage

6. **HTTPS Enforcement**
   - Converts HTTP → HTTPS in production
   - Configurable override for development

7. **Comprehensive Error Handling**
   - Status code differentiation (404, 403, 429, 5xx)
   - Custom domain exceptions
   - Detailed logging with context

#### Code Example to Replicate

```typescript
// Circuit breaker setup
this.circuitBreaker = new CircuitBreaker(this.requestWithRetry.bind(this), {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
});

// Retry with exponential backoff
private async requestWithRetry(path: string, options: any = {}): Promise<any> {
  return withRetry(
    () => this.request(path, options),
    {
      maxRetries: 3,
      initialDelayMs: 500,
      maxDelayMs: 5000,
      retryOn: (error) => {
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          return false; // Don't retry 4xx (except 429)
        }
        return isRetryableError(error);
      },
    }
  );
}

// Tenant-aware caching
function getCacheKey(tenantId: string, venueId: string): string {
  return `${tenantId}:${venueId}`;
}

// Fallback behavior
if (this.isDegraded || error.message?.includes('Breaker is open')) {
  const cached = this.getCachedVenue(tenantId, venueId);
  if (cached) {
    return cached; // Use cache when service down
  }
  return defaultResponse; // Or return safe default
}
```

#### Apply This Pattern To

- ❌ `blockchain.service.ts` - Needs circuit breaker + retry
- ❌ `cache-integration.ts` - Needs circuit breaker + timeouts
- ❌ `databaseService.ts` - Needs retry + connection management

---

## CROSS-SERVICE DEPENDENCIES

### Dependency Map

```
┌─────────────────────┐
│  Event Service      │
└──────────┬──────────┘
           │
           ├─────────────► Solana Blockchain (RPC)
           │               • Program: tickettoken-program
           │               • No resilience patterns
           │               🔴 Missing: Circuit breaker, timeout, retry
           │
           ├─────────────► Venue Service (HTTP)
           │               • S2S authenticated calls
           │               ✅ Circuit breaker + retry + fallback
           │               ✅ Tenant-aware caching
           │
           ├─────────────► PostgreSQL Database
           │               • Connection pool via pg
           │               🔴 Missing: Retry, circuit breaker, timeouts
           │               ✅ RLS for tenant isolation
           │
           └─────────────► Redis Cache
                           • Single connection
                           🔴 Missing: Tenant prefixing in keys
                           🔴 Missing: Circuit breaker, timeout
```

### External Service Inventory

| Service | Type | Auth | Resilience | Tenant-Aware | Status |
|---------|------|------|------------|--------------|--------|
| Solana RPC | Blockchain | None | ❌ None | ❌ No | 🔴 Critical gaps |
| Venue Service | HTTP/S2S | S2S JWT | ✅ Full | ✅ Yes | ✅ Gold standard |
| PostgreSQL | Database | Password | ❌ None | ✅ RLS | 🔴 Critical gaps |
| Redis | Cache | Optional password | ⚠️ Partial | ❌ No | 🔴 Critical gaps |

### Service Call Flows

#### Event Creation Flow
```
POST /api/v1/events
  │
  ├─► venue-service.client.validateVenueAccess()
  │   └─► HTTP GET /api/v1/venues/{id}
  │       ✅ Circuit breaker + retry + cache fallback
  │
  ├─► databaseService.getPool().query()
  │   └─► PostgreSQL INSERT into events table
  │       🔴 No retry, no circuit breaker
  │
  ├─► blockchain.service.createEventOnChain()
  │   └─► Solana RPC: create_event instruction
  │       🔴 No retry, no timeout, no circuit breaker
  │
  └─► cache-integration.delete()
      └─► Redis DEL event:*
          🔴 No tenant prefixing
```

---

## RESILIENCE GAPS

### Summary by Priority

#### 🔴 CRITICAL (P0) - Security & Data Isolation

| File | Gap | Impact | Fix Required |
|------|-----|--------|--------------|
| `cache-integration.ts` | No tenant prefixing in Redis keys | Cross-tenant data leakage | Add `tenant:${id}:` prefix to ALL keys |
| `cache-integration.ts` | `flush()` clears all tenants | Data loss across tenants | Scope to tenant or remove method |
| `blockchain.service.ts` | No tenant validation | Cross-tenant event creation | Validate venue belongs to tenant |
| `reservation-cleanup.service.ts` | Tenant isolation unclear | May affect all tenants | Verify CapacityService scoping |

#### ⚠️ HIGH (P1) - Missing Resilience

| File | Missing Pattern | Impact | Fix Required |
|------|----------------|--------|--------------|
| `blockchain.service.ts` | No circuit breaker | Cascading failures on Solana outage | Add opossum circuit breaker |
| `blockchain.service.ts` | No timeout | Operations hang indefinitely | Add 10s timeout to transactions |
| `blockchain.service.ts` | No retry logic | Single-point failures | Add retry with exponential backoff |
| `databaseService.ts` | No connection pool limits | Connection exhaustion | Configure max connections, idle timeout |
| `databaseService.ts` | No retry on connection failure | Service crash on DB restart | Add connection retry logic |
| `databaseService.ts` | No circuit breaker | Cascading failures on DB outage | Add circuit breaker to connection pool |
| `cache-integration.ts` | No timeout | Redis operations hang | Add 1s timeout |
| `cache-integration.ts` | No circuit breaker | Cascading failures on Redis outage | Add circuit breaker |
| `reservation-cleanup.service.ts` | No circuit breaker | Job continues hitting down DB | Add circuit breaker to stop job |

#### 🟡 MEDIUM (P2) - Code Quality & Operations

| File | Gap | Impact | Fix Required |
|------|-----|--------|--------------|
| `cache-integration.ts` | Uses `keys *` command | Blocks Redis in production | Use SCAN instead |
| `databaseService.ts` | No graceful shutdown | Connection leaks on shutdown | Add graceful pool drain |
| `healthCheck.service.ts` | Detailed health needs auth | Info disclosure | Require admin middleware |
| `reservation-cleanup.service.ts` | No alerting | Blind to cleanup failures | Add metrics/alerting |
| `venue-service.client.ts` | In-memory cache | Doesn't scale across instances | Migrate to Redis with tenant prefix |

---

## INTEGRATION TEST FILE MAPPING

### Test Coverage Recommendations

| Service File | Test File (Proposed) | Priority | Key Scenarios |
|-------------|---------------------|----------|---------------|
| `blockchain.service.ts` | `tests/integration/blockchain-resilience.test.ts` | 🔴 P0 | • Solana RPC timeout<br>• Network failures during tx<br>• Tenant validation<br>• Duplicate event creation<br>• Royalty calculation |
| `venue-service.client.ts` | `tests/integration/venue-client-resilience.test.ts` | 🟡 P2 | • Circuit breaker behavior<br>• Retry logic<br>• Cache fallback<br>• Degraded mode operations<br>• Tenant isolation in cache<br>• Idempotency key handling |
| `cache-integration.ts` | `tests/integration/cache-tenant-isolation.test.ts` | 🔴 P0 | • Tenant key isolation<br>• Cross-tenant data leakage tests<br>• Redis failover<br>• Timeout handling<br>• Pattern deletion safety |
| `databaseService.ts` | `tests/integration/database-pool-resilience.test.ts` | ⚠️ P1 | • Connection pool exhaustion<br>• DB restart recovery<br>• Connection retry logic<br>• Graceful shutdown<br>• RLS enforcement |
| `healthCheck.service.ts` | `tests/integration/health-check-isolation.test.ts` | 🟡 P2 | • External service failures don't affect readiness<br>• Timeout enforcement<br>• Degraded state detection<br>• Clock drift detection |
| `reservation-cleanup.service.ts` | `tests/integration/cleanup-tenant-isolation.test.ts` | 🔴 P0 | • Tenant isolation in cleanup<br>• DB failure handling<br>• Overlapping job prevention<br>• Metrics accuracy |

### Test Scenario Details

#### 🔴 P0: cache-tenant-isolation.test.ts
**Purpose**: Verify Redis cache cannot leak data across tenants

```typescript
describe('Cache Tenant Isolation', () => {
  it('should prevent cross-tenant cache key collision', async () => {
    // Tenant A sets data
    await serviceCache.set('event:123', { name: 'Tenant A Event' });
    
    // Tenant B should NOT see Tenant A's data
    const data = await serviceCache.get('event:123');
    // CURRENTLY FAILS - both tenants see same data
    // SHOULD FAIL - need tenant prefixing
  });
  
  it('should scope flush() to single tenant', async () => {
    // Setup: Multiple tenants have cached data
    // Action: flush() called
    // Expected: Only current tenant's cache cleared
    // CURRENTLY FAILS - flush() clears all tenants
  });
  
  it('should scope wildcard deletion to tenant', async () => {
    // Test that event:* doesn't delete other tenants' events
  });
});
```

#### 🔴 P0: blockchain-resilience.test.ts
**Purpose**: Verify blockchain operations are resilient and tenant-safe

```typescript
describe('Blockchain Resilience', () => {
  it('should timeout after 10s on hung RPC', async () => {
    // Mock Solana RPC that never responds
    // Should timeout, not hang forever
  });
  
  it('should retry transient network failures', async () => {
    // Mock RPC with 2 failures then success
    // Should succeed after retries
  });
  
  it('should prevent creating event for wrong tenant venue', async () => {
    // Tenant A tries to create event for Tenant B's venue
    // Should fail with ForbiddenError
    // CURRENTLY FAILS - no tenant check
  });
  
  it('should handle circuit breaker open state', async () => {
    // After multiple failures, circuit should open
    // Should fail fast without hitting RPC
  });
});
```

#### ⚠️ P1: database-pool-resilience.test.ts
**Purpose**: Verify database connection pool handles failures gracefully

```typescript
describe('Database Pool Resilience', () => {
  it('should retry connection on database restart', async () => {
    // Simulate DB restart during operation
    // Should retry and reconnect
    // CURRENTLY FAILS - no retry logic
  });
  
  it('should handle connection pool exhaustion', async () => {
    // Create max connections + 1
    // Should queue or fail gracefully
  });
  
  it('should enforce connection timeout', async () => {
    // Mock slow connection attempt
    // Should timeout after configured period
  });
});
```

#### 🟡 P2: venue-client-resilience.test.ts
**Purpose**: Verify venue-service.client resilience patterns work correctly

```typescript
describe('Venue Client Resilience', () => {
  it('should open circuit breaker after error threshold', async () => {
    // Make 5+ requests that fail
    // Circuit should open
    // Next request should fail fast
  });
  
  it('should use cached fallback when circuit open', async () => {
    // Prime cache with venue data
    // Open circuit breaker
    // Request should return cached data
  });
  
  it('should include idempotency key on mutating requests', async () => {
    // Make POST/PUT/PATCH/DELETE
    // Should include Idempotency-Key header
  });
  
  it('should NOT include idempotency key on GET requests', async () => {
    // Make GET request
    // Should NOT include Idempotency-Key header
  });
});
```

---

## RECOMMENDED FIXES

### Priority Order

#### 1. 🔴 P0: Fix Cache Tenant Isolation (IMMEDIATE)

**File**: `cache-integration.ts`

**Changes Required**:
```typescript
// Add tenant parameter to all methods
async get(tenantId: string, key: string): Promise<any> {
  const scopedKey = `tenant:${tenantId}:${key}`;
  // ... existing logic
}

async set(tenantId: string, key: string, value: any, ttl: number = 3600): Promise<void> {
  const scopedKey = `tenant:${tenantId}:${key}`;
  // ... existing logic
}

// REMOVE dangerous flush() method or scope to tenant
async flush(tenantId: string): Promise<void> {
  const pattern = `tenant:${tenantId}:*`;
  // Use SCAN instead of KEYS
  // ... safe deletion logic
}
```

**Breaking Change**: Yes - all callers must pass tenantId

#### 2. 🔴 P0: Add Blockchain Tenant Validation

**File**: `blockchain.service.ts`

**Changes Required**:
```typescript
async createEventOnChain(
  eventData: EventBlockchainData,
  tenantId: string // ADD THIS PARAMETER
): Promise<CreateEventResult> {
  // Validate venue belongs to tenant BEFORE blockchain call
  await this.validateVenueTenant(eventData.venueId, tenantId);
  
  // ... existing logic
}

private async validateVenueTenant(venueId: string, tenantId: string): Promise<void> {
  // Call venue-service or check database
  // Throw ForbiddenError if venue not in tenant
}
```

#### 3. ⚠️ P1: Add Blockchain Circuit Breaker

**File**: `blockchain.service.ts`

**Changes Required**:
```typescript
import CircuitBreaker from 'opossum';

export class EventBlockchainService {
  private circuitBreaker: CircuitBreaker;
  
  constructor() {
    this.circuitBreaker = new CircuitBreaker(
      this.createEventOnChainInternal.bind(this),
      {
        timeout: 10000, // 10s for blockchain operations
        errorThresholdPercentage: 50,
        resetTimeout: 60000, // 1 minute
      }
    );
  }
  
  async createEventOnChain(data: EventBlockchainData): Promise<CreateEventResult> {
    return this.circuitBreaker.fire(data);
  }
}
```

#### 4. ⚠️ P1: Add Database Connection Resilience

**File**: `databaseService.ts`

**Changes Required**:
```typescript
async initialize(): Promise<void> {
  const poolConfig = {
    // ... existing config
    max: 20, // Maximum connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
  
  // Add retry logic
  await withRetry(
    async () => {
      this.pool = new Pool(poolConfig);
      await this.pool.query('SELECT NOW()');
    },
    {
      maxRetries: 5,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
    }
  );
}
```

---

## TESTING STRATEGY

### Integration Test Priorities

1. **P0 - Security Tests** (Must have before production)
   - Cache tenant isolation
   - Blockchain tenant validation
   - Reservation cleanup tenant scoping

2. **P1 - Resilience Tests** (Critical for reliability)
   - Circuit breaker behavior (all services)
   - Timeout enforcement
   - Retry logic validation
   - Fallback behavior

3. **P2 - Operations Tests** (Important for monitoring)
   - Health check isolation
   - Degraded mode operations
   - Metrics accuracy

### Test Environment Setup

```typescript
// Integration test setup for external services
beforeAll(async () => {
  // Start test containers
  await startRedis(); // Testcontainers
  await startPostgres(); // Testcontainers
  await startMockSolana(); // Mock RPC server
  await startMockVenueService(); // Mock HTTP server
});

// Tenant isolation test helper
async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  // Set tenant context for test
  // Execute test function
  // Clean up tenant data
}
```

---

## METRICS & MONITORING

### Recommended Metrics

#### Circuit Breaker Metrics
```typescript
// Track circuit breaker state changes
metrics.gauge('circuit_breaker.state', state, { service: 'venue-service' });
metrics.counter('circuit_breaker.opened', { service: 'venue-service' });
metrics.counter('circuit_breaker.closed', { service: 'venue-service' });
```

#### External Service Metrics
```typescript
// Latency
metrics.histogram('external_service.latency', latencyMs, { 
  service: 'venue-service',
  operation: 'getVenue',
  status: 'success'
});

// Error rates
metrics.counter('external_service.errors', { 
  service: 'venue-service',
  error_type: 'timeout'
});

// Cache hit rates
metrics.counter('cache.hits', { tenant: tenantId });
metrics.counter('cache.misses', { tenant: tenantId });
```

---

## CONCLUSION

### Summary

- ✅ **1 Gold Standard File**: `venue-service.client.ts` - Use as reference
- 🔴 **3 Critical Issues**: Cache tenant isolation, blockchain tenant validation, unclear cleanup scoping
- ⚠️ **8 High Priority Gaps**: Missing circuit breakers, timeouts, retry logic
- 🟡 **6 Medium Priority Issues**: Code quality and operational concerns

### Next Steps

1. **Immediate** (Sprint 1): Fix cache tenant isolation
2. **Critical** (Sprint 1): Add blockchain tenant validation
3. **High Priority** (Sprint 2): Add circuit breakers to blockchain + database
4. **Integration Tests** (Sprint 2-3): Implement P0 and P1 test scenarios
5. **Monitoring** (Sprint 3): Add metrics for all external services

### Architecture Recommendations

1. **Standardize Resilience**: Apply venue-service.client.ts patterns to all external integrations
2. **Tenant-First Design**: All cache/storage operations must include tenant context
3. **Circuit Breaker Strategy**: Add circuit breakers to ALL external dependencies
4. **Timeout Policy**: Enforce timeouts on all I/O operations (network, database, cache)
5. **Graceful Degradation**: Design fallback behavior for non-critical operations

---

**End of Analysis**
