# Error Handling Standards & Best Practices
## TicketToken Platform - Comprehensive Research Document

**Stack:** Node.js/TypeScript/Fastify, PostgreSQL/Knex, Redis, Stripe, Solana, Microservices Architecture

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Sources & References](#4-sources--references)

---

## 1. Standards & Best Practices

### 1.1 RFC 7807 Problem Details for HTTP APIs

RFC 7807 (updated by RFC 9457) defines a standardized format for machine-readable error responses in HTTP APIs. This eliminates the need for custom error formats and provides consistency across services.

**Standard Problem Details Structure:**

```json
{
  "type": "https://api.tickettoken.com/errors/insufficient-funds",
  "title": "Insufficient Funds",
  "status": 403,
  "detail": "Your wallet balance is 0.5 SOL, but the transaction requires 1.2 SOL.",
  "instance": "/api/v1/tickets/purchase/abc123"
}
```

**RFC 7807 Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Recommended | URI reference identifying the problem type. Should resolve to human-readable documentation. Default: `about:blank` |
| `title` | Recommended | Short, human-readable summary of the problem type. Should NOT change between occurrences |
| `status` | Recommended | HTTP status code (must match actual HTTP response status) |
| `detail` | Optional | Human-readable explanation specific to THIS occurrence. Focus on helping client correct the problem |
| `instance` | Optional | URI reference identifying the specific occurrence (useful for support tickets) |

**Extension Fields for TicketToken:**

```json
{
  "type": "https://api.tickettoken.com/errors/validation",
  "title": "Validation Failed",
  "status": 422,
  "detail": "One or more fields failed validation",
  "instance": "/api/v1/events/create",
  "errors": [
    { "field": "price_cents", "message": "Must be a positive integer" },
    { "field": "start_date", "message": "Must be in the future" }
  ],
  "correlation_id": "req-abc123-def456",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

**Media Type:** `application/problem+json`

**Source:** https://datatracker.ietf.org/doc/html/rfc7807, https://www.rfc-editor.org/rfc/rfc9457.html

---

### 1.2 HTTP Status Code Usage

#### Status Code Categories

| Category | Range | Meaning |
|----------|-------|---------|
| Informational | 1xx | Request received, continuing process |
| Success | 2xx | Request successfully received, understood, accepted |
| Redirection | 3xx | Further action needed to complete request |
| Client Error | 4xx | Request contains errors (client's fault) |
| Server Error | 5xx | Server failed to fulfill valid request (server's fault) |

#### Critical Status Codes for TicketToken

**Success Codes:**

| Code | When to Use |
|------|-------------|
| `200 OK` | Successful GET, PUT, PATCH |
| `201 Created` | Successful POST creating a resource (include Location header) |
| `202 Accepted` | Request accepted for async processing (blockchain transactions) |
| `204 No Content` | Successful DELETE, or PUT/PATCH with no response body |

**Client Error Codes:**

| Code | When to Use |
|------|-------------|
| `400 Bad Request` | Malformed syntax, invalid JSON, missing required headers |
| `401 Unauthorized` | Missing or invalid authentication credentials |
| `403 Forbidden` | Valid credentials but insufficient permissions |
| `404 Not Found` | Resource doesn't exist (also use to hide existence from unauthorized users) |
| `409 Conflict` | Resource state conflict (duplicate ticket purchase, concurrent modification) |
| `422 Unprocessable Entity` | Valid syntax but semantic/business rule violation |
| `429 Too Many Requests` | Rate limit exceeded (include Retry-After header) |

**Server Error Codes:**

| Code | When to Use |
|------|-------------|
| `500 Internal Server Error` | Unexpected server errors (catch-all) |
| `502 Bad Gateway` | Upstream service returned invalid response (Stripe, Solana RPC) |
| `503 Service Unavailable` | Temporary overload or maintenance (include Retry-After) |
| `504 Gateway Timeout` | Upstream service didn't respond in time |

#### 400 vs 422 Decision Tree

```
Request Received
    │
    ▼
Is the request syntactically valid?
(Valid JSON, correct Content-Type, required headers present)
    │
    ├── NO → Return 400 Bad Request
    │
    ▼
Is the request semantically valid?
(Valid field values, business rules satisfied, references exist)
    │
    ├── NO → Return 422 Unprocessable Entity
    │
    ▼
Process the request → Return 2xx Success
```

**Source:** https://www.rfc-editor.org/rfc/rfc7231, https://beeceptor.com/docs/concepts/400-vs-422/

---

### 1.3 Error Categorization

#### Client vs Server Errors

| Category | HTTP Range | Characteristics | Retry Strategy |
|----------|------------|-----------------|----------------|
| Client Error | 4xx | Request is invalid, client must fix | Do NOT retry without changes |
| Server Error | 5xx | Server failed, request may be valid | Retry with exponential backoff |

#### Recoverable vs Fatal Errors

**Recoverable Errors (Can Retry):**
- Network timeouts (502, 503, 504)
- Rate limiting (429)
- Temporary unavailability (503)
- Transient database locks
- Blockchain transaction expiry

**Fatal Errors (Cannot Retry):**
- Validation failures (400, 422)
- Authentication failures (401)
- Authorization failures (403)
- Resource not found (404)
- Business rule violations

#### TicketToken Error Categories

```typescript
enum ErrorCategory {
  // Client Errors (do not retry)
  VALIDATION = 'VALIDATION',           // 400/422 - Invalid input
  AUTHENTICATION = 'AUTHENTICATION',   // 401 - Invalid/missing credentials
  AUTHORIZATION = 'AUTHORIZATION',     // 403 - Insufficient permissions
  NOT_FOUND = 'NOT_FOUND',             // 404 - Resource doesn't exist
  CONFLICT = 'CONFLICT',               // 409 - State conflict
  
  // Server Errors (may retry)
  INTERNAL = 'INTERNAL',               // 500 - Unexpected error
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE', // 502/503 - Stripe, Solana down
  TIMEOUT = 'TIMEOUT',                 // 504 - Upstream timeout
  
  // Domain-Specific
  PAYMENT_FAILED = 'PAYMENT_FAILED',   // Stripe declined
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR', // Solana transaction failed
  INVENTORY_ERROR = 'INVENTORY_ERROR'  // Tickets sold out
}
```

---

### 1.4 Async Error Handling in Node.js

#### Process-Level Error Handlers

**CRITICAL:** Always register global error handlers to prevent silent crashes.

```typescript
// Unhandled Promise Rejections - REQUIRED
process.on('unhandledRejection', (reason: Error, promise: Promise<any>) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason.message,
    stack: reason.stack,
    promise: promise.toString()
  });
  
  // In Node.js 15+, unhandled rejections crash the process by default
  // Log, alert, then exit gracefully
  process.exit(1);
});

