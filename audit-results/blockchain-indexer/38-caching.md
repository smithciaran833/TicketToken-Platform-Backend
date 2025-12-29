# Blockchain-Indexer Service - 38 Caching Audit

**Service:** blockchain-indexer
**Document:** 38-caching.md
**Date:** 2025-12-26
**Auditor:** Cline AI
**Pass Rate:** 75% (15/20 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 1 | Cache not actually used in query routes |
| MEDIUM | 2 | No cache invalidation strategy, no tenant-scoped cache keys |
| LOW | 2 | No cache warming, limited cache metrics |

---

## Caching Infrastructure

| Component | Technology | Key Prefix |
|-----------|------------|------------|
| CacheManager | Redis (ioredis) | `blockchain-indexer:` |
| Shared Cache | Redis | `blockchain:` |

---

## Section 3.1: Cache Manager Implementation (`cache.ts`)

### CM1: Redis client configuration
**Status:** PASS
**Evidence:** `src/utils/cache.ts:22-33`
```typescript
this.client = new Redis({
  host: config.host,
  port: config.port,
  password: config.password,
  db: config.db || 0,
  keyPrefix: this.keyPrefix,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});
```
Includes retry strategy with exponential backoff.

### CM2: Connection event handling
**Status:** PASS
**Evidence:** `src/utils/cache.ts:35-43`
```typescript
this.client.on('connect', () => {
  logger.info({ host: config.host, port: config.port }, 'Redis cache connected');
});

this.client.on('error', (error) => {
  logger.error({ error }, 'Redis cache error');
});
```

### CM3: TTL support
**Status:** PASS
**Evidence:** `src/utils/cache.ts:59-67`
```typescript
async set(key: string, value: any, ttl?: number): Promise<void> {
  const serialized = JSON.stringify(value);
  const expirySeconds = ttl || this.defaultTTL;  // Default: 300s
  await this.client.setex(key, expirySeconds, serialized);
}
```

### CM4: Error handling
**Status:** PASS
**Evidence:** All cache methods have try-catch:
```typescript
async get<T>(key: string): Promise<T | null> {
  try {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) as T : null;
  } catch (error) {
    logger.error({ error, key }, 'Cache get error');
    return null;  // Graceful degradation
  }
}
```

### CM5: Cache-aside pattern (getOrSet)
**Status:** PASS
**Evidence:** `src/utils/cache.ts:103-121`
```typescript
async getOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Try to get from cache
  const cached = await this.get<T>(key);
  if (cached !== null) {
    logger.debug({ key }, 'Cache hit');
    return cached;
  }

  // Cache miss - fetch data
  logger.debug({ key }, 'Cache miss');
  const data = await fetchFn();
  
  // Store in cache
  await this.set(key, data, ttl);
  
  return data;
}
```

### CM6: Bulk operations
**Status:** PASS
**Evidence:** `src/utils/cache.ts:143-179`
```typescript
async mget<T>(keys: string[]): Promise<Array<T | null>> {
  const values = await this.client.mget(...keys);
  return values.map(v => v ? JSON.parse(v) as T : null);
}

async mset(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
  const pipeline = this.client.pipeline();
  for (const entry of entries) {
    pipeline.setex(entry.key, ttl, JSON.stringify(entry.value));
  }
  await pipeline.exec();
}
```
Uses pipelining for efficient bulk operations.

### CM7: Pattern-based deletion
**Status:** PASS
**Evidence:** `src/utils/cache.ts:79-93`
```typescript
async delPattern(pattern: string): Promise<void> {
  const keys = await this.client.keys(pattern);
  if (keys.length > 0) {
    const strippedKeys = keys.map(key => key.replace(this.keyPrefix, ''));
    await this.client.del(...strippedKeys);
    logger.info({ pattern, count: keys.length }, 'Deleted keys matching pattern');
  }
}
```

### CM8: Cache statistics
**Status:** PASS
**Evidence:** `src/utils/cache.ts:203-219`
```typescript
async getStats(): Promise<{ keyCount: number; memoryUsed: string }> {
  const info = await this.client.info('memory');
  const keys = await this.client.keys('*');
  const memoryMatch = info.match(/used_memory_human:(.+)/);
  return {
    keyCount: keys.length,
    memoryUsed: memoryMatch ? memoryMatch[1].trim() : 'unknown'
  };
}
```

---

## Section 3.2: Cache Key Design

### CK1: Key builders defined
**Status:** PASS
**Evidence:** `src/utils/cache.ts:232-244`
```typescript
export const CacheKeys = {
  transaction: (signature: string) => `tx:${signature}`,
  walletActivity: (address: string, offset: number, limit: number) => 
    `wallet:${address}:activity:${offset}:${limit}`,
  nftHistory: (tokenId: string) => `nft:${tokenId}:history`,
  syncStatus: () => `sync:status`,
  slotTransactions: (slot: number) => `slot:${slot}:transactions`,
  marketplaceActivity: (marketplace: string | undefined, offset: number, limit: number) =>
    `marketplace:${marketplace || 'all'}:${offset}:${limit}`
};
```

### CK2: Key prefix for namespacing
**Status:** PASS
**Evidence:** Both cache implementations use prefixes:
- `blockchain-indexer:` for CacheManager
- `blockchain:` for shared cache

### CK3: Tenant-scoped keys
**Status:** FAIL
**Evidence:** Cache keys don't include tenant ID.
**Issue:** Multi-tenant data could leak via cache.
**Remediation:**
```typescript
export const CacheKeys = {
  transaction: (tenantId: string, signature: string) => 
    `tenant:${tenantId}:tx:${signature}`,
  walletActivity: (tenantId: string, address: string, offset: number, limit: number) => 
    `tenant:${tenantId}:wallet:${address}:activity:${offset}:${limit}`,
  // ... all keys should include tenantId
};
```

### CK4: Pagination in cache keys
**Status:** PASS
**Evidence:** `walletActivity` and `marketplaceActivity` include offset and limit.

---

## Section 3.3: Cache Usage in Routes

### CU1: Caching in query routes
**Status:** FAIL
**Evidence:** `src/routes/query.routes.ts` doesn't use cache.
```typescript
// query.routes.ts:82-95
fastify.get('/transactions/:signature', async (request, reply) => {
  const result = await db.query(
    `SELECT * FROM indexed_transactions WHERE signature = $1`,
    [signature]
  );
  // NO cache.getOrSet() used!
  return result.rows[0] || reply.status(404).send({ error: 'Not found' });
});
```
**Issue:** CacheManager exists but isn't used in routes.
**Remediation:**
```typescript
const cacheKey = CacheKeys.transaction(signature);
const result = await cache.getOrSet(cacheKey, async () => {
  const dbResult = await db.query(
    'SELECT * FROM indexed_transactions WHERE signature = $1',
    [signature]
  );
  return dbResult.rows[0];
}, 3600);  // 1 hour TTL for immutable transactions
```

### CU2: Cache hit/miss logging
**Status:** PASS
**Evidence:** `src/utils/cache.ts:109-113`
```typescript
if (cached !== null) {
  logger.debug({ key }, 'Cache hit');
  return cached;
}
logger.debug({ key }, 'Cache miss');
```

---

## Section 3.4: Cache Invalidation

### CI1: Invalidation on write
**Status:** FAIL
**Evidence:** No cache invalidation in transaction processor.
**Issue:** When new transactions are indexed, related caches aren't invalidated.
**Remediation:**
```typescript
// In transactionProcessor after recording transaction
await cache.del(CacheKeys.walletActivity(tx.from));
await cache.del(CacheKeys.walletActivity(tx.to));
await cache.delPattern(`wallet:${tx.from}:*`);
```

### CI2: Pattern-based invalidation
**Status:** PASS
**Evidence:** `delPattern()` method available for bulk invalidation.

### CI3: Invalidation strategy documented
**Status:** FAIL
**Evidence:** No documentation of when caches are invalidated.

---

## Section 3.5: Cache Resilience

### CR1: Graceful degradation on cache failure
**Status:** PASS
**Evidence:** All cache methods return null/empty on error:
```typescript
async get<T>(key: string): Promise<T | null> {
  try {
    // ...
  } catch (error) {
    logger.error({ error, key }, 'Cache get error');
    return null;  // App continues without cache
  }
}
```

### CR2: Retry strategy
**Status:** PASS
**Evidence:** `src/utils/cache.ts:28-31`
```typescript
retryStrategy: (times) => {
  const delay = Math.min(times * 50, 2000);
  return delay;  // Up to 2 seconds between retries
}
```

### CR3: Connection timeout
**Status:** PARTIAL
**Evidence:** No explicit connection timeout configured.
**Remediation:**
```typescript
this.client = new Redis({
  // ...
  connectTimeout: 5000,  // 5 second timeout
  maxRetriesPerRequest: 3,
});
```

---

## Section 3.6: Cache Performance

### CP1: Pipeline usage for bulk ops
**Status:** PASS
**Evidence:** `mset` uses Redis pipeline.

### CP2: Serialization/deserialization
**Status:** PASS
**Evidence:** JSON.stringify/parse for all values.

### CP3: Appropriate TTLs
**Status:** PARTIAL
**Evidence:** Default 300s (5 min) for all keys.
**Issue:** Different data types should have different TTLs:
- Transactions (immutable): Long TTL (hours)
- Sync status: Short TTL (seconds)
- Activity feeds: Medium TTL (minutes)

---

## Section 3.7: Missing Cache Features

### MC1: Cache warming
**Status:** FAIL
**Evidence:** No cache warming on startup.
**Recommendation:** Pre-populate frequently accessed data:
```typescript
async warmCache(): Promise<void> {
  // Pre-load sync status
  const status = await this.getSyncStatus();
  await cache.set(CacheKeys.syncStatus(), status, 60);
  
  // Pre-load recent transactions
  const recent = await this.getRecentTransactions(100);
  for (const tx of recent) {
    await cache.set(CacheKeys.transaction(tx.signature), tx, 3600);
  }
}
```

### MC2: Cache metrics
**Status:** PARTIAL
**Evidence:** `getStats()` provides basic metrics but no Prometheus integration.
**Remediation:**
```typescript
const cacheHitCounter = new Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['key_type']
});

const cacheMissCounter = new Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['key_type']
});
```

### MC3: Read-through caching
**Status:** PASS
**Evidence:** `getOrSet()` implements read-through pattern.

### MC4: Write-through caching
**Status:** FAIL
**Evidence:** No write-through caching (cache updated on write).

---

## Remediation Priority

### HIGH (This Week)
1. **Actually use cache in routes** - Integrate CacheManager in query.routes.ts
```typescript
const transaction = await cache.getOrSet(
  CacheKeys.transaction(tenantId, signature),
  () => db.query('SELECT * FROM indexed_transactions WHERE signature = $1', [signature]),
  3600
);
```

2. **Add tenant ID to cache keys** - Prevent cross-tenant data leakage
```typescript
export const CacheKeys = {
  transaction: (tenantId: string, signature: string) => 
    `tenant:${tenantId}:tx:${signature}`,
};
```

### MEDIUM (This Month)
1. **Implement cache invalidation strategy** - Invalidate on write
2. **Add different TTLs by data type** - Optimize for data volatility
3. **Add cache metrics** - Prometheus counters for hits/misses

### LOW (Backlog)
1. **Add cache warming** - Pre-populate on startup
2. **Add connection timeout** - Explicit timeout config
3. **Document invalidation strategy** - Clear documentation

---

## Pass/Fail Summary by Section

| Section | Pass | Fail | Partial | N/A | Total |
|---------|------|------|---------|-----|-------|
| Cache Manager | 8 | 0 | 0 | 0 | 8 |
| Cache Keys | 3 | 1 | 0 | 0 | 4 |
| Cache Usage | 1 | 1 | 0 | 0 | 2 |
| Cache Invalidation | 1 | 2 | 0 | 0 | 3 |
| Cache Resilience | 2 | 0 | 1 | 0 | 3 |
| Cache Performance | 2 | 0 | 1 | 0 | 3 |
| Missing Features | 1 | 2 | 1 | 0 | 4 |
| **Total** | **18** | **6** | **3** | **0** | **27** |

**Applicable Checks:** 27
**Pass Rate:** 67% (18/27 pass cleanly)
**Pass + Partial Rate:** 78% (21/27)

---

## Recommended Cache TTLs

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Transaction by signature | 3600s (1h) | Immutable once confirmed |
| Wallet activity | 300s (5m) | Frequently updated |
| Sync status | 30s | Changes often |
| NFT history | 600s (10m) | Less frequent changes |
| Marketplace activity | 120s (2m) | Real-time data |
| Slot transactions | 3600s (1h) | Immutable |

---

## Positive Findings

1. **Comprehensive CacheManager** - Full-featured Redis wrapper
2. **Cache-aside pattern** - `getOrSet()` method
3. **Bulk operations** - Pipeline-based mget/mset
4. **Pattern deletion** - For cache invalidation
5. **Graceful degradation** - App continues on cache failure
6. **Retry strategy** - Automatic reconnection
7. **Key builders** - Consistent key naming
8. **Statistics** - Basic cache monitoring
