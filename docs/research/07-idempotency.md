# Idempotency Audit Guide

**TicketToken Security Audit Series**  
*Blockchain Ticketing Platform - Microservices Architecture*

---

## Section 1: Standards & Best Practices

### Idempotency Key Patterns

**IETF Standard (Draft RFC)**

The IETF has developed a draft standard for the `Idempotency-Key` HTTP header field as part of the "Building Blocks for HTTP APIs" working group. This standard is increasingly adopted by major payment providers.

**Key Requirements from the RFC:**
- Idempotency keys MUST be unique and MUST NOT be reused with different request payloads
- UUID v4 or similar random identifiers are RECOMMENDED
- Keys should be sent via the `Idempotency-Key` HTTP header
- Servers MAY enforce time-based expiry and SHOULD publish expiration policy
- An idempotency fingerprint (hash of request payload) MAY be used alongside the key

**Standard Header Format:**
```
Idempotency-Key: "8e03978e-40d5-43e8-bc93-6894a57f9324"
```

**Key Generation Best Practices:**
- Use UUID v4 for sufficient entropy (128 bits of randomness)
- Alternatively: combine `user_id + timestamp + random_string`
- For TicketToken: `tenant_id + resource_type + unique_identifier`
- Never use predictable patterns (sequential IDs, timestamps alone)
- Generate on client side, validate on server side

*Source: IETF draft-ietf-httpapi-idempotency-key-header-07 (https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)*

---

### Which Operations Need Idempotency

**Always Require Idempotency:**
- Payment processing (charges, refunds, transfers)
- Ticket purchases and reservations
- NFT minting operations
- Webhook event processing
- Order creation
- Account balance modifications
- Royalty distributions
- Any operation involving money or irreversible state changes

**HTTP Method Idempotency:**
- GET, HEAD, OPTIONS, TRACE: Idempotent by definition
- PUT, DELETE: Idempotent by design (same result regardless of repetition)
- POST, PATCH: NOT idempotent - require explicit idempotency implementation

**TicketToken Critical Operations:**
- `POST /api/payments/charge` - Stripe payment creation
- `POST /api/tickets/purchase` - Ticket acquisition
- `POST /api/nft/mint` - NFT minting on Solana
- `POST /api/transfers` - Ticket transfers between users
- `POST /api/marketplace/list` - Secondary market listings
- `POST /webhooks/stripe` - Stripe webhook handler
- `POST /webhooks/solana` - Blockchain event handler

