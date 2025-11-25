# ORDER SERVICE REMEDIATION PLAN

**Created:** November 17, 2025  
**Auditor:** Platform Security Team  
**Service:** order-service (v1.0.0)  
**Port:** 3016  
**Audit Reference:** ORDER_SERVICE_AUDIT.md  

---

## 🎯 EXECUTIVE SUMMARY

This remediation plan validates and provides actionable fixes for **ALL findings** identified in the ORDER_SERVICE_AUDIT.md. Through comprehensive code examination, I have confirmed that **100% of audit findings are ACCURATE** with exact file locations and line numbers documented.

### Validation Results

**Status:** ✅ ALL AUDIT FINDINGS VALIDATED

- 🔴 **6 CRITICAL Blockers** - All confirmed, must fix before deployment
- 🟡 **4 HIGH Priority** - All confirmed, fix immediately after blockers
- 🟢 **3 MEDIUM Priority** - All confirmed, quality improvements

### Deployment Verdict

**🔴 DO NOT DEPLOY TO PRODUCTION**

**Rationale:** Critical security vulnerabilities make the service unsafe for production use. All endpoints are effectively public, price tampering is possible, and race conditions can cause double-sold tickets.

**Minimum Viable Deployment Requires:** Phases 1-2 (32 hours)  
**Full Production Readiness:** All 5 Phases (69 hours)

---

## 📋 CRITICAL FINDINGS VALIDATED (BLOCKERS)

### 1. Authentication Middleware Not Connected 🔴

**Severity:** CRITICAL  
**Impact:** All endpoints are publicly accessible  
**Effort:** 4 hours  

#### Validated Location
**File:** `backend/services/order-service/src/routes/order.routes.ts`  
**Lines:** 17-23, 34-38, 50-54, 66-72, 84-90, 102-108, 120-124

#### Evidence
```typescript
// Line 17-23
fastify.post(
  '/',
  {
    preHandler: [
      idempotency,
      // Authentication middleware will be added  ← COMMENT, NOT CODE
    ],
```

**Issue:** Auth middleware exists in `src/middleware/auth.middleware.ts` but is commented out in all route definitions.

#### Risk Assessment
- **Financial Risk:** HIGH - Unauthorized order creation/modification
- **Security Risk:** CRITICAL - No access control
- **Data Risk:** HIGH - User data accessible to anyone

#### Remediation Steps
1. Import authenticate middleware: `import { authenticate } from '../middleware/auth.middleware'`
2. Add to preHandler array for all routes:
   - POST `/` - Create order
   - GET `/:orderId` - Get order
   - GET `/` - List orders
   - POST `/:orderId/reserve` - Reserve order
   - POST `/:orderId/cancel` - Cancel order
   - POST `/:orderId/refund` - Refund order
   - GET `/:orderId/events` - Get order events

#### Implementation Example
```typescript
fastify.post(
  '/',
  {
    preHandler: [
      idempotency,
      authenticate,  // ← ADD THIS
    ],
    // ... rest of config
  },
  async (request, reply) => controller.createOrder(request, reply)
);
```

---

### 2. Internal Routes Unprotected 🔴

**Severity:** CRITICAL  
**Impact:** Service-to-service endpoints accessible to anyone  
**Effort:** 2 hours  

#### Validated Location
**File:** `backend/services/order-service/src/routes/internal.routes.ts`  
**Lines:** 8-12, 17-21, 26-30, 35-39

#### Evidence
```typescript
// Line 8-12
fastify.post(
  '/internal/v1/orders/:orderId/confirm',
  {
    preHandler: [
      // Internal service authentication  ← COMMENT, NOT CODE
    ],
  },
```

**Issue:** Internal auth middleware exists in `src/middleware/internal-auth.middleware.ts` but is not connected.

#### Risk Assessment
- **Security Risk:** CRITICAL - Attackers can confirm/expire orders
- **Data Integrity:** HIGH - Order state manipulation possible

#### Remediation Steps
1. Import internal auth: `import { internalAuth } from '../middleware/internal-auth.middleware'`
2. Add to preHandler for all internal routes:
   - POST `/internal/v1/orders/:orderId/confirm`
   - POST `/internal/v1/orders/:orderId/expire`
   - GET `/internal/v1/orders/expiring`
   - POST `/internal/v1/orders/bulk/cancel`

---

### 3. No Distributed Locking (Race Conditions) 🔴

**Severity:** CRITICAL  
**Impact:** Double-sold tickets possible  
**Effort:** 8 hours  

#### Validated Location
**File:** `backend/services/order-service/src/services/redis.service.ts`  
**Lines:** 1-62 (entire file)