// Uncaught Exceptions - REQUIRED
process.on('uncaughtException', (error: Error) => {
  logger.fatal('Uncaught Exception', {
    message: error.message,
    stack: error.stack
  });
  
  // ALWAYS exit after uncaughtException - state is unreliable
  process.exit(1);
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await server.close();
  await db.destroy();
  process.exit(0);
});
```

**Source:** https://dev.to/superiqbal7/catching-unhandled-promise-rejections-and-uncaughtexception-in-nodejs-2403

#### Async/Await Best Practices

```typescript
// GOOD: Always use try/catch with async/await
async function purchaseTicket(userId: string, eventId: string): Promise<Ticket> {
  try {
    const event = await eventService.findById(eventId);
    const payment = await stripeService.charge(userId, event.price);
    const ticket = await ticketService.create(userId, eventId, payment.id);
    return ticket;
  } catch (error) {
    // Re-throw with context
    throw new PurchaseError('Failed to purchase ticket', {
      cause: error,
      userId,
      eventId
    });
  }
}

// BAD: Floating promises (no await, no catch)
function badExample() {
  someAsyncOperation(); // Promise returned but not handled!
}

// GOOD: Always await or attach .catch()
function goodExample() {
  someAsyncOperation().catch(handleError);
  // OR
  await someAsyncOperation();
}
```

#### ESLint Rules for Promise Safety

```json
{
  "rules": {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "no-async-promise-executor": "error"
  }
}
```

**Source:** https://dzone.com/articles/unhandled-promise-rejections-nodejs-crash

---

### 1.5 Error Propagation in Microservices

#### Correlation IDs

Every request entering the system must have a unique correlation ID that propagates through all services.

```typescript
// Middleware to extract or generate correlation ID
fastify.addHook('onRequest', async (request, reply) => {
  const correlationId = request.headers['x-correlation-id'] 
    || request.headers['x-request-id']
    || crypto.randomUUID();
  
  request.correlationId = correlationId;
  reply.header('x-correlation-id', correlationId);
});

// Include in all outgoing requests
async function callDownstreamService(correlationId: string) {
  return fetch('http://payment-service/charge', {
    headers: {
      'x-correlation-id': correlationId,
      'x-trace-id': currentSpan.traceId,
      'x-span-id': currentSpan.spanId
    }
  });
}

// Include in all logs
logger.error('Payment failed', {
  correlationId: request.correlationId,
  error: error.message,
  service: 'ticket-service'
});
```

**Source:** https://www.sapphire.net/blogs-press-releases/correlation-id/

#### Distributed Tracing with OpenTelemetry

```typescript
import { trace, context, propagation } from '@opentelemetry/api';

const tracer = trace.getTracer('ticket-service');

