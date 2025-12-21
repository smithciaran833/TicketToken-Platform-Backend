# Redis Module - @tickettoken/shared

Complete Redis integration with advanced data structures, Lua scripts, and high-level managers.

## Features

- ✅ **Hash Operations** - Efficient object storage (better than JSON strings)
- ✅ **Sorted Sets** - Leaderboards, sliding window rate limiting
- ✅ **Lists** - FIFO/LIFO queues with blocking operations
- ✅ **Geo Operations** - Location-based venue/event search
- ✅ **Streams** - Event logging and message queues
- ✅ **Lua Scripts** - Atomic operations to prevent race conditions
- ✅ **Session Manager** - Multi-device session tracking with limits
- ✅ **Rate Limiter** - Sliding window, fixed window, token bucket
- ✅ **Cache Manager** - Multiple strategies with safe SCAN operations
- ✅ **Pub/Sub Manager** - Real-time messaging with patterns

## Quick Start

```typescript
import {
  getSessionManager,
  getRateLimiter,
  getCacheManager,
  getPubSubManager,
} from '@tickettoken/shared';

// Session Management
const sessionManager = getSessionManager();
const result = await sessionManager.createSession(sessionId, userId, data);

// Rate Limiting
const rateLimiter = getRateLimiter();
const limit = await rateLimiter.slidingWindow(key, 100, 60000); // 100 req/min
if (!limit.allowed) {
  throw new Error(`Rate limit exceeded. Retry after ${limit.retryAfter}s`);
}

// Caching
const cache = getCacheManager();
const user = await cache.getOrFetch('user:123', async () => {
  return await fetchUserFromDatabase('123');
}, 300);

// Pub/Sub
const pubsub = getPubSubManager();
await pubsub.subscribe('events', async (message) => {
  console.log('Received:', message.data);
});
await pubsub.publish('events', { type: 'user.login', userId: '123' });
```

## Session Manager

```typescript
import { getSessionManager } from '@tickettoken/shared';

const sessionManager = getSessionManager({
  ttl: 1800, // 30 minutes
  maxSessionsPerUser: 5,
  useHash: true, // More efficient than JSON
});

// Create session with automatic limit enforcement
const { success, sessionCount } = await sessionManager.createSession(
  sessionId,
  userId,
  { venueId, metadata }
);

// Get session
const session = await sessionManager.getSession(sessionId);

// Update session
await sessionManager.updateSession(sessionId, { pageViews: 10 });

// Get all user sessions
const sessions = await sessionManager.getUserSessions(userId);

// Delete session
await sessionManager.deleteSession(sessionId, userId);
```

## Rate Limiter

### Sliding Window (Most Accurate)
```typescript
import { getRateLimiter } from '@tickettoken/shared';

const limiter = getRateLimiter();

// Sliding window - prevents burst at boundaries
const result = await limiter.slidingWindow(
  'ratelimit:api:user:123',
  100, // max requests
  60000 // window in milliseconds
);

if (!result.allowed) {
  console.log(`Rate limited. Retry after ${result.retryAfter} seconds`);
}
```

### Fixed Window (Fastest)
```typescript
// Fixed window - simple counter
const result = await limiter.fixedWindow('ratelimit:login:user:123', 5, 60000);
```

### Token Bucket (Burst Handling)
```typescript
// Token bucket - allows bursts
const result = await limiter.tokenBucket(
  'ratelimit:api:user:123',
  100, // capacity
  10, // refill rate per second
  1 // tokens requested
);
```

## Cache Manager

```typescript
import { getCacheManager } from '@tickettoken/shared';

const cache = getCacheManager();

// Basic operations
await cache.set('key', value, 300);
const value = await cache.get('key');
await cache.delete('key');

// Cache-aside pattern
const event = await cache.getOrFetch(
  'event:123',
  async () => await database.getEvent('123'),
  3600
);

// Batch operations
await cache.mset({ 'key1': 'val1', 'key2': 'val2' }, 300);
const values = await cache.mget(['key1', 'key2']);

// Safe invalidation (uses SCAN, not KEYS)
const deleted = await cache.invalidate('cache:user:*');

// Hash storage (more efficient for objects)
await cache.setHash('user:123', { name: 'John', age: 30 }, 300);
const user = await cache.getHash('user:123');
```

## Pub/Sub Manager

```typescript
import { getPubSubManager } from '@tickettoken/shared';

const pubsub = getPubSubManager();

// Subscribe to channel
await pubsub.subscribe('notifications', async (message) => {
  console.log(`Channel: ${message.channel}`);
  console.log(`Data:`, message.data);
  console.log(`Time: ${message.timestamp}`);
});

// Pattern subscription
await pubsub.psubscribe('events:*', async (message) => {
  console.log(`Pattern: ${message.pattern}`);
  console.log(`Channel: ${message.channel}`);
});

// Publish message (auto JSON serialization)
await pubsub.publish('notifications', {
  type: 'ticket.sold',
  ticketId: '123',
  userId: '456',
});

// Unsubscribe
await pubsub.unsubscribe('notifications');
```