**File:** `backend/services/order-service/src/services/order.service.ts`  
**Lines:** 145-163 (reserveOrder method)

#### Evidence
Redis service only provides basic get/set operations:
```typescript
async get(key: string): Promise<string | null> { }
async set(key: string, value: string, ttlSeconds?: number): Promise<void> { }
async del(key: string): Promise<number> { }
```

**Missing:** Lock acquisition/release methods (SETNX, DEL with token verification)

#### Race Condition Scenario
```
Time    User A                          User B
0ms     Check ticket availability ✓     
50ms                                    Check ticket availability ✓
100ms   Reserve tickets                 
150ms                                   Reserve tickets
200ms   Both succeed → DOUBLE-SOLD!
```

#### Risk Assessment
- **Financial Risk:** HIGH - Revenue loss from oversold tickets
- **Reputational Risk:** HIGH - Customer dissatisfaction

#### Remediation Steps

**Step 1:** Add distributed lock methods to RedisService
```typescript
// Add to src/services/redis.service.ts

async acquireLock(
  lockKey: string, 
  ttlMs: number,
  retries: number = 3
): Promise<boolean> {
  const lockValue = `${Date.now()}-${Math.random()}`;
  
  for (let i = 0; i < retries; i++) {
    const result = await this.client.set(
      lockKey, 
      lockValue, 
      'PX', 
      ttlMs, 
      'NX'
    );
    
    if (result === 'OK') {
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  return false;
}

async releaseLock(lockKey: string): Promise<void> {
  await this.client.del(lockKey);
}
```

**Step 2:** Use locks in order.service.ts reserveOrder method
```typescript
// Modify src/services/order.service.ts:145-163

async reserveOrder(request: ReserveOrderRequest): Promise<...> {
  const lockKey = `order:reserve:${request.orderId}`;
  const lockAcquired = await RedisService.acquireLock(lockKey, 10000);
  
  if (!lockAcquired) {
    throw new Error('Unable to acquire lock, please retry');
  }
  
  try {
    // Existing reservation logic here
    
  } finally {
    await RedisService.releaseLock(lockKey);
  }
}
```

---

### 4. Price Validation Missing (Price Tampering) 🔴

**Severity:** CRITICAL  
**Impact:** Clients can set arbitrary prices  
**Effort:** 6 hours  

#### Validated Location
**File:** `backend/services/order-service/src/services/order.service.ts`  
**Lines:** 71-77 (createOrder method)

#### Evidence
```typescript
// Line 71-77
const subtotalCents = request.items.reduce((sum, item) =>
  sum + (item.unitPriceCents * item.quantity), 0  // ← CLIENT-PROVIDED PRICE!
);
```

**Issue:** Service trusts client-provided `unitPriceCents` without validation against ticket-service.

#### Attack Scenario
```json
{
  "items": [
    {
      "ticketTypeId": "real-ticket-id",
      "quantity": 10,
      "unitPriceCents": 1  // ← Should be 10000 ($100), attacker sends $0.01
    }
  ]
}
```

#### Risk Assessment
- **Financial Risk:** CRITICAL - Direct revenue loss
- **Security Risk:** HIGH - Exploitable vulnerability

#### Remediation Steps

**Step 1:** Add getPrices method to TicketClient
```typescript
// Add to src/services/ticket.client.ts

async getPrices(
  ticketTypeIds: string[]
): Promise<Record<string, number>> {
  const response = await this.makeRequest('/internal/prices', {
    method: 'POST',
    data: { ticketTypeIds }
  });
  
  return response.data.prices;
}
```

**Step 2:** Validate prices in createOrder
```typescript
// Modify src/services/order.service.ts:60-77

async createOrder(request: CreateOrderRequest): Promise<...> {
  // 1. Validate event exists
  const event = await this.eventClient.getEvent(request.eventId);
  
  // 2. Get actual prices from ticket-service
  const ticketTypeIds = request.items.map(i => i.ticketTypeId);
  const actualPrices = await this.ticketClient.getPrices(ticketTypeIds);
  
  // 3. Validate client prices match actual prices
  for (const item of request.items) {
    const actualPrice = actualPrices[item.ticketTypeId];
    
    if (!actualPrice) {
      throw new Error(`Invalid ticket type: ${item.ticketTypeId}`);
    }
    
    if (item.unitPriceCents !== actualPrice) {
      throw new Error(
        `Price mismatch for ${item.ticketTypeId}: ` +
        `expected ${actualPrice}, got ${item.unitPriceCents}`
      );
    }
  }
  
  // 4. Calculate pricing using validated prices
  const subtotalCents = request.items.reduce((sum, item) =>
    sum + (actualPrices[item.ticketTypeId] * item.quantity), 0
  );
  
  // Continue with rest of order creation...
}
```