async function processTicketPurchase(request: Request) {
  // Extract trace context from incoming request
  const ctx = propagation.extract(context.active(), request.headers);
  
  return context.with(ctx, async () => {
    const span = tracer.startSpan('processTicketPurchase');
    
    try {
      span.setAttribute('user.id', request.userId);
      span.setAttribute('event.id', request.eventId);
      
      const result = await purchaseTicket(request);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

#### Error Response Wrapping

When propagating errors between services, wrap them to preserve context:

```typescript
interface ServiceError {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  correlation_id: string;
  upstream_errors?: ServiceError[];  // Chain of errors from downstream services
}

// When catching errors from downstream services
async function callPaymentService(request: PaymentRequest): Promise<PaymentResult> {
  try {
    return await paymentClient.charge(request);
  } catch (error) {
    if (error.response?.status >= 400) {
      throw new ExternalServiceError('Payment service error', {
        status: error.response.status === 502 ? 502 : 500,
        upstream_error: error.response.data,
        service: 'payment-service'
      });
    }
    throw error;
  }
}
```

**Source:** https://www.geeksforgeeks.org/system-design/distributed-tracing-in-microservices/

---

### 1.6 User-Facing vs Internal Error Messages

#### Separation of Concerns

**User-Facing Messages:**
- Clear, actionable, non-technical
- No stack traces, file paths, or system details
- Translated/localized when needed
- Include error code for support reference

**Internal Messages:**
- Full technical details
- Stack traces with source maps
- Request/response payloads
- System state at time of error

```typescript
// Error class with dual messages
class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly userMessage: string;  // Safe to show to users
  public readonly internalMessage: string;  // For logs only
  public readonly context: Record<string, any>;  // Internal context
  
  constructor(options: {
    message: string;
    userMessage: string;
    statusCode: number;
    code: string;
    context?: Record<string, any>;
  }) {
    super(options.message);
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.internalMessage = options.message;
    this.context = options.context || {};
  }
}

// Usage
throw new AppError({
  message: `Database constraint violation: unique_email on users table, value=${email}`,
  userMessage: 'An account with this email already exists',
  statusCode: 409,
  code: 'USER_EMAIL_EXISTS',
  context: { email, table: 'users', constraint: 'unique_email' }
});
```

#### Fastify Error Handler with Message Separation

```typescript
fastify.setErrorHandler((error, request, reply) => {
  const correlationId = request.correlationId;
  
  // ALWAYS log full error internally
  request.log.error({
    correlationId,
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
      context: error.context
    },
    request: {
      method: request.method,
      url: request.url,
      userId: request.user?.id
    }
  });
  
  // Determine user-safe response
  const isAppError = error instanceof AppError;
  const isProd = process.env.NODE_ENV === 'production';
  
  const response = {
    type: `https://api.tickettoken.com/errors/${error.code || 'internal'}`,
    title: isAppError ? error.userMessage : 'An unexpected error occurred',
    status: error.statusCode || 500,
    detail: isAppError ? error.userMessage : 'Please try again later',
    instance: request.url,
    correlation_id: correlationId,
    // NEVER include in production
    ...(isProd ? {} : {
      debug: {
        message: error.message,
        stack: error.stack?.split('\n')
      }
    })
  };
  
  reply
    .status(response.status)
    .header('content-type', 'application/problem+json')
    .send(response);
});
```

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Leaking Stack Traces to Clients

**VULNERABILITY:** Exposing stack traces reveals internal file paths, library versions, and code structure to attackers.

**OWASP Warning:** "Unhandled errors can assist an attacker in the Reconnaissance phase, which is very important for the rest of the attack."

**BAD - Exposes internals:**
```json
{
  "error": "TypeError: Cannot read property 'id' of undefined",
  "stack": "TypeError: Cannot read property 'id' of undefined\n    at TicketService.purchase (/app/src/services/ticket.service.ts:45:23)\n    at processTickHandler (/app/src/handlers/ticket.handler.ts:12:5)"
}
```

**GOOD - Safe error response:**
```json
{
  "type": "https://api.tickettoken.com/errors/internal",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred. Please try again.",
  "correlation_id": "req-abc123"
}
```

**Source:** https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html

---

### 2.2 Exposing Internal System Details

**VULNERABILITY:** Database errors, file paths, and infrastructure details aid attackers.

**Dangerous Information to NEVER Expose:**

| Type | Example | Risk |
|------|---------|------|
| Database errors | `ERROR: duplicate key value violates unique constraint "users_email_key"` | Schema exposure |
| SQL queries | `SELECT * FROM users WHERE id = 'abc'` | SQL injection hints |
| File paths | `/var/www/tickettoken/src/services/payment.ts` | Server structure |
| Library versions | `Express 4.17.1`, `pg 8.7.1` | Known vulnerability targeting |
| Server details | `nginx/1.18.0`, `Node.js v16.14.0` | Version-specific exploits |
| Internal IPs | `192.168.1.50:5432` | Network mapping |

**Sanitization Function:**
```typescript
function sanitizeErrorForClient(error: Error): string {
  const sensitivePatterns = [
    /at .+\.(ts|js):\d+:\d+/gi,  // Stack trace lines
    /\/[a-z0-9_\-\/]+\.(ts|js)/gi,  // File paths
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,  // IP addresses
    /password|secret|key|token|credential/gi,  // Sensitive words
    /SELECT|INSERT|UPDATE|DELETE|FROM|WHERE/gi,  // SQL keywords
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/gi,  // Network errors
  ];
  
  let message = error.message;
  for (const pattern of sensitivePatterns) {
    message = message.replace(pattern, '[REDACTED]');
  }
  return message;
}
```

**Source:** https://owasp.org/www-project-cheat-sheets/

---

### 2.3 Inconsistent Error Formats Across Services

**PROBLEM:** Different services returning different error structures breaks client error handling.

**BAD - Inconsistent formats:**
```javascript
// Service A
{ "error": "Not found" }

// Service B
{ "message": "Resource not found", "code": 404 }

// Service C
{ "errors": [{ "msg": "not found" }], "status": "fail" }
```

**SOLUTION:** Standardize on RFC 7807 across ALL services:

```typescript
// Shared error response factory
export function createProblemResponse(options: {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  correlationId: string;
  extensions?: Record<string, any>;
}): ProblemDetails {
  return {
    type: `https://api.tickettoken.com/errors/${options.type}`,
    title: options.title,
    status: options.status,
    detail: options.detail,
    instance: options.instance,
    correlation_id: options.correlationId,
    ...options.extensions
  };
}
```

**Create shared npm package `@tickettoken/errors` for all services.**

---

### 2.4 Swallowing Errors Silently

**VULNERABILITY:** Silent error swallowing hides bugs and makes debugging impossible.

**BAD - Swallowed error:**
```typescript
try {
  await riskyOperation();
} catch (error) {
  // Silent swallow - BUG HIDING!
}

// Or worse:
promise.catch(() => {});  // Intentionally ignoring errors
```

**GOOD - Always log or re-throw:**
```typescript
try {
  await riskyOperation();
} catch (error) {
  // Option 1: Log and re-throw
  logger.error('Operation failed', { error });
  throw error;
  
  // Option 2: Log and return default (with explicit comment)
  logger.warn('Operation failed, using default', { error });
  return defaultValue;  // Intentional fallback
  
  // Option 3: Transform and re-throw
  throw new AppError({
    message: 'Operation failed',
    cause: error,
    code: 'OPERATION_FAILED'
  });
}
```

**ESLint Rule:**
```json
{
  "rules": {
    "no-empty": ["error", { "allowEmptyCatch": false }]
  }
}
```

---

### 2.5 Missing Error Handling on Async Operations

**VULNERABILITY:** Unhandled async operations crash Node.js processes.

**BAD - Floating promises:**
```typescript
// No await, no catch - crash waiting to happen
async function processWebhook(data) {
  updateDatabase(data);  // Returns promise, not awaited!
  sendNotification(data);  // Returns promise, not awaited!
}

// Event handler without error handling
eventEmitter.on('ticket.purchased', (event) => {
  sendEmail(event.userId);  // Async but no error handling
});
```

**GOOD - Proper async handling:**
```typescript
async function processWebhook(data) {
  await updateDatabase(data);
  await sendNotification(data);
}

// Fire-and-forget with error handling
eventEmitter.on('ticket.purchased', async (event) => {
  try {
    await sendEmail(event.userId);
  } catch (error) {
    logger.error('Failed to send purchase email', { error, event });
    // Don't re-throw - event handlers shouldn't throw
  }
});

// Alternative: Use queue for reliability
eventEmitter.on('ticket.purchased', (event) => {
  emailQueue.add('purchase-confirmation', event)
    .catch(error => logger.error('Failed to queue email', { error }));
});
```

**Source:** https://thecodebarbarian.com/unhandled-promise-rejections-in-node.js.html

---

### 2.6 Uncaught Promise Rejections

**CRITICAL:** In Node.js 15+, unhandled promise rejections terminate the process.

**Detection with --unhandled-rejections flag:**
```bash
# Development: warn about unhandled rejections
node --unhandled-rejections=warn app.js

# Production: crash on unhandled rejections (default in Node 15+)
node --unhandled-rejections=throw app.js
```

**Global Safety Net (but don't rely on it):**
```typescript
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.stack : reason,
    promise: String(promise)
  });
  
  // Send to error tracking
  Sentry.captureException(reason);
  
  // Graceful shutdown
  gracefulShutdown();
});
```

**Source:** https://medium.com/@arashramy/node-js-process-unhandledrejection-event-8a1c1b354707

---

### 2.7 Error Handling in Webhooks and Background Jobs

#### Webhook Error Handling (Stripe)

**CRITICAL:** Always return 200 for received webhooks, even if processing fails. Otherwise, Stripe retries indefinitely.

```typescript
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), 
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    
    // 1. Verify signature
    try {
      event = stripe.webhooks.constructEvent(
        req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      logger.error('Webhook signature verification failed', { error });
      return res.status(400).send('Invalid signature');
    }
    
    // 2. Check idempotency - prevent duplicate processing
    const processed = await redis.get(`webhook:${event.id}`);
    if (processed) {
      logger.info('Webhook already processed', { eventId: event.id });
      return res.status(200).json({ received: true });
    }
    
    // 3. Mark as processing
    await redis.setex(`webhook:${event.id}`, 86400, 'processing');
    
    // 4. Process event (but catch errors!)
    try {
      await processStripeEvent(event);
      await redis.setex(`webhook:${event.id}`, 86400, 'completed');
    } catch (error) {
      logger.error('Webhook processing failed', { 
        eventId: event.id, 
        error 
      });
      // Queue for retry, but still return 200!
      await webhookRetryQueue.add('stripe-webhook', { event });
    }
    
    // 5. ALWAYS return 200 to acknowledge receipt
    return res.status(200).json({ received: true });
  }
);
```

**Source:** https://docs.stripe.com/webhooks/process-undelivered-events

#### Background Job Error Handling (BullMQ)

```typescript
import { Worker, Queue } from 'bullmq';

