# Redis Migration Guide

## Overview
All services now use the shared Redis library from `@tickettoken/shared` for centralized connection management, advanced operations, and consistent patterns.

## Quick Start

### 1. Add to your service's `config/redis.ts`:
```typescript
import type Redis from 'ioredis';
import { getRedisClient, getRedisPubClient, getRedisSubClient, getConnectionManager } from '@tickettoken/shared';

let redis: Redis;
let redisPub: Redis;
let redisSub: Redis;
let initialized = false;

export async function initRedis(): Promise<void> {
  if (initialized) return;
  redis = await getRedisClient();
  redisPub = await getRedisPubClient();
  redisSub = await getRedisSubClient();
  initialized = true;
}

export function getRedis(): Redis {
  if (!redis) throw new Error('Redis not initialized');
  return redis;
}

export function getPub(): Redis {
  if (!redisPub) throw new Error('Redis pub not initialized');
  return redisPub;
}

export function getSub(): Redis {
  if (!redisSub) throw new Error('Redis sub not initialized');
  return redisSub;
}

export async function closeRedisConnections(): Promise<void> {
  const connectionManager = getConnectionManager();
  await connectionManager.disconnect();
  initialized = false;
}
```

### 2. Initialize at startup (`index.ts` or `app.ts`):
```typescript
import { initRedis } from './config/redis';

async function main() {
  // Initialize Redis before starting server
  await initRedis();
  logger.info('Redis connected');
  
  // ... rest of startup
}
```

### 3. Use in your code:
```typescript
import { getRedis } from '../config/redis';

async function myFunction() {
  const redis = getRedis(); // Synchronous getter
  await redis.get('key');
  await redis.set('key', 'value', 'EX', 300);
}
```

### 4. Graceful shutdown:
```typescript
import { closeRedisConnections } from './config/redis';

process.on('SIGTERM', async () => {
  // ... close other resources
  await closeRedisConnections();
  logger.info('Redis connections closed');
});
```

## Available Utilities from @tickettoken/shared

### Core Exports
```typescript
import {
  // Connection Management
  getRedisClient,
  getRedisPubClient,
  getRedisSubClient,
  getConnectionManager,
  
  // Managers
  getSessionManager,
  getRateLimiter,
  getCacheManager,
  getPubSubManager,
  
  // Utilities
  getKeyBuilder,
  getScanner,
  
  // Operations
  getHashOps,
  getSortedSetOps,
  getListOps,
  getGeoOps,
  getStreamOps,
} from '@tickettoken/shared';
```

### Key Building (Type-Safe)
```typescript
import { getKeyBuilder } from '@tickettoken/shared';

const keyBuilder = getKeyBuilder();
const sessionKey = keyBuilder.session(sessionId);
const rateLimitKey = keyBuilder.rateLimit('api', userId);
const cacheKey = keyBuilder.cache('user', userId);
```

### Session Management
```typescript
import { getSessionManager } from '@tickettoken/shared';

const sessionManager = getSessionManager({
  ttl: 1800, // 30 minutes
  maxSessionsPerUser: 5,
});

// Create session (enforces limits automatically)
await sessionManager.createSession(sessionId, userId, { ip, userAgent });

// Get session
const session = await sessionManager.getSession(sessionId);

// Update session
await sessionManager.updateSession(sessionId, { lastActivity: Date.now() });
```

### Rate Limiting (Atomic with Lua)
```typescript
import { getRateLimiter } from '@tickettoken/shared';

const limiter = getRateLimiter();

// Sliding window (most accurate)
const result = await limiter.slidingWindow(
  `ratelimit:api:${userId}`,
  100, // max requests
  60000 // window in ms
);

if (!result.allowed) {
  throw new Error(`Rate limited. Retry after ${result.retryAfter}s`);
}
```

### Cache Manager (Cache-Aside Pattern)
```typescript
import { getCacheManager } from '@tickettoken/shared';

const cache = getCacheManager();

// Get or fetch pattern
const user = await cache.getOrFetch(
  'user:123',
  async () => await database.getUser('123'),
  300 // TTL in seconds
);

// Safe invalidation (uses SCAN, not KEYS)
await cache.invalidate('cache:user:*');
```

### Safe SCAN Operations
```typescript
import { getScanner } from '@tickettoken/shared';

const scanner = getScanner();

// Safe key scanning (non-blocking)
const keys = await scanner.scanKeys('session:*', 100);

// Scan and delete
const deleted = await scanner.scanAndDelete('cache:expired:*');
```

## Migration Checklist

When migrating a service to use the shared Redis library:

- ✅ Add `@tickettoken/shared` to package.json dependencies
- ✅ Create/update `src/config/redis.ts` with the async init pattern (shown above)
- ✅ Call `await initRedis()` at service startup
- ✅ Replace all `import { redis }` with `import { getRedis }`
- ✅ Add `const redis = getRedis()` at the start of functions
- ✅ Replace `redis.keys()` with `getScanner().scanKeys()` (IMPORTANT!)
- ✅ Update graceful shutdown to use `await closeRedisConnections()`
- ✅ Delete old `redisService.ts` or `redis.service.ts` files
- ✅ Test build: `npm run build`

## Breaking Changes

### 1. Async Initialization Required
**Before:**
```typescript
// ❌ Old: Direct client export
export const redis = new Redis({ ... });
```

**After:**
```typescript
// ✅ New: Async initialization
export async function initRedis(): Promise<void> {
  redis = await getRedisClient();
}
export function getRedis(): Redis {
  return redis;
}
```

### 2. No More redis.keys()
**Before:**
```typescript
// ❌ Old: Blocks Redis (dangerous!)
const keys = await redis.keys('session:*');
```