---

### 5. No Database Transactions 🔴

**Severity:** CRITICAL  
**Impact:** Partial failures leave inconsistent state  
**Effort:** 12 hours  

#### Validated Location
**File:** `backend/services/order-service/src/services/order.service.ts`  
**Lines:** Multiple methods (createOrder, reserveOrder, confirmOrder, cancelOrder)

#### Evidence
All database operations are individual queries:
```typescript
// Line 97
const order = await this.orderModel.create(orderData);

// Line 109
const items = await this.orderItemModel.createBulk(order.id, itemsData);

// Line 115
await this.orderEventModel.create({ ... });
```

**Issue:** No transaction wrapping - if step 2 fails, step 1 is not rolled back.

#### Failure Scenarios

**Scenario 1: Order Creation Failure**
```
1. ✅ Create order in DB
2. ✅ Create order items in DB
3. ❌ Reserve tickets fails (ticket-service down)
Result: Orphaned order + items in database
```

**Scenario 2: Cancellation Failure**
```
1. ✅ Release tickets
2. ✅ Cancel payment intent
3. ❌ Update order status fails (DB connection lost)
Result: Order still shows as active but tickets released
```

#### Risk Assessment
- **Data Integrity:** CRITICAL - Inconsistent state across tables
- **Operational Risk:** HIGH - Manual cleanup required

#### Remediation Steps

**Step 1:** Add transaction support to models
```typescript
// Modify src/models/order.model.ts

import { PoolClient } from 'pg';

export class OrderModel {
  async create(
    data: OrderData, 
    client?: PoolClient
  ): Promise<Order> {
    const db = client || this.pool;
    // Use db instead of this.pool for query
  }
}
```

**Step 2:** Wrap operations in transactions
```typescript
// Modify src/services/order.service.ts

async createOrder(request: CreateOrderRequest): Promise<...> {
  const client = await this.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1-5: All DB operations use client parameter
    const order = await this.orderModel.create(orderData, client);
    const items = await this.orderItemModel.createBulk(
      order.id, 
      itemsData, 
      client
    );
    await this.orderEventModel.create(eventData, client);
    
    await client.query('COMMIT');
    
    // 6-7: External calls AFTER commit
    await eventPublisher.publishOrderCreated(...);
    
    return { order, items };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Apply to all methods:**
- createOrder
- reserveOrder  
- confirmOrder
- cancelOrder
- refundOrder

---

### 6. Zero Test Coverage 🔴

**Severity:** CRITICAL  
**Impact:** No verification of business logic  
**Effort:** 20 hours  

#### Validated Location
**Directory:** `backend/services/order-service/tests/unit/`  
**Subdirectories:** controllers/, middleware/, models/, services/, utils/

#### Evidence
```bash
$ ls backend/services/order-service/tests/unit/controllers/
# No files found.

$ ls backend/services/order-service/tests/unit/services/
# No files found.
```

**All test directories are empty.**

#### Risk Assessment
- **Quality Risk:** CRITICAL - No validation of correctness
- **Regression Risk:** HIGH - Future changes may break functionality

#### Critical Untested Paths
1. ❌ Order creation with price calculation
2. ❌ Order reservation + ticket locking
3. ❌ Payment confirmation flow
4. ❌ Order cancellation + refund
5. ❌ Expiration job
6. ❌ Idempotency collision handling
7. ❌ Concurrent order attempts (race conditions)
8. ❌ State machine transitions
9. ❌ Price tampering prevention (after fix)
10. ❌ Distributed locking (after fix)

#### Remediation Steps

**Phase 1: Unit Tests (10 hours)**

Create test files:
- `tests/unit/services/order.service.test.ts` (4h)
- `tests/unit/middleware/idempotency.middleware.test.ts` (2h)
- `tests/unit/models/order.model.test.ts` (2h)
- `tests/unit/utils/money.test.ts` (1h)
- `tests/unit/validators/order.validator.test.ts` (1h)

**Phase 2: Integration Tests (6 hours)**

Create test files:
- `tests/integration/order-flow.test.ts` (3h)
- `tests/integration/race-conditions.test.ts` (2h)
- `tests/integration/price-validation.test.ts` (1h)

**Phase 3: E2E Tests (4 hours)**

Create test files:
- `tests/e2e/happy-path.test.ts` (2h)
- `tests/e2e/failure-scenarios.test.ts` (2h)

**Example Test Structure**
```typescript
// tests/unit/services/order.service.test.ts