const emailQueue = new Queue('email', { connection: redis });

// Worker with proper error handling
const worker = new Worker('email', async (job) => {
  // BullMQ catches thrown errors automatically
  // DO NOT wrap in try/catch unless you need custom handling
  
  const { to, template, data } = job.data;
  await emailService.send(to, template, data);
  
  // Return value stored as job result
  return { sent: true, timestamp: Date.now() };
}, {
  connection: redis,
  concurrency: 5,
  // Retry configuration
  settings: {
    backoffStrategy: (attemptsMade) => {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      return Math.min(Math.pow(2, attemptsMade) * 1000, 30000);
    }
  }
});

// Job configuration with retries
await emailQueue.add('welcome-email', {
  to: user.email,
  template: 'welcome',
  data: { name: user.name }
}, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000
  },
  removeOnComplete: 100,  // Keep last 100 completed
  removeOnFail: 1000      // Keep last 1000 failed for debugging
});

// CRITICAL: Attach error listener to prevent crashes
worker.on('error', (error) => {
  logger.error('Worker error', { error });
});

worker.on('failed', (job, error) => {
  logger.error('Job failed', {
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    error: error.message
  });
  
  // Alert if max retries reached
  if (job?.attemptsMade >= 5) {
    alerting.send('Job permanently failed', { job, error });
  }
});

