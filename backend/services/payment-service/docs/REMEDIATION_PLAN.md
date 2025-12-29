# Payment-Service Remediation Plan

**Generated:** 2025-12-21
**Audit Score:** 66% Pass (148/223 items)
**Critical Issues:** 30
**High Priority Issues:** 30

---

## Executive Summary

Payment-service handles all financial transactions, refunds, tax compliance, and royalty distribution. The audit found critical gaps in tenant isolation and financial calculation accuracy that must be fixed before production.

**Blockers for Production:**
1. Cross-tenant data access possible
2. Money creation/destruction through rounding errors
3. Weak configuration defaults

**Strengths:**
- Excellent compliance implementation (tax, AML, KYC)
- 80% test coverage
- Circuit breakers and graceful degradation
- Idempotency properly scoped

---

## Phase 1: Tenant Isolation (Week 1)

### Issue 1: Queries Missing tenant_id Filter

**Risk:** Users can access other tenants' payment data

**Files to Fix:**
- `src/controllers/payment.controller.ts` lines 223, 266, 290

**Current Code (line 223):**
```typescript
const result = await pool.query(
  `SELECT * FROM payment_transactions WHERE id = $1`,
  [transactionId]
);
```

**Fixed Code:**
```typescript
const result = await pool.query(
  `SELECT * FROM payment_transactions WHERE id = $1 AND tenant_id = $2`,
  [transactionId, request.user.tenantId]
);
```

**Verification:**
```bash
rg "SELECT.*FROM.*WHERE.*\$1" --type ts src/controllers/ | grep -v tenant_id
# Should return empty
```

---

### Issue 2: tenant_id is Nullable

**Risk:** Records can exist without tenant association

**File:** New migration `src/migrations/002_tenant_isolation.ts`

**Migration Code:**
```typescript
export async function up(knex: Knex): Promise<void> {
  // Update any NULL tenant_ids first (use default tenant or fail)
  await knex.raw(`
    UPDATE payment_transactions 
    SET tenant_id = (SELECT id FROM tenants LIMIT 1)
    WHERE tenant_id IS NULL
  `);
  
  // Make NOT NULL
  await knex.raw(`
    ALTER TABLE payment_transactions 
    ALTER COLUMN tenant_id SET NOT NULL
  `);
  
  // Repeat for all tables:
  // payment_refunds, payment_intents, venue_balances, etc.
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE payment_transactions 
    ALTER COLUMN tenant_id DROP NOT NULL
  `);
}
```

**Verification:**
```sql
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'payment_transactions' AND column_name = 'tenant_id';
-- Should return: is_nullable = NO
```

---

### Issue 3: No Row Level Security

**Risk:** Application bugs can expose all tenant data

**File:** New migration `src/migrations/003_row_level_security.ts`

**Migration Code:**
```typescript
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY tenant_isolation ON payment_transactions
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
    
    -- Repeat for all tables
  `);
}
```

**Verification:**
```sql
SELECT tablename, policyname FROM pg_policies WHERE tablename = 'payment_transactions';
-- Should return: tenant_isolation
```

---

### Issue 4: Validate Tenant at Request Start

**File:** `src/middleware/tenant.ts` (create new)

**Code:**
```typescript
export async function validateTenant(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) {
    return reply.status(400).send({ error: 'Tenant ID required' });
  }
  
  // Set for RLS
  await request.server.pg.query(
    `SELECT set_config('app.tenant_id', $1, true)`,
    [request.user.tenantId]
  );
}
```

**Apply to routes:**
```typescript
fastify.addHook('preHandler', validateTenant);
```

---

### Issue 5: Outbound Service Calls Not Signed

**Risk:** Service impersonation

**File:** `src/webhooks/stripe-handler.ts` line 177

**Current Code:**
```typescript
const response = await fetch(`${marketplaceUrl}/webhooks/payment-completed`, {
  headers: {
    'X-Internal-Service': 'payment-service'
  }
});
```

**Fixed Code:**
```typescript
import { signRequest } from '../middleware/internal-auth';

const signature = signRequest('POST', '/webhooks/payment-completed', body);
const response = await fetch(`${marketplaceUrl}/webhooks/payment-completed`, {
  method: 'POST',
  headers: {
    'X-Internal-Service': 'payment-service',
    'X-Timestamp': Date.now().toString(),
    'X-Signature': signature,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body)
});
```

---

### Issue 6: Weak Default Secrets

**Risk:** Service starts with insecure defaults

**File:** `src/config/index.ts`

**Current Code (line 7):**
```typescript
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-change-in-production';
```

**Fixed Code:**
```typescript
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;
if (!INTERNAL_SECRET) {
  throw new Error('INTERNAL_SERVICE_SECRET environment variable required');
}
```

**Apply to all secrets:**
- JWT_SECRET
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- DATABASE_URL

---

### Issue 7: No Config Validation at Startup

**File:** `src/config/validate.ts` (create new)

