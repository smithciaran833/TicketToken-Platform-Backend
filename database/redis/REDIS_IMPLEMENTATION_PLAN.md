# Redis Implementation Plan

## Executive Summary

### Current State
- **Coverage:** ~15-20% of designed features implemented
- **What works:** Basic GET/SET/INCR caching, simple pub/sub, key expiration
- **What's missing:** HASH, SORTED SET, LIST, GEO, Lua scripts, STREAM operations

### Desired State
Full implementation of 8 Redis data structure patterns:
1. Analytics cache (dashboards, revenue, attendance)
2. Caching strategies (multi-tier, write-through, write-behind)
3. Geospatial data (venue discovery, location search)
4. Leaderboards (rankings for venues, events, users)
5. Queue management (background job processing)
6. Rate limiting (sliding window, device tracking)
7. Real-time data (live counters, dynamic pricing, WebSocket)
8. Session management (atomic operations, concurrent limits)

### Effort Estimate
- **Phase 0 - Workspace setup:** 1 day
- **Phase 1 - Shared library:** 2-3 days
- **Phase 2 - Critical services:** 3 days
- **Phase 3 - Important services:** 3-4 days
- **Phase 4 - Enhancements:** 3-4 days
- **Total:** 12-15 days

---

## Phase 0: Shared Workspace Configuration

Before creating any shared libraries, set up the workspace structure.

### Files to Create

#### `backend/shared/package.json`
```json
{
  "name": "@tickettoken/shared",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "redis",
    "mongodb",
    "content-reviews"
  ]
}
```

#### `backend/shared/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": false,
    "inlineSourceMap": true,
    "inlineSources": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
```

### Update Root package.json

Add to `backend/package.json`:
```json
{
  "workspaces": [
    "services/*",
    "shared/*"
  ]
}
```

---

## Part 1: Shared Redis Library

Create reusable Redis operations library at `backend/shared/redis/`

### Files to Create
```
backend/shared/redis/
├── src/
│   ├── index.ts
│   ├── connection.ts
│   ├── hash-operations.ts
│   ├── sorted-set-operations.ts
│   ├── list-operations.ts
│   ├── geo-operations.ts
│   ├── lua-scripts.ts
│   ├── stream-operations.ts
│   ├── pubsub-manager.ts
│   ├── cache-strategies.ts
│   ├── ttl-config.ts
│   └── types.ts
├── package.json
├── tsconfig.json
└── README.md
```

#### 1.1 `backend/shared/redis/package.json`
```json
{
  "name": "@shared/redis",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "ioredis": "^5.3.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  }
}
```

#### 1.2 `backend/shared/redis/src/connection.ts`
```
Purpose: Shared Redis connection factory

Features:
- Connection factory with retry logic
- Connection pooling configuration
- Health check utilities
- Graceful shutdown handling
- Cluster mode support

Exports:
- createRedisClient(config): Redis
- createRedisCluster(config): Cluster
- healthCheck(client): Promise<boolean>
- gracefulShutdown(client): Promise<void>
```

#### 1.3 `backend/shared/redis/src/hash-operations.ts`
```
Purpose: Revenue analytics, funnel tracking, performance metrics, config storage

Commands to implement:
- hset(key, field, value) / hmset(key, data)
- hget(key, field) / hmget(key, fields) / hgetall(key)
- hincrby(key, field, increment) / hincrbyfloat(key, field, increment)
- hdel(key, fields)
- hexists(key, field)
- hlen(key)

Key patterns:
- analytics:venue:{venue_id}:revenue:{period}:{date}
- analytics:event:{event_id}:funnel:{date}
- analytics:platform:performance:{date}
- pricing:config
- queue:config:{type}
```

#### 1.4 `backend/shared/redis/src/sorted-set-operations.ts`
```
Purpose: Leaderboards, rankings, top performers, sliding window rate limiting

Commands to implement:
- zadd(key, score, member) / zadds(key, members)
- zincrby(key, increment, member)
- zrevrange(key, start, stop) / zrange(key, start, stop)
- zrevrank(key, member) / zrank(key, member)
- zscore(key, member)
- zrem(key, members)
- zremrangebyscore(key, min, max)
- zcount(key, min, max)
- zcard(key)

