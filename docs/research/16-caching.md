# Caching Strategies and Patterns: Production Readiness Audit

## Document Information
- **Purpose**: Production readiness verification for caching implementations
- **Target Systems**: Redis, multi-tenant data, session data, API responses
- **Research Date**: December 2025

---

## 1. Standards & Best Practices

### 1.1 Cache-Aside Pattern (Lazy Loading)

The cache-aside pattern is the most widely adopted caching strategy where the application manages cache interactions directly, keeping the cache "aside" from the database.

**How It Works:**
1. Application checks the cache for requested data
2. On cache hit: return cached data immediately
3. On cache miss: query the database, store result in cache, return to caller
4. On data update: update database, then invalidate/update cache

**Implementation Requirements:**
- Application code explicitly manages both cache and database interactions
- Cache only contains data that has been requested (demand-driven)
- Must handle cache failures gracefully (fallback to database)

**Best Practices:**
- Use distributed caching (Redis) for multi-instance deployments to maintain consistency
- Implement proper error handling when cache is unavailable
- Consider cache warming for predictably hot data
- Set appropriate TTLs based on data volatility

**Real-World Examples:**
- Netflix uses EVCache (built on Memcached) for content metadata
- Facebook uses Memcached combined with TAO for social graph data

*Sources:*
- https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
- https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html
- https://www.geeksforgeeks.org/system-design/cache-aside-pattern/

---

### 1.2 Write-Through vs Write-Behind (Write-Back)

#### Write-Through Cache

Data is written to both cache and database simultaneously before confirming the operation.

**Characteristics:**
- Strong data consistency between cache and database
- Higher write latency (must wait for both writes)
- Data durability guaranteed—survives system failures
- Best for: read-heavy workloads with infrequent writes, critical data requiring consistency

**Trade-offs:**
- Write latency penalty
- Database can become bottleneck under high write load
- Simpler to implement than write-behind

#### Write-Behind (Write-Back) Cache

Data is written to cache first, acknowledged immediately, then asynchronously written to database.

**Characteristics:**
- Lower write latency (immediate acknowledgment)
- Risk of data loss if cache fails before database sync
- Temporary inconsistency between cache and database
- Best for: write-heavy workloads, non-critical data, when write performance is crucial

**Implementation Considerations:**
- Use time-based delay or batching for database writes
- Implement conflation (combining multiple updates to same key)
- Configure proper failure handling and retry logic
- Consider using persistent queues for pending writes

**Comparison Summary:**

| Aspect | Write-Through | Write-Behind |
|--------|---------------|--------------|
| Consistency | Strong | Eventual |
| Write Latency | Higher | Lower |
| Data Durability | High | Risk of loss |
| Implementation | Simpler | More complex |
| Best For | Critical data | High write volume |

*Sources:*
- https://www.enjoyalgorithms.com/blog/write-behind-caching-pattern/
- https://codeahoy.com/2017/08/11/caching-strategies-and-how-to-choose-the-right-one/
- https://redisson.pro/glossary/write-through-and-write-behind-caching.html

---

### 1.3 Cache Invalidation Strategies

Cache invalidation ensures stale data is removed or updated. There are three main approaches:

#### Time-Based Invalidation (TTL)

Each cached item has an expiration time after which it's automatically invalidated.

**Best Practices:**
- Static/reference data: longer TTLs (hours to days)
- Dynamic data: shorter TTLs matching update frequency
- Add jitter (5-10% randomization) to prevent synchronized expiration
- Read-heavy infrequent updates: 5-60 minute TTLs (95%+ cache hit rates)
- Frequently updated data: 1-10 second TTLs

**Example TTL Guidelines:**
```
Session data: 30 minutes - 24 hours
API responses: 1-15 minutes
Product catalog: 1-24 hours
User profiles: 1-12 hours
Static assets: 1 week - 1 year
```

#### Event-Based Invalidation

Cache is invalidated in response to specific data change events.

**Implementation Methods:**
- Database triggers or ORM hooks
- Message queue/event bus integration
- Application-level invalidation on write operations

