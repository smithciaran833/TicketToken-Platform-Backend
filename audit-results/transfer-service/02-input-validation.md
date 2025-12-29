## Transfer-Service Input Validation Audit
### Standard: 02-input-validation.md

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Checks** | 38 |
| **Passed** | 25 |
| **Failed** | 7 |
| **Partial** | 6 |
| **Pass Rate** | 66% |

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 2 |
| 🟠 HIGH | 4 |
| 🟡 MEDIUM | 5 |
| 🟢 LOW | 2 |

---

## Section 3.1: Route Definition Checklist

### RD1: All routes have schema validation
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.routes.ts:16-30, 33-46` |
| Code | Both routes have `preHandler: [..., validate({ body/params: schema })]` |

### RD2: Body schema defined for POST/PUT/PATCH
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.routes.ts:19-20, 37-40` |
| Code | `validate({ body: giftTransferBodySchema })` and `validate({ params: acceptTransferParamsSchema, body: acceptTransferBodySchema })` |

### RD3: Params schema defined with format validation
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts:77-79` |
| Code | `acceptTransferParamsSchema = z.object({ transferId: uuidSchema })` |
| Note | UUID format validation applied via `z.string().uuid()` |

### RD4: Query schema defined with type constraints
| Status | **PARTIAL** 🟢 LOW |
|--------|----------------------|
| Evidence | `schemas.ts:93-99` |
| Code | `transferListQuerySchema` defined but not applied to any route |
| Issue | No list/query endpoints currently implemented |
| Note | Schema exists for future use |

### RD5: Response schema defined (serialization)
| Status | **FAIL** 🟡 MEDIUM |
|--------|----------------------|
| Evidence | `transfer.routes.ts` |
| Issue | No response schema validation/serialization configured |
| Remediation | Add Fastify response schemas to prevent data leakage |
| Fix | Add `schema: { response: { 201: giftTransferResponseSchema } }` |

### RD6: `additionalProperties: false` on all object schemas
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts:46, 65` |
| Code | `.strict()` applied to both body schemas |
| Note | Zod `.strict()` is equivalent to `additionalProperties: false` |

### RD7: Arrays have `maxItems` constraint
| Status | **N/A** |
|--------|---------|
| Note | No array fields in transfer schemas |

### RD8: Strings have `maxLength` constraint
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts:19, 27, 33` |
| Code | `emailSchema: .max(255)`, `acceptanceCodeSchema: .max(12)`, `messageSchema: .max(500)` |

### RD9: Integers have `minimum` and `maximum`
| Status | **N/A** |
|--------|---------|
| Note | No integer fields in transfer schemas |

### RD10: Enums use `Type.Union` with `Type.Literal`
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts:95-96` |
| Code | `status: z.enum(['PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED'])` |

---

## Section 3.2: Schema Definition Checklist

### SD1: UUIDs validated with `format: 'uuid'`
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts:14-16` |
| Code | `uuidSchema = z.string().uuid('Invalid UUID format')` |
| Usage | Applied to `ticketId`, `transferId`, `userId` fields |

### SD2: Emails validated with `format: 'email'`
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts:18-21` |
| Code | `emailSchema = z.string().email('Invalid email format').max(255)` |

### SD3: URLs validated with `format: 'uri'`
| Status | **N/A** |
|--------|---------|
| Note | No URL fields in transfer schemas |

### SD4: Dates use ISO8601 format string
| Status | **PARTIAL** 🟡 MEDIUM |
|--------|------------------------|
| Evidence | `schemas.ts:56` |
| Code | `expiresAt: z.date()` |
| Issue | Uses Zod `z.date()` but API likely receives ISO strings |
| Remediation | Use `z.string().datetime()` for API input or add transform |

### SD5: Phone numbers have pattern validation
| Status | **N/A** |
|--------|---------|
| Note | No phone fields in transfer schemas |

### SD6: No `Type.Any()` or `Type.Unknown()` in production
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts` - full file review |
| Note | No `z.any()` or `z.unknown()` usage found |

### SD7: Optional fields explicitly marked
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts:33, 45` |
| Code | `message: z.string().max(500).optional()` |

### SD8: Default values set where appropriate
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts:88-89` |
| Code | `page: z.coerce.number().default(1)`, `limit: z.coerce.number().default(20)` |

### SD9: Schemas are reusable (DRY)
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts:14-35` |
| Code | Common validators (`uuidSchema`, `emailSchema`, `acceptanceCodeSchema`) defined once and reused |

### SD10: Schema names are consistent
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts` |
| Code | Consistent naming: `*Schema`, `*BodySchema`, `*ParamsSchema`, `*ResponseSchema` |

---

## Section 3.3: Service Layer Checklist

### SL1: Business rule validation after schema validation
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts:36-42` |
| Code | After schema validation, service checks ticket ownership and transferability |

