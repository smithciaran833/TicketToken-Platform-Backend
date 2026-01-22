# Event Service Validations Analysis
## Purpose: Integration Testing Documentation
## Source Files Analyzed:
- `src/validations/event-security.ts` (390 lines)

## Generated: January 20, 2026

---

## FILE-BY-FILE ANALYSIS

### 1. event-security.ts (390 lines)

**Purpose:** Security validation for event modifications and deletions based on ticket sales status, with refund window management and two-step confirmation flow for critical changes.

#### DATABASE OPERATIONS
N/A - Pure validation logic, no direct DB access

#### EXTERNAL SERVICE CALLS
N/A - Validation logic only

#### CACHING

**In-Memory Confirmation Cache:**
```typescript
const pendingConfirmations = new Map<string, CriticalChangeConfirmation>();
```

**Cache Operations:**
| Function | Purpose |
|----------|---------|
| `storePendingConfirmation()` | Store confirmation with 5-min auto-cleanup |
| `getPendingConfirmation()` | Retrieve by token |
| `removePendingConfirmation()` | Delete used confirmation |

⚠️ **HIGH:** In-memory cache doesn't scale across instances

#### STATE MANAGEMENT

**Locked Statuses (No Modifications Allowed):**
```typescript
const LOCKED_STATUSES = ['COMPLETED', 'CANCELLED'];
```

**Critical Fields (Restricted After Sales):**
```typescript
const CRITICAL_FIELDS_AFTER_SALES = [
  'venue_id',
  'starts_at',
  'ends_at',
  'event_date',
  'total_capacity',
  'timezone'
];
```

#### TENANT ISOLATION

**Status:** N/A - Validation logic doesn't handle tenant context directly

Validation methods receive event data but don't enforce tenant isolation - that's the caller's responsibility.

#### BUSINESS LOGIC

**Configuration (`EventSecurityConfig`):**
| Setting | Default | Purpose |
|---------|---------|---------|
| `maxAdvanceDays` | 365 | Max days ahead for event scheduling |
| `minAdvanceHours` | 2 | Min hours ahead for event scheduling |
| `maxTicketsPerOrder` | 10 | Per-order ticket limit |
| `maxTicketsPerCustomer` | 50 | Per-customer ticket limit |
| `refundWindowHours` | 48 | Hours for refund requests after major change |
| `minHoursBeforeEventForModification` | 72 | Cannot modify critical fields within 72h of event |

**Validation Methods:**

| Method | Purpose | Throws On |
|--------|---------|-----------|
| `validateTicketPurchase()` | Check purchase limits | Exceeds per-order or per-customer limits |
| `validateEventDate()` | Check event date bounds | Too soon or too far in future |
| `validateEventModification()` | Check if modification allowed | Locked status, critical fields after sales |
| `validateEventDeletion()` | Check if deletion allowed | Completed event, tickets sold |
| `validateVenueCapacity()` | Check capacity vs venue | Exceeds venue capacity |
| `validateStatusTransition()` | Check status change validity | Invalid transition |
| `validateModificationTiming()` | Check time until event | Critical change too close to event |
| `validateConfirmationToken()` | Verify confirmation token | Invalid or expired token |

**Two-Step Confirmation Flow:**

1. User attempts to modify critical fields
2. System generates `CriticalChangeConfirmation`:
   ```typescript
   {
     confirmationToken: string;      // Random 32-byte hex
     eventId: string;
     fieldsChanging: string[];
     affectedTicketCount: number;
     refundWindowOpened: boolean;
     expiresAt: Date;                // 5 minutes
     warnings: string[];
   }
   ```
3. User resends request with confirmation token
4. System validates token and applies changes

**Refund Window Calculation:**
```typescript
calculateRefundWindow(eventId, data, currentEvent, soldTicketCount)
```
- Returns `null` if no tickets sold
- Triggers on:
  - Date/time change > 1 hour
  - Venue change
- Window duration: 48 hours (configurable)

**Warning Messages Generated:**
| Field Changed | Warning |
|---------------|---------|
| `venue_id` | "Changing venue will affect all ticket holders and may require reissuance." |
| `starts_at`/`event_date` | "Changing event date/time will notify all ticket holders and may trigger refund requests." |
| `total_capacity` (below sold) | "Cannot reduce capacity below {sold} (tickets already sold)." |
| `total_capacity` (above sold) | "Reducing capacity may affect future sales availability." |
| `timezone` | "Changing timezone will affect displayed event times for all users." |