**Best Practices:**
- Use for critical data requiring immediate consistency
- Implement cascading invalidation for related data
- Combine with TTL as a safety net for missed events

#### Hybrid Approach

Combine TTL with event-driven invalidation:
- Event-driven for critical, frequently accessed data
- TTL as backup for missed invalidation events
- Meta's TAO system uses short TTLs as safety net even with event-driven invalidation

*Sources:*
- https://leapcell.io/blog/cache-invalidation-strategies-time-based-vs-event-driven
- https://redis.io/glossary/cache-invalidation/
- https://daily.dev/blog/cache-invalidation-vs-expiration-best-practices

---

### 1.4 TTL Configuration Best Practices

**General Guidelines:**
- Always set TTL for cache entries—keys without TTL can cause memory exhaustion
- Match TTL to data volatility and business requirements
- Use millisecond precision (PEXPIRE) for time-sensitive operations
- Combine SET with expiration atomically: `SET key value EX seconds NX`

**Recommended TTLs by Data Type:**

| Data Type | Recommended TTL | Rationale |
|-----------|-----------------|-----------|
| Sessions | 30 min - 24 hours | Balance security with UX |
| Auth tokens | 15 min - 1 hour | Short-lived for security |
| API responses | 1-15 minutes | Depends on data freshness needs |
| Product data | 1-24 hours | Moderate change frequency |
| Static config | 1 hour - 1 day | Rarely changes |
| Rate limit counters | 1-60 seconds | Window-based |
| Distributed locks | 10-30 seconds | Prevent deadlocks |

**Redis TTL Commands:**
```redis
EXPIRE key seconds        # Set TTL in seconds
PEXPIRE key milliseconds  # Set TTL in milliseconds
EXPIREAT key timestamp    # Set absolute expiration
TTL key                   # Check remaining TTL
PERSIST key               # Remove TTL (make permanent)
```

**Important Notes:**
- Redis active expiration samples keys randomly—up to 25% of expired keys may persist briefly
- Redis 6+ improved expiration algorithm reduces "hidden memory" from expired keys
- Monitor memory pressure and test with TTL-heavy workloads

*Sources:*
- https://redis.io/docs/latest/commands/expire/
- https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/cache-validity.html
- https://redis.io/kb/doc/1fqjridk8w/what-are-the-impacts-of-the-redis-expiration-algorithm

---

### 1.5 Cache Key Design

**Naming Conventions:**

Use hierarchical, namespace-prefixed keys with colon separators:
```
{namespace}:{entity}:{identifier}:{attribute}

Examples:
tenant:t123:user:456:profile
api:v1:products:all
session:abc123def
rate_limit:user:789:minute
```

**Best Practices:**
1. **Use namespace prefixes** for application/service isolation
2. **Include version identifiers** for cache-busting during deployments
3. **Keep keys under 1KB** (ideally under 200 bytes)
4. **Avoid special characters** in keys (spaces, quotes, slashes)
5. **Use consistent patterns** across the application
6. **Include tenant ID first** in multi-tenant systems

**Multi-Tenant Key Patterns:**
```javascript
// Standard prefix pattern
`tenant:${tenantId}:${category}:${identifier}`

// Example
tenant:acme-corp:products:inventory

// Hashed keys for sensitive data
const hash = sha256(`${tenantId}:${category}:${identifier}`);
`cache:${base64(hash)}`
```

**Key Design Anti-Patterns:**
- ❌ Generic keys without namespace: `user:123`
- ❌ Including sensitive data in keys
- ❌ Overly long keys impacting memory
- ❌ Inconsistent delimiter usage
- ❌ Missing version/environment prefix

*Sources:*
- https://redis.io/blog/5-key-takeaways-for-developing-with-redis/
- https://medium.com/nerd-for-tech/unveiling-the-art-of-redis-key-naming-best-practices-6e20f3839e4a
- https://www.w3schools.io/nosql/redis-keys-naming-convention/

---

### 1.6 Distributed Caching with Redis

**Architecture Best Practices:**

1. **Network Security:**
   - Never expose Redis directly to the internet
   - Deploy within private VPC/VNet
   - Use TLS encryption for data in transit (Redis 6+)
   - Configure firewall rules to restrict access

