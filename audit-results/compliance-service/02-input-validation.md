## Compliance Service Input Validation Audit Report (COMPLETE)
### Audited Against: Docs/research/02-input-validation.md
### Controllers Reviewed: ALL 12/12

---

## 🔴 CRITICAL FINDINGS

### RD1 | No Schema Validation Applied to ANY Routes
**Severity:** CRITICAL  
**Files:** All 12 controllers use `request.body as any` without validation  
**Evidence from ALL Controllers:**

| Controller | Evidence |
|------------|----------|
| `venue.controller.ts` | `const { venueId, ein, businessName } = request.body as any;` |
| `risk.controller.ts` | `const { venueId, reason } = request.body as any;` |
| `document.controller.ts` | `const fields = data.fields as any;` |
| `tax.controller.ts` | `const { venueId, amount, ticketId } = request.body as any;` |
| `bank.controller.ts` | `const { venueId, accountNumber, routingNumber } = request.body as any;` |
| `ofac.controller.ts` | `const { name, venueId } = request.body as any;` |
| `gdpr.controller.ts` | `const { customerId } = request.body as any;` |
| `admin.controller.ts` | `const { notes } = request.body as any;` |
| `batch.controller.ts` | `const { year } = request.body as any;` |
| `dashboard.controller.ts` | No body parsing (GET only) ✓ |
| `webhook.controller.ts` | `const { webhook_type, webhook_code, item_id } = request.body as any;` |
| `health.controller.ts` | No body parsing (GET only) ✓ |

**Violation:** Zod schemas exist in `validators/schemas.ts` but **ARE NOT IMPORTED OR USED** in ANY controller.  
**Impact:** Complete input validation bypass - ALL endpoints accept ANY data.

---

### SEC2 | Mass Assignment Vulnerability (ALL Object Schemas)
**Severity:** CRITICAL  
**File:** `src/validators/schemas.ts`  
**Evidence:** NO schemas use `.strict()`:
```typescript
// ALL schemas lack .strict() - examples:
export const startVerificationSchema = z.object({...});  // ❌ No .strict()
export const trackSaleSchema = z.object({...});          // ❌ No .strict()
export const verifyBankAccountSchema = z.object({...}); // ❌ No .strict()
export const ofacCheckSchema = z.object({...});          // ❌ No .strict()
// ... ALL 25+ schemas lack .strict()
```
**Violation:** Extra properties will pass through when schemas are eventually applied.

---

### SD6 | Use of z.any() in Schemas
**Severity:** CRITICAL  
**File:** `src/validators/schemas.ts`  
**Evidence:**
```typescript
export const updateComplianceSettingsSchema = z.object({
  settingValue: z.any(),  // ❌ Allows ANY value!
});

export const stripeWebhookSchema = z.object({
  data: z.any()  // ❌ Allows ANY value!
});

export const plaidWebhookSchema = z.object({
  error: z.any().optional()  // ❌ Allows ANY value!
});
```
**Count:** 3 instances of `z.any()`

---

## 🟠 HIGH FINDINGS

### DB1 | Direct Unvalidated Input to Database (ALL Controllers)
**Severity:** HIGH  
**Files:** All controllers with database writes  
**Evidence Pattern:**
```typescript
// venue.controller.ts - Direct insert from unvalidated body
const { venueId, ein, businessName } = request.body as any;
await db.query(
  'INSERT INTO venue_verifications (venue_id, ein, business_name...) VALUES ($1, $2, $3...)',
  [venueId, ein, businessName, ...]  // ← Unvalidated!
);

// bank.controller.ts - Sensitive financial data
const { venueId, accountNumber, routingNumber } = request.body as any;
await bankService.verifyBankAccount(venueId, accountNumber, routingNumber);  // ← Unvalidated!

// tax.controller.ts
const { venueId, amount, ticketId } = request.body as any;
await taxService.trackSale(venueId, amount, ticketId, tenantId);  // ← Unvalidated!
```
**Impact:** While SQL injection is prevented by parameterized queries, malformed data can corrupt database.

---

### RD7 | Arrays Missing maxItems Constraint
**Severity:** HIGH  
**File:** `src/validators/schemas.ts`  
**Evidence:**
```typescript
export const sendgridWebhookSchema = z.array(z.object({...}));  // ❌ No maxItems!
```

---

### File Upload Missing Magic Bytes Validation
**Severity:** HIGH  
**File:** `src/controllers/document.controller.ts`  
**Evidence:**
```typescript
const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
if (!allowedTypes.includes(data.mimetype)) {  // ❌ Trusts client header only!
```
**Violation:** MIME type can be spoofed. Should verify actual file content.

---

### Webhook Validation Schema NOT Applied
**Severity:** HIGH  
**File:** `src/controllers/webhook.controller.ts`  
**Evidence:**
```typescript
async handlePlaidWebhook(request: FastifyRequest, reply: FastifyReply) {
  const { webhook_type, webhook_code, item_id } = request.body as any;  // ❌ plaidWebhookSchema exists but unused!
}

async handleStripeWebhook(request: FastifyRequest, reply: FastifyReply) {
  const payload = request.body;  // ❌ stripeWebhookSchema exists but unused!
}

async handleSendGridWebhook(request: FastifyRequest, reply: FastifyReply) {
  const events = request.body as any[];  // ❌ sendgridWebhookSchema exists but unused!
}
```

---

### parseInt Without Validation
**Severity:** HIGH  
**Files:** Multiple controllers  
**Evidence:**
```typescript
// tax.controller.ts
year ? parseInt(year as string) : undefined  // ❌ Can produce NaN

// batch.controller.ts
const targetYear = year || new Date().getFullYear() - 1;  // ← year not validated

// risk.controller.ts
await riskService.resolveFlag(parseInt(flagId), resolution, tenantId);  // ❌ Can produce NaN
```