**Code:**
```typescript
import Joi from 'joi';

const configSchema = Joi.object({
  JWT_SECRET: Joi.string().min(32).required(),
  STRIPE_SECRET_KEY: Joi.string().pattern(/^sk_/).required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().pattern(/^whsec_/).required(),
  DATABASE_URL: Joi.string().uri().required(),
  INTERNAL_SERVICE_SECRET: Joi.string().min(32).required(),
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').required()
}).unknown(true);

export function validateConfig(): void {
  const { error } = configSchema.validate(process.env);
  if (error) {
    console.error('Configuration validation failed:', error.message);
    process.exit(1);
  }
}
```

**Call at startup in `src/index.ts`:**
```typescript
import { validateConfig } from './config/validate';
validateConfig();
```

---

### Issue 8: Inconsistent User ID Extraction

**File:** `src/controllers/payment.controller.ts` line 242

**Current Code:**
```typescript
if (transaction.user_id !== (user.sub || user.id || user.userId) && !user.isAdmin)
```

**Fixed Code:**
```typescript
// Standardize in auth middleware
const userId = request.user.sub; // Always use 'sub' claim

if (transaction.user_id !== userId && !request.user.isAdmin)
```

**Fix in auth middleware:**
```typescript
// src/middleware/auth.ts after token verification
request.user = {
  sub: decoded.sub,           // User ID (standardized)
  tenantId: decoded.tenantId, // Tenant ID (required)
  isAdmin: decoded.isAdmin || false
};

if (!request.user.sub || !request.user.tenantId) {
  throw new Error('Token missing required claims');
}
```

---

## Phase 2: Financial Integrity (Week 2)

### Issue 9: Floating Point in Royalty Splits

**Risk:** Money creation/destruction through rounding

**File:** `src/services/royalty-splitter.service.ts` lines 28-39

**Current Code:**
```typescript
const venueRoyalty = salePrice * (venuePercentage / 100);
const sellerProceeds = salePrice - venueRoyalty - artistRoyalty - platformFee;
return Math.round(venueRoyalty * 100) / 100;
```

**Fixed Code:**
```typescript
// All amounts in cents (integers)
function calculateSplit(salePriceCents: number, percentageBasisPoints: number): number {
  return Math.floor(salePriceCents * percentageBasisPoints / 10000);
}

const venueRoyaltyCents = calculateSplit(salePriceCents, venuePercentageBps);
const artistRoyaltyCents = calculateSplit(salePriceCents, artistPercentageBps);
const platformFeeCents = calculateSplit(salePriceCents, platformFeeBps);

// Seller gets remainder (handles rounding)
const sellerProceedsCents = salePriceCents - venueRoyaltyCents - artistRoyaltyCents - platformFeeCents;

// Assert no money created/destroyed
const total = venueRoyaltyCents + artistRoyaltyCents + platformFeeCents + sellerProceedsCents;
if (total !== salePriceCents) {
  throw new Error(`Split mismatch: ${total} !== ${salePriceCents}`);
}
```

---

### Issue 10: No Split Reconciliation

**File:** `src/services/royalty-splitter.service.ts`

**Add assertion:**
```typescript
function assertSplitBalances(
  originalCents: number,
  splits: { venue: number; artist: number; platform: number; seller: number }
): void {
  const total = splits.venue + splits.artist + splits.platform + splits.seller;
  if (total !== originalCents) {
    throw new Error(
      `Split reconciliation failed: ${total} !== ${originalCents}. ` +
      `Diff: ${total - originalCents} cents`
    );
  }
}
```

---

### Issue 11: Cumulative Refund Validation Missing

**File:** `src/controllers/payment.controller.ts`

**Add before processing refund:**
```typescript
async function validateRefundAmount(
  transactionId: string, 
  requestedAmountCents: number,
  tenantId: string
): Promise<void> {
  const result = await pool.query(
    `SELECT 
      pt.amount as original_amount,
      COALESCE(SUM(pr.amount), 0) as total_refunded
    FROM payment_transactions pt
    LEFT JOIN payment_refunds pr ON pr.transaction_id = pt.id
    WHERE pt.id = $1 AND pt.tenant_id = $2
    GROUP BY pt.id, pt.amount`,
    [transactionId, tenantId]
  );
  
  const { original_amount, total_refunded } = result.rows[0];
  const remaining = original_amount - total_refunded;
  
  if (requestedAmountCents > remaining) {
    throw new Error(
      `Refund amount ${requestedAmountCents} exceeds remaining ${remaining} cents`
    );
  }
}
```

---

### Issue 12: Royalties Not Reversed on Refund

**File:** `src/services/royalty-splitter.service.ts`