2. **Authentication & Authorization:**
   - Enable Redis AUTH with strong passwords
   - Use ACLs (Redis 6+) for fine-grained access control
   - Create per-tenant users with key-prefix restrictions
   - Rotate credentials periodically

3. **High Availability:**
   - Use Redis Sentinel for automatic failover
   - Deploy Redis Cluster for horizontal scaling
   - Configure appropriate replication

4. **Memory Management:**
   - Set `maxmemory` limit appropriately
   - Configure eviction policy (e.g., `volatile-lru`, `allkeys-lru`)
   - Monitor memory usage with alerts

**Multi-Tenant Isolation Strategies:**

| Approach | Isolation Level | Pros | Cons |
|----------|-----------------|------|------|
| Key prefixing | Logical | Scales well, simple | Application-enforced |
| Redis databases (0-15) | Logical | Built-in separation | Limited to 16, no ACL per DB |
| Separate instances | Physical | Complete isolation | Higher cost/complexity |
| ACLs with key patterns | Logical + Access control | Fine-grained permissions | Requires Redis 6+ |

**Recommended Configuration:**
```redis
# redis.conf security settings
requirepass your-strong-password
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG ""
rename-command DEBUG ""
tls-port 6380
tls-cert-file /path/to/cert.pem
tls-key-file /path/to/key.pem
```

*Sources:*
- https://redis.io/docs/latest/operate/oss_and_stack/management/security/
- https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/service/cache-redis
- https://medium.com/@okanyildiz1994/mastering-redis-security-an-in-depth-guide-to-best-practices-and-configuration-strategies-df12271062be

---

### 1.7 Cache Stampede Prevention

A cache stampede (thundering herd) occurs when many concurrent requests try to regenerate expired cache simultaneously, overwhelming the database.

**Prevention Strategies:**

#### 1. Request Coalescing (Distributed Locking)

Only one request regenerates the cache; others wait for completion.

```javascript
async function getWithLock(key) {
  let value = await cache.get(key);
  if (value) return value;
  
  // Try to acquire lock
  const lockKey = `lock:${key}`;
  const acquired = await cache.set(lockKey, '1', 'NX', 'EX', 30);
  
  if (acquired) {
    try {
      value = await database.query(key);
      await cache.set(key, value, 'EX', TTL);
    } finally {
      await cache.del(lockKey);
    }
  } else {
    // Wait and retry from cache
    await sleep(50);
    return getWithLock(key);
  }
  return value;
}
```

**Lock timeout is critical**—set slightly longer than worst-case query time.

#### 2. Probabilistic Early Expiration

Randomly refresh items before they expire, with probability increasing as expiration approaches.

```javascript
function shouldRefresh(timeUntilExpiry, originalTTL, beta = 1.0) {
  return (timeUntilExpiry / originalTTL) < Math.random() * beta;
}

// XFetch algorithm
async function xfetch(key, ttl, beta = 1.0) {
  const { value, delta, expiry } = await cache.getWithMeta(key);
  
  if (!value || (Date.now() - delta * beta * Math.log(Math.random())) >= expiry) {
    const start = Date.now();
    const newValue = await recompute();
    const newDelta = Date.now() - start;
    await cache.set(key, { value: newValue, delta: newDelta }, ttl);
    return newValue;
  }
  return value;
}
```

#### 3. Background Refresh

External process refreshes cache before expiration.

**Best For:** Ultra-critical paths (e.g., Netflix homepage recommendations)

#### 4. Stale-While-Revalidate

Serve stale data immediately while refreshing in background.

```http
Cache-Control: max-age=300, stale-while-revalidate=60
```

**Decision Matrix:**

| Question | If Yes | If No |
|----------|--------|-------|
| Can DB handle full load if cache fails? | Any strategy | Must have request coalescing |
| Can you tolerate occasional slow requests? | Probabilistic works | Need locking |
| Predictable traffic spikes? | Pre-warm cache | Standard strategies |

*Sources:*
- https://howtech.substack.com/p/thundering-herd-problem-cache-stampede
- https://en.wikipedia.org/wiki/Cache_stampede
- https://distributed-computing-musings.com/2025/08/thundering-herd-problem-preventing-the-stampede/

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Caching Sensitive Data