**Admin Override:**
- `isAdmin` flag allows modification with explicit `forceAdminOverride`
- Logs warning when admin overrides protections
- Still cannot override completed event deletion

#### ERROR HANDLING

**Pattern:** Throws `Error` with descriptive messages

**Error Messages:**
| Validation | Error Message |
|------------|---------------|
| Missing event ID | "Event ID is required for modification/deletion" |
| Locked status | "Cannot modify event with status '{status}'" |
| Critical field after sales | "Cannot modify {fields} after tickets have been sold. {count} ticket(s) already sold." |
| Completed event | "Cannot delete a completed event" |
| Tickets sold (delete) | "Cannot delete event with {count} ticket(s) sold. Please cancel the event and process refunds instead." |
| Event started | "Cannot delete an event that has already started" |
| Too close to event | "Cannot modify {fields} within 72 hours of the event. Event starts in {hours} hours." |
| Capacity exceeds venue | "Event capacity ({requested}) cannot exceed venue capacity ({venue})" |
| Purchase limit | "Cannot purchase more than {limit} tickets per order/event" |
| Date too soon | "Event must be scheduled at least {hours} hours in advance" |
| Date too far | "Event cannot be scheduled more than {days} days in advance" |
| Invalid token | "Invalid confirmation token" |
| Expired token | "Confirmation token has expired. Please retry the operation." |

🟡 **MEDIUM:** Uses generic `Error` instead of custom error classes

#### CONCURRENCY

**Status:** ⚠️ PARTIAL

**In-Memory Cache Issue:**
```typescript
const pendingConfirmations = new Map<string, CriticalChangeConfirmation>();
```
- Not shared across service instances
- Race condition: User could hit different pod on confirmation
- Comment acknowledges: "in production, use Redis"

**Token Expiry:**
- Uses `setTimeout` for auto-cleanup
- Could accumulate if many confirmations generated

#### POTENTIAL ISSUES

🔴 **CRITICAL:**
1. **In-memory confirmation cache doesn't scale:**
   ```typescript
   // Current - in-memory
   const pendingConfirmations = new Map<string, ...>();
   
   // Needs Redis for multi-instance
   await redis.setex(`confirm:${token}`, 300, JSON.stringify(confirmation));
   ```

⚠️ **HIGH:**
1. **Uses generic `Error` instead of custom classes:**
   - Should use `ValidationError`, `ForbiddenError`, etc.
   - Makes error handling in controllers harder

2. **No tenant context in validation:**
   - Validation methods don't receive tenantId
   - Could validate wrong tenant's event if caller doesn't check

3. **Config is hardcoded in constructor:**
   - No way to override via environment
   - Should load from config

🟡 **MEDIUM:**
1. **Async methods that aren't async:**
   ```typescript
   async validateTicketPurchase(...): Promise<void> {
     // No await anywhere - doesn't need to be async
   }
   ```

2. **`console.warn` for admin override:**
   - Should use proper logger
   - Could leak to stdout in production

3. **Token generation uses `require('crypto')`:**
   - Should import at top of file
   - Minor performance hit per call

🟢 **LOW:**
- Good business logic coverage
- Clear separation of concerns
- Comprehensive warnings for users

---

## CROSS-SERVICE DEPENDENCIES