Key patterns:
- leaderboard:venues:revenue:{period}
- leaderboard:events:trending:{date}
- leaderboard:customers:loyalty:{period}
- analytics:top:{entity}:{metric}:{period}
- api_requests:{identifier}:{endpoint} (sliding window)
```

#### 1.5 `backend/shared/redis/src/list-operations.ts`
```
Purpose: Time-series data, job queues, activity logs

Commands to implement:
- lpush(key, values) / rpush(key, values)
- lpop(key) / rpop(key)
- lrange(key, start, stop)
- ltrim(key, start, stop)
- llen(key)
- lindex(key, index)
- blpop(keys, timeout) / brpop(keys, timeout)

Key patterns:
- analytics:venue:{venue_id}:revenue:timeseries
- analytics:venue:{venue_id}:attendance:timeseries
- failed_logins:{ip}
- queue:{type}:pending
```

#### 1.6 `backend/shared/redis/src/geo-operations.ts`
```
Purpose: Venue discovery, event search by location, service zones

Commands to implement:
- geoadd(key, longitude, latitude, member)
- geopos(key, members)
- geodist(key, member1, member2, unit)
- georadius(key, longitude, latitude, radius, unit, options)
- georadiusbymember(key, member, radius, unit, options)
- geosearch(key, options) - Redis 6.2+
- geohash(key, members)

Key patterns:
- venues:locations
- events:active:locations
- zones:service:{city}
- search:grid:{area}

Fallback:
- GEOSEARCH requires Redis 6.2+
- Fallback to GEORADIUS for older versions
```

#### 1.7 `backend/shared/redis/src/lua-scripts.ts`
```
Purpose: Atomic operations for sessions, rate limiting, leaderboard updates

Scripts to implement:

1. createSessionWithLimit
   - Atomically create session
   - Enforce max concurrent sessions
   - Return { success: boolean, sessionId: string, existingSessions: number }
   - Error handling: Return safe defaults on script failure

2. slidingWindowRateLimit
   - Add request to sorted set with timestamp
   - Remove expired entries (older than window)
   - Check count against limit
   - Set TTL if first request
   - Return { allowed: boolean, current: number, remaining: number, resetAt: number }

3. refreshSessionWithValidation
   - Validate session exists
   - Update TTL
   - Update activity timestamp
   - Return session data or null

4. atomicLeaderboardUpdate
   - Update score with ZINCRBY
   - Trim to max size with ZREMRANGEBYRANK
   - Return { newScore: number, rank: number }

5. atomicCounterWithLimit
   - INCR counter
   - Check against max
   - Set TTL on first increment
   - Return { current: number, exceeded: boolean, remaining: number }

Rollback Strategy:
- All scripts wrapped in try/catch
- On failure, log error and return safe defaults
- Circuit breaker pattern for repeated failures
```

#### 1.8 `backend/shared/redis/src/stream-operations.ts`
```
Purpose: Event streaming, real-time updates, message queues

Commands to implement:
- xadd(key, id, fields)
- xread(streams, options)
- xreadgroup(group, consumer, streams, options)
- xgroup('CREATE', key, group, id)
- xack(key, group, ids)
- xpending(key, group)
- xtrim(key, strategy, threshold)

Key patterns:
- stream:events:{type}
- stream:notifications
- stream:analytics
```

#### 1.9 `backend/shared/redis/src/pubsub-manager.ts`
```
Purpose: Real-time updates, WebSocket broadcasting

Features:
- Channel subscription management
- Message publishing with retry
- Pattern subscriptions (PSUBSCRIBE)
- Connection state management
- Automatic reconnection

Key patterns:
- metrics:{venueId}:{metricType}
- events:{eventId}:updates
- pricing:{eventId}:changes
- notifications:{userId}
```

#### 1.10 `backend/shared/redis/src/cache-strategies.ts`
```
Purpose: Implement caching patterns from caching_strategies.redis

Strategies to implement:

1. Cache-Aside (Read-Through)
   - Check cache first
   - On miss, fetch from source
   - Store in cache with TTL
   - Return data