**Risk:** Exposing PII, credentials, financial data, or health records through cache.

**OWASP Guidelines (A3:2017 - Sensitive Data Exposure):**
- Disable caching for responses containing sensitive data
- Classify data by sensitivity level
- Don't store sensitive data unnecessarily

**What Should NEVER Be Cached:**
- Passwords or password hashes
- Full credit card numbers
- Social Security Numbers / National IDs
- Authentication tokens in shared caches
- Unencrypted PII
- Session data with PII in shared/public caches
- Medical/health records
- Encryption keys

**Mitigation:**
```http
# Response headers for sensitive data
Cache-Control: no-store, no-cache, must-revalidate, private
Pragma: no-cache
```

```javascript
// Application-level protection
if (containsSensitiveData(response)) {
  response.setHeader('Cache-Control', 'no-store');
}
```

*Sources:*
- https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure
- https://owasp.org/www-project-mobile-top-10/2023-risks/m9-insecure-data-storage

---

### 2.2 Missing Cache Invalidation

**Symptoms:**
- Users see stale data after updates
- Inconsistencies between cache and database
- "Ghost" data persists after deletion

**Common Causes:**
- Forgetting to invalidate on write operations
- Missing invalidation for cascading updates
- Out-of-band database modifications bypassing cache logic
- Microservices updating shared data without notification

**Prevention:**
1. **Centralize cache invalidation logic** in a service/module
2. **Use event-driven architecture** for invalidation triggers
3. **Implement TTL as safety net** even with explicit invalidation
4. **Audit all write paths** to ensure invalidation coverage
5. **Log invalidation events** for debugging

```javascript
// Pattern: Invalidation decorator
async function updateUser(userId, data) {
  await database.update(userId, data);
  
  // Invalidate all related cache entries
  await cache.del(`user:${userId}:profile`);
  await cache.del(`user:${userId}:settings`);
  await cache.del(`team:${data.teamId}:members`);  // Cascading
}
```

---

### 2.3 Cache Poisoning

**Attack Vector:** Attacker injects malicious content into cache that gets served to legitimate users.

**Types:**
1. **Web Cache Poisoning:** Manipulating HTTP requests to cache malicious responses
2. **DNS Cache Poisoning:** Falsifying DNS records in resolver cache

**Web Cache Poisoning Mechanism:**
- Attacker identifies unkeyed inputs (headers, cookies) that affect response
- Crafts request that generates malicious response
- Malicious response gets cached with legitimate cache key
- All subsequent users receive poisoned response

**Prevention:**

1. **Cache only static content** or carefully validated dynamic content
2. **Normalize cache keys** to prevent variations
3. **Validate all user input** before including in responses
4. **Use Cache-Control headers** appropriately:
   ```http
   Cache-Control: private  # For user-specific data
   Cache-Control: no-store # For sensitive/dynamic data
   ```
5. **Strip unnecessary headers** from cache key consideration
6. **Only cache GET/HEAD requests**—never cache POST responses by default
7. **Reject GET requests with body**
8. **Use WAF** to detect cache poisoning attempts

**CDN-Specific:**
- Disable error page caching
- Configure CDN to validate origin responses
- Monitor for Cache Poisoned Denial of Service (CPDoS)

*Sources:*
- https://portswigger.net/web-security/web-cache-poisoning
- https://developers.cloudflare.com/cache/cache-security/avoid-web-poisoning/
- https://snyk.io/blog/how-to-avoid-web-cache-poisoning-attacks/

---

### 2.4 Inconsistent Cache Keys

**Symptoms:**
- Cache misses despite data being cached
- Duplicate cache entries for same data
- Memory waste from redundant entries

**Common Causes:**
- Case sensitivity issues (`User:123` vs `user:123`)
- Different parameter ordering (`user:123:profile` vs `profile:user:123`)
- Missing or inconsistent tenant prefixes
- URL encoding differences
- Trailing slashes or whitespace