*Source: Stripe Blog - Designing robust and predictable APIs with idempotency (https://stripe.com/blog/idempotency)*

---

### Storage Strategies for Idempotency Keys

**Option 1: Redis (Recommended for High-Traffic)**

```typescript
// Redis storage pattern
const IDEMPOTENCY_TTL = 86400; // 24 hours

async function checkIdempotency(key: string): Promise<CachedResponse | null> {
  const cached = await redis.get(`idempotency:${key}`);
  return cached ? JSON.parse(cached) : null;
}

async function storeIdempotency(key: string, response: Response): Promise<void> {
  await redis.setex(
    `idempotency:${key}`,
    IDEMPOTENCY_TTL,
    JSON.stringify({
      status_code: response.status,
      body: response.body,
      headers: response.headers,
      created_at: Date.now()
    })
  );
}
```

**Advantages:**
- Sub-millisecond lookups
- Built-in TTL support via EXPIRE
- Atomic operations with SETNX for race condition prevention
- Horizontal scaling with Redis Cluster

**Option 2: PostgreSQL (For Durability)**

```sql
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL,
  request_path VARCHAR(500) NOT NULL,
  request_params_hash VARCHAR(64) NOT NULL,
  response_code INTEGER,
  response_body JSONB,
  locked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  UNIQUE(user_id, idempotency_key)
);

CREATE INDEX idx_idempotency_lookup 
  ON idempotency_keys(user_id, idempotency_key);
CREATE INDEX idx_idempotency_cleanup 
  ON idempotency_keys(created_at) WHERE completed_at IS NOT NULL;
```

**Advantages:**
- ACID compliance
- Survives restarts
- Can be queried for debugging/auditing
- Integrates with existing transaction boundaries

**Option 3: Hybrid (Recommended for TicketToken)**

```typescript
// Check Redis first (fast path)
let cached = await redis.get(`idempotency:${key}`);
if (cached) return JSON.parse(cached);

// Fall back to PostgreSQL (durable path)
const dbRecord = await db('idempotency_keys')
  .where({ user_id: userId, idempotency_key: key })
  .first();

if (dbRecord?.completed_at) {
  // Populate Redis cache for future requests
  await redis.setex(`idempotency:${key}`, TTL, JSON.stringify(dbRecord));
  return dbRecord;
}
```

*Source: Brandur - Implementing Stripe-like Idempotency Keys in Postgres (https://brandur.org/idempotency-keys)*

---

### TTL and Cleanup of Idempotency Records

**Recommended TTL Values:**
- Stripe: 24 hours (keys automatically pruned after)
- Payment operations: 24-72 hours
- General API operations: 24 hours
- Webhook deduplication: 1-7 days (match provider retry policy)

**TTL Considerations:**
- Too short: Clients may retry after expiry, causing duplicates
- Too long: Storage bloat, stale data
- Match to your retry policy window + buffer

**Cleanup Strategies:**

```typescript
// Redis: Automatic via TTL
await redis.setex(key, 86400, value); // Auto-expires in 24h

// PostgreSQL: Scheduled cleanup job
async function cleanupExpiredKeys(retentionDays: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  const result = await db('idempotency_keys')
    .where('created_at', '<', cutoffDate)
    .whereNotNull('completed_at')
    .delete();
  
  return result;
}

// Run via cron: 0 3 * * * (daily at 3 AM)
```

**Reaper Process (Brandur Pattern):**
- Delete completed keys after 72 hours
- Flag incomplete keys older than 1 hour for investigation
- Log keys that couldn't complete successfully for manual review

*Source: Stripe API Documentation - Idempotent Requests (https://docs.stripe.com/api/idempotent_requests)*

---

### Idempotency in Payment Processing

**Stripe's Implementation:**

Stripe is the industry standard for payment idempotency. Key behaviors:

1. **Idempotency-Key Header**: Pass unique value with POST requests
2. **Response Caching**: First request's response (including errors) is cached
3. **Parameter Matching**: Same key with different parameters returns error
4. **24-Hour Window**: Keys expire after 24 hours

```typescript
// TicketToken Stripe integration pattern
async function createPaymentIntent(
  amount: number,
  currency: string,
  customerId: string,
  idempotencyKey: string
): Promise<Stripe.PaymentIntent> {
  return await stripe.paymentIntents.create(
    {
      amount,
      currency,
      customer: customerId,
      metadata: {
        tenant_id: tenantId,
        order_id: orderId
      }
    },
    {
      idempotencyKey: idempotencyKey // Critical!
    }
  );
}
```

**Critical Rules for Payment Idempotency:**

1. **Generate key before any processing**: Key must exist before Stripe call
2. **Include key in all retries**: Same key = same charge
3. **New key for new intent**: Different purchase = different key
4. **Store key with order**: Map idempotency_key to order for debugging

**Compound Key Pattern for Payments:**
```typescript
const idempotencyKey = `payment:${tenantId}:${orderId}:${Date.now()}`;
// Or for stricter deduplication:
const idempotencyKey = `charge:${tenantId}:${customerId}:${orderId}`;
```

*Source: Stripe Documentation - Server-side integration (https://stripe.com/docs/implementation-guides/core-payments/server-side-integration)*

---

### Idempotency in Webhook Handling

**The Challenge:**
- Webhooks use "at-least-once" delivery semantics
- Same event may be delivered multiple times
- Network issues cause retries
- Must process each unique event exactly once

**Stripe Webhook Deduplication:**

```typescript
// Track processed events
const processedEvents = new Map<string, boolean>();

async function handleStripeWebhook(
  payload: Buffer,
  signature: string
): Promise<void> {
  // 1. Verify signature first
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    webhookSecret
  );
  
  // 2. Check if already processed (use event.id, NOT idempotency key)
  const existingEvent = await db('webhook_events')
    .where('stripe_event_id', event.id)
    .first();
  
  if (existingEvent?.status === 'processed') {
    console.log(`Duplicate webhook ignored: ${event.id}`);
    return; // Return 200 to acknowledge
  }
  
  // 3. Create processing record (acts as lock)
  await db('webhook_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    status: 'processing',
    received_at: new Date()
  });
  
  try {
    // 4. Process event
    await processEvent(event);
    
    // 5. Mark complete
    await db('webhook_events')
      .where('stripe_event_id', event.id)
      .update({ status: 'processed', processed_at: new Date() });
      
  } catch (error) {
    await db('webhook_events')
      .where('stripe_event_id', event.id)
      .update({ status: 'failed', error: error.message });
    throw error;
  }
}
```

**Webhook Events Table:**
```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'processing',
  payload JSONB,
  error_message TEXT,
  received_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Key Insight**: Use the webhook provider's event ID (e.g., `evt_xxx` from Stripe) for deduplication, NOT an idempotency key you generate.

*Source: Stripe Documentation - Receive Stripe events in your webhook endpoint (https://docs.stripe.com/webhooks)*

---

### Exactly-Once vs At-Least-Once Semantics

**The Fundamental Truth:**
> "There is no such thing as exactly-once delivery. We must choose between the lesser of two evils, which is at-least-once delivery in most cases."

**Delivery Semantics:**

| Semantic | Guarantee | Use Case |
|----------|-----------|----------|
| At-most-once | Message delivered 0 or 1 times | Logs, metrics (loss acceptable) |
| At-least-once | Message delivered 1+ times | Payments, orders (duplicates filtered) |
| Exactly-once | Message delivered exactly 1 time | Theoretical ideal |

**Achieving "Effectively Once" Processing:**

True exactly-once delivery is impossible in distributed systems (Two Generals Problem). Instead, combine at-least-once delivery with idempotent processing:

```
Exactly-Once Processing = At-Least-Once Delivery + Idempotent Handlers
```

**Implementation Pattern:**
```typescript
async function processMessage(message: Message): Promise<void> {
  const processingId = message.id;
  
  // 1. Check if already processed
  const existing = await getProcessingRecord(processingId);
  if (existing?.completed) {
    return existing.result; // Return cached result
  }
  
  // 2. Acquire lock (prevent concurrent processing)
  const lock = await acquireLock(processingId);
  if (!lock) {
    throw new ConflictError('Processing in progress');
  }
  
  try {
    // 3. Process with idempotent operations
    const result = await performIdempotentOperation(message);
    
    // 4. Store result atomically
    await storeProcessingRecord(processingId, result);
    
    return result;
  } finally {
    await releaseLock(processingId);
  }
}
```

*Source: ByteByteGo - At most once, at least once, exactly once (https://blog.bytebytego.com/p/at-most-once-at-least-once-exactly)*

---

## Section 2: Common Vulnerabilities & Mistakes

### Missing Idempotency on Payment Operations

**The Vulnerability:**
Without idempotency keys on payment operations, network timeouts or client retries can result in double charges.

**Real-World Scenario:**
```
1. User clicks "Pay" button
2. Request sent to server
3. Server calls Stripe, charge succeeds
4. Network timeout before response reaches client
5. Client retries (or user clicks again)
6. Server calls Stripe again
7. Second charge created = Customer charged twice
```

**Detection in Code Review:**
```typescript
// VULNERABLE - No idempotency key
const charge = await stripe.charges.create({
  amount: 2000,
  currency: 'usd',
  source: token
});

// SECURE - With idempotency key
const charge = await stripe.charges.create(
  {
    amount: 2000,
    currency: 'usd',
    source: token
  },
  {
    idempotencyKey: `charge_${orderId}_${tenantId}`
  }
);
```

**Audit Query - Find Stripe Calls Without Idempotency:**
```bash
# Search for Stripe API calls missing idempotencyKey
grep -r "stripe\." --include="*.ts" | grep -v "idempotencyKey"
```

---

### In-Memory Idempotency Storage (Lost on Restart)

**The Vulnerability:**
Storing idempotency keys only in application memory means they're lost on restart, deployment, or crash.

**Vulnerable Pattern:**
```typescript
// VULNERABLE - In-memory storage
const processedKeys = new Set<string>();

async function processPayment(idempotencyKey: string) {
  if (processedKeys.has(idempotencyKey)) {
    return cachedResponse;
  }
  processedKeys.add(idempotencyKey);
  // ... process payment
}
// On restart: processedKeys is empty, duplicates possible!
```

**Why This Fails:**
- Server restart clears the Set
- Load balancer sends retry to different server
- Horizontal scaling means each instance has different state
- Memory limits may cause eviction

**Secure Pattern:**
```typescript
// SECURE - Persistent storage
async function processPayment(idempotencyKey: string) {
  // Check Redis (distributed, survives restarts)
  const existing = await redis.get(`idempotency:${idempotencyKey}`);
  if (existing) {
    return JSON.parse(existing);
  }
  
  // Or check PostgreSQL (durable)
  const dbRecord = await db('idempotency_keys')
    .where('key', idempotencyKey)
    .first();
  if (dbRecord?.completed) {
    return dbRecord.response;
  }
  // ... process payment
}
```

---

### Idempotency Key Collisions

**The Vulnerability:**
Weak key generation can lead to collisions where different operations share the same key.

**Vulnerable Patterns:**
```typescript
// VULNERABLE - Timestamp only (collisions within same millisecond)
const key = `payment_${Date.now()}`;

// VULNERABLE - Sequential ID (predictable, low entropy)
const key = `payment_${autoIncrementId}`;

// VULNERABLE - User ID only (same user, different purchases)
const key = `payment_${userId}`;
```

**Secure Patterns:**
```typescript
// SECURE - UUID v4 (128 bits of randomness)
import { v4 as uuidv4 } from 'uuid';
const key = uuidv4();

// SECURE - Composite key with sufficient uniqueness
const key = `${tenantId}:${userId}:${orderId}:${uuidv4()}`;

// SECURE - Crypto random
import crypto from 'crypto';
const key = crypto.randomBytes(32).toString('hex');
```

**Collision Impact:**
- Two different operations treated as duplicates
- Second operation silently returns first operation's result
- Data integrity compromised

---

### Not Returning Cached Response for Duplicate Requests

**The Vulnerability:**
Detecting duplicates but not returning the original response leaves clients without confirmation.

**Vulnerable Pattern:**
```typescript
// VULNERABLE - Detects duplicate but doesn't help client
async function handleRequest(idempotencyKey: string, payload: any) {
  const existing = await checkIdempotency(idempotencyKey);
  if (existing) {
    // Just returns success, client doesn't know what happened
    return { status: 'ok' };
  }
  // ... process
}
```

**Secure Pattern:**
```typescript
// SECURE - Returns original response
async function handleRequest(idempotencyKey: string, payload: any) {
  const existing = await checkIdempotency(idempotencyKey);
  if (existing) {
    // Return the exact same response from original request
    return {
      status: existing.status_code,
      body: existing.response_body,
      headers: { 'X-Idempotent-Replayed': 'true' }
    };
  }
  
  const result = await processRequest(payload);
  
  // Store complete response for future replays
  await storeIdempotency(idempotencyKey, {
    status_code: result.status,
    response_body: result.body,
    created_at: new Date()
  });
  
  return result;
}
```

**IETF RFC Requirement:**
Per the draft RFC, servers SHOULD return the same response (status code and body) for duplicate requests with the same idempotency key.

---

### Partial Completion Without Idempotency

**The Vulnerability:**
Multi-step operations that fail partway through without idempotency tracking can leave the system in an inconsistent state.

**Vulnerable Pattern:**
```typescript
// VULNERABLE - No recovery point tracking
async function purchaseTicket(orderId: string) {
  // Step 1: Reserve inventory
  await reserveTicket(ticketId);
  
  // Step 2: Charge payment (if this fails, ticket is reserved but not paid)
  await chargePayment(amount);
  
  // Step 3: Mint NFT (if this fails, paid but no NFT)
  await mintNFT(ticketId);
  
  // Step 4: Send confirmation
  await sendEmail(userId);
}
// If step 2 fails, retry will fail at step 1 (already reserved)
```

**Secure Pattern with Recovery Points:**
```typescript
// SECURE - Recovery point tracking (Brandur pattern)
async function purchaseTicket(idempotencyKey: string, orderId: string) {
  let record = await getIdempotencyRecord(idempotencyKey);
  
  if (!record) {
    record = await createIdempotencyRecord(idempotencyKey, {
      recovery_point: 'started',
      order_id: orderId
    });
  }
  
  // Resume from last successful point
  if (record.recovery_point === 'started') {
    await reserveTicket(ticketId);
    await updateRecoveryPoint(idempotencyKey, 'ticket_reserved');
  }
  
  if (record.recovery_point === 'ticket_reserved') {
    await chargePayment(amount, idempotencyKey); // Stripe idempotency
    await updateRecoveryPoint(idempotencyKey, 'payment_complete');
  }
  
  if (record.recovery_point === 'payment_complete') {
    await mintNFT(ticketId, idempotencyKey);
    await updateRecoveryPoint(idempotencyKey, 'nft_minted');
  }
  
  if (record.recovery_point === 'nft_minted') {
    await sendEmail(userId); // Idempotent (or best-effort)
    await updateRecoveryPoint(idempotencyKey, 'completed');
  }
  
  return record;
}
```

---

### Race Conditions in Idempotency Checks

**The Vulnerability:**
Without proper locking, concurrent requests with the same idempotency key can both pass the duplicate check.

**Vulnerable Pattern:**
```typescript
// VULNERABLE - Race condition window
async function processRequest(idempotencyKey: string) {
  // Thread 1: checks, not found
  // Thread 2: checks, not found (race!)
  const existing = await db('idempotency').where('key', idempotencyKey).first();
  
  if (!existing) {
    // Both threads enter here
    await db('idempotency').insert({ key: idempotencyKey });
    await processPayment(); // Duplicate payment!
  }
}
```

**Secure Patterns:**

**Option 1: Database Unique Constraint + Insert**
```typescript
// SECURE - Atomic insert with unique constraint
async function processRequest(idempotencyKey: string) {
  try {
    // Atomic insert - second insert fails with unique violation
    await db('idempotency').insert({ 
      key: idempotencyKey,
      status: 'processing'
    });
  } catch (error) {
    if (error.code === '23505') { // Postgres unique violation
      // Duplicate - fetch and return existing
      const existing = await db('idempotency').where('key', idempotencyKey).first();
      return existing.response;
    }
    throw error;
  }
  // Only one thread reaches here
  const result = await processPayment();
  await db('idempotency').where('key', idempotencyKey).update({
    status: 'completed',
    response: result
  });
  return result;
}
```

**Option 2: Redis SETNX (Set if Not Exists)**
```typescript
// SECURE - Atomic Redis lock
async function processRequest(idempotencyKey: string) {
  const lockKey = `lock:${idempotencyKey}`;
  
  // SETNX is atomic - only one caller succeeds
  const acquired = await redis.set(lockKey, 'processing', 'NX', 'EX', 60);
  
  if (!acquired) {
    // Another request is processing or completed
    const result = await redis.get(`result:${idempotencyKey}`);
    if (result) return JSON.parse(result);
    throw new ConflictError('Request in progress');
  }
  
  try {
    const result = await processPayment();
    await redis.setex(`result:${idempotencyKey}`, 86400, JSON.stringify(result));
    return result;
  } finally {
    await redis.del(lockKey);
  }
}
```

**Option 3: PostgreSQL Advisory Locks**
```typescript
// SECURE - Advisory lock for distributed locking
async function processRequest(idempotencyKey: string) {
  const lockId = hashToInt(idempotencyKey);
  
  await db.raw('SELECT pg_advisory_lock(?)', [lockId]);
  try {
    // Check and process within lock
    const existing = await db('idempotency').where('key', idempotencyKey).first();
    if (existing) return existing.response;
    
    const result = await processPayment();
    await db('idempotency').insert({ key: idempotencyKey, response: result });
    return result;
  } finally {
    await db.raw('SELECT pg_advisory_unlock(?)', [lockId]);
  }
}
```

*Source: CockroachDB - Idempotency's role in financial services (https://www.cockroachlabs.com/blog/idempotency-in-finance/)*

---

## Section 3: Audit Checklist

### Payment Flow Checklist (Stripe)

| # | Check | Status |
|---|-------|--------|
| 1 | All `stripe.paymentIntents.create()` calls include `idempotencyKey` option | ☐ |
| 2 | All `stripe.charges.create()` calls include `idempotencyKey` option | ☐ |
| 3 | All `stripe.refunds.create()` calls include `idempotencyKey` option | ☐ |
| 4 | Idempotency key is generated BEFORE any Stripe API call | ☐ |
| 5 | Idempotency key is stored in database with order/transaction record | ☐ |
| 6 | Key format includes tenant_id to prevent cross-tenant collisions | ☐ |
| 7 | Key uses UUID v4 or cryptographically random component | ☐ |
| 8 | Failed requests (non-retryable) generate new idempotency key on user retry | ☐ |
| 9 | Stripe error code 400 (invalid request) triggers new key generation | ☐ |
| 10 | Payment service handles Stripe's idempotency replay responses correctly | ☐ |

**Code Search Patterns:**
```bash
# Find Stripe calls without idempotencyKey
grep -rn "stripe\.\(paymentIntents\|charges\|refunds\)\.create" --include="*.ts" \
  | grep -v "idempotencyKey"

# Verify key generation before Stripe calls
grep -B5 "stripe\.paymentIntents\.create" --include="*.ts"
```

---

### Webhook Handler Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Webhook signature verification happens FIRST before any processing | ☐ |
| 2 | `webhook_events` table exists with unique constraint on provider event ID | ☐ |
| 3 | Event ID is checked for duplicates before processing | ☐ |
| 4 | Processing status tracked (pending/processing/completed/failed) | ☐ |
| 5 | Handler returns 200 immediately, processes asynchronously | ☐ |
| 6 | Duplicate events return 200 (not error) to prevent provider retries | ☐ |
| 7 | Event payload stored for debugging/replay capability | ☐ |
| 8 | Cleanup job removes processed events after retention period | ☐ |
| 9 | Failed events are logged with error details for investigation | ☐ |
| 10 | Concurrent webhook handling prevented via locking | ☐ |

**Webhook Events Table Verification:**
```sql
-- Check table structure
\d webhook_events

-- Verify unique constraint exists
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'webhook_events' AND constraint_type = 'UNIQUE';

-- Check for missing index on event_id
SELECT indexname FROM pg_indexes WHERE tablename = 'webhook_events';
```

---

### Ticket Purchase Flow Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Purchase endpoint accepts/requires `Idempotency-Key` header | ☐ |
| 2 | Idempotency key validated (format, length, uniqueness scope) | ☐ |
| 3 | Duplicate purchase attempts return original purchase result | ☐ |
| 4 | Inventory reservation is atomic (SELECT FOR UPDATE or equivalent) | ☐ |
| 5 | Recovery points tracked for multi-step purchase flow | ☐ |
| 6 | Partial failures can be resumed from last successful step | ☐ |
| 7 | Idempotency record includes tenant_id for multi-tenant isolation | ☐ |
| 8 | Concurrent purchase attempts for same key return 409 Conflict | ☐ |
| 9 | Different payload with same key returns 422 Unprocessable | ☐ |
| 10 | Idempotency key TTL matches business retry window (24-72 hours) | ☐ |

**Purchase Flow State Machine:**
```
started → inventory_reserved → payment_initiated → payment_confirmed 
        → ticket_created → nft_pending → nft_minted → completed
```

---

### NFT Minting Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Minting operation uses unique idempotency key per ticket/NFT | ☐ |
| 2 | Idempotency key includes ticket_id to prevent duplicate mints | ☐ |
| 3 | Blockchain transaction hash stored and checked before retry | ☐ |
| 4 | Pending transactions monitored for confirmation before retry | ☐ |
| 5 | NFT metadata URI is deterministic (same input = same URI) | ☐ |
| 6 | Minting failures are distinguishable from network timeouts | ☐ |
| 7 | Successfully minted NFTs update ticket record atomically | ☐ |
| 8 | Duplicate mint attempts return existing NFT details | ☐ |
| 9 | Cross-chain operations (if any) have independent idempotency | ☐ |
| 10 | Gas estimation failures don't consume idempotency key | ☐ |

**NFT Idempotency Key Pattern:**
```typescript
// Recommended format for TicketToken
const mintIdempotencyKey = `mint:${tenantId}:${eventId}:${ticketId}:${version}`;

// Track minting status
interface MintRecord {
  idempotency_key: string;
  ticket_id: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  transaction_hash?: string;
  token_id?: string;
  created_at: Date;
  confirmed_at?: Date;
}
```

*Source: Thirdweb - Prevent duplicate blockchain transactions with Engine (https://blog.thirdweb.com/changelog/idempotency-keys-for/)*

---

### State-Changing Operations Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | All POST endpoints modifying data support idempotency | ☐ |
| 2 | Idempotency storage is persistent (not in-memory only) | ☐ |
| 3 | Idempotency checks are atomic (no race condition window) | ☐ |
| 4 | Response includes header indicating idempotent replay | ☐ |
| 5 | Idempotency keys scoped to tenant for multi-tenant safety | ☐ |
| 6 | Key collision probability is acceptably low (UUID v4 or better) | ☐ |
| 7 | Error responses are NOT cached (only successful operations) | ☐ |
| 8 | Retryable errors (5xx, timeout) allow same-key retry | ☐ |
| 9 | Non-retryable errors (4xx validation) require new key | ☐ |
| 10 | Monitoring/alerting exists for idempotency-related errors | ☐ |

---

## Priority Matrix for TicketToken

### P0 - Critical (Implement Immediately)

1. **Stripe Payment Idempotency**: All payment intent and charge creation MUST include idempotency keys
2. **Webhook Deduplication**: All webhook handlers MUST track and deduplicate by event ID
3. **Purchase Flow Idempotency**: Ticket purchase endpoint MUST be idempotent
4. **NFT Mint Idempotency**: Minting operations MUST prevent duplicate NFT creation
5. **Persistent Storage**: Idempotency keys MUST be stored in Redis or PostgreSQL, NOT in-memory

### P1 - High (Implement Within Sprint)

1. **Race Condition Prevention**: Implement atomic idempotency checks (SETNX or unique constraint)
2. **Recovery Points**: Multi-step operations should track progress for safe retry
3. **Response Caching**: Return cached response for duplicate requests
4. **TTL Configuration**: Implement appropriate expiry (24h for payments, 7d for webhooks)
5. **Cross-Tenant Isolation**: Include tenant_id in idempotency key scope

### P2 - Medium (Implement Within Quarter)

1. **Monitoring Dashboard**: Track idempotency key usage, collision rate, replay rate
2. **Audit Logging**: Log all idempotent replays for debugging
3. **Key Format Standardization**: Document and enforce key format across services
4. **Cleanup Jobs**: Implement automated cleanup of expired idempotency records
5. **Client SDK**: Provide idempotency key generation in client libraries

### P3 - Low (Backlog)

1. **Idempotency Fingerprint**: Hash request payload to detect parameter mismatches
2. **Completionist Process**: Background job to complete stuck operations
3. **Key Analytics**: Track idempotency patterns for capacity planning
4. **Documentation**: API docs specifying idempotency requirements per endpoint

---

## Sources

1. IETF Draft RFC - The Idempotency-Key HTTP Header Field  
   https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/

2. Stripe Blog - Designing robust and predictable APIs with idempotency  
   https://stripe.com/blog/idempotency

3. Stripe API Documentation - Idempotent Requests  
   https://docs.stripe.com/api/idempotent_requests

4. Stripe Documentation - Server-side integration  
   https://stripe.com/docs/implementation-guides/core-payments/server-side-integration

5. Stripe Documentation - Webhooks  
   https://docs.stripe.com/webhooks

6. Brandur - Implementing Stripe-like Idempotency Keys in Postgres  
   https://brandur.org/idempotency-keys

7. ByteByteGo - At most once, at least once, exactly once  
   https://blog.bytebytego.com/p/at-most-once-at-least-once-exactly

8. Brave New Geek - You Cannot Have Exactly-Once Delivery  
   https://bravenewgeek.com/you-cannot-have-exactly-once-delivery/

9. CockroachDB - Idempotency's role in financial services  
   https://www.cockroachlabs.com/blog/idempotency-in-finance/

10. HTTP Toolkit - Working with the new Idempotency Keys RFC  
    https://httptoolkit.com/blog/idempotency-keys/

11. Hookdeck - How to Implement Webhook Idempotency  
    https://hookdeck.com/webhooks/guides/implement-webhook-idempotency

12. Thirdweb - Prevent duplicate blockchain transactions with Engine  
    https://blog.thirdweb.com/changelog/idempotency-keys-for/

13. Crossmint - Mint NFT with ID (Idempotent)  
    https://docs.crossmint.com/api-reference/minting/nfts/mint-nft-idempotent

14. Redis Documentation - EXPIRE Command  
    https://redis.io/docs/latest/commands/expire/

15. Zuplo - Implementing Idempotency Keys in REST APIs  
    https://zuplo.com/learning-center/implementing-idempotency-keys-in-rest-apis-a-complete-guide