worker.on('stalled', (jobId) => {
  logger.warn('Job stalled', { jobId });
});
```

**Dead Letter Queue Pattern:**
```typescript
// Move permanently failed jobs to DLQ for manual inspection
worker.on('failed', async (job, error) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await deadLetterQueue.add('failed-email', {
      originalJob: job.data,
      error: error.message,
      stack: error.stack,
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade
    });
  }
});
```

**Source:** https://docs.bullmq.io/guide/retrying-failing-jobs, https://docs.bullmq.io/guide/workers

---

## 3. Audit Checklist

### 3.1 Route Handler Checklist

#### Fastify Error Handling

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **RH1** | Global error handler registered with `setErrorHandler` | CRITICAL | `grep -r "setErrorHandler" src/` |
| **RH2** | Error handler registered BEFORE routes | CRITICAL | Check app initialization order |
| **RH3** | Not Found handler registered with `setNotFoundHandler` | HIGH | `grep -r "setNotFoundHandler" src/` |
| **RH4** | Schema validation errors produce consistent format | HIGH | Test invalid payload response format |
| **RH5** | Error handler returns RFC 7807 Problem Details | HIGH | Test any error endpoint response |
| **RH6** | Correlation ID included in all error responses | HIGH | Check `correlation_id` in responses |
| **RH7** | Stack traces NOT exposed in production | CRITICAL | `curl` any 500 error in prod |
| **RH8** | All async route handlers use async/await | HIGH | `grep -r "function.*request.*reply" --include="*.ts"` |
| **RH9** | No floating promises in route handlers | CRITICAL | Run ESLint with `@typescript-eslint/no-floating-promises` |
| **RH10** | Response status matches Problem Details status field | MEDIUM | Compare HTTP status vs body status |

**Fastify Error Handler Template:**
```typescript
// src/plugins/error-handler.ts
import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';

export default async function errorHandler(fastify: FastifyInstance) {
  // MUST be registered before routes
  fastify.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = request.headers['x-correlation-id'] || request.id;
    
    // Log full error internally
    request.log.error({
      correlationId,
      err: error,
      req: {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body
      }
    });
    
    // Determine appropriate status code
    let statusCode = error.statusCode || 500;
    if (error.validation) {
      statusCode = 422;
    }
    
    // Build RFC 7807 response
    const response = {
      type: `https://api.tickettoken.com/errors/${error.code || 'internal'}`,
      title: statusCode >= 500 ? 'Internal Server Error' : error.message,
      status: statusCode,
      detail: statusCode >= 500 
        ? 'An unexpected error occurred' 
        : error.message,
      instance: request.url,
      correlation_id: correlationId,
      ...(error.validation && {
        errors: error.validation
      })
    };
    
    reply
      .status(statusCode)
      .header('content-type', 'application/problem+json')
      .send(response);
  });
  
  fastify.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .header('content-type', 'application/problem+json')
      .send({
        type: 'https://api.tickettoken.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Route ${request.method} ${request.url} not found`,
        instance: request.url
      });
  });
}
```

---

### 3.2 Service Layer Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **SL1** | All public methods have try/catch or throw typed errors | HIGH | Code review |
| **SL2** | Errors include context (IDs, operation type) | HIGH | Review error constructors |
| **SL3** | No empty catch blocks | CRITICAL | `grep -rn "catch.*{.*}" --include="*.ts" \| grep -v "log\|throw\|return"` |
| **SL4** | Domain errors extend base AppError class | MEDIUM | Check error class hierarchy |
| **SL5** | Error codes are documented and consistent | MEDIUM | Check error code enum |
| **SL6** | Sensitive data not included in error messages | CRITICAL | Review error message strings |
| **SL7** | External errors wrapped with context | HIGH | Check catch blocks calling external services |
| **SL8** | Timeouts configured for all I/O operations | HIGH | Check HTTP clients, DB connections |

**Service Error Pattern:**
```typescript
// src/services/ticket.service.ts
export class TicketService {
  async purchase(userId: string, eventId: string, quantity: number): Promise<Ticket[]> {
    // Validate business rules
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found', { eventId });
    }
    
    if (event.availableTickets < quantity) {
      throw new BusinessRuleError('Insufficient tickets available', {
        code: 'INSUFFICIENT_INVENTORY',
        requested: quantity,
        available: event.availableTickets
      });
    }
    
    // External service call with error wrapping
    let paymentIntent;
    try {
      paymentIntent = await this.stripeService.createPaymentIntent({
        amount: event.priceInCents * quantity,
        currency: 'usd',
        metadata: { eventId, userId, quantity }
      });
    } catch (error) {
      throw new ExternalServiceError('Payment processing failed', {
        service: 'stripe',
        operation: 'createPaymentIntent',
        cause: error
      });
    }
    
    // Database operation with transaction
    try {
      return await this.db.transaction(async (trx) => {
        await this.eventRepo.decrementAvailable(eventId, quantity, trx);
        return this.ticketRepo.createMany(userId, eventId, quantity, paymentIntent.id, trx);
      });
    } catch (error) {
      // Refund on database failure
      await this.stripeService.refund(paymentIntent.id).catch(refundError => {
        this.logger.error('Refund failed after DB error', { refundError, paymentIntent });
      });
      throw new DatabaseError('Failed to create tickets', { cause: error });
    }
  }
}
```

---

### 3.3 Knex/Database Error Handling Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **DB1** | All queries wrapped in try/catch | HIGH | Review repository files |
| **DB2** | Transactions used for multi-operation writes | CRITICAL | Check service methods with multiple writes |
| **DB3** | Transaction errors trigger rollback | CRITICAL | Review transaction code |
| **DB4** | Connection pool errors handled | HIGH | Check pool configuration |
| **DB5** | Database errors NOT exposed to clients | CRITICAL | Test constraint violation response |
| **DB6** | Unique constraint violations return 409 Conflict | MEDIUM | Test duplicate insert |
| **DB7** | Foreign key violations return 400/422 | MEDIUM | Test invalid reference |
| **DB8** | Query timeouts configured | HIGH | Check `acquireTimeoutMillis` |
| **DB9** | Connection pool has error event handler | HIGH | `grep -r "pool.*error" src/` |
| **DB10** | Migrations handle errors gracefully | MEDIUM | Review migration files |

**Knex Error Handling Pattern:**
```typescript
// src/repositories/base.repository.ts
export class BaseRepository {
  constructor(protected db: Knex) {}
  