**Prevention:**
```javascript
// Centralized key generation
class CacheKeyBuilder {
  static forUser(tenantId, userId, attribute) {
    return `tenant:${tenantId.toLowerCase()}:user:${userId}:${attribute}`;
  }
  
  static forApi(version, resource, params) {
    const sortedParams = Object.keys(params).sort()
      .map(k => `${k}=${params[k]}`).join(':');
    return `api:${version}:${resource}:${sortedParams}`;
  }
}
```

**Best Practices:**
1. **Create key builder utility** used everywhere
2. **Normalize inputs** (lowercase, trim, sort params)
3. **Unit test key generation** for consistency
4. **Document key format** for each cached entity

---

### 2.5 No TTL (Stale Data Forever)

**Risk:** Memory exhaustion and serving indefinitely stale data.

**Symptoms:**
- Redis memory grows unbounded
- Old data persists after deletion from database
- Performance degradation as dataset grows

**Common Causes:**
- Developer oversight during implementation
- Using `SET` without `EX` option
- Framework defaults not setting TTL

**Prevention:**
```javascript
// ❌ Bad - No TTL
await cache.set('user:123', userData);

// ✅ Good - Always set TTL
await cache.set('user:123', userData, 'EX', 3600);

// ✅ Better - Atomic with NX
await cache.set('user:123', userData, 'EX', 3600, 'NX');
```

**Monitoring:**
```redis
# Find keys without TTL
redis-cli --scan | while read key; do
  ttl=$(redis-cli TTL "$key")
  if [ "$ttl" -eq -1 ]; then
    echo "$key has no TTL"
  fi
done
```

**Enforcement:**
- Code review checklist item
- Static analysis rules
- Runtime monitoring for keys with TTL=-1

---

### 2.6 Cache Stampede on Expiry

See Section 1.7 for detailed prevention strategies.

**Key Indicators:**
- Database load spikes at regular intervals
- Correlated cache TTLs across keys
- Latency spikes when popular keys expire

**Quick Fixes:**
1. Add jitter to TTLs: `TTL = baseTTL + random(0, baseTTL * 0.1)`
2. Implement locking for high-traffic keys
3. Use probabilistic early expiration
4. Pre-warm cache before expected traffic spikes

---

## 3. Audit Checklist

### 3.1 Redis Infrastructure Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| R1 | Redis not exposed to public internet | ☐ | |
| R2 | Redis AUTH enabled with strong password | ☐ | |
| R3 | ACLs configured for application users (Redis 6+) | ☐ | |
| R4 | TLS encryption enabled for data in transit | ☐ | |
| R5 | Dangerous commands disabled/renamed (FLUSHALL, CONFIG, DEBUG) | ☐ | |
| R6 | `maxmemory` limit configured | ☐ | |
| R7 | Eviction policy set appropriately | ☐ | |
| R8 | Redis deployed in private subnet/VPC | ☐ | |
| R9 | Firewall rules restrict access to app servers only | ☐ | |
| R10 | Redis version is current (security patches) | ☐ | |
| R11 | Persistence configured appropriately (RDB/AOF) | ☐ | |
| R12 | High availability setup (Sentinel/Cluster) for production | ☐ | |
| R13 | Monitoring and alerting configured | ☐ | |
| R14 | Connection pooling implemented in application | ☐ | |
| R15 | Credentials stored securely (not in code) | ☐ | |

---

### 3.2 Multi-Tenant Data Isolation

| # | Check | Status | Notes |
|---|-------|--------|-------|
| MT1 | Tenant ID included in all cache keys | ☐ | |
| MT2 | Key prefix enforced at framework/middleware level | ☐ | |
| MT3 | No cross-tenant data access possible | ☐ | |
| MT4 | ACLs restrict users to tenant key patterns | ☐ | |
| MT5 | SCAN/KEYS operations scoped to tenant prefix | ☐ | |
| MT6 | Tenant isolation verified with integration tests | ☐ | |
| MT7 | Bulk operations (FLUSHDB) disabled for app users | ☐ | |
| MT8 | Tenant data cannot leak through error messages | ☐ | |
| MT9 | Cache key generation centralized (not scattered) | ☐ | |
| MT10 | Noisy neighbor protection (memory/rate limits) | ☐ | |