**After:**
```typescript
// ✅ New: Non-blocking SCAN
import { getScanner } from '@tickettoken/shared';
const keys = await getScanner().scanKeys('session:*');
```

### 3. Session Storage Uses Hashes
**Before:**
```typescript
// ❌ Old: JSON strings (inefficient)
await redis.set('session:123', JSON.stringify(data));
const session = JSON.parse(await redis.get('session:123'));
```

**After:**
```typescript
// ✅ New: Redis Hashes (more efficient)
import { getSessionManager } from '@tickettoken/shared';
await getSessionManager().createSession(sessionId, userId, data);
const session = await getSessionManager().getSession(sessionId);
```

## Before/After Examples

### Example 1: Basic Redis Usage

**Before:**
```typescript
import { redis } from '../config/redis';

async function cacheUser(userId: string, data: any) {
  await redis.setex(`user:${userId}`, 300, JSON.stringify(data));
}

async function getUser(userId: string) {
  const cached = await redis.get(`user:${userId}`);
  return cached ? JSON.parse(cached) : null;
}
```

**After:**
```typescript
import { getRedis } from '../config/redis';

async function cacheUser(userId: string, data: any) {
  const redis = getRedis();
  await redis.setex(`user:${userId}`, 300, JSON.stringify(data));
}

async function getUser(userId: string) {
  const redis = getRedis();
  const cached = await redis.get(`user:${userId}`);
  return cached ? JSON.parse(cached) : null;
}

// Or better yet, use CacheManager:
import { getCacheManager } from '@tickettoken/shared';

async function getUser(userId: string) {
  return await getCacheManager().getOrFetch(
    `user:${userId}`,
    () => database.getUser(userId),
    300
  );
}
```

### Example 2: Rate Limiting

**Before:**
```typescript
// ❌ Race condition! Multiple requests can slip through
const current = await redis.incr(key);
if (current === 1) {
  await redis.expire(key, 60); // Race: expire might fail!
}
if (current > limit) {
  throw new Error('Rate limited');
}
```

**After:**
```typescript
// ✅ Atomic operation with Lua script
import { getRateLimiter } from '@tickettoken/shared';

const result = await getRateLimiter().slidingWindow(key, limit, windowMs);
if (!result.allowed) {
  throw new Error(`Rate limited. Retry after ${result.retryAfter}s`);
}
```

### Example 3: Key Scanning

**Before:**
```typescript
// ❌ BLOCKS entire Redis! DON'T DO THIS!
const keys = await redis.keys('cache:*');
for (const key of keys) {
  await redis.del(key);
}
```

**After:**
```typescript
// ✅ Non-blocking SCAN operation
import { getScanner } from '@tickettoken/shared';

const deleted = await getScanner().scanAndDelete('cache:*');
logger.info(`Deleted ${deleted} keys`);
```

## Services Migration Status

| Service | Status | Notes |
|---------|--------|-------|
| auth-service | ✅ Complete | Phase 1 |
| api-gateway | ✅ Complete | Phase 1 |
| analytics-service | ✅ Complete | Phase 2 |
| ticket-service | ✅ Complete | Phase 2 |
| payment-service | ✅ Complete | Phase 2 |
| event-service | ✅ Complete | Phase 3 |
| venue-service | ✅ Complete | Phase 3 |
| marketplace-service | ✅ Complete | Phase 3 |
| order-service | ✅ Complete | Phase 3 |
| notification-service | ⏳ Pending | Phase 3 |

## Common Patterns

### Pattern 1: Dependency Injection Container

If your service uses Awilix or similar DI:

```typescript
import { getRedis } from './redis';

container.register({
  redis: asFunction(() => getRedis()).singleton(),
  // ... other dependencies
});
```

### Pattern 2: Backwards-Compatible Helpers

For services with lots of Redis calls, create helper exports:

```typescript
// config/redis.ts
export async function get(key: string) {
  return getRedis().get(key);
}

export async function set(key: string, value: string, ttl?: number) {
  if (ttl) {
    return getRedis().setex(key, ttl, value);
  }
  return getRedis().set(key, value);
}
```

### Pattern 3: Health Checks

```typescript
import { getRedis } from '../config/redis';

app.get('/health', async (req, res) => {
  try {
    await getRedis().ping();
    res.json({ redis: 'ok' });
  } catch (error) {
    res.status(503).json({ redis: 'unhealthy' });
  }
});
```

## Troubleshooting

### Error: "Redis not initialized"
**Cause:** Trying to use `getRedis()` before calling `initRedis()`

**Solution:** Ensure `await initRedis()` is called at startup before any routes/handlers are registered.

### Error: Connection refused
**Cause:** Redis environment variables not set

**Solution:** Check `.env` file has:
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password  # if required
```

### Error: "Cannot find module '@tickettoken/shared'"
**Cause:** Package not installed

**Solution:**
```bash
npm install
# or
cd backend/shared && npm run build
```

## Performance Benefits

### Hash Storage vs JSON Strings
- **Before:** `JSON.stringify()` + `JSON.parse()` on every operation
- **After:** Native Redis Hashes (30-40% faster, less memory)

### Lua Scripts vs Multiple Commands
- **Before:** Multiple round-trips (race conditions possible)
- **After:** Single atomic operation

### SCAN vs KEYS
- **Before:** `KEYS *` blocks Redis (O(N) operation)
- **After:** `SCAN` is non-blocking, cursor-based

## Additional Resources

- See `backend/shared/src/redis/README.md` for detailed API documentation
- See `/backend/shared/src/redis/` for source code and examples
- See individual manager files for advanced usage patterns

## Support

For issues or questions about the Redis migration:
1. Check this guide and the main README
2. Review migrated services for reference implementations
3. Check error logs for specific error messages