  protected async executeQuery<T>(
    operation: string,
    query: () => Promise<T>
  ): Promise<T> {
    try {
      return await query();
    } catch (error) {
      throw this.transformDatabaseError(error, operation);
    }
  }
  
  private transformDatabaseError(error: any, operation: string): AppError {
    // PostgreSQL error codes
    switch (error.code) {
      case '23505': // unique_violation
        return new ConflictError('Resource already exists', {
          code: 'DUPLICATE_ENTRY',
          constraint: error.constraint,
          detail: error.detail
        });
      
      case '23503': // foreign_key_violation
        return new ValidationError('Referenced resource does not exist', {
          code: 'INVALID_REFERENCE',
          constraint: error.constraint
        });
      
      case '23502': // not_null_violation
        return new ValidationError('Required field is missing', {
          code: 'MISSING_REQUIRED_FIELD',
          column: error.column
        });
      
      case '57014': // query_canceled (timeout)
        return new TimeoutError('Database query timed out', {
          operation,
          timeout: this.db.client.config.pool?.acquireTimeoutMillis
        });
      
      case 'ECONNREFUSED':
      case 'ETIMEDOUT':
        return new ServiceUnavailableError('Database connection failed', {
          code: 'DATABASE_UNAVAILABLE'
        });
      
      default:
        return new DatabaseError('Database operation failed', {
          operation,
          originalCode: error.code,
          cause: error
        });
    }
  }
}

// Knex configuration with pool error handling
const knexConfig: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    propagateCreateError: false
  }
};

// Pool error handling
const db = knex(knexConfig);
db.client.pool.on('error', (error: Error) => {
  logger.error('Database pool error', { error });
});
```

**Transaction Pattern:**
```typescript
async function transferTicket(ticketId: string, fromUserId: string, toUserId: string) {
  const trx = await db.transaction();
  
  try {
    // Lock the ticket row
    const ticket = await trx('tickets')
      .where({ id: ticketId, owner_id: fromUserId })
      .forUpdate()
      .first();
    
    if (!ticket) {
      throw new NotFoundError('Ticket not found or not owned by user');
    }
    
    // Update ownership
    await trx('tickets')
      .where({ id: ticketId })
      .update({ owner_id: toUserId, transferred_at: new Date() });
    
    // Create transfer record
    await trx('ticket_transfers').insert({
      ticket_id: ticketId,
      from_user_id: fromUserId,
      to_user_id: toUserId
    });
    
    await trx.commit();
  } catch (error) {
    await trx.rollback();
    throw error;  // Re-throw after rollback
  }
}
```

**Source:** https://knexjs.org/faq/recipes

---

### 3.4 External Integration Checklist

#### Stripe Integration

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **ST1** | Webhook signature verified before processing | CRITICAL | Check `stripe.webhooks.constructEvent` |
| **ST2** | Webhook handler returns 200 even on processing errors | CRITICAL | Review webhook endpoint |
| **ST3** | Idempotency keys used for all POST requests | HIGH | Check `idempotencyKey` option |
| **ST4** | Stripe errors caught and categorized | HIGH | Review try/catch around Stripe calls |
| **ST5** | Rate limit errors handled with backoff | MEDIUM | Check for 429 handling |
| **ST6** | Webhook events deduplicated | HIGH | Check event ID storage |
| **ST7** | Card decline errors return user-friendly messages | MEDIUM | Test declined card response |
| **ST8** | API version locked to prevent breaking changes | MEDIUM | Check Stripe client initialization |

**Stripe Error Handling Pattern:**
```typescript
// src/services/stripe.service.ts
import Stripe from 'stripe';

export class StripeService {
  private stripe: Stripe;
  
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',  // Lock API version
      maxNetworkRetries: 2
    });
  }
  
  async createPaymentIntent(params: CreatePaymentParams): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.create({
        amount: params.amount,
        currency: params.currency,
        metadata: params.metadata
      }, {
        idempotencyKey: params.idempotencyKey  // ALWAYS use
      });
    } catch (error) {
      throw this.handleStripeError(error);
    }
  }
  
  private handleStripeError(error: any): AppError {
    if (error instanceof Stripe.errors.StripeError) {
      switch (error.type) {
        case 'StripeCardError':
          return new PaymentError(this.getCardErrorMessage(error.code), {
            code: 'CARD_DECLINED',
            decline_code: error.decline_code,
            // Safe to expose these to users
            userMessage: this.getCardErrorMessage(error.code)
          });
        
        case 'StripeRateLimitError':
          return new RateLimitError('Payment service rate limited', {
            retryAfter: 60
          });
        
        case 'StripeInvalidRequestError':
          return new ValidationError('Invalid payment request', {
            param: error.param
          });
        
        case 'StripeAPIError':
        case 'StripeConnectionError':
          return new ExternalServiceError('Payment service unavailable', {
            service: 'stripe',
            retryable: true
          });
        
        case 'StripeAuthenticationError':
          // This is a configuration error - alert ops
          this.alerting.critical('Stripe authentication failed');
          return new InternalError('Payment configuration error');
      }
    }
    
    return new ExternalServiceError('Payment processing failed', {
      service: 'stripe',
      cause: error
    });
  }
  
  private getCardErrorMessage(code: string | undefined): string {
    const messages: Record<string, string> = {
      'card_declined': 'Your card was declined. Please try a different card.',
      'insufficient_funds': 'Insufficient funds. Please try a different card.',
      'expired_card': 'Your card has expired. Please use a different card.',
      'incorrect_cvc': 'The security code is incorrect. Please check and try again.',
      'processing_error': 'An error occurred processing your card. Please try again.'
    };
    return messages[code || ''] || 'Your card could not be charged. Please try again.';
  }
}
```

**Source:** https://docs.stripe.com/error-handling?lang=node

#### Solana Integration

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **SOL1** | Transaction confirmation awaited properly | CRITICAL | Check `confirmTransaction` usage |
| **SOL2** | Blockhash expiry handled with retry | CRITICAL | Check `TransactionExpiredBlockheightExceededError` handling |
| **SOL3** | Transaction simulation errors caught | HIGH | Check preflight error handling |
| **SOL4** | RPC errors categorized (timeout vs rejection) | HIGH | Review Solana client error handling |
| **SOL5** | Multiple RPC endpoints configured for failover | MEDIUM | Check RPC configuration |
| **SOL6** | Compute budget estimated before sending | MEDIUM | Check `simulateTransaction` usage |
| **SOL7** | Priority fees added during congestion | MEDIUM | Check fee configuration |
| **SOL8** | Transaction status polled until finalized | HIGH | Check confirmation strategy |

**Solana Error Handling Pattern:**
```typescript
// src/services/solana.service.ts
import { 
  Connection, 
  Transaction, 
  sendAndConfirmTransaction,
  TransactionExpiredBlockheightExceededError
} from '@solana/web3.js';