---

### 3.3 Session Data Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| S1 | Session IDs are cryptographically random | ☐ | |
| S2 | Session TTL configured (not infinite) | ☐ | |
| S3 | Session invalidation on logout implemented | ☐ | |
| S4 | Session data encrypted at rest (if sensitive) | ☐ | |
| S5 | Session fixation prevention in place | ☐ | |
| S6 | Session regeneration after privilege changes | ☐ | |
| S7 | Inactive session timeout configured | ☐ | |
| S8 | Concurrent session limits enforced (if required) | ☐ | |
| S9 | Session data minimized (no unnecessary PII) | ☐ | |
| S10 | Session store failures handled gracefully | ☐ | |
| S11 | Session keys prefixed uniquely per application | ☐ | |
| S12 | Session data serialization is secure (no injection) | ☐ | |
| S13 | Remote session invalidation capability exists | ☐ | |
| S14 | Session activity logging for security audit | ☐ | |

---

### 3.4 API Response Caching

| # | Check | Status | Notes |
|---|-------|--------|-------|
| A1 | Cache-Control headers set appropriately | ☐ | |
| A2 | Private data uses `Cache-Control: private` | ☐ | |
| A3 | Sensitive data uses `Cache-Control: no-store` | ☐ | |
| A4 | ETag or Last-Modified headers implemented | ☐ | |
| A5 | Conditional requests (304) supported | ☐ | |
| A6 | Vary header used for content negotiation | ☐ | |
| A7 | Only GET/HEAD responses cached | ☐ | |
| A8 | Cache key includes all relevant parameters | ☐ | |
| A9 | User-specific data not in shared cache | ☐ | |
| A10 | Cache invalidation triggered on mutations | ☐ | |
| A11 | CDN cache-control directives configured | ☐ | |
| A12 | Error responses not cached (or short TTL) | ☐ | |
| A13 | API versioning reflected in cache keys | ☐ | |

---

### 3.5 Cache Implementation Verification

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C1 | All cache entries have TTL set | ☐ | |
| C2 | TTLs appropriate for data volatility | ☐ | |
| C3 | TTL jitter implemented to prevent stampedes | ☐ | |
| C4 | Cache stampede prevention in place | ☐ | |
| C5 | Cache key naming convention documented | ☐ | |
| C6 | Cache key generation centralized | ☐ | |
| C7 | Keys normalized (case, encoding, ordering) | ☐ | |
| C8 | Cache failures don't crash application | ☐ | |
| C9 | Fallback to database on cache miss | ☐ | |
| C10 | Circuit breaker for cache failures | ☐ | |
| C11 | Cache hit/miss metrics collected | ☐ | |
| C12 | Cache size/memory monitored | ☐ | |
| C13 | Serialization format efficient and secure | ☐ | |
| C14 | Large values handled appropriately | ☐ | |

---

### 3.6 Cache Invalidation Verification

| # | Check | Status | Notes |
|---|-------|--------|-------|
| I1 | Invalidation triggered on CREATE operations | ☐ | |
| I2 | Invalidation triggered on UPDATE operations | ☐ | |
| I3 | Invalidation triggered on DELETE operations | ☐ | |
| I4 | Cascading invalidation for related entities | ☐ | |
| I5 | Event-driven invalidation for real-time needs | ☐ | |
| I6 | TTL backup for missed invalidation events | ☐ | |
| I7 | Invalidation covers all write paths | ☐ | |
| I8 | Out-of-band updates trigger invalidation | ☐ | |
| I9 | Batch operations invalidate affected keys | ☐ | |
| I10 | Invalidation logged for debugging | ☐ | |

---

### 3.7 Data That Should NEVER Be Cached

| Data Type | Reason | Alternative |
|-----------|--------|-------------|
| Passwords/hashes | Security risk | Never store in cache |
| Full credit card numbers | PCI compliance | Token only |
| CVV/security codes | PCI compliance | Never persist |
| Social Security Numbers | Regulatory compliance | Encrypt if needed |
| Private encryption keys | Security risk | Secure key store |
| Health records (PHI) | HIPAA compliance | Encrypt + strict access |
| Unencrypted PII | Privacy regulations | Encrypt or tokenize |
| Session tokens in shared cache | Security risk | Private cache only |
| One-time passwords | Security risk | Short TTL if any |
| Internal system credentials | Security risk | Vault/secrets manager |