---

## 🟡 MEDIUM FINDINGS

### RD8 | Some Strings Missing maxLength
**Severity:** MEDIUM  
**Count:** 4 instances without maxLength:
```typescript
webhook_type: z.string(),  // ❌
webhook_code: z.string(),  // ❌
item_id: z.string().optional(),  // ❌
sg_event_id: z.string().optional(),  // ❌
```

---

### Query Params Not Validated
**Severity:** MEDIUM  
**Files:** Multiple controllers  
**Evidence:**
```typescript
// tax.controller.ts
const { year } = request.query as any;  // ❌ No validation

// admin.controller.ts - No query validation for pagination
```

---

### URL Params Not Validated
**Severity:** MEDIUM  
**Files:** All controllers using params  
**Evidence:**
```typescript
const { venueId } = request.params as any;  // ❌ Not validated as UUID
const { documentId } = request.params as any;  // ❌ Not validated
const { customerId } = request.params as any;  // ❌ Not validated
const { year } = request.params as any;  // ❌ Not validated as integer
```

---

### Response Schema Not Defined
**Severity:** MEDIUM  
**Impact:** Potential data leakage - controllers return all fields including sensitive data like EIN.

---

## ✅ PASSING CHECKS

| ID | Check | Status | Evidence |
|----|-------|--------|----------|
| SD1-SD5 | Common format patterns defined | ✅ PASS | `einSchema`, `emailSchema`, `uuidSchema`, `phoneSchema` exist |
| RD10 | Enums use proper patterns | ✅ PASS | `z.enum(['pending', 'verified', 'rejected'])` |
| DB2 | Parameterized queries | ✅ PASS | All queries use `$1, $2, $3` binding |
| File Size | File size validated | ✅ PASS | 10MB limit checked |
| File Types | Extension allowlist | ✅ PASS | Only PDF, JPG, PNG |
| Middleware | Validation middleware exists | ✅ PASS | `validateBody()`, `validateQuery()`, `validateParams()` implemented |
| Error Format | Consistent error format | ✅ PASS | `formatZodError()` returns structured errors |
| Tenant Isolation | Tenant ID required | ✅ PASS | `requireTenantId()` used in all controllers |
| Logging | Actions logged | ✅ PASS | logger.info() used throughout |

---

## 📊 SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 3 | No validation applied, mass assignment risk, z.any() usage |
| 🟠 HIGH | 6 | Unvalidated DB input, missing array limits, file magic bytes, webhooks, parseInt |
| 🟡 MEDIUM | 4 | String limits, query/params validation, response schemas |
| ✅ PASS | 9 | Schemas defined, SQL injection protected, file limits |

---

## 🛠️ COMPLETE FIX REQUIRED

**The entire validation layer exists but is disconnected!**

### Step 1: Apply schemas to ALL routes
```typescript
// routes/venue.routes.ts
import { validateBody, validateParams } from '../middleware/validation.middleware';
import { startVerificationSchema, venueIdParamSchema } from '../validators/schemas';

fastify.post('/venue/start-verification', {
  preHandler: [validateBody(startVerificationSchema)],
  onRequest: requireComplianceOfficer
}, venueController.startVerification);

fastify.get('/venue/:venueId/status', {
  preHandler: [validateParams(venueIdParamSchema)]
}, venueController.getVerificationStatus);
```

### Step 2: Add .strict() to ALL object schemas
```typescript
export const startVerificationSchema = z.object({...}).strict();
export const trackSaleSchema = z.object({...}).strict();
// Apply to ALL 25+ schemas
```

### Step 3: Remove z.any() and use specific types
```typescript
export const updateComplianceSettingsSchema = z.object({
  settingValue: z.union([z.string(), z.number(), z.boolean()]),  // ← Specific types
});
```

### Step 4: Remove `as any` casting in controllers
```typescript
// BEFORE (unsafe):
const { venueId, ein, businessName } = request.body as any;

// AFTER (type-safe, assuming validation applied):
const { venueId, ein, businessName } = request.body;  // TypeScript infers from schema
```

---

## Controllers Summary Table

| Controller | Body Validation | Params Validation | Query Validation | Status |
|------------|-----------------|-------------------|------------------|--------|
| venue.controller.ts | ❌ MISSING | ❌ MISSING | N/A | 🔴 FAIL |
| risk.controller.ts | ❌ MISSING | ❌ MISSING | N/A | 🔴 FAIL |
| document.controller.ts | ❌ MISSING | ❌ MISSING | N/A | 🔴 FAIL |
| tax.controller.ts | ❌ MISSING | ❌ MISSING | ❌ MISSING | 🔴 FAIL |
| bank.controller.ts | ❌ MISSING | N/A | N/A | 🔴 FAIL |
| ofac.controller.ts | ❌ MISSING | N/A | N/A | 🔴 FAIL |
| gdpr.controller.ts | ❌ MISSING | ❌ MISSING | N/A | 🔴 FAIL |
| admin.controller.ts | ❌ MISSING | ❌ MISSING | N/A | 🔴 FAIL |
| batch.controller.ts | ❌ MISSING | N/A | N/A | 🔴 FAIL |
| dashboard.controller.ts | N/A | N/A | N/A | ✅ OK |
| webhook.controller.ts | ❌ MISSING | N/A | N/A | 🔴 FAIL |
| health.controller.ts | N/A | N/A | N/A | ✅ OK |

**Overall: 10/12 controllers have validation issues (83% failure rate)**
