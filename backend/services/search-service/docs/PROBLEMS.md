# SEARCH-SERVICE - ISSUES & PROBLEMS FOUND

> **Generated**: January 2025  
> **Analysis Date**: Complete code review of 58 files  
> **Total Issues Found**: 45

---

## Table of Contents

1. [Summary](#summary)
2. [Critical Security Vulnerabilities](#critical-security-vulnerabilities)
3. [High Severity Issues](#high-severity-issues)
4. [Medium Severity Issues](#medium-severity-issues)
5. [Low Severity Issues](#low-severity-issues)
6. [Priority Fix Order](#priority-fix-order)

---

## Summary

| Severity | Count | Impact |
|----------|-------|--------|
| 🔴 Critical | 4 | Security vulnerabilities - data leaks, injection attacks |
| 🟠 High | 5 | Service won't start or will crash in production |
| 🟡 Medium | 16 | Stability, performance, and quality issues |
| 🟢 Low | 20 | Code smells, missing features, minor improvements |
| **TOTAL** | **45** | |

---

## Critical Security Vulnerabilities

### 1. NO Tenant Filtering in Autocomplete Service 🔴

**File:** `services/autocomplete.service.ts`  
**Severity:** CRITICAL  
**Impact:** Complete tenant isolation bypass - users can see competitors' data

**Problem:**
```typescript
// Current code has NO tenant filtering
async getSuggestions(query: string, types: string[] = ['events', 'venues']) {
  const response = await this.elasticsearch.search({
    index: types,
    body: { suggest }
  });
  // Returns data from ALL tenants!
}
```

**Fix Required:**
```typescript
async getSuggestions(query: string, types: string[], venueId: string, userRole: string) {
  let esQuery = { suggest };
  
  // Add tenant filter
  const allowCrossTenant = canAccessCrossTenant(userRole);
  esQuery = addTenantFilter(esQuery, { venueId, allowCrossTenant });
  
  const response = await this.elasticsearch.search({
    index: types,
    body: esQuery
  });
}
```

---

### 2. NO Tenant Filtering in Professional Search Service 🔴

**File:** `services/professional-search.service.ts`  
**Severity:** CRITICAL  
**Impact:** Users can search across ALL tenants' data - massive data leak

**Problem:**
The entire professional search service has NO tenant filtering. Methods affected:
- `search()`
- `searchNearMe()`
- `getTrending()`
- `findSimilar()`

**Fix Required:**
Add tenant filtering to all Elasticsearch queries:
```typescript
// Add to all search methods
const allowCrossTenant = !!(userRole && canAccessCrossTenant(userRole));
esQuery = addTenantFilter(esQuery, { venueId, allowCrossTenant });
```

---

### 3. NO Input Sanitization in Professional Search Controller 🔴

**File:** `controllers/professional-search.controller.ts`  
**Severity:** CRITICAL  
**Impact:** SQL injection, NoSQL injection, XSS attacks possible

**Problem:**
```typescript
fastify.post('/advanced', async (request, _reply) => {
  // Raw body passed directly to service - NO SANITIZATION!
  const results = await professionalSearchService.search(request.body);
  return results;
});
```

**Fix Required:**
```typescript
fastify.post('/advanced', async (request, _reply) => {
  const body = request.body as any;
  
  // Sanitize all inputs
  const sanitizedQuery = SearchSanitizer.sanitizeQuery(body.query);
  const sanitizedFilters = SearchSanitizer.sanitizeFilters(body.filters);
  const sanitizedLimit = SearchSanitizer.sanitizeNumber(body.limit, 20, 1, 100);
  
  const results = await professionalSearchService.search({
    ...body,
    query: sanitizedQuery,
    filters: sanitizedFilters,
    limit: sanitizedLimit
  });
  return results;
});
```

---

### 4. NO Tenant Middleware in Professional Search Routes 🔴

**File:** `controllers/professional-search.controller.ts`  
**Severity:** CRITICAL  
**Impact:** Authenticated users without tenant context can access data

**Problem:**
```typescript
// Only has authenticate, missing requireTenant
fastify.post('/advanced', {
  preHandler: authenticate  // ❌ No tenant check!
}, async (request, _reply) => {
  // ...
});
```

**Fix Required:**
```typescript
fastify.post('/advanced', {
  preHandler: [authenticate, requireTenant]  // ✅ Both checks
}, async (request, _reply) => {
  // ...
});
```

---

## High Severity Issues

### 5. Database Environment Variable Inconsistency 🟠

**Files:** `config/database.ts` vs `config/env.validator.ts`  
**Severity:** HIGH  
**Impact:** Configuration won't work - either validation or connection will fail

**Problem:**
- `database.ts` uses: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `env.validator.ts` uses: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`

**Fix Required:**
Standardize on one prefix (recommend `DATABASE_*` to match validator)

---

### 6. Syntax Error in server.ts Logger 🟠

**File:** `src/server.ts`  
**Severity:** HIGH  
**Impact:** Service won't start

**Problem:**
```typescript
logger.info`${signal} received, starting graceful shutdown`);
// Wrong syntax - uses backslash instead of backtick
```

**Fix Required:**
```typescript
logger.info(`${signal} received, starting graceful shutdown`);
```

---

### 7. RabbitMQ Infinite Retry Loop 🟠

**File:** `config/rabbitmq.ts`  
**Severity:** HIGH  
**Impact:** Resource exhaustion, connection flooding

**Problem:**
```typescript
export async function connectRabbitMQ() {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL || '...');
    // ...
  } catch (error) {
    console.error('RabbitMQ connection failed:', error);
    setTimeout(connectRabbitMQ, 5000); // ❌ Infinite retry!
  }
}
```

**Fix Required:**
```typescript
let retryCount = 0;
const MAX_RETRIES = 10;
const INITIAL_DELAY = 1000;

export async function connectRabbitMQ() {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL || '...');
    retryCount = 0; // Reset on success
    // ...
  } catch (error) {
    console.error('RabbitMQ connection failed:', error);
    
    if (retryCount < MAX_RETRIES) {
      const delay = INITIAL_DELAY * Math.pow(2, retryCount); // Exponential backoff
      retryCount++;
      setTimeout(connectRabbitMQ, delay);
    } else {
      console.error('Max RabbitMQ retries reached. Giving up.');
    }
  }
}
```

---

### 8. Background Processor Uses setInterval Without Cleanup 🟠

**File:** `services/consistency.service.ts`  
**Severity:** HIGH  
**Impact:** No graceful shutdown - interval keeps running

**Problem:**
```typescript
private startBackgroundProcessor(): void {
  setInterval(async () => {
    await this.processQueuedOperations();
  }, 5000);
  // No reference stored - can't clear on shutdown!
}
```

**Fix Required:**
```typescript
private processorInterval?: NodeJS.Timeout;

private startBackgroundProcessor(): void {
  this.processorInterval = setInterval(async () => {
    await this.processQueuedOperations();
  }, 5000);
}

public stopBackgroundProcessor(): void {
  if (this.processorInterval) {
    clearInterval(this.processorInterval);
    this.processorInterval = undefined;
  }
}
```

---

### 9. MongoDB Connection Not Initialized in RabbitMQ 🟠

**File:** `src/server.ts` and `config/rabbitmq.ts`  
**Severity:** HIGH  
**Impact:** RabbitMQ message handlers can't access MongoDB for enrichment

**Problem:**
`initializeMongoDB()` is called in server.ts but RabbitMQ doesn't have access to it

**Fix Required:**
Ensure RabbitMQ message handlers have access to MongoDB connection via dependency injection

---

## Medium Severity Issues

### 10. No Error Handling in Controllers 🟡

**Files:** `controllers/search.controller.ts`, `controllers/professional-search.controller.ts`  
**Severity:** MEDIUM  
**Impact:** Service crashes on any error

**Fix Required:**
```typescript
fastify.get('/', {
  preHandler: [authenticate, requireTenant]
}, async (request, reply) => {
  try {
    const sanitizedQuery = SearchSanitizer.sanitizeQuery(q);
    return await searchService.search(sanitizedQuery, ...);
  } catch (error) {
    request.log.error({ error }, 'Search failed');
    return reply.status(500).send({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

---

### 11. No Rate Limiting Middleware Applied 🟡

**Files:** All controllers  
**Severity:** MEDIUM  
**Impact:** No protection against abuse

**Fix Required:**
Apply rate limiting middleware from `rate-limit.middleware.ts` to all routes

---

### 12. No Validation Middleware on Professional Search 🟡

**File:** `controllers/professional-search.controller.ts`  
**Severity:** MEDIUM  
**Impact:** Invalid data can reach services

**Fix Required:**
Add Joi validation schemas and apply validation middleware

---

### 13. Port Mismatch 🟡

**Files:** `package.json` vs `server.ts`  
**Severity:** MEDIUM  
**Impact:** Confusion, documentation mismatch

**Problem:**
- `package.json` scripts suggest port 3000
- `server.ts` defaults to 3020

**Fix Required:**
Standardize on one port across all configs

---

### 14. Cross-Service Imports 🟡

**File:** `services/content-sync.service.ts`  
**Severity:** MEDIUM  
**Impact:** Tight coupling, breaks microservice architecture

**Problem:**
```typescript
import { VenueContentModel } from '../../../venue-service/src/models/mongodb/venue-content.model';
import { EventContentModel } from '../../../event-service/src/models/mongodb/event-content.model';
```

**Fix Required:**
Use shared package or API calls instead of direct imports

---

### 15. AB Testing Service Not Production Ready 🟡

**File:** `services/ab-testing.service.ts`  
**Severity:** MEDIUM  
**Impact:** Tests reset on restart, users get different variants

**Problem:**
- Uses in-memory Map
- Random assignment (no consistent hashing)
- No persistence

**Fix Required:**
- Store tests in database/Redis
- Use consistent hashing based on userId
- Persist variant assignments

---

### 16. Hardcoded Relative Path in Script 🟡

**File:** `scripts/create-indices.ts`  
**Severity:** MEDIUM  
**Impact:** Brittle, breaks if directory structure changes

**Problem:**
```typescript
const mappingPath = join(__dirname, '../../../../../../database/elasticsearch/mappings', filename);
// 7 levels up!
```

**Fix Required:**
```typescript
const mappingPath = process.env.MAPPING_PATH || join(__dirname, '../../../mappings');
```

---

### 17. No Pagination in Sync Scripts 🟡

**Files:** `scripts/sync-data.ts`, `services/content-sync.service.ts`  
**Severity:** MEDIUM  
**Impact:** Memory exhaustion on large datasets

**Problem:**
```typescript
const venues = await db('venues').select('*'); // Loads ALL into memory!
```

**Fix Required:**
```typescript
const BATCH_SIZE = 100;
let offset = 0;
let hasMore = true;

while (hasMore) {
  const venues = await db('venues').select('*').limit(BATCH_SIZE).offset(offset);
  hasMore = venues.length === BATCH_SIZE;
  offset += BATCH_SIZE;
  
  // Process batch
  for (const venue of venues) {
    await client.index({ ... });
  }
}
```

---

### 18. No Batch Processing in Sync Script 🟡

**File:** `scripts/sync-data.ts`  
**Severity:** MEDIUM  
**Impact:** Very slow, inefficient

**Problem:**
```typescript
for (const venue of venues) {
  await client.index({ index: 'venues', id: venue.id, body: venue });
  // One at a time!
}
```

**Fix Required:**
```typescript
const bulkBody = venues.flatMap(venue => [
  { index: { _index: 'venues', _id: venue.id } },
  venue
]);

await client.bulk({ body: bulkBody, refresh: true });
```

---

### 19. Elasticsearch URL Inconsistency 🟡

**Files:** `scripts/sync-content.ts` vs other files  
**Severity:** MEDIUM  
**Impact:** Configuration confusion

**Problem:**
- Most files use: `ELASTICSEARCH_NODE`
- `sync-content.ts` uses: `ELASTICSEARCH_URL`

**Fix Required:**
Standardize on `ELASTICSEARCH_NODE`

---

### 20. optimize-indices.ts Sets Replicas to 0 🟡

**File:** `scripts/optimize-indices.ts`  
**Severity:** MEDIUM  
**Impact:** No data redundancy in production

**Problem:**
```typescript
number_of_replicas: 0 // Only for single node development!
```

**Fix Required:**
```typescript
number_of_replicas: process.env.NODE_ENV === 'production' ? 1 : 0
```

---

### 21-25. Additional Medium Issues 🟡

21. **Missing Tests Directory** - Jest config references tests but directory doesn't exist
22. **Silent Failures in Analytics** - `trackSearch()` errors not surfaced
23. **Personalization Not Implemented** - `personalizeResults()` is a stub
24. **RabbitMQ Logs to Console** - Uses `console.log` instead of logger
25. **No Logging for Missing Tables** - Ticket enrichment silently skips missing tables

---

## Low Severity Issues

### 26-35. Code Smells & Minor Improvements 🟢

26. **Duplicate DEFAULT_TENANT_ID** - Hardcoded in two files
27. **No Index Alias Usage** - Can't do zero-downtime reindexing
28. **Commented Out Import** - Dead code in professional-search controller
29. **No Request ID Propagation** - Hard to trace requests
30. **No Elasticsearch Health Check** - Can't monitor via API
31. **No Redis Health Check** - Can't monitor via API
32. **No MongoDB Health Check** - Can't monitor via API
33. **Search Boost Not Configurable** - Hardcoded boost values
34. **No Metrics Endpoint** - Prometheus metrics not exposed
35. **No Circuit Breaker** - Will hammer failed services

### 36-45. Additional Low Priority Issues 🟢

36. No retry logic for Elasticsearch operations
37. No connection pooling configuration for MongoDB
38. No cleanup of expired consistency tokens
39. No index lifecycle management (ILM)
40. No search query logging for debugging
41. No cache warming strategy
42. No A/B test result tracking
43. No search relevance feedback loop
44. No query performance tracking per field
45. No index optimization scheduling

---

## Priority Fix Order

### 🚨 FIX IMMEDIATELY (Blocks Service Start)

1. **#6**: Syntax error in server.ts - service won't start
2. **#5**: Database env var inconsistency - service won't connect

### 🔒 FIX BEFORE ANY RELEASE (Security - Data Leak Risk)

3. **#1**: Tenant filtering in autocomplete service
4. **#2**: Tenant filtering in professional search service
5. **#3**: Input sanitization in professional search controller
6. **#4**: Tenant middleware in professional search routes

### ⚠️ FIX BEFORE PRODUCTION (Stability)

7. **#7**: RabbitMQ infinite retry loop
8. **#8**: Background processor cleanup
9. **#10**: Error handling in controllers
10. **#11**: Apply rate limiting middleware

### 📋 FIX SOON (Quality & Performance)

11-25: All remaining medium severity issues

### 🔧 FIX WHEN TIME PERMITS (Nice to Have)

26-45: All low severity issues

---

**END OF PROBLEMS DOCUMENT**

Generated: January 2025  
Total Issues: 45  
Critical: 4 | High: 5 | Medium: 16 | Low: 20