describe('OrderService', () => {
  describe('createOrder', () => {
    it('should validate prices from ticket-service', async () => {
      // Test price validation
    });
    
    it('should reject client price tampering', async () => {
      // Test security
    });
    
    it('should use database transaction', async () => {
      // Test rollback on failure
    });
    
    it('should enforce idempotency', async () => {
      // Test duplicate prevention
    });
  });
  
  describe('reserveOrder', () => {
    it('should acquire distributed lock', async () => {
      // Test locking
    });
    
    it('should handle concurrent reservations', async () => {
      // Test race conditions
    });
  });
});
```

---

## 🟡 HIGH PRIORITY WARNINGS

### 7. Health Check Inadequate 🟡

**Severity:** HIGH  
**Impact:** K8s won't know if service is truly healthy  
**Effort:** 2 hours  

#### Validated Location
**File:** `backend/services/order-service/src/routes/health.routes.ts`  
**Lines:** 5-10

#### Evidence
```typescript
fastify.get('/health', async (request, reply) => {
  return {
    status: 'healthy',  // ← Always returns healthy!
    service: 'order-service',
    timestamp: new Date().toISOString()
  };
});
```

**Issue:** No dependency checks performed.

#### Remediation Steps
```typescript
fastify.get('/health', async (request, reply) => {
  const checks = {
    database: 'unknown',
    redis: 'unknown',
    rabbitmq: 'unknown',
    paymentService: 'unknown',
    ticketService: 'unknown'
  };
  
  try {
    // Check database
    await pool.query('SELECT 1');
    checks.database = 'ok';
  } catch (error) {
    checks.database = 'error';
  }
  
  try {
    // Check Redis
    await RedisService.get('health-check');
    checks.redis = 'ok';
  } catch (error) {
    checks.redis = 'error';
  }
  
  // Check RabbitMQ, payment-service, ticket-service...
  
  const isHealthy = Object.values(checks).every(c => c === 'ok');
  
  return reply.code(isHealthy ? 200 : 503).send({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'order-service',
    checks,
    timestamp: new Date().toISOString()
  });
});
```

---

### 8. Reconciliation Job Not Implemented 🟡

**Severity:** HIGH  
**Impact:** Inconsistent states won't be detected  
**Effort:** 4 hours  

#### Validated Location
**File:** `backend/services/order-service/src/jobs/reconciliation.job.ts`  
**Lines:** 33-40

#### Evidence
```typescript
private async reconcileOrderState(): Promise<void> {
  try {
    logger.info('Starting order reconciliation');

    // TODO: Implement reconciliation logic
    // 1. Find orders with inconsistent state
    // 2. Verify with ticket-service
    // 3. Verify with payment-service
    // 4. Fix discrepancies
    // 5. Alert on critical issues

    logger.info('Order reconciliation completed');
  } catch (error) {
    logger.error('Reconciliation job failed', { error });
  }
}
```

#### Remediation Steps
```typescript
private async reconcileOrderState(): Promise<void> {
  try {
    logger.info('Starting order reconciliation');
    
    // 1. Find stuck RESERVED orders (past expiration)
    const stuckOrders = await this.orderService
      .findOrdersByStatus('RESERVED')
      .filter(o => o.expiresAt < new Date());
    
    for (const order of stuckOrders) {
      // Check if payment was actually completed
      const payment = await paymentClient.getPayment(order.paymentIntentId);
      
      if (payment.status === 'succeeded') {
        // Confirm order (missed webhook)
        await this.orderService.confirmOrder({
          orderId: order.id,
          paymentIntentId: order.paymentIntentId
        });
        logger.warn('Fixed missed confirmation', { orderId: order.id });
      } else {
        // Expire as intended
        await this.orderService.expireReservation(order.id, 'reconciliation');
      }
    }
    
    // 2. Verify ticket allocations match order states
    const confirmedOrders = await this.orderService
      .findOrdersByStatus('CONFIRMED');
    
    for (const order of confirmedOrders) {
      const tickets = await ticketClient.getTicketsForOrder(order.id);
      const items = await this.orderService.getOrderItems(order.id);
      
      if (tickets.length !== items.reduce((sum, i) => sum + i.quantity, 0)) {
        logger.error('Ticket mismatch detected', {
          orderId: order.id,
          expected: items.reduce((sum, i) => sum + i.quantity, 0),
          actual: tickets.length
        });
        // Alert operations team
      }
    }
    
    logger.info('Order reconciliation completed');
  } catch (error) {
    logger.error('Reconciliation job failed', { error });
  }
}
```

---

### 9. Reminder Job Incomplete 🟡

**Severity:** HIGH  
**Impact:** Users won't get expiration warnings  
**Effort:** 3 hours  

#### Validated Location
**File:** `backend/services/order-service/src/jobs/reminder.job.ts`  
**Lines:** 60-64

#### Evidence
```typescript
// TODO: Publish event to notification service
// await eventBus.publish('order.expiring_soon', {
//   orderId: order.id,
//   userId: order.userId,
//   expiresAt: order.expiresAt,
// });
```

#### Remediation Steps
```typescript
try {
  // Publish event to notification service
  await eventPublisher.publish('order.expiring_soon', {
    orderId: order.id,
    userId: order.userId,
    orderNumber: order.orderNumber,
    expiresAt: order.expiresAt,
    minutesRemaining: Math.round(
      (order.expiresAt.getTime() - Date.now()) / 60000
    ),
    metadata: {
      totalCents: order.totalCents,
      currency: order.currency
    }
  });

  this.sentReminders.add(order.id);
  
  logger.debug('Expiration reminder sent', {
    orderId: order.id,
    expiresAt: order.expiresAt,
  });
} catch (error) {
  logger.error('Failed to send expiration reminder', {
    orderId: order.id,
    error: error instanceof Error ? error.message : error,
  });
}
```

---

### 10. Bulk Cancellation Not Implemented 🟡

**Severity:** HIGH  
**Impact:** Can't bulk cancel when event cancelled  
**Effort:** 4 hours  

#### Validated Location
**File:** `backend/services/order-service/src/controllers/internal.controller.ts`  
**Lines:** 82-85

#### Evidence
```typescript
// TODO: Implement bulk cancellation logic
// Query all orders for event, cancel each one
```

#### Remediation Steps
```typescript
async bulkCancelOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const body = request.body as any;
    const { eventId, reason } = body;
    
    if (!eventId || !reason) {
      return reply.status(400).send({ 
        error: 'eventId and reason are required' 
      });
    }
    
    // Find all active orders for this event
    const orders = await this.orderService.findOrdersByEvent(
      eventId,
      ['PENDING', 'RESERVED', 'CONFIRMED']
    );
    
    logger.info('Starting bulk cancellation', {
      eventId,
      orderCount: orders.length,
      reason
    });
    
    const results = {
      total: orders.length,
      succeeded: 0,
      failed: 0,
      errors: [] as any[]
    };
    
    // Cancel each order
    for (const order of orders) {
      try {
        await this.orderService.cancelOrder({
          orderId: order.id,
          userId: 'system',
          reason: `Event cancelled: ${reason}`
        });
        
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          orderId: order.id,
          error: error instanceof Error ? error.message : String(error)
        });
        
        logger.error('Failed to cancel order in bulk', {
          orderId: order.id,
          error
        });
      }
    }
    
    logger.info('Bulk cancellation completed', results);
    
    reply.send({
      message: 'Bulk cancellation completed',
      results
    });
  } catch (error) {
    logger.error('Error in bulkCancelOrders', { error });
    reply.status(500).send({ error: 'Failed to bulk cancel orders' });
  }
}
```

---

## 🟢 MEDIUM PRIORITY IMPROVEMENTS

### 11. Hardcoded Fee Rates 🟢

**Severity:** MEDIUM  
**Impact:** Can't adjust fees without code change  
**Effort:** 2 hours  

#### Validated Location
**File:** `backend/services/order-service/src/services/order.service.ts`  
**Lines:** 73-76

#### Evidence
```typescript
const platformFeeCents = Math.floor(subtotalCents * 0.05);  // 5% hardcoded
const processingFeeCents = Math.floor(subtotalCents * 0.029) + 30;  // 2.9% + $0.30
const taxCents = Math.floor((subtotalCents + platformFeeCents + processingFeeCents) * 0.08);  // 8%
```

#### Remediation Steps

**Step 1:** Add fee configuration
```typescript
// Add to src/config/order.config.ts