---

### 3.8 Invalidation Triggers to Verify

For each cached entity, verify invalidation occurs on:

**User Data:**
- [ ] User profile update
- [ ] User deletion
- [ ] Password change
- [ ] Role/permission change
- [ ] Account suspension/activation

**Product/Inventory Data:**
- [ ] Price update
- [ ] Stock level change
- [ ] Product creation/deletion
- [ ] Category reassignment
- [ ] Availability status change

**Order/Transaction Data:**
- [ ] Order status update
- [ ] Payment confirmation
- [ ] Refund processing
- [ ] Order cancellation

**Configuration Data:**
- [ ] System settings change
- [ ] Feature flag toggle
- [ ] Rate limit adjustment

**Multi-Service Invalidation:**
- [ ] Cross-service data updates
- [ ] Event-driven sync between services
- [ ] Database replication lag handling

---

### 3.9 TicketToken-Specific Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| TT1 | Event data cache invalidated on updates | ☐ | |
| TT2 | Ticket availability cached with short TTL | ☐ | |
| TT3 | QR codes not cached (generated fresh) | ☐ | |
| TT4 | Price data invalidated on changes | ☐ | |
| TT5 | Seat maps cached with invalidation on booking | ☐ | |
| TT6 | User wallet balance not stale-cached | ☐ | |
| TT7 | NFT ownership data synchronized | ☐ | |
| TT8 | Secondary market listings updated in real-time | ☐ | |
| TT9 | Tenant branding cached with proper invalidation | ☐ | |
| TT10 | Rate limiting counters use appropriate TTL | ☐ | |
| TT11 | Search results cached with reasonable TTL | ☐ | |
| TT12 | Payment tokens NEVER cached | ☐ | |

---

## 4. Monitoring & Alerting Recommendations

### Key Metrics to Monitor

| Metric | Alert Threshold | Rationale |
|--------|-----------------|-----------|
| Cache hit rate | < 80% | Low efficiency |
| Memory usage | > 80% of maxmemory | Risk of eviction |
| Connection count | > 80% of limit | Exhaustion risk |
| Evicted keys/sec | > 100 | Memory pressure |
| Keys without TTL | > 0 (in audit) | Memory leak risk |
| Command latency p99 | > 10ms | Performance issue |
| Blocked clients | > 0 | Contention issue |
| Cache stampede detection | DB spikes at intervals | TTL sync issue |

### Dashboard Requirements

1. **Real-time metrics:** Hit rate, memory, connections
2. **Key distribution:** Keys per prefix/tenant
3. **TTL analysis:** Distribution of TTL values
4. **Slow log:** Commands exceeding threshold
5. **Invalidation events:** Rate and distribution

---

## 5. References & Sources

### Official Documentation
- Redis Security: https://redis.io/docs/latest/operate/oss_and_stack/management/security/
- Redis TTL/Expire: https://redis.io/docs/latest/commands/expire/
- AWS ElastiCache Strategies: https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html
- Azure Cache for Redis Multi-tenancy: https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/service/cache-redis

### HTTP Caching Standards
- RFC 9111 - HTTP Caching: https://httpwg.org/specs/rfc9111.html
- MDN HTTP Caching: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching

### Security Resources
- OWASP Sensitive Data Exposure: https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure
- OWASP Cache Poisoning: https://owasp.org/www-community/attacks/Cache_Poisoning
- PortSwigger Web Cache Poisoning: https://portswigger.net/web-security/web-cache-poisoning

### Design Patterns
- Microsoft Cache-Aside Pattern: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside
- AWS Database Caching Strategies: https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html
- Cache Stampede Prevention: https://en.wikipedia.org/wiki/Cache_stampede

---

*Document Version: 1.0*
*Last Updated: December 2025*
*Next Review: Apply checklist to each TicketToken microservice*