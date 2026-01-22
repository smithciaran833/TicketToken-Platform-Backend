# Event Service Types Analysis
## Purpose: Integration Testing Documentation
## Source Files Analyzed:
- `src/types/index.ts` (125 lines)

## Generated: January 20, 2026

---

## FILE-BY-FILE ANALYSIS

### 1. index.ts (125 lines)

**Purpose:** Central type definitions, interfaces, and custom error classes for the event service.

#### DATABASE OPERATIONS
N/A - Type definitions only

#### EXTERNAL SERVICE CALLS
N/A - Type definitions only

#### CACHING
N/A

#### STATE MANAGEMENT
N/A

#### TENANT ISOLATION

**Status:** ⚠️ PARTIAL - Types defined but not enforced

**Observation:** `AuthenticatedRequest` does NOT include `tenantId`:
```typescript
export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    role: string;
    permissions: string[];
  };
  container: AwilixContainer<Dependencies>;
  // Missing: tenantId!
}
```

🟡 **MEDIUM:** `tenantId` accessed via `(request as any).tenantId` throughout codebase instead of typed property

#### BUSINESS LOGIC

**Re-exported Model Interfaces:**
```typescript
export {
  IEvent,
  IEventCategory,
  IEventSchedule,
  IEventCapacity,
  IEventPricing,
  IEventMetadata
} from '../models';
```

**Configuration Types:**

| Type | Purpose |
|------|---------|
| `AppConfig` | Service configuration (port, host, db, redis, services) |
| `Dependencies` | DI container shape |
| `AuthenticatedRequest` | Fastify request with user context |
| `AuthenticatedHandler` | Handler function type |

**Legacy Types:**

| Type | Purpose | Notes |
|------|---------|-------|
| `Event` | Old event structure | Maps to new IEvent |
| `TicketType` | Ticket tier definition | Used by ticket endpoints |
| `PricingRule` | Dynamic pricing rules | time_based, demand_based, group |

**Service Response Type:**
```typescript
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: any[];
}
```

**Custom Error Classes:**

| Error Class | Status Code | Code | Use Case |
|-------------|-------------|------|----------|
| `AppError` | Any | Any | Base error class |
| `ValidationError` | 422 | VALIDATION_ERROR | Input validation failures |
| `NotFoundError` | 404 | NOT_FOUND | Resource not found |
| `UnauthorizedError` | 401 | UNAUTHORIZED | Auth failures |
| `ForbiddenError` | 403 | FORBIDDEN | Permission denied |

**Error Class Implementation:**
```typescript
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any[];

  constructor(message: string, statusCode: number, code: string, details?: any[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

#### ERROR HANDLING

**Pattern:** Custom error classes with HTTP status codes

✅ **GOOD:** Error classes include:
- `statusCode` for HTTP response
- `code` for machine-readable error type
- `details` for validation errors
- Stack trace capture

#### CONCURRENCY
N/A

#### POTENTIAL ISSUES

🟡 **MEDIUM:**
1. **`AuthenticatedRequest` missing `tenantId`:**
   ```typescript
   // Current - forces type casting
   const tenantId = (request as any).tenantId;
   
   // Should be
   export interface AuthenticatedRequest extends FastifyRequest {
     user: { ... };
     tenantId: string;  // ADD THIS
     container: AwilixContainer<Dependencies>;
   }
   ```

2. **Legacy `Event` type has different status values:**
   ```typescript
   // Legacy
   status: 'draft' | 'published' | 'soldout' | 'cancelled';
   
   // New IEvent
   status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | ...
   ```
   - Casing mismatch (lowercase vs UPPERCASE)
   - Different status values

3. **`Dependencies` interface has `any` types:**
   ```typescript
   mongodb?: any;
   eventContentService: any;
   eventService: any;
   pricingService: any;
   capacityService: any;
   ```
   - Should be properly typed

🟢 **LOW:**
- Error classes well-structured
- Good use of generics in `ServiceResponse<T>`

---

## CROSS-SERVICE DEPENDENCIES

### Type Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                    src/types/index.ts                        │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ External Deps   │  │ Internal Models │  │ Error Classes   │
│                 │  │                 │  │                 │
│ • FastifyRequest│  │ • IEvent        │  │ • AppError      │
│ • FastifyReply  │  │ • IEventCategory│  │ • ValidationError│
│ • Knex          │  │ • IEventSchedule│  │ • NotFoundError │
│ • Redis         │  │ • IEventCapacity│  │ • UnauthorizedError│
│ • AwilixContainer│ │ • IEventPricing │  │ • ForbiddenError│
│                 │  │ • IEventMetadata│  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## INTEGRATION TEST FILE MAPPING

### Test Coverage Recommendations

| Type/Class | Test File (Proposed) | Priority | Key Scenarios |
|------------|---------------------|----------|---------------|
| Error Classes | `error-classes.unit.test.ts` | 🟡 MEDIUM | Status codes, error codes, stack traces |
| `ServiceResponse` | N/A | 🟢 LOW | Type-only, no runtime behavior |

### Test Scenarios

#### Error Classes Tests
- [ ] `AppError` captures stack trace
- [ ] `ValidationError` sets 422 status and VALIDATION_ERROR code
- [ ] `NotFoundError` formats resource name in message
- [ ] `UnauthorizedError` defaults message to 'Unauthorized'
- [ ] `ForbiddenError` defaults message to 'Forbidden'
- [ ] Error classes extend Error properly (instanceof checks)

---

## REMAINING CONCERNS

### 🟡 MEDIUM Priority

1. **Add `tenantId` to `AuthenticatedRequest`:**
   ```typescript
   export interface AuthenticatedRequest extends FastifyRequest {
     user: { ... };
     tenantId: string;
     container: AwilixContainer<Dependencies>;
   }
   ```

2. **Type the `Dependencies` interface properly:**
   ```typescript
   import { EventService } from '../services/event.service';
   import { PricingService } from '../services/pricing.service';
   // etc.
   
   export interface Dependencies {
     eventService: EventService;
     pricingService: PricingService;
     // etc.
   }
   ```

3. **Reconcile legacy `Event` type with `IEvent`:**
   - Either remove legacy type or add mapping functions
   - Standardize on UPPERCASE status values

### 🟢 LOW Priority

4. **Add missing error classes:**
   - `ConflictError` (409) - for optimistic locking failures
   - `BadRequestError` (400) - for malformed requests
   - `ServiceUnavailableError` (503) - for external service failures

---

## TESTING CHECKLIST

### Should Test (P1)
- [ ] Error class instantiation
- [ ] Error class HTTP status codes
- [ ] Error class error codes
- [ ] Stack trace capture

### Nice to Test (P2)
- [ ] Type compatibility with Fastify
- [ ] DI container type resolution

---

**End of Analysis**