export const feeConfig = {
  platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT || '0.05'),
  processingFeePercent: parseFloat(process.env.PROCESSING_FEE_PERCENT || '0.029'),
  processingFeeFixed: parseInt(process.env.PROCESSING_FEE_FIXED_CENTS || '30'),
  taxPercent: parseFloat(process.env.TAX_PERCENT || '0.08')
};
```

**Step 2:** Use configuration
```typescript
const platformFeeCents = Math.floor(subtotalCents * feeConfig.platformFeePercent);
const processingFeeCents = Math.floor(subtotalCents * feeConfig.processingFeePercent) + feeConfig.processingFeeFixed;
const taxCents = Math.floor((subtotalCents + platformFeeCents + processingFeeCents) * feeConfig.taxPercent);
```

---

### 12. Missing RABBITMQ_URL in .env.example 🟢

**Severity:** LOW  
**Impact:** Developers won't know to set it  
**Effort:** 0.5 hours  

#### Validated Location
**File:** `backend/services/order-service/.env.example`

#### Remediation Steps
Add to .env.example:
```bash
# RabbitMQ Configuration
RABBITMQ_URL=amqp://user:password@localhost:5672
RABBITMQ_EXCHANGE=orders
```

---

### 13. State Machine Not Enforced in Code 🟢

**Severity:** MEDIUM  
**Impact:** Easy to forget to check valid transitions  
**Effort:** 4 hours  

#### Validated Location
**File:** `backend/services/order-service/src/services/order.service.ts`  
**Multiple locations:** Lines 145, 184, 233

#### Evidence
Manual status checks:
```typescript
if (order.status !== OrderStatus.RESERVED) {
  throw new Error(`Cannot confirm order in ${order.status} status`);
}
```

**Issue:** DB function `validate_order_status_transition()` exists but not used in application code.

#### Remediation Steps

**Step 1:** Create state machine class
```typescript
// Create src/utils/order-state-machine.ts