**Add method:**
```typescript
async reverseRoyalties(transactionId: string, tenantId: string): Promise<void> {
  // Get original distributions
  const distributions = await pool.query(
    `SELECT * FROM royalty_distributions 
     WHERE transaction_id = $1 AND tenant_id = $2`,
    [transactionId, tenantId]
  );
  
  // Create reversal records
  for (const dist of distributions.rows) {
    await pool.query(
      `INSERT INTO royalty_distributions 
       (tenant_id, transaction_id, recipient_type, recipient_id, amount, type)
       VALUES ($1, $2, $3, $4, $5, 'reversal')`,
      [tenantId, transactionId, dist.recipient_type, dist.recipient_id, -dist.amount]
    );
    
    // Update recipient balance
    await pool.query(
      `UPDATE venue_balances 
       SET pending_balance = pending_balance - $1
       WHERE venue_id = $2 AND tenant_id = $3`,
      [dist.amount, dist.recipient_id, tenantId]
    );
  }
}
```

**Call from refund handler:**
```typescript
// In refundTransaction()
await royaltySplitter.reverseRoyalties(transactionId, tenantId);
```

---

### Issue 13: Tax Refunds Not Tracked

**File:** `src/services/tax-calculator.service.ts`

**Add method:**
```typescript
async recordTaxRefund(
  transactionId: string, 
  refundAmountCents: number,
  tenantId: string
): Promise<void> {
  // Get original tax record
  const original = await pool.query(
    `SELECT * FROM tax_collections WHERE transaction_id = $1 AND tenant_id = $2`,
    [transactionId, tenantId]
  );
  
  if (!original.rows[0]) return;
  
  const taxRecord = original.rows[0];
  const refundRatio = refundAmountCents / taxRecord.taxable_amount;
  
  // Calculate proportional tax refund
  const stateTaxRefund = Math.round(taxRecord.state_tax * refundRatio);
  const localTaxRefund = Math.round(taxRecord.local_tax * refundRatio);
  
  await pool.query(
    `INSERT INTO tax_refunds 
     (tenant_id, transaction_id, state_tax, local_tax, refund_amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, transactionId, stateTaxRefund, localTaxRefund, refundAmountCents]
  );
}
```

---

## Phase 3: Operations (Week 3)

### Issue 14: No Correlation ID

**File:** `src/middleware/correlation.ts` (create new)
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

export async function correlationMiddleware(
  request: FastifyRequest, 
  reply: FastifyReply
): Promise<void> {
  const correlationId = request.headers['x-correlation-id'] as string || uuidv4();
  
  request.correlationId = correlationId;
  reply.header('x-correlation-id', correlationId);
  
  // Add to logger context
  request.log = request.log.child({ correlationId });
}
```

---

### Issue 15: No CI/CD Pipeline

**File:** `.github/workflows/payment-service.yml`
```yaml
name: Payment Service CI

on:
  push:
    paths:
      - 'backend/services/payment-service/**'
  pull_request:
    paths:
      - 'backend/services/payment-service/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd backend/services/payment-service && npm ci
      - run: cd backend/services/payment-service && npm run lint
      - run: cd backend/services/payment-service && npm run test
      - run: cd backend/services/payment-service && npm run build
```

---

### Issue 16: No Stripe Rate Limit Handling

**File:** `src/controllers/payment.controller.ts`
```typescript
import Stripe from 'stripe';

async function callStripeWithRetry<T>(
  fn: () => Promise<T>, 
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Stripe.errors.StripeRateLimitError) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        logger.warn(`Stripe rate limited, retrying in ${delay}ms`, { attempt });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded for Stripe API');
}
```

---

## Verification Checklist

After all fixes, run these checks:
```bash
# 1. No queries without tenant_id
rg "SELECT.*FROM.*(payment_transactions|payment_refunds|payment_intents)" --type ts src/ | grep -v tenant_id
# Expected: empty

# 2. No nullable tenant_id
psql -c "SELECT column_name, is_nullable FROM information_schema.columns WHERE column_name = 'tenant_id' AND is_nullable = 'YES';"
# Expected: empty

# 3. RLS policies exist
psql -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';"
# Expected: policies for all tables

# 4. Config validation works
NODE_ENV=production npm start
# Expected: fails if secrets missing

# 5. Tests pass
npm run test
# Expected: all pass, 80%+ coverage

# 6. No floating point in money code
rg "\* \(.*/ 100\)" --type ts src/services/
# Expected: empty (should use basis points)
```

---

## Estimated Effort

| Phase | Issues | Hours | Priority |
|-------|--------|-------|----------|
| Phase 1: Tenant Isolation | 8 | 16-24 | CRITICAL |
| Phase 2: Financial Integrity | 5 | 12-16 | CRITICAL |
| Phase 3: Operations | 7 | 8-12 | HIGH |
| **Total** | **20** | **36-52** | |

---

## Sign-Off Criteria

Before marking payment-service as production-ready:

- [ ] All Phase 1 issues fixed
- [ ] All Phase 2 issues fixed
- [ ] All tests passing
- [ ] Security review completed
- [ ] Load test passed
- [ ] Runbook documented

---

*Document generated from audit completed 2025-12-21*
