## Compliance Service Idempotency Audit Report
### Audited Against: Docs/research/07-idempotency.md

---

## 🔴 CRITICAL FINDINGS

### No Idempotency Implementation Exists Anywhere
**Severity:** CRITICAL  
**Files:** ALL controllers, routes, services  
**Evidence:** Zero references to idempotency in the entire service:
- No `Idempotency-Key` header handling
- No `idempotency_keys` table in migrations
- No duplicate detection in any POST endpoint
- No webhook event deduplication

**Searched patterns that returned NO results:**
- `idempotency` - 0 matches
- `Idempotency-Key` - 0 matches
- `idempotent` - 0 matches
- `duplicate` check patterns - 0 matches

---

### Webhook Handlers Have No Event Deduplication
**Severity:** CRITICAL  
**File:** `src/routes/webhook.routes.ts:8-43`  
**Evidence:**
```typescript
// Line 8-18: Tax update webhook - NO deduplication!
fastify.post('/webhooks/compliance/tax-update', {
  onRequest: webhookAuth(WEBHOOK_SECRET)
}, async (request, reply) => {
  try {
    console.log('Tax update webhook received', { body: request.body });
    return reply.send({ received: true });
    // ❌ No event ID tracking!
    // ❌ No duplicate check!
    // ❌ No webhook_events table insert!
  } catch (error) { ... }
});

// Same pattern for all 3 webhook endpoints:
// - /webhooks/compliance/tax-update
// - /webhooks/compliance/kyc-update  
// - /webhooks/compliance/risk-alert
```
**Impact:** Same webhook delivered twice = processed twice. At-least-once delivery semantics require deduplication.

---

### Batch Operations Can Run Multiple Times
**Severity:** CRITICAL  
**File:** `src/services/batch.service.ts:7-96`  
**Evidence:**
```typescript
// Line 7-15: No idempotency check on batch job
async generateYear1099Forms(year: number, tenantId: string) {
  // Just inserts a new job every time - no check for existing!
  const jobResult = await db.query(
    `INSERT INTO compliance_batch_jobs 
     (job_type, status, started_at, tenant_id, created_at)
     VALUES ('1099_generation', 'running', NOW(), $1, NOW())`,
    [tenantId]
  );
  // ❌ No check if 1099s already generated for this year!
  // ❌ No idempotency key!
}
```
**File:** `src/controllers/batch.controller.ts:9-32`
```typescript
async generate1099Forms(request: FastifyRequest, reply: FastifyReply) {
  const { year } = request.body as any;
  const result = await batchService.generateYear1099Forms(targetYear, tenantId);
  // ❌ No Idempotency-Key header
  // ❌ No duplicate request detection
  // Running this twice = DUPLICATE 1099 FORMS!
}
```
**Impact:** Duplicate tax forms generated, sent to IRS = compliance violation.

---

### POST Endpoints for State Changes Lack Idempotency
**Severity:** CRITICAL  
**Files:** All controller files  
**Evidence from controllers (reviewed in previous audits):**

**venue.controller.ts - startVerification:**
```typescript
async startVerification(request: FastifyRequest, reply: FastifyReply) {
  const { venueId, ein, businessName, businessAddress } = request.body;
  // ❌ No idempotency key
  // Running twice creates duplicate verification records
}
```

**document.controller.ts - uploadDocument:**
```typescript
async uploadDocument(request: FastifyRequest, reply: FastifyReply) {
  // ❌ No idempotency key
  // Client retry = duplicate document records
}
```

**bank.controller.ts - addBankAccount:**
```typescript
async addBankAccount(request: FastifyRequest, reply: FastifyReply) {
  // ❌ No idempotency key
  // Bank account added multiple times on retry
}
```

---

## 🟠 HIGH FINDINGS

### form_1099_records Has No Unique Constraint on (venue_id, year)
**Severity:** HIGH  
**File:** `src/migrations/001_baseline_compliance.ts:168-187`  
**Evidence:**
```typescript
// Line 168-187: No unique constraint!
await knex.schema.createTable('form_1099_records', (table) => {
  table.increments('id').primary();
  table.string('venue_id', 255);
  table.integer('year');
  // ... other fields
  table.index(['venue_id', 'year']);  // Index only, NOT unique!
});
// Missing: table.unique(['venue_id', 'year', 'tenant_id']);
```
**Impact:** Database allows duplicate 1099 forms per venue per year.

---

### webhook_logs Table Exists But Not Used for Deduplication
**Severity:** HIGH  
**File:** `src/migrations/001_baseline_compliance.ts:189-199`  
**Evidence:**
```typescript
// Table exists:
await knex.schema.createTable('webhook_logs', (table) => {
  table.increments('id').primary();
  table.string('source', 50);
  table.string('type', 100);
  table.jsonb('payload');
  table.boolean('processed').defaultTo(false);
  // ❌ No unique constraint on event_id!
  // ❌ No event_id column at all!
});
```
**File:** `src/routes/webhook.routes.ts` - webhook_logs table NOT used:
```typescript
// Webhook handlers don't insert into webhook_logs!
// They just log to console and return
```

---

### No Recovery Point Tracking for Multi-Step Operations
**Severity:** HIGH  
**File:** `src/services/batch.service.ts:30-74`  
**Evidence:**
```typescript
// Line 30-74: 1099 generation loop
for (const venue of venues) {
  try {
    // Step 1: Generate form data
    const form1099 = { ... };
    
    // Step 2: Store 1099 record
    await db.query('INSERT INTO form_1099_records...');
    
    // Step 3: Update tax records
    await db.query('UPDATE tax_records...');
    
    // Step 4: Send notification
    await notificationService.sendEmail(...);
    
    // ❌ No recovery points!
    // If step 3 fails: 1099 saved but tax_records not updated
    // Retry creates ANOTHER 1099 record
  } catch (error) {
    // Just logs and continues - no recovery tracking
  }
}
```

