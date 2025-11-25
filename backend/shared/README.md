# @tickettoken/shared

> Shared utilities and middleware for the TicketToken platform

[![Version](https://img.shields.io/npm/v/@tickettoken/shared)](https://www.npmjs.com/package/@tickettoken/shared)
[![License](https://img.shields.io/npm/l/@tickettoken/shared)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)

## 📋 Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Requirements](#requirements)
- [Features](#features)
- [Usage](#usage)
  - [Security Utilities](#security-utilities)
  - [Distributed Locking](#distributed-locking)
  - [Audit Logging](#audit-logging)
  - [HTTP Utilities](#http-utilities)
  - [Cache Utilities](#cache-utilities)
  - [Message Queues](#message-queues)
- [API Reference](#api-reference)
- [Security](#security)
- [Migration Guides](#migration-guides)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Overview

`@tickettoken/shared` is a comprehensive shared library for the TicketToken platform, providing:

- **Security**: Rate limiting, XSS protection, SQL injection prevention, audit logging
- **Distributed Systems**: Redis-based distributed locking with Redlock
- **HTTP**: Configured Axios instances with retry logic
- **Caching**: Redis caching with TTL support
- **Messaging**: RabbitMQ queue configurations
- **Type Safety**: Full TypeScript support with strict mode enabled

## 📦 Installation

```bash
npm install @tickettoken/shared
```

### Peer Dependencies

This library requires the following peer dependencies:

```bash
npm install express@^4.18.0 redis@^4.0.0 pg@^8.0.0 typescript@^5.0.0
```

## ✅ Requirements

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **TypeScript**: >= 5.0.0

### Environment Variables

**Required:**

- `DATABASE_URL` - PostgreSQL connection string (for audit logging)
- `REDIS_URL` - Redis connection string (for rate limiting & caching)

**Optional:**

- `JWT_SECRET` - For authentication middleware
- `NODE_ENV` - Environment (development/production)

## 🚀 Features

### Security

- ✅ **Helmet** - Security headers
- ✅ **Rate Limiting** - Redis-backed rate limiting
- ✅ **SQL Injection Protection** - Request sanitization
- ✅ **XSS Protection** - Input sanitization
- ✅ **Audit Logging** - Compliance-ready audit trails
- ✅ **PII Sanitization** - Data privacy protection

### Distributed Systems

- ✅ **Distributed Locking** - Redlock implementation
- ✅ **Lock Retry Logic** - Automatic retry with backoff
- ✅ **Lock Metrics** - Performance monitoring

### HTTP & Networking

- ✅ **Axios Instance** - Pre-configured HTTP client
- ✅ **Retry Logic** - Automatic request retries
- ✅ **Timeout Handling** - Request timeouts

### Caching

- ✅ **Redis Caching** - Key-value caching
- ✅ **TTL Support** - Time-based expiration
- ✅ **Cache Invalidation** - Manual and automatic

### Messaging

- ✅ **Queue Configuration** - RabbitMQ queues
- ✅ **Search Sync** - Elasticsearch synchronization

## 📖 Usage

### Security Utilities

#### Helmet Middleware

```typescript
import { helmetMiddleware } from '@tickettoken/shared';
import express from 'express';

const app = express();
app.use(helmetMiddleware);
```

#### Rate Limiting

```typescript
import { rateLimiters } from '@tickettoken/shared';

// General API endpoints (100 req/min)
app.use('/api', rateLimiters.general);

// Auth endpoints (5 req/15min)
app.use('/api/auth', rateLimiters.auth);

// Payment endpoints (20 req/min)
app.use('/api/payments', rateLimiters.payment);

// Admin endpoints (50 req/min)
app.use('/api/admin', rateLimiters.admin);

// Scanning endpoints (500 req/min)
app.use('/api/scan', rateLimiters.scanning);
```

#### SQL Injection & XSS Protection

```typescript
import { sqlInjectionProtection, xssProtection } from '@tickettoken/shared';

app.use(sqlInjectionProtection);
app.use(xssProtection);
```

#### Request ID & IP Tracking

```typescript
import { requestIdMiddleware, ipMiddleware } from '@tickettoken/shared';

app.use(requestIdMiddleware);
app.use(ipMiddleware);

// Access in routes
app.get('/api/resource', (req, res) => {
  console.log('Request ID:', req.id);
  console.log('Client IP:', req.clientIp);
});
```

### Distributed Locking

```typescript
import { withLock, withLockRetry, LockKeys } from '@tickettoken/shared';

// Simple lock
await withLock(
  LockKeys.ORDER_PROCESSING(orderId),
  async () => {
    // Critical section - protected by lock
    await processOrder(orderId);
  },
  5000 // TTL in milliseconds
);

// Lock with retry
await withLockRetry(
  LockKeys.INVENTORY_UPDATE(itemId),
  async () => {
    // Will retry if lock is not immediately available
    await updateInventory(itemId);
  },
  {
    ttl: 5000,
    retries: 3,
    delay: 100,
  }
);

// Try lock (non-blocking)
import { tryLock } from '@tickettoken/shared';

const lock = await tryLock(LockKeys.USER_SESSION(userId), 5000);

if (lock) {
  try {
    // Got the lock
    await performAction();
  } finally {
    await lock.unlock();
  }
} else {
  // Lock not available
  console.log('Resource is locked');
}
```

#### Pre-defined Lock Keys

```typescript
import { LockKeys } from '@tickettoken/shared';

// Available lock keys
LockKeys.ORDER_PROCESSING(orderId);
LockKeys.TICKET_MINTING(ticketId);
LockKeys.INVENTORY_UPDATE(itemId);
LockKeys.USER_SESSION(userId);
LockKeys.PAYMENT_PROCESSING(paymentId);
```

### Audit Logging

```typescript
import { AuditLogger } from '@tickettoken/shared';

// Log an audit event
await AuditLogger.log({
  userId: user.id,
  action: 'TICKET_PURCHASE',
  resource: 'ticket',
  resourceId: ticket.id,
  metadata: {
    amount: 100.0,
    currency: 'USD',
    eventId: event.id,
  },
  ipAddress: req.clientIp,
  userAgent: req.headers['user-agent'],
});

// Close connections (during shutdown)
await AuditLogger.close();
```

#### Audit Service (Middleware)

```typescript
import { auditMiddleware, auditService } from '@tickettoken/shared';

// Use as middleware
app.use(auditMiddleware);

// Or use the service directly
await auditService.logAction({
  userId: user.id,
  action: 'LOGIN',
  resource: 'auth',
  ipAddress: req.clientIp,
});
```

### HTTP Utilities

```typescript
import { createAxiosInstance } from '@tickettoken/shared';

// Create configured Axios instance
const api = createAxiosInstance({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
});

// Use the instance
const response = await api.get('/users');
```

### Cache Utilities

```typescript
import { createCache } from '@tickettoken/shared';

const cache = createCache();

// Set with TTL
await cache.set('user:123', userData, 3600); // 1 hour

// Get
const user = await cache.get('user:123');

// Delete
await cache.del('user:123');

// Check exists
const exists = await cache.exists('user:123');
```

### Message Queues

```typescript
import { QUEUES, publishSearchSync } from '@tickettoken/shared';

// Queue names
console.log(QUEUES.TICKET_MINTING);
console.log(QUEUES.ORDER_PROCESSING);
console.log(QUEUES.EMAIL_NOTIFICATIONS);

// Publish to search sync
await publishSearchSync({
  action: 'index',
  type: 'ticket',
  id: ticket.id,
  data: ticket,
});

// Close connections (during shutdown)
await closeSearchSync();
```

### PII Sanitization

```typescript
import { PIISanitizer } from '@tickettoken/shared';

// Sanitize user data
const sanitized = PIISanitizer.sanitize(userData);

// Remove specific fields
const cleaned = PIISanitizer.removeFields(userData, ['ssn', 'creditCard', 'password']);
```

## 📚 API Reference

### Security Middleware

#### `helmetMiddleware`

Express middleware that sets security HTTP headers using Helmet.

#### `rateLimiters`

Object containing pre-configured rate limiters:

- `general`: 100 requests per minute
- `auth`: 5 requests per 15 minutes
- `payment`: 20 requests per minute
- `admin`: 50 requests per minute
- `scanning`: 500 requests per minute

#### `sqlInjectionProtection(req, res, next)`

Middleware that checks for SQL injection patterns in request inputs.

#### `xssProtection(req, res, next)`

Middleware that sanitizes request inputs to prevent XSS attacks.

#### `requestIdMiddleware(req, res, next)`

Adds a unique `req.id` to each request for tracing.

#### `ipMiddleware(req, res, next)`

Extracts client IP and adds `req.clientIp` to the request.

### Distributed Locking

#### `withLock(key, fn, ttl)`

Executes a function with a distributed lock.

**Parameters:**

- `key`: Lock identifier
- `fn`: Async function to execute
- `ttl`: Lock time-to-live in milliseconds

**Returns:** Result of the function

#### `withLockRetry(key, fn, options)`

Executes a function with retry logic.

**Parameters:**

- `key`: Lock identifier
- `fn`: Async function to execute
- `options`: `{ ttl, retries, delay }`

#### `tryLock(key, ttl)`

Attempts to acquire a lock without blocking.

**Returns:** Lock object or null

### Audit Logging

#### `AuditLogger.log(entry)`

Logs an audit event to the database.

**Parameters:**

- `entry`: `AuditEntry` object with user action details

#### `AuditLogger.close()`

Closes database connections.

### Types

```typescript
import type { Request, Response, NextFunction } from '@tickettoken/shared';

// All Express types are re-exported for convenience
```

## 🔒 Security

### Security Best Practices

1. **Never commit credentials** - Use environment variables
2. **Rotate credentials regularly** - See PHASE0_SECURITY_INCIDENT_REPORT.md
3. **Enable all security middleware** - Helmet, rate limiting, input validation
4. **Use audit logging** - For compliance and forensics
5. **Implement proper error handling** - Don't leak sensitive information

### Required Environment Variables

```bash
# REQUIRED - No fallback values
DATABASE_URL=postgresql://user:password@host:port/database
REDIS_URL=redis://host:port

# Optional but recommended
JWT_SECRET=your-secret-key
NODE_ENV=production
```

### Security Features

- ✅ **No hardcoded credentials** (as of v1.0.1)
- ✅ **Mandatory environment variables** (fail-fast if missing)
- ✅ **Rate limiting** (prevent brute force & DDoS)
- ✅ **SQL injection protection** (input validation)
- ✅ **XSS protection** (output sanitization)
- ✅ **Audit logging** (compliance & forensics)
- ✅ **Type safety** (TypeScript strict mode)

## 📋 Migration Guides

### From v1.0.0 to v1.0.1

**BREAKING CHANGES:**

1. **Environment Variables Now Required**

   ```bash
   # These MUST be set - no fallbacks
   DATABASE_URL=postgresql://...
   REDIS_URL=redis://...
   ```

2. **Credential Rotation Required**
   - See PHASE0_SECURITY_INCIDENT_REPORT.md
   - Rotate database password immediately
   - Verify REDIS_URL is configured

3. **Update Your Code**

   ```bash
   npm install @tickettoken/shared@1.0.1
   ```

4. **Test Before Deployment**
   - Services will crash if environment variables are missing
   - This is intentional for security

See [CHANGELOG.md](CHANGELOG.md) for detailed migration instructions.

### From v1.0.1 to v1.1.0 (Upcoming)

**Non-breaking changes:**

- TypeScript strict mode enabled
- Additional exports added
- Peer dependencies clarified
- README and documentation improved

No migration required.

## 🤝 Contributing

### Development Setup

```bash
# Clone the repository
git clone https://github.com/tickettoken/platform.git
cd platform/backend/shared

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Code Quality

- TypeScript strict mode enabled
- All public APIs must be typed
- Unit tests required for new features
- Security review required for changes

### Security

**DO NOT:**

- Commit credentials or secrets
- Create fallback values for sensitive configuration
- Disable security middleware in production

**DO:**

- Use environment variables for all configuration
- Add audit logging for sensitive operations
- Follow principle of least privilege
- Document security considerations

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🆘 Support

- **Security Issues**: Report to security@tickettoken.com (DO NOT file public issues)
- **Bugs & Features**: File issues on GitHub
- **Documentation**: https://docs.tickettoken.com

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and migration guides.

## 🔗 Related Packages

- `@tickettoken/sdk-typescript` - TypeScript SDK
- `@tickettoken/sdk-react` - React components
- `@tickettoken/sdk-javascript` - JavaScript SDK

---

**Made with ❤️ by the TicketToken team**