export class SolanaService {
  private connections: Connection[];
  private currentConnectionIndex = 0;
  
  constructor() {
    // Multiple RPC endpoints for redundancy
    this.connections = [
      new Connection(process.env.SOLANA_RPC_PRIMARY!, 'confirmed'),
      new Connection(process.env.SOLANA_RPC_SECONDARY!, 'confirmed')
    ];
  }
  
  async sendTransaction(
    transaction: Transaction,
    signers: Keypair[],
    options: { maxRetries?: number } = {}
  ): Promise<string> {
    const maxRetries = options.maxRetries || 3;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const connection = this.getConnection();
      
      try {
        // Get fresh blockhash for each attempt
        const { blockhash, lastValidBlockHeight } = 
          await connection.getLatestBlockhash('finalized');
        
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        
        // Simulate first
        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) {
          throw new TransactionSimulationError(
            'Transaction simulation failed',
            simulation.value.err,
            simulation.value.logs
          );
        }
        
        // Send and confirm
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          signers,
          {
            commitment: 'confirmed',
            maxRetries: 0  // We handle retries ourselves
          }
        );
        
        return signature;
        
      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof TransactionExpiredBlockheightExceededError) {
          // Blockhash expired - get new one and retry
          this.logger.warn('Transaction expired, retrying', { attempt });
          continue;
        }
        
        if (this.isNetworkError(error)) {
          // Switch to backup RPC
          this.rotateConnection();
          continue;
        }
        
        // Non-retryable error
        throw this.transformSolanaError(error);
      }
    }
    
    throw new BlockchainError('Transaction failed after max retries', {
      cause: lastError,
      attempts: maxRetries
    });
  }
  
  private transformSolanaError(error: any): AppError {
    if (error.message?.includes('insufficient funds')) {
      return new InsufficientFundsError('Wallet has insufficient SOL', {
        code: 'INSUFFICIENT_SOL'
      });
    }
    
    if (error.message?.includes('custom program error')) {
      return new SmartContractError('NFT program error', {
        programError: error.message
      });
    }
    
    return new BlockchainError('Solana transaction failed', {
      cause: error
    });
  }
  
  private getConnection(): Connection {
    return this.connections[this.currentConnectionIndex];
  }
  
  private rotateConnection(): void {
    this.currentConnectionIndex = 
      (this.currentConnectionIndex + 1) % this.connections.length;
  }
  
  private isNetworkError(error: any): boolean {
    return error.message?.includes('ECONNREFUSED') ||
           error.message?.includes('ETIMEDOUT') ||
           error.message?.includes('fetch failed');
  }
}
```

**Source:** https://solana.com/docs/advanced/retry, https://docs.chainstack.com/docs/solana-how-to-handle-the-transaction-expiry-error

---

### 3.5 Distributed Systems Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **DS1** | Correlation ID generated at API gateway | CRITICAL | Check first service in chain |
| **DS2** | Correlation ID propagated in all service calls | CRITICAL | Check HTTP client headers |
| **DS3** | Correlation ID included in all logs | CRITICAL | `grep -r "correlationId" src/` |
| **DS4** | Circuit breaker implemented for external services | HIGH | Check service clients |
| **DS5** | Timeouts configured for all inter-service calls | CRITICAL | Check HTTP client configuration |
| **DS6** | Retry logic with exponential backoff | HIGH | Review retry configuration |
| **DS7** | Dead letter queues for failed async operations | HIGH | Check queue configuration |
| **DS8** | Error responses include source service | MEDIUM | Check error `instance` field |
| **DS9** | Health checks report dependency status | MEDIUM | Test `/health` endpoint |
| **DS10** | Graceful degradation when dependencies fail | MEDIUM | Test with dependency down |

**Circuit Breaker Pattern:**
```typescript
import CircuitBreaker from 'opossum';

const paymentCircuitBreaker = new CircuitBreaker(
  async (params: PaymentParams) => stripeService.charge(params),
  {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5
  }
);

paymentCircuitBreaker.on('open', () => {
  logger.warn('Payment circuit breaker opened');
  alerting.warn('Stripe service degraded');
});

paymentCircuitBreaker.on('halfOpen', () => {
  logger.info('Payment circuit breaker half-open, testing...');
});