---

### compliance_batch_jobs Has No Unique Constraint
**Severity:** HIGH  
**File:** `src/migrations/001_baseline_compliance.ts:151-162`  
**Evidence:**
```typescript
await knex.schema.createTable('compliance_batch_jobs', (table) => {
  table.increments('id').primary();
  table.string('job_type', 50);
  table.string('status', 20);
  // ❌ No unique constraint on (job_type, tenant_id, date)
  // Multiple jobs of same type can run simultaneously
});
```

---

## 🟡 MEDIUM FINDINGS

### No Idempotent Response Headers
**Severity:** MEDIUM  
**Evidence:** None of the endpoints return `X-Idempotent-Replayed: true` header for duplicate requests because duplicates are not detected.

---

### Daily Compliance Checks Can Run Multiple Times Per Day
**Severity:** MEDIUM  
**File:** `src/services/batch.service.ts:121-162`  
**Evidence:**
```typescript
async dailyComplianceChecks(tenantId: string) {
  // ❌ No check if already run today
  // ❌ No job record created
  // Running multiple times = multiple notifications sent
}
```

---

## ✅ PASSING CHECKS

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| **None** | No idempotency checks pass | ❌ N/A | Service has zero idempotency implementation |

---

## 📊 SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 4 | No idempotency anywhere, webhooks no dedup, batch duplicates, POST without keys |
| 🟠 HIGH | 4 | No unique constraints, webhook_logs unused, no recovery points |
| 🟡 MEDIUM | 2 | No replay headers, daily checks can run multiple times |
| ✅ PASS | 0 | Nothing passes idempotency audit |

---

## 🛠️ REQUIRED FIXES

### IMMEDIATE (CRITICAL)

**1. Create idempotency_keys table:**
```typescript
// New migration: 006_add_idempotency.ts
export async function up(knex: Knex) {
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('idempotency_key', 255).notNullable();
    table.uuid('tenant_id').notNullable();
    table.string('request_path', 500).notNullable();
    table.string('request_hash', 64);
    table.integer('response_code');
    table.jsonb('response_body');
    table.timestamp('locked_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    
    table.unique(['tenant_id', 'idempotency_key']);
    table.index(['tenant_id', 'created_at']);
  });
}
```

**2. Create idempotency middleware:**
```typescript
// src/middleware/idempotency.middleware.ts
export async function checkIdempotency(request: FastifyRequest, reply: FastifyReply) {
  const idempotencyKey = request.headers['idempotency-key'] as string;
  if (!idempotencyKey) return; // Optional for some endpoints
  
  const tenantId = request.tenantId;
  
  // Check if key exists
  const existing = await db.query(
    `SELECT * FROM idempotency_keys 
     WHERE tenant_id = $1 AND idempotency_key = $2`,
    [tenantId, idempotencyKey]
  );
  
  if (existing.rows.length > 0) {
    const record = existing.rows[0];
    if (record.completed_at) {
      // Return cached response
      reply.header('X-Idempotent-Replayed', 'true');
      return reply.code(record.response_code).send(record.response_body);
    } else {
      // Request in progress
      return reply.code(409).send({ error: 'Request already in progress' });
    }
  }
  
  // Insert new key (with unique constraint handling)
  try {
    await db.query(
      `INSERT INTO idempotency_keys (tenant_id, idempotency_key, request_path)
       VALUES ($1, $2, $3)`,
      [tenantId, idempotencyKey, request.url]
    );
  } catch (err) {
    if (err.code === '23505') {
      // Race condition - another request inserted first
      return reply.code(409).send({ error: 'Duplicate request' });
    }
    throw err;
  }
}
```

**3. Fix webhook handlers with event deduplication:**
```typescript
// src/routes/webhook.routes.ts
fastify.post('/webhooks/compliance/tax-update', async (request, reply) => {
  const eventId = (request.body as any).event_id || (request.body as any).id;
  
  // Check for duplicate
  const existing = await db.query(
    `SELECT id FROM webhook_logs WHERE event_id = $1`,
    [eventId]
  );
  if (existing.rows.length > 0) {
    logger.info({ eventId }, 'Duplicate webhook ignored');
    return reply.send({ received: true }); // Return 200 to stop retries
  }
  
  // Insert with unique constraint (race condition safe)
  await db.query(
    `INSERT INTO webhook_logs (event_id, source, type, payload, tenant_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [eventId, 'compliance', 'tax-update', request.body, tenantId]
  );
  
  // Process webhook...
});
```

**4. Add unique constraint on form_1099_records:**
```typescript
await knex.schema.alterTable('form_1099_records', (t) => {
  t.unique(['tenant_id', 'venue_id', 'year', 'form_type']);
});
```

### 24-48 HOURS (HIGH)

5. Add event_id column to webhook_logs table
6. Use webhook_logs for deduplication
7. Add recovery points to batch processing
8. Implement batch job deduplication (unique on tenant_id, job_type, date)

### 1 WEEK (MEDIUM)

9. Add idempotency to all POST endpoints
10. Return X-Idempotent-Replayed header
11. Implement TTL and cleanup for idempotency_keys
12. Add monitoring for duplicate request rates