## Low-Level Operations

### Hash Operations
```typescript
import { hset, hget, hgetall, hincrby } from '@tickettoken/shared';

await hset('user:123', 'name', 'John Doe');
await hset('user:123', 'age', 30);
const name = await hget('user:123', 'name');
const user = await hgetall('user:123');
await hincrby('user:123', 'loginCount', 1);
```

### Sorted Sets
```typescript
import { zadd, zrange, zincrby, zrank } from '@tickettoken/shared';

// Leaderboard
await zadd('leaderboard', 1000, 'user:123');
await zincrby('leaderboard', 50, 'user:123');
const top10 = await zrange('leaderboard', 0, 9, true); // with scores
const rank = await zrank('leaderboard', 'user:123');
```

### Lists
```typescript
import { lpush, rpush, brpop, lrange } from '@tickettoken/shared';

// Queue
await rpush('queue:jobs', job1, job2);
const job = await brpop('queue:jobs', 5); // blocking pop, 5s timeout

// Activity feed
await lpush('feed:user:123', event);
const recent = await lrange('feed:user:123', 0, 9);
```

### Geo Operations
```typescript
import { geoadd, georadius, geodist } from '@tickettoken/shared';

// Add venue locations
await geoadd('venues', -73.9857, 40.7484, 'venue:123');

// Find nearby venues
const nearby = await georadius(
  'venues',
  -73.9857, 40.7484, // longitude, latitude
  5, // radius
  'km', // unit
  { withDist: true, count: 10 }
);

// Distance between venues
const distance = await geodist('venues', 'venue:123', 'venue:456', 'km');
```

## Migration from Old Patterns

### Before (analytics-service)
```typescript
// ❌ DON'T: Uses KEYS command (blocks Redis)
const keys = await redis.keys('session:*');
for (const key of keys) {
  await redis.del(key);
}

// ❌ DON'T: JSON strings for sessions
await redis.set('session:123', JSON.stringify(sessionData));
const session = JSON.parse(await redis.get('session:123'));
```

### After (using this library)
```typescript
// ✅ DO: Uses SCAN (non-blocking)
import { scanAndDelete } from '@tickettoken/shared';
const deleted = await scanAndDelete('session:*');

// ✅ DO: Hash for sessions (more efficient)
import { getSessionManager } from '@tickettoken/shared';
const sessionManager = getSessionManager();
await sessionManager.createSession(sessionId, userId, data);
const session = await sessionManager.getSession(sessionId);
```

### Before (api-gateway)
```typescript
// ❌ DON'T: Manual rate limiting with race conditions
const current = await redis.incr(key);
if (current === 1) {
  await redis.expire(key, 60);
}
if (current > limit) {
  throw new Error('Rate limited');
}
```

### After
```typescript
// ✅ DO: Atomic rate limiting with Lua
import { getRateLimiter } from '@tickettoken/shared';
const limiter = getRateLimiter();
const result = await limiter.slidingWindow(key, limit, windowMs);
if (!result.allowed) {
  throw new Error(`Rate limited. Retry after ${result.retryAfter}s`);
}
```

## Configuration

All Redis configuration uses environment variables:

```bash
REDIS_HOST=localhost      # Default: localhost
REDIS_PORT=6379          # Default: 6379
REDIS_PASSWORD=secret    # Optional
REDIS_DB=0               # Default: 0
REDIS_URL=redis://...    # Alternative: full URL (overrides above)
```

## Best Practices

1. **Use SCAN, never KEYS** - The scanner utility automatically uses SCAN
2. **Use Hashes for objects** - More efficient than JSON strings
3. **Use Lua scripts for atomicity** - Prevents race conditions
4. **Set TTLs on all keys** - Prevents memory leaks
5. **Use appropriate rate limiting** - Sliding window for critical ops, fixed for performance
6. **Separate pub/sub clients** - Automatically handled by ConnectionManager

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type {
  SessionData,
  RateLimitResult,
  GeoSearchResult,
  PubSubMessage,
} from '@tickettoken/shared';
```

## Error Handling

```typescript
import {
  RedisConnectionError,
  RedisOperationError,
  RedisScanError,
  RedisLockError,
  RedisRateLimitError,
} from '@tickettoken/shared';

try {
  await cache.get('key');
} catch (error) {
  if (error instanceof RedisConnectionError) {
    // Handle connection failure
  } else if (error instanceof RedisOperationError) {
    // Handle operation failure
  }
}
```

## License

Part of TicketToken platform - Internal use only.