### Validation Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Controller/Service                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              EventSecurityValidator                          │
│                                                              │
│  validateEventModification()                                 │
│       │                                                      │
│       ├── Check locked status                                │
│       ├── Check sold ticket count                            │
│       ├── Check critical fields                              │
│       ├── Check admin override                               │
│       └── validateEventDate()                                │
│                                                              │
│  validateEventDeletion()                                     │
│       │                                                      │
│       ├── Check completed status                             │
│       ├── Check sold ticket count                            │
│       ├── Check admin override                               │
│       └── Check event started                                │
│                                                              │
│  generateCriticalChangeConfirmation()                        │
│       │                                                      │
│       └── Returns confirmation token + warnings              │
│                                                              │
│  validateConfirmationToken()                                 │
│       │                                                      │
│       └── Verifies token and expiry                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              In-Memory Confirmation Cache                    │
│              (Should be Redis in production)                 │
└─────────────────────────────────────────────────────────────┘
```

### Dependencies

| Used By | Method | Purpose |
|---------|--------|---------|
| EventService | `validateEventModification()` | Before update |
| EventService | `validateEventDeletion()` | Before delete |
| Controller | `generateCriticalChangeConfirmation()` | Two-step flow |
| Controller | `validateConfirmationToken()` | Confirm changes |

---

## INTEGRATION TEST FILE MAPPING

### Test Coverage Recommendations

| Validation | Test File (Proposed) | Priority | Key Scenarios |
|------------|---------------------|----------|---------------|
| Modification rules | `event-modification-security.integration.test.ts` | 🔴 CRITICAL | Critical fields after sales, admin override, timing |
| Deletion rules | `event-deletion-security.integration.test.ts` | 🔴 CRITICAL | Tickets sold, completed event, started event |
| Confirmation flow | `critical-change-confirmation.integration.test.ts` | ⚠️ HIGH | Token generation, validation, expiry |
| Purchase limits | `purchase-limits.unit.test.ts` | 🟡 MEDIUM | Per-order, per-customer limits |
| Date validation | `event-date-validation.unit.test.ts` | 🟡 MEDIUM | Min/max advance times |
| Refund window | `refund-window-calculation.unit.test.ts` | 🟡 MEDIUM | Trigger conditions, duration |

### Test Scenarios by Priority

#### 🔴 CRITICAL - Modification Security

**validateEventModification():**
- [ ] Allows modification of non-critical fields after sales
- [ ] Blocks modification of `venue_id` after sales
- [ ] Blocks modification of `starts_at` after sales
- [ ] Blocks modification of `total_capacity` after sales
- [ ] Blocks modification of `timezone` after sales
- [ ] Blocks modification when status is COMPLETED
- [ ] Blocks modification when status is CANCELLED
- [ ] Admin with `forceAdminOverride` can modify critical fields
- [ ] Admin without `forceAdminOverride` cannot modify critical fields
- [ ] Allows all modifications when no tickets sold

**validateModificationTiming():**
- [ ] Blocks critical changes within 72 hours of event
- [ ] Allows critical changes more than 72 hours before event
- [ ] Allows non-critical changes within 72 hours

#### 🔴 CRITICAL - Deletion Security

**validateEventDeletion():**
- [ ] Allows deletion when no tickets sold
- [ ] Blocks deletion when tickets sold
- [ ] Blocks deletion of completed event (even admin)
- [ ] Admin with `forceAdminOverride` can delete with tickets sold
- [ ] Blocks deletion of event that has started

#### ⚠️ HIGH - Confirmation Flow

**generateCriticalChangeConfirmation():**
- [ ] Returns null when no tickets sold
- [ ] Returns null when no critical fields changing
- [ ] Generates token for venue change
- [ ] Generates token for date change
- [ ] Includes affected ticket count
- [ ] Sets 5-minute expiry
- [ ] Includes appropriate warnings

**validateConfirmationToken():**
- [ ] Accepts valid token before expiry
- [ ] Rejects invalid token
- [ ] Rejects expired token (after 5 minutes)

**Cache Functions:**
- [ ] `storePendingConfirmation()` stores with auto-cleanup
- [ ] `getPendingConfirmation()` retrieves stored confirmation
- [ ] `removePendingConfirmation()` deletes confirmation

#### 🟡 MEDIUM - Business Rules

**validateTicketPurchase():**
- [ ] Allows purchase within per-order limit (10)
- [ ] Blocks purchase exceeding per-order limit
- [ ] Allows purchase within per-customer limit (50)
- [ ] Blocks purchase exceeding per-customer limit

**validateEventDate():**
- [ ] Rejects event less than 2 hours in future
- [ ] Rejects event more than 365 days in future
- [ ] Accepts event within valid range

**validateVenueCapacity():**
- [ ] Accepts capacity <= venue capacity
- [ ] Rejects capacity > venue capacity

**validateStatusTransition():**
- [ ] Blocks DRAFT transition after sales
- [ ] Blocks publishing cancelled event
- [ ] Blocks cancelling completed event

**calculateRefundWindow():**
- [ ] Returns null when no tickets sold
- [ ] Triggers on date change > 1 hour
- [ ] Triggers on venue change
- [ ] Does not trigger on small date change (< 1 hour)
- [ ] Sets 48-hour window duration

---

## REMAINING CONCERNS

### 🔴 CRITICAL Priority

1. **In-Memory Confirmation Cache Must Be Redis:**
   ```typescript
   // Replace Map with Redis
   export async function storePendingConfirmation(
     redis: Redis,
     confirmation: CriticalChangeConfirmation
   ): Promise<void> {
     await redis.setex(
       `event:confirm:${confirmation.confirmationToken}`,
       300, // 5 minutes
       JSON.stringify(confirmation)
     );
   }
   ```

### ⚠️ HIGH Priority

2. **Use Custom Error Classes:**
   ```typescript
   // Instead of
   throw new Error('Cannot modify...');
   
   // Use
   throw new ForbiddenError('Cannot modify...');
   throw new ValidationError([{ field: 'venue_id', message: '...' }]);
   ```

3. **Add Tenant Context to Validation:**
   ```typescript
   async validateEventModification(
     eventId: string,
     tenantId: string,  // ADD
     data: Record<string, any>,
     options?: EventValidationOptions
   ): Promise<void>
   ```

4. **Load Config from Environment:**
   ```typescript
   constructor() {
     this.config = {
       maxAdvanceDays: parseInt(process.env.EVENT_MAX_ADVANCE_DAYS || '365'),
       minAdvanceHours: parseInt(process.env.EVENT_MIN_ADVANCE_HOURS || '2'),
       // etc.
     };
   }
   ```

### 🟡 MEDIUM Priority

5. **Replace `console.warn` with Logger:**
   ```typescript
   import { logger } from '../utils/logger';
   logger.warn({ eventId, soldTicketCount }, 'ADMIN OVERRIDE: Modifying critical fields');
   ```

6. **Move `require('crypto')` to Top:**
   ```typescript
   import crypto from 'crypto';
   
   function generateConfirmationToken(): string {
     return crypto.randomBytes(32).toString('hex');
   }
   ```

7. **Remove Unnecessary `async`:**
   - `validateTicketPurchase()` doesn't await anything
   - `validateEventDate()` doesn't await anything
   - Can be sync methods

---

## TESTING CHECKLIST

### Must Test (P0)
- [ ] Critical field modification blocked after sales
- [ ] Deletion blocked after sales
- [ ] Admin override works with flag
- [ ] Completed event cannot be modified/deleted
- [ ] Confirmation token flow (generate → validate)
- [ ] Token expiry after 5 minutes

### Should Test (P1)
- [ ] Timing validation (72-hour rule)
- [ ] Refund window calculation
- [ ] Purchase limits enforcement
- [ ] Date range validation
- [ ] Status transition rules

### Nice to Test (P2)
- [ ] Warning message content
- [ ] Cache auto-cleanup
- [ ] Config defaults

---

## NOTES FOR IMPLEMENTATION

1. **Redis Migration for Confirmations:**
   ```typescript
   // Inject Redis dependency
   class EventSecurityValidator {
     constructor(private redis?: Redis) {}
     
     async storePendingConfirmation(confirmation: CriticalChangeConfirmation): Promise<void> {
       if (this.redis) {
         await this.redis.setex(
           `event:confirm:${confirmation.confirmationToken}`,
           300,
           JSON.stringify(confirmation)
         );
       } else {
         // Fallback to in-memory for tests
         pendingConfirmations.set(confirmation.confirmationToken, confirmation);
       }
     }
   }
   ```

2. **Integration Test Setup:**
   ```typescript
   describe('Event Modification Security', () => {
     let validator: EventSecurityValidator;
     let testEvent: IEvent;
     
     beforeEach(async () => {
       validator = new EventSecurityValidator();
       testEvent = await createTestEvent({ status: 'PUBLISHED' });
     });
     
     it('blocks venue change after tickets sold', async () => {
       await expect(
         validator.validateEventModification(
           testEvent.id,
           { venue_id: 'new-venue-id' },
           { event: testEvent, soldTicketCount: 5, isAdmin: false }
         )
       ).rejects.toThrow('Cannot modify venue_id after tickets have been sold');
     });
   });
   ```

3. **Test Confirmation Token Expiry:**
   ```typescript
   it('rejects expired confirmation token', async () => {
     const confirmation = validator.generateCriticalChangeConfirmation(
       'event-id',
       { venue_id: 'new-venue' },
       10
     );
     
     // Fast-forward time past expiry
     jest.advanceTimersByTime(6 * 60 * 1000); // 6 minutes
     
     expect(() => {
       validator.validateConfirmationToken(confirmation!, confirmation!.confirmationToken);
     }).toThrow('Confirmation token has expired');
   });
   ```

---

**End of Analysis**