2. Write-Through
   - Write to cache and source simultaneously
   - Ensure consistency

3. Write-Behind (Write-Back)
   - Write to cache immediately
   - Queue write to source
   - Process queue asynchronously

4. Cache Warming
   - Pre-populate cache on startup
   - Refresh before TTL expires

5. Cache Invalidation
   - Pattern-based invalidation
   - Tag-based invalidation
   - Event-driven invalidation
```

#### 1.11 `backend/shared/redis/src/ttl-config.ts`
```
Purpose: Centralized TTL management

TTL categories:
- REALTIME: 30-60 seconds (live counters, active users)
- SHORT: 300 seconds / 5 min (session data, aggregated metrics)
- MEDIUM: 1800-3600 seconds / 30 min - 1 hour (user profiles, venue info)
- LONG: 86400 seconds / 24 hours (dashboard configs, daily aggregates)
- VERY_LONG: 604800 seconds / 7 days (refresh tokens, weekly data)
- PERSISTENT: 0 (no expiry - all-time leaderboards)

Per-entity defaults:
- user_session: 3600 (1 hour)
- login_attempts: 900 (15 minutes)
- rate_limit_window: 60 (1 minute)
- venue_cache: 3600 (1 hour)
- event_cache: 300 (5 minutes)
- ticket_availability: 30 (30 seconds)
- leaderboard_daily: 86400 (24 hours)
- analytics_realtime: 60 (1 minute)
```

#### 1.12 `backend/shared/redis/src/types.ts`
```typescript
// TypeScript interfaces

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  retryDelayMs?: number;
  maxRetries?: number;
}

export interface LeaderboardEntry {
  member: string;
  score: number;
  rank: number;
}

export interface GeoLocation {
  longitude: number;
  latitude: number;
  member: string;
  distance?: number;
  unit?: 'km' | 'mi' | 'm' | 'ft';
}

