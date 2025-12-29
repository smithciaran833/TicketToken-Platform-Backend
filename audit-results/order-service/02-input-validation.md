# Order Service - 02 Input Validation Audit

**Service:** order-service
**Document:** 02-input-validation.md
**Date:** 2024-12-24
**Auditor:** Cline
**Pass Rate:** 61% (25/41 applicable checks)

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | 28 routes have ZERO input validation |
| HIGH | 2 | Mass assignment vulnerability, No response serialization |
| MEDIUM | 1 | SQL string interpolation in interval |
| LOW | 0 | None |

---

## 3.1 Route Definition (5/10)

| Check | Status | Evidence |
|-------|--------|----------|
| RD1: All routes have schema | FAIL | `tax.routes.ts`: 0/15 routes; `refund-policy.routes.ts`: 0/13 routes |
| RD2: Body schema for POST/PUT | PARTIAL | `order.routes.ts`: Yes; tax/refund-policy: NO |
| RD3: Params schema with format | PARTIAL | `order.routes.ts`: orderId validated; Others: NO |
| RD4: Query schema defined | PASS | `order.schemas.ts` line 103: getOrdersQuerySchema |
| RD5: Response schema defined | FAIL | No response schemas - data leakage possible |
| RD6: additionalProperties: false | FAIL | Joi schemas don't use `.unknown(false)` |
| RD7: Arrays have maxItems | PASS | `order.schemas.ts` line 33: `.max(50)` on items |
| RD8: Strings have maxLength | PASS | idempotencyKey `.max(255)`, reason `.max(500)` |
| RD9: Integers have min/max | PASS | quantity `.min(1).max(20)`, price `.max(1000000000)` |
| RD10: Enums validated | PASS | `modification.schemas.ts` line 4: `.valid()` |

**CRITICAL: Tax Routes - ZERO Validation**
```typescript
// ALL 15 routes have NO validation
fastify.post('/jurisdictions', controller.createJurisdiction);
fastify.post('/rates', controller.createTaxRate);
fastify.post('/calculate', controller.calculateTax);
```

**CRITICAL: Refund Policy Routes - ZERO Validation**
```typescript
// ALL 13 routes have NO validation
fastify.post('/policies', controller.createPolicy);
fastify.post('/rules', controller.createRule);
```

---

## 3.2 Schema Definition (7/8 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| SD1: UUIDs validated | PASS | `order.schemas.ts` line 10: `.uuid({ version: 'uuidv4' })` |
| SD4: Dates ISO8601 | PARTIAL | Date fields exist but no explicit format |
| SD6: No Type.Any() | PASS | No `.any()` usage found |
| SD7: Optional explicit | PASS | `.optional()` used correctly |
| SD8: Defaults set | PASS | `currency.default('USD')`, query `.default(50)` |
| SD9: Schemas reusable | PASS | Exported from dedicated files |
| SD10: Consistent naming | PASS | `createOrderSchema`, `cancelOrderSchema`, etc. |

---

## 3.3 Service Layer (6/8)

| Check | Status | Evidence |
|-------|--------|----------|
| SL1: Business rule validation | PASS | `order.service.ts` line 131: total items > 100 check |
| SL2: Auth before data access | FAIL | Auth is broken stub |
| SL3: Entity existence validated | PASS | line 86: `if (!event) throw new Error` |
| SL4: State transitions validated | PASS | line 155: checks `order.status !== PENDING` |
| SL5: Cross-field validation | PASS | lines 64-77: Custom validator for qty/value |
| SL6: Re-validates transformed input | PASS | Middleware replaces body with sanitized value |
| SL7: No direct request.body in DB | PASS | Controllers extract typed fields |
| SL8: Sensitive fields filtered | PARTIAL | No explicit response filtering |

**EXCELLENT: Server-Side Price Validation**
```typescript
// services/order.service.ts lines 93-109
const actualPrices = await this.ticketClient.getPrices(ticketTypeIds);
for (const item of request.items) {
  if (item.unitPriceCents !== actualPrice) {
    logger.warn('Price manipulation attempt detected');
    throw new Error('Invalid price for ticket type...');
  }
}
```

---

## 3.4 Database Layer (4/8)

| Check | Status | Evidence |
|-------|--------|----------|
| DB1: Parameterized queries | PASS | All queries use `$1, $2, $3` |
| DB2: whereRaw uses bindings | PARTIAL | line 80: String interpolation for interval |
| DB3: Dynamic columns allowlist | PASS | Update builds fields safely |
| DB4: No user input in table names | PASS | All hardcoded strings |
| DB5: Migrations define NOT NULL | PARTIAL | Needs migration review |
| DB6: Migrations define constraints | PARTIAL | Needs migration review |
| DB7: Explicit field lists | PARTIAL | Uses `SELECT *` in some queries |
| DB8: Explicit insert/update fields | PASS | line 26: Explicit field list |

**Issue: SQL Injection Risk in Interval**
```typescript
// models/order.model.ts line 80
AND expires_at <= NOW() + INTERVAL '${minutesFromNow} minutes'
```

---

## 3.5 Security (3/7 applicable)

| Check | Status | Evidence |
|-------|--------|----------|
| SEC1: Prototype pollution blocked | FAIL | No `.unknown(false)` |
| SEC2: Mass assignment prevented | FAIL | Extra fields not rejected |
| SEC3: SQL injection prevented | PASS | Parameterized queries |
| SEC4: XSS prevented | PARTIAL | No HTML encoding on responses |
| SEC8: Unicode normalized | PARTIAL | No explicit normalization |
| SEC9: Integer overflow prevented | PASS | `.max(1000000000)` on prices |
| SEC10: Rate limiting on heavy endpoints | PASS | Limits on POST endpoints |

**Mass Assignment Vulnerability**
```typescript
// Missing from all schemas:
.unknown(false)  // or .options({ stripUnknown: true })
```

---

## Critical Remediations

### 1. Add Validation to 28 Unprotected Routes
- `tax.routes.ts`: All 15 endpoints
- `refund-policy.routes.ts`: All 13 endpoints

### 2. Fix Mass Assignment
```typescript
export const createOrderSchema = Joi.object({
  // ... fields ...
}).unknown(false);
```

### 3. Add Response Schemas
Define explicit response schemas to prevent data leakage

### 4. Fix SQL Interval
```typescript
// Use parameterized or validate numeric
.andWhere('expires_at', '<=', knex.raw('NOW() + INTERVAL ? MINUTE', [minutesFromNow]))
```

---

## Positive Findings

- Server-side price validation against ticket service
- UUID format validation on all IDs
- Parameterized SQL queries
- Array/string bounds enforced
- Business rule validation (ticket count, order value)
- State machine validation for order status