export class OrderStateMachine {
  private static transitions: Record<string, string[]> = {
    PENDING: ['RESERVED', 'CANCELLED', 'EXPIRED'],
    RESERVED: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
    CONFIRMED: ['COMPLETED', 'CANCELLED', 'REFUNDED'],
    COMPLETED: [],
    CANCELLED: [],
    EXPIRED: [],
    REFUNDED: []
  };
  
  static canTransition(from: string, to: string): boolean {
    return this.transitions[from]?.includes(to) ?? false;
  }
  
  static validateTransition(from: string, to: string): void {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid state transition: ${from} → ${to}. ` +
        `Valid transitions: ${this.transitions[from]?.join(', ') || 'none'}`
      );
    }
  }
}
```

**Step 2:** Use in service methods
```typescript
async reserveOrder(request: ReserveOrderRequest): Promise<...> {
  const order = await this.orderModel.findById(request.orderId);
  
  // Use state machine instead of manual check
  OrderStateMachine.validateTransition(order.status, 'RESERVED');
  
  // Continue with reservation...
}
```

---

## 📊 PHASE-BASED REMEDIATION ROADMAP

### Phase 1: Security Fixes (CRITICAL) - 20 hours

**Priority:** MUST DO BEFORE DEPLOY  
**Duration:** 3 days  
**Dependencies:** None  

| Item | File(s) | Effort | Status |
|------|---------|--------|--------|
| Wire auth middleware | src/routes/order.routes.ts | 4h | ⏳ |
| Wire internal-auth | src/routes/internal.routes.ts | 2h | ⏳ |
| Implement price validation | src/services/order.service.ts, src/services/ticket.client.ts | 6h | ⏳ |
| Add distributed locking | src/services/redis.service.ts, src/services/order.service.ts | 8h | ⏳ |

**Success Criteria:**
- ✅ All endpoints require authentication
- ✅ Internal endpoints require service JWT
- ✅ Prices validated against ticket-service
- ✅ Distributed locks prevent race conditions

---

### Phase 2: Data Integrity (HIGH) - 12 hours

**Priority:** CRITICAL  
**Duration:** 2 days  
**Dependencies:** Phase 1  

| Item | File(s) | Effort | Status |
|------|---------|--------|--------|
| Add transaction support | src/models/*.ts, src/services/order.service.ts | 12h | ⏳ |

**Success Criteria:**
- ✅ All multi-step operations wrapped in database transactions
- ✅ Automatic rollback on failures
- ✅ No orphaned data in database

---

### Phase 3: Observability & Jobs (HIGH) - 13 hours

**Priority:** HIGH  
**Duration:** 2 days  
**Dependencies:** Phases 1-2  

| Item | File(s) | Effort | Status |
|------|---------|--------|--------|
| Improve health checks | src/routes/health.routes.ts | 2h | ⏳ |
| Implement reconciliation job | src/jobs/reconciliation.job.ts | 4h | ⏳ |
| Complete reminder job | src/jobs/reminder.job.ts | 3h | ⏳ |
| Implement bulk cancellation | src/controllers/internal.controller.ts | 4h | ⏳ |

**Success Criteria:**
- ✅ Health checks verify all dependencies
- ✅ Reconciliation job detects and fixes inconsistencies
- ✅ Reminder notifications sent before expiration
- ✅ Bulk cancellation works for event cancellations

---

### Phase 4: Testing (HIGH) - 20 hours

**Priority:** HIGH  
**Duration:** 3 days  
**Dependencies:** Phases 1-3  

| Item | File(s) | Effort | Status |
|------|---------|--------|--------|
| Unit tests | tests/unit/**/*.test.ts | 10h | ⏳ |
| Integration tests | tests/integration/**/*.test.ts | 6h | ⏳ |
| E2E tests | tests/e2e/**/*.test.ts | 4h | ⏳ |

**Success Criteria:**
- ✅ Minimum 70% code coverage
- ✅ All critical paths tested
- ✅ Race condition tests passing
- ✅ Price validation tests passing
- ✅ State machine tests passing

---

### Phase 5: Improvements (MEDIUM) - 6.5 hours

**Priority:** NICE TO HAVE  
**Duration:** 1 day  
**Dependencies:** Phases 1-4  

| Item | File(s) | Effort | Status |
|------|---------|--------|--------|
| Make fee rates configurable | src/config/order.config.ts, src/services/order.service.ts | 2h | ⏳ |
| Add RABBITMQ_URL to .env.example | .env.example | 0.5h | ⏳ |
| Create state machine class | src/utils/order-state-machine.ts, src/services/order.service.ts | 4h | ⏳ |

**Success Criteria:**
- ✅ Fees configurable via environment variables
- ✅ All required env vars documented
- ✅ State machine enforces valid transitions

---

## 📈 EFFORT SUMMARY

### By Priority

| Priority | Items | Total Hours | Percentage |
|----------|-------|-------------|------------|
| 🔴 CRITICAL | 6 blockers | 52h | 75% |
| 🟡 HIGH | 4 warnings | 13h | 19% |
| 🟢 MEDIUM | 3 improvements | 6.5h | 6% |
| **TOTAL** | **13 items** | **71.5h** | **100%** |

### By Phase

| Phase | Priority | Hours | Days | Cumulative |
|-------|----------|-------|------|------------|
| Phase 1 | CRITICAL | 20h | 3 | 20h |
| Phase 2 | CRITICAL | 12h | 2 | 32h |
| Phase 3 | HIGH | 13h | 2 | 45h |
| Phase 4 | HIGH | 20h | 3 | 65h |
| Phase 5 | MEDIUM | 6.5h | 1 | 71.5h |

**Minimum Viable Deployment:** Phases 1-2 = 32 hours (4 days)  
**Full Production Readiness:** All phases = 71.5 hours (9 days)

---

## 🎯 RECOMMENDED EXECUTION ORDER

### Week 1: Critical Security (Days 1-5)

**Goal:** Make service secure and deployable

1. **Day 1:** Phase 1 Items 1-2 (6h)
   - Wire authentication middleware
   - Wire internal-auth middleware
   - Test with Postman/curl

2. **Day 2:** Phase 1 Item 3 (6h)
   - Implement price validation
   - Add getPrices to ticket client
   - Test price tampering scenarios

3. **Day 3:** Phase 1 Item 4 (8h)
   - Add distributed locking to Redis service
   - Apply locks to reservation flow
   - Test concurrent reservations

4. **Day 4-5:** Phase 2 (12h)
   - Add transaction support to models
   - Wrap all multi-step operations
   - Test failure/rollback scenarios

**Checkpoint:** Service is minimally secure and can be deployed to staging

---

### Week 2: Stability & Testing (Days 6-9)

**Goal:** Ensure reliability and correctness

5. **Day 6:** Phase 3 Items 1-2 (6h)
   - Improve health checks
   - Implement reconciliation job

6. **Day 7:** Phase 3 Items 3-4 (7h)
   - Complete reminder job
   - Implement bulk cancellation

7. **Day 8-9:** Phase 4 (20h)
   - Write unit tests (Day 8: 10h)
   - Write integration + E2E tests (Day 9: 10h)

**Checkpoint:** Service has good test coverage and operational monitoring

---

### Week 3: Polish (Day 10)

**Goal:** Quality improvements

8. **Day 10:** Phase 5 (6.5h)
   - Make fees configurable
   - Update documentation
   - Create state machine class

**Final Checkpoint:** Service is production-ready

---

## ✅ VALIDATION CHECKLIST

Use this checklist to verify remediation completion:

### Phase 1: Security ✅
- [ ] Run: `curl -X POST http://localhost:3016/api/v1/orders` returns 401 Unauthorized
- [ ] Run: `curl -X POST http://localhost:3016/internal/v1/orders/:id/confirm` returns 401 Unauthorized
- [ ] Test: Order creation with tampered price returns 400 Bad Request
- [ ] Test: Two concurrent order requests for last ticket - only one succeeds

### Phase 2: Data Integrity ✅
- [ ] Simulate DB failure during order creation - verify rollback
- [ ] Check database for orphaned records - should be zero
- [ ] Review logs for "ROLLBACK" entries after induced failures

### Phase 3: Observability ✅
- [ ] Access: `http://localhost:3016/health` shows all dependency statuses
- [ ] Check logs: Reconciliation job runs and reports findings
- [ ] Verify: Expiration reminders appear in notification service
- [ ] Test: Bulk cancel works when event is cancelled

### Phase 4: Testing ✅
- [ ] Run: `npm test` shows >70% coverage
- [ ] All critical path tests passing
- [ ] Load test: 100 concurrent order requests complete successfully

### Phase 5: Improvements ✅
- [ ] Fees adjustable via environment variables
- [ ] State machine prevents invalid transitions
- [ ] Documentation complete

---

## 🚨 ROLLBACK PLAN

If issues arise during remediation:

### Rollback Phase 1
**Risk:** Breaking authentication may block all traffic

**Rollback Steps:**
1. Remove authenticate from preHandler arrays
2. Comment out import statement
3. Restart service
4. Verify health endpoint accessible

**Time:** 15 minutes

### Rollback Phase 2
**Risk:** Transaction changes may break order creation

**Rollback Steps:**
1. Revert model changes to remove client parameter
2. Remove transaction wrapping from service methods
3. Restart service
4. Test order creation

**Time:** 30 minutes

### Rollback Phase 3
**Risk:** Jobs may consume excessive resources

**Rollback Steps:**
1. Stop job schedulers in index.ts
2. Comment out job initialization
3. Restart service

**Time:** 10 minutes

---

## 📞 SUPPORT & ESCALATION

### Critical Issues During Remediation

**Issue:** Can't wire authentication middleware  
**Escalate to:** Backend Team Lead  
**Alternative:** Use API Gateway authentication

**Issue:** Distributed locking not working  
**Escalate to:** Infrastructure Team  
**Alternative:** Temporary queue-based serialization

**Issue:** Transaction support breaking queries  
**Escalate to:** Database Team  
**Alternative:** Use advisory locks instead

---

## 📚 REFERENCES

### Internal Documentation
- ORDER_SERVICE_AUDIT.md - Original audit findings
- backend/services/order-service/README.md - Service documentation
- backend/shared/README.md - Shared library documentation

### External Resources
- Redis Distributed Locking: https://redis.io/docs/manual/patterns/distributed-locks/
- PostgreSQL Transactions: https://www.postgresql.org/docs/current/tutorial-transactions.html
- Fastify Authentication: https://fastify.io/docs/latest/Reference/Hooks/#prehander

### Testing Resources
- Jest Documentation: https://jestjs.io/docs/getting-started
- Supertest for API Testing: https://github.com/visionmedia/supertest

---

## 🎉 SUCCESS METRICS

### Key Performance Indicators

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| **Security** | No auth | 100% endpoints protected | Manual verification |
| **Data Integrity** | No transactions | 0 orphaned records | Database query |
| **Test Coverage** | 0% | 70%+ | Jest coverage report |
| **Race Conditions** | Possible | 0 double-sales | Load testing |
| **Price Tampering** | Possible | 0 exploits | Security audit |

### Deployment Readiness Criteria

✅ All Phase 1-2 items completed  
✅ Critical and high-severity security scans pass  
✅ Load testing shows no race conditions under 100 concurrent users  
✅ Integration tests with payment-service and ticket-service passing  
✅ Staging deployment successful for 48 hours  
✅ Security team sign-off obtained  

---

## 📝 FINAL NOTES

### What Success Looks Like

After completing this remediation plan:

1. **Security:** All endpoints protected by authentication
2. **Reliability:** No data corruption from partial failures  
3. **Performance:** Race conditions eliminated via distributed locking
4. **Quality:** Comprehensive test coverage prevents regressions
5. **Operations:** Health checks and reconciliation detect issues proactively

### Timeline Reality Check

**Optimistic:** 9 working days (71.5 hours)  
**Realistic:** 12 working days (accounting for testing discoveries)  
**Pessimistic:** 15 working days (if major refactoring needed)

### Team Requirements

**Minimum Team:**
- 1 Senior Backend Engineer (Phases 1-2)
- 1 Backend Engineer (Phases 3-4)
- 1 QA Engineer (Phase 4)

**Recommended Team:**
- 2 Senior Backend Engineers (parallel work on Phases 1-2)
- 1 Backend Engineer (Phases 3-5)
- 1 QA Engineer (continuous testing)

---

**Document Version:** 1.0  
**Last Updated:** November 17, 2025  
**Next Review:** After Phase 2 completion  
**Status:** 🔴 ACTIVE REMEDIATION REQUIRED