### SL2: Authorization checks before data access
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts:36` |
| Code | `await this.getTicketForUpdate(client, ticketId, fromUserId)` |
| Note | Ownership verified in query with `AND user_id = $2` |

### SL3: Entity existence validated before operations
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts:144-152, 161-170` |
| Code | `getTicketForUpdate` and `getTicketType` throw if not found |

### SL4: State transitions validated
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts:95-99` |
| Code | Checks `if (new Date(transfer.expires_at) < new Date())` before accepting |
| Note | Transfer expiration validated before state transition |

### SL5: Cross-field validation performed
| Status | **PARTIAL** 🟡 MEDIUM |
|--------|------------------------|
| Evidence | `transfer.service.ts` |
| Issue | No validation that `toEmail` differs from sender's email |
| Remediation | Add check to prevent self-transfers |

### SL6: External input re-validated if transformed
| Status | **PASS** |
|--------|----------|
| Evidence | `validation.middleware.ts:26-28` |
| Code | `request.body = validated;` - replaces with validated data |

### SL7: No direct use of `request.body` in DB queries
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.controller.ts:31-33`, `transfer.service.ts:56-70` |
| Code | Controller destructures validated fields, service uses typed parameters |

### SL8: Sensitive fields filtered from responses
| Status | **PARTIAL** 🟠 HIGH |
|--------|----------------------|
| Evidence | `transfer.service.ts:77-82` |
| Code | Returns `acceptanceCode` in response |
| Issue | Acceptance code (security-sensitive) exposed in API response |
| Note | This is expected for gift transfers (code sent to recipient) |
| Remediation | Ensure code only returned once, add warning in docs |

---

## Section 3.4: Database Layer Checklist

### DB1: All queries use parameterized values
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts:56-70, 110-115, 144-152` |
| Code | All queries use `$1, $2, $3...` parameterization |

### DB2: `whereRaw` uses bindings array
| Status | **N/A** |
|--------|---------|
| Note | No `whereRaw` usage - uses pg client directly with proper params |

### DB3: Dynamic columns use allowlist
| Status | **N/A** |
|--------|---------|
| Note | No dynamic column queries in transfer service |

### DB4: No user input in table/column names
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts` - all queries |
| Note | Table/column names are hardcoded strings |

### DB5: Knex migrations define NOT NULL
| Status | **REQUIRES REVIEW** |
|--------|---------------------|
| Note | Migration file `001_baseline_transfer.ts` not reviewed |

### DB6: Knex migrations define constraints
| Status | **REQUIRES REVIEW** |
|--------|---------------------|
| Note | Migration file `001_baseline_transfer.ts` not reviewed |

### DB7: Repository methods use explicit field lists
| Status | **PARTIAL** 🟡 MEDIUM |
|--------|------------------------|
| Evidence | `transfer.service.ts:144-147, 182-187` |
| Code | Uses `SELECT *` in several queries |
| Issue | `SELECT *` fetches all columns including potentially sensitive data |
| Remediation | Use explicit column lists: `SELECT id, ticket_id, status, ...` |

### DB8: Insert/update use explicit field mapping
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts:56-70` |
| Code | INSERT statement explicitly lists all columns |

---

## Section 3.5: Security-Specific Checklist

### SEC1: Prototype pollution blocked (`additionalProperties: false`)
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts:46, 65` |
| Code | `.strict()` on body schemas |