paymentCircuitBreaker.on('close', () => {
  logger.info('Payment circuit breaker closed');
});

paymentCircuitBreaker.fallback(() => {
  throw new ServiceUnavailableError('Payment service temporarily unavailable', {
    retryAfter: 30
  });
});
```

---

### 3.6 Background Jobs Checklist

| ID | Check | Severity | Verification |
|----|-------|----------|--------------|
| **BJ1** | Worker has error event listener | CRITICAL | `grep -r "worker.on.*error" src/` |
| **BJ2** | Failed jobs have retry configuration | HIGH | Check job options |
| **BJ3** | Max retries configured per job type | HIGH | Review job definitions |
| **BJ4** | Exponential backoff configured | MEDIUM | Check backoff settings |
| **BJ5** | Dead letter queue for permanently failed jobs | HIGH | Check DLQ configuration |
| **BJ6** | Stalled job detection enabled | HIGH | Check worker settings |
| **BJ7** | Job progress tracked for long operations | MEDIUM | Check `job.updateProgress` usage |
| **BJ8** | Completed/failed job cleanup configured | MEDIUM | Check `removeOnComplete/removeOnFail` |
| **BJ9** | Job data includes correlation ID | HIGH | Check job payload structure |
| **BJ10** | Workers don't swallow errors | CRITICAL | Review worker processor functions |

---

## 4. Sources & References

### Standards & Specifications

1. **RFC 7807 - Problem Details for HTTP APIs**
   https://datatracker.ietf.org/doc/html/rfc7807

2. **RFC 9457 - Problem Details for HTTP APIs (Updated)**
   https://www.rfc-editor.org/rfc/rfc9457.html

3. **RFC 7231 - HTTP/1.1 Semantics and Content**
   https://www.rfc-editor.org/rfc/rfc7231

4. **MDN HTTP Status Codes**
   https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status

### OWASP Guidelines

5. **OWASP Error Handling Cheat Sheet**
   https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html

6. **OWASP Cheat Sheet Series**
   https://owasp.org/www-project-cheat-sheets/

### Framework Documentation

7. **Fastify Error Handling**
   https://fastify.dev/docs/latest/Reference/Errors/

8. **Fastify Server setErrorHandler**
   https://fastify.dev/docs/latest/Reference/Server/

9. **Knex.js Documentation**
   https://knexjs.org/guide/

10. **Knex.js Recipes**
    https://knexjs.org/faq/recipes

### Node.js Error Handling

11. **Unhandled Promise Rejections in Node.js**
    https://thecodebarbarian.com/unhandled-promise-rejections-in-node.js.html

12. **Catching Unhandled Promise Rejections**
    https://dev.to/superiqbal7/catching-unhandled-promise-rejections-and-uncaughtexception-in-nodejs-2403

13. **The Tiny Mistake That Crashed Our Node.js App**
    https://dzone.com/articles/unhandled-promise-rejections-nodejs-crash

### External Service Integration

14. **Stripe Error Handling**
    https://docs.stripe.com/error-handling?lang=node

15. **Stripe Webhook Processing**
    https://docs.stripe.com/webhooks/process-undelivered-events

16. **Stripe Idempotency**
    https://docs.stripe.com/api/errors/handling

17. **Solana Transaction Retries**
    https://solana.com/docs/advanced/retry

18. **Solana Transaction Expiry Error**
    https://docs.chainstack.com/docs/solana-how-to-handle-the-transaction-expiry-error

### Background Jobs

19. **BullMQ Retrying Failing Jobs**
    https://docs.bullmq.io/guide/retrying-failing-jobs

20. **BullMQ Workers**
    https://docs.bullmq.io/guide/workers

### Distributed Systems

21. **Correlation ID in Distributed Systems**
    https://www.sapphire.net/blogs-press-releases/correlation-id/

22. **Distributed Tracing Best Practices**
    https://www.atatus.com/blog/distributed-tracing-best-practices-for-microservices/

23. **Distributed Tracing in Microservices**
    https://www.geeksforgeeks.org/system-design/distributed-tracing-in-microservices/

24. **Observability in Microservices**
    https://microsoft.github.io/code-with-engineering-playbook/observability/microservices/

### HTTP Status Codes

25. **400 vs 422 Status Codes**
    https://beeceptor.com/docs/concepts/400-vs-422/

26. **HTTP Error Codes Guide**
    https://workos.com/blog/http-error-codes

---

## Quick Reference Card

### Error Response Template (RFC 7807)

```json
{
  "type": "https://api.tickettoken.com/errors/{error-code}",
  "title": "Human Readable Error Title",
  "status": 400,
  "detail": "Specific details about this error occurrence",
  "instance": "/api/v1/endpoint/resource-id",
  "correlation_id": "uuid-v4",
  "errors": []
}
```

### Status Code Quick Reference

| Scenario | Status Code |
|----------|-------------|
| Success with body | 200 |
| Resource created | 201 |
| Async processing started | 202 |
| Success, no body | 204 |
| Invalid JSON/syntax | 400 |
| Missing/invalid auth | 401 |
| Valid auth, no permission | 403 |
| Resource not found | 404 |
| Duplicate resource | 409 |
| Valid syntax, invalid data | 422 |
| Rate limited | 429 |
| Unexpected error | 500 |
| Upstream service error | 502 |
| Service unavailable | 503 |
| Upstream timeout | 504 |

### Must-Have Process Handlers

```typescript
process.on('unhandledRejection', handler);
process.on('uncaughtException', handler);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

---

*Document generated: December 2025*
*For: TicketToken Platform*
*Version: 1.0*