export interface SessionData {
  sessionId: string;
  userId: string;
  deviceId: string;
  deviceType: string;
  ipAddress: string;
  userAgent: string;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface CacheConfig {
  ttl: number;
  strategy: 'cache-aside' | 'write-through' | 'write-behind';
  invalidateOn?: string[];
  warmOnStartup?: boolean;
}

export interface StreamMessage {
  id: string;
  fields: Record<string, string>;
  timestamp: number;
}

export interface QueueJob {
  id: string;
  type: string;
  payload: Record<string, any>;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  processAfter?: number;
}
```

---

## Part 2: Service-by-Service Implementation

### 2.1 analytics-service
**Priority: 1 (Critical)**

#### Files to Modify
| File | Changes |
|------|---------|
| `src/config/redis.ts` | Import shared library, configure connections |
| `src/config/redis-cache-strategies.ts` | Use shared cache-strategies module |
| `src/models/redis/cache.model.ts` | Replace GET/SET with HASH operations |
| `src/models/redis/realtime.model.ts` | Add SORTED SET for rankings, LIST for time-series |
| `src/models/redis/session.model.ts` | Integrate Lua scripts for atomic operations |

#### Files to Create
| File | Purpose |
|------|---------|
| `src/services/leaderboard.service.ts` | Venue/event/user rankings using SORTED SET |
| `src/services/timeseries.service.ts` | Time-series data using LIST |
| `src/services/dashboard-cache.service.ts` | Dashboard caching using HASH |

#### Features to Implement
- [ ] Revenue tracking with HASH (HINCRBY for increments)
- [ ] Attendance tracking with HASH
- [ ] Conversion funnel with HASH
- [ ] Top venues/events with SORTED SET
- [ ] Time-series data with LIST (LPUSH/LTRIM)
- [ ] Real-time KPIs with HASH
- [ ] Dashboard summaries with HASH + TTL

---

### 2.2 api-gateway
**Priority: 1 (Critical)**

#### Files to Modify
| File | Changes |
|------|---------|
| `src/config/redis.ts` | Import shared library |
| `src/middleware/rate-limit.middleware.ts` | Replace INCR with sliding window (SORTED SET + Lua) |

#### Files to Create
| File | Purpose |
|------|---------|
| `src/services/sliding-window-rate-limit.service.ts` | Implement proper sliding window |
| `src/services/device-tracking.service.ts` | Track by device fingerprint with HASH |

#### Features to Implement
- [ ] Sliding window rate limiting with SORTED SET
- [ ] Lua script for atomic rate limit check
- [ ] Per-endpoint rate limits from schema
- [ ] Device fingerprint tracking
- [ ] IP-based rate limits with HASH
- [ ] Auto-blocking with SETEX

#### Migration from Current Rate Limiting
```
1. Deploy new sliding window alongside existing INCR
2. Log both results for comparison (1 week)
3. Verify sliding window accuracy
4. Switch traffic to sliding window
5. Remove old INCR-based code
```

---

### 2.3 auth-service
**Priority: 1 (Critical)**

#### Files to Modify
| File | Changes |
|------|---------|
| `src/config/redis.ts` | Import shared library |
| `src/services/auth.service.ts` | Use session Lua scripts |
| `src/services/rate-limit.service.ts` | Use sliding window |
| `src/services/brute-force-protection.service.ts` | Use HASH for tracking |

#### Files to Create
| File | Purpose |
|------|---------|
| `src/services/session-manager.service.ts` | Full session management with Lua scripts |

#### Features to Implement
- [ ] Session storage with HASH (device info, metadata)
- [ ] Multi-session tracking with SET
- [ ] Session activity with SORTED SET
- [ ] Concurrent session limits with Lua script
- [ ] Login attempt tracking with INCR + TTL
- [ ] Failed login tracking with LIST
- [ ] Sliding window API rate limiting

---

### 2.4 event-service
**Priority: 2 (Important)**

#### Files to Modify
| File | Changes |
|------|---------|
| `src/config/redis.ts` | Import shared library |
| `src/services/event.service.ts` | Add geospatial queries |
| `src/services/redisService.ts` | Add real-time counters |

#### Files to Create
| File | Purpose |
|------|---------|
| `src/services/event-geo.service.ts` | Location-based event search |
| `src/services/event-realtime.service.ts` | Live counters, availability |

#### Features to Implement
- [ ] Event locations with GEOADD
- [ ] Radius search with GEORADIUS
- [ ] Live attendance counters
- [ ] Real-time ticket availability
- [ ] Event status pub/sub

---

### 2.5 venue-service
**Priority: 2 (Important)**

#### Files to Modify
| File | Changes |
|------|---------|
| `src/services/cache.service.ts` | Add HASH, GEO operations |

#### Files to Create
| File | Purpose |
|------|---------|
| `src/services/venue-geo.service.ts` | Venue location features |
| `src/services/venue-leaderboard.service.ts` | Venue rankings |

#### Features to Implement
- [ ] Venue locations with GEOADD
- [ ] "Venues near me" with GEORADIUS
- [ ] Venue leaderboards with SORTED SET
- [ ] Venue analytics cache with HASH

---

### 2.6 payment-service
**Priority: 2 (Important)**

#### Files to Modify
| File | Changes |
|------|---------|
| `src/config/redis.ts` | Import shared library |
| `src/services/cache.service.ts` | Add queue operations |

#### Files to Create
| File | Purpose |
|------|---------|
| `src/services/payment-queue.service.ts` | Payment job queue |
| `src/services/fraud-rate-limit.service.ts` | Fraud detection rate limiting |

#### Features to Implement
- [ ] Payment capture queue with LIST
- [ ] Refund queue with LIST
- [ ] Settlement queue with LIST
- [ ] Velocity checking with sliding window
- [ ] Fraud scoring cache with HASH

---

### 2.7 ticket-service
**Priority: 2 (Important)**

#### Files to Modify
| File | Changes |
|------|---------|
| `src/config/redis.ts` | Import shared library |
| `src/services/redisService.ts` | Add real-time features |
| `src/services/ticketService.ts` | Add availability counters |

#### Files to Create
| File | Purpose |
|------|---------|
| `src/services/ticket-availability.service.ts` | Real-time availability |

#### Features to Implement
- [ ] Real-time availability counters
- [ ] Ticket hold with TTL
- [ ] Purchase rate limiting
- [ ] "X people viewing" counters

---

### 2.8 marketplace-service
**Priority: 3 (Enhancement)**

#### Files to Modify
| File | Changes |
|------|---------|
| `src/config/redis.ts` | Import shared library |

#### Files to Create
| File | Purpose |
|------|---------|
| `src/services/marketplace-leaderboard.service.ts` | Seller/listing rankings |
| `src/services/dynamic-pricing.service.ts` | Price caching |

#### Features to Implement
- [ ] Seller leaderboards with SORTED SET
- [ ] Trending listings with SORTED SET
- [ ] Price history cache with HASH
- [ ] Real-time price updates with pub/sub

---

### 2.9 order-service
**Priority: 3 (Enhancement)**

#### Files to Modify
| File | Changes |
|------|---------|
| `src/services/redis.service.ts` | Add queue operations |
| `src/services/order-cache.service.ts` | Use HASH for order data |

#### Features to Implement
- [ ] Order processing queue with LIST
- [ ] Order data cache with HASH
- [ ] Order analytics with HASH

---

### 2.10 notification-service
**Priority: 3 (Enhancement)**

#### Files to Modify
| File | Changes |
|------|---------|
| `src/config/redis.ts` | Import shared library |
| `src/services/queue.service.ts` | Use LIST/STREAM for queues |

#### Features to Implement
- [ ] Email queue with LIST
- [ ] SMS queue with LIST
- [ ] Push notification queue with LIST
- [ ] Priority queue with SORTED SET

---

## Part 3: Implementation Order

### Phase 0: Workspace Setup (Day 1)
1. Create `backend/shared/package.json`
2. Create `backend/shared/tsconfig.json`
3. Update root `backend/package.json` with workspaces
4. Verify yarn/npm workspace installation
5. Test workspace linking

### Phase 1: Foundation (Days 2-4)
1. Create `backend/shared/redis/` library
2. Implement core modules:
   - connection.ts
   - hash-operations.ts
   - sorted-set-operations.ts
   - lua-scripts.ts
   - types.ts
   - index.ts
3. Write unit tests for shared library
4. Test Lua scripts in isolation

### Phase 2: Critical Services (Days 5-7)
1. **api-gateway** - Sliding window rate limiting
2. **auth-service** - Session management with Lua scripts
3. **analytics-service** - Leaderboards with SORTED SET, dashboards with HASH

### Phase 3: Important Services (Days 8-11)
1. **event-service** - Geospatial features
2. **venue-service** - Geospatial + leaderboards
3. **payment-service** - Queue management
4. **ticket-service** - Real-time availability

### Phase 4: Enhancements (Days 12-14)
1. **marketplace-service** - Leaderboards + pricing
2. **order-service** - Queue + caching
3. **notification-service** - Queue management
4. Stream operations where needed

### Phase 5: Testing & Validation (Days 15)
1. Integration testing
2. Load testing rate limiting
3. Performance validation
4. Documentation updates

---

## Part 4: Complete File Checklist

### Phase 0: Workspace Setup
- [ ] `backend/shared/package.json`
- [ ] `backend/shared/tsconfig.json`
- [ ] Modify: `backend/package.json` (add workspaces)

### Shared Library
- [ ] `backend/shared/redis/package.json`
- [ ] `backend/shared/redis/tsconfig.json`
- [ ] `backend/shared/redis/src/index.ts`
- [ ] `backend/shared/redis/src/connection.ts`
- [ ] `backend/shared/redis/src/hash-operations.ts`
- [ ] `backend/shared/redis/src/sorted-set-operations.ts`
- [ ] `backend/shared/redis/src/list-operations.ts`
- [ ] `backend/shared/redis/src/geo-operations.ts`
- [ ] `backend/shared/redis/src/lua-scripts.ts`
- [ ] `backend/shared/redis/src/stream-operations.ts`
- [ ] `backend/shared/redis/src/pubsub-manager.ts`
- [ ] `backend/shared/redis/src/cache-strategies.ts`
- [ ] `backend/shared/redis/src/ttl-config.ts`
- [ ] `backend/shared/redis/src/types.ts`

### analytics-service
- [ ] Modify: `src/config/redis.ts`
- [ ] Modify: `src/config/redis-cache-strategies.ts`
- [ ] Modify: `src/models/redis/cache.model.ts`
- [ ] Modify: `src/models/redis/realtime.model.ts`
- [ ] Modify: `src/models/redis/session.model.ts`
- [ ] Create: `src/services/leaderboard.service.ts`
- [ ] Create: `src/services/timeseries.service.ts`
- [ ] Create: `src/services/dashboard-cache.service.ts`

### api-gateway
- [ ] Modify: `src/config/redis.ts`
- [ ] Modify: `src/middleware/rate-limit.middleware.ts`
- [ ] Create: `src/services/sliding-window-rate-limit.service.ts`
- [ ] Create: `src/services/device-tracking.service.ts`

### auth-service
- [ ] Modify: `src/config/redis.ts`
- [ ] Modify: `src/services/auth.service.ts`
- [ ] Modify: `src/services/rate-limit.service.ts`
- [ ] Modify: `src/services/brute-force-protection.service.ts`
- [ ] Create: `src/services/session-manager.service.ts`

### event-service
- [ ] Modify: `src/config/redis.ts`
- [ ] Modify: `src/services/event.service.ts`
- [ ] Modify: `src/services/redisService.ts`
- [ ] Create: `src/services/event-geo.service.ts`
- [ ] Create: `src/services/event-realtime.service.ts`

### venue-service
- [ ] Modify: `src/services/cache.service.ts`
- [ ] Create: `src/services/venue-geo.service.ts`
- [ ] Create: `src/services/venue-leaderboard.service.ts`

### payment-service
- [ ] Modify: `src/config/redis.ts`
- [ ] Modify: `src/services/cache.service.ts`
- [ ] Create: `src/services/payment-queue.service.ts`
- [ ] Create: `src/services/fraud-rate-limit.service.ts`

### ticket-service
- [ ] Modify: `src/config/redis.ts`
- [ ] Modify: `src/services/redisService.ts`
- [ ] Modify: `src/services/ticketService.ts`
- [ ] Create: `src/services/ticket-availability.service.ts`

### marketplace-service
- [ ] Modify: `src/config/redis.ts`
- [ ] Create: `src/services/marketplace-leaderboard.service.ts`
- [ ] Create: `src/services/dynamic-pricing.service.ts`

### order-service
- [ ] Modify: `src/services/redis.service.ts`
- [ ] Modify: `src/services/order-cache.service.ts`

### notification-service
- [ ] Modify: `src/config/redis.ts`
- [ ] Modify: `src/services/queue.service.ts`

---

## Summary

| Category | Files to Create | Files to Modify |
|----------|----------------|-----------------|
| Workspace Setup | 2 | 1 |
| Shared Library | 14 | 0 |
| analytics-service | 3 | 5 |
| api-gateway | 2 | 2 |
| auth-service | 1 | 4 |
| event-service | 2 | 3 |
| venue-service | 2 | 1 |
| payment-service | 2 | 2 |
| ticket-service | 1 | 3 |
| marketplace-service | 2 | 1 |
| order-service | 0 | 2 |
| notification-service | 0 | 2 |
| **TOTAL** | **31** | **26** |

**Total files to touch: 57**
**Estimated time: 12-15 days**

---

## Technical Notes

### Redis Version Requirements
- Minimum: Redis 6.0
- Recommended: Redis 6.2+ (for GEOSEARCH command)
- Fallback: GEORADIUS for Redis < 6.2

### Lua Script Error Handling
All Lua scripts implement:
1. Try/catch wrapper in TypeScript caller
2. Safe defaults returned on failure
3. Circuit breaker for repeated failures
4. Logging of all errors

### Rate Limiting Migration
1. Deploy sliding window alongside INCR (shadow mode)
2. Log both results for 1 week
3. Compare accuracy
4. Switch to sliding window
5. Remove INCR code after 1 week stable

### Memory Considerations
- Monitor sorted set sizes (leaderboards can grow)
- Implement ZREMRANGEBYRANK for bounded leaderboards
- Set maxmemory-policy to allkeys-lru
- Monitor memory usage per key pattern