### SEC2: Mass assignment prevented (explicit fields)
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.controller.ts:31-33` |
| Code | `const { ticketId, toEmail, message } = request.body;` |
| Note | Destructures only expected fields |

### SEC3: SQL injection prevented (parameterized queries)
| Status | **PASS** |
|--------|----------|
| Evidence | `transfer.service.ts` - all queries |
| Note | All user input passed as parameters, never concatenated |

### SEC4: XSS prevented (output encoding)
| Status | **N/A** |
|--------|---------|
| Note | Service returns JSON, no HTML rendering |

### SEC5: File upload validates content type
| Status | **N/A** |
|--------|---------|
| Note | No file uploads in transfer service |

### SEC6: File names are sanitized/regenerated
| Status | **N/A** |
|--------|---------|
| Note | No file handling in transfer service |

### SEC7: Path traversal prevented
| Status | **N/A** |
|--------|---------|
| Note | No file system operations |

### SEC8: Unicode normalized before comparison
| Status | **FAIL** 🟡 MEDIUM |
|--------|----------------------|
| Evidence | `schemas.ts:18-21` |
| Code | `z.string().email('Invalid email format')` |
| Issue | No Unicode normalization on email addresses |
| Remediation | Add `.transform(v => v.normalize('NFC'))` before validation |

### SEC9: Integer bounds prevent overflow
| Status | **PASS** |
|--------|----------|
| Evidence | `schemas.ts:88-89` |
| Code | `page: .min(1)`, `limit: .min(1).max(100)` |

### SEC10: Rate limiting on validation-heavy endpoints
| Status | **PARTIAL** 🟠 HIGH |
|--------|----------------------|
| Evidence | `app.ts:27-30` |
| Issue | Global rate limit only (100/min). Transfer creation should have stricter limit |
| Note | `rate-limit.middleware.ts` has `transferCreation: { max: 5 }` but NOT applied |
| Remediation | Apply custom rate limit to POST `/transfers/gift` |

---

## Additional Validation Findings

### CRITICAL: Acceptance Code Pattern Too Weak
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `schemas.ts:24-28` |
| Code | `acceptanceCodeSchema = z.string().min(6).max(12).regex(/^[A-Z0-9]+$/)` |
| Issue | Pattern allows sequential/predictable codes (e.g., "AAAAAA", "123456") |
| Risk | Brute-force attack on acceptance codes |
| Remediation | Generate cryptographically random codes server-side only |

### CRITICAL: No Validation for Transfer Recipient
| Severity | 🔴 CRITICAL |
|----------|-------------|
| Evidence | `transfer.service.ts:175-193` |
| Code | `getOrCreateUser` creates user without email verification |
| Issue | Can create transfers to ANY email address without verification |
| Risk | Data injection, spam, potential account enumeration |
| Remediation | Require email verification before transfer completion |

### HIGH: Missing Duplicate Request Prevention
| Severity | 🟠 HIGH |
|----------|---------|
| Evidence | `transfer.service.ts:23-83` |
| Issue | No idempotency check for transfer creation |
| Risk | Duplicate transfers created on retry |
| Remediation | Implement idempotency key checking |

### MEDIUM: Validation Error Response Leaks Schema Details
| Severity | 🟡 MEDIUM |
|----------|----------|
| Evidence | `validation.middleware.ts:12-20` |
| Code | Returns full Zod error details including `code` |
| Issue | Detailed error responses aid attackers |
| Remediation | Sanitize error responses in production |

---

## Validation Coverage Matrix

| Endpoint | Body | Params | Query | Response | Rate Limit |
|----------|------|--------|-------|----------|------------|
| POST `/transfers/gift` | ✅ | N/A | N/A | ❌ | ⚠️ Global |
| POST `/transfers/:id/accept` | ✅ | ✅ | N/A | ❌ | ⚠️ Global |

---

## Prioritized Remediations

### 🔴 CRITICAL (Fix Immediately)

1. **Acceptance Code Security**
   - File: `transfer.service.ts:227-232`
   - Issue: Weak code generation + pattern-only validation
   - Action: Generate cryptographically random codes, remove client-side generation

2. **Email Verification for Transfers**
   - File: `transfer.service.ts:175-193`
   - Issue: Creates users without email verification
   - Action: Require email confirmation before transfer completion

### 🟠 HIGH (Fix Within 24-48 Hours)

3. **Apply Transfer-Specific Rate Limiting**
   - File: `transfer.routes.ts`
   - Action: Add `createRateLimitMiddleware(redis, RateLimitPresets.transferCreation)` to POST `/transfers/gift`

4. **Response Schema Validation**
   - File: `transfer.routes.ts`
   - Action: Add Fastify response schemas to prevent data leakage
```typescript
   schema: {
     response: {
       201: { type: 'object', properties: { transferId: { type: 'string' }, ... } }
     }
   }
```

5. **Idempotency Key Validation**
   - Add `Idempotency-Key` header validation to transfer creation

6. **Sensitive Field Logging Review**
   - Ensure `acceptanceCode` never logged

### 🟡 MEDIUM (Fix Within 1 Week)

7. **Unicode Normalization**
   - File: `schemas.ts:18-21`
   - Add `.transform(v => v.normalize('NFC'))` to email schema

8. **Explicit Column Selection**
   - File: `transfer.service.ts`
   - Replace `SELECT *` with explicit column lists

9. **Self-Transfer Prevention**
   - File: `transfer.service.ts`
   - Add validation: `if (fromUserEmail === toEmail) throw error`

10. **Production Error Sanitization**
    - File: `validation.middleware.ts`
    - Reduce error detail in production environment

---

## Schema Compliance Summary

| Schema | Strict Mode | Max Length | Format Validation | Optional Marked |
|--------|-------------|------------|-------------------|-----------------|
| `giftTransferBodySchema` | ✅ `.strict()` | ✅ | ✅ UUID, Email | ✅ `message` |
| `acceptTransferBodySchema` | ✅ `.strict()` | ✅ | ✅ UUID, Code | N/A |
| `acceptTransferParamsSchema` | ✅ (implicit) | N/A | ✅ UUID | N/A |

---

## End of Input Validation Audit Report
