# EVENT EDIT/UPDATE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Event Edit/Update |

---

## Executive Summary

**WELL IMPLEMENTED - Comprehensive event update with proper validations**

| Component | Status |
|-----------|--------|
| Update event endpoint | ✅ Complete |
| Authentication | ✅ Complete |
| Tenant isolation | ✅ Complete |
| Ownership validation | ✅ Complete (with admin bypass) |
| Venue access validation | ✅ Complete |
| State machine validation | ✅ Complete |
| Optimistic locking | ✅ Complete |
| Sold ticket protection | ✅ Complete |
| Audit logging | ✅ Complete |
| Cache invalidation | ✅ Complete |
| Search sync | ✅ Complete |
| API Gateway routing | ✅ Complete |
| Input validation | ✅ Comprehensive schemas |

**Bottom Line:** This is one of the most complete flows in the platform. Proper security, state machine for status transitions, optimistic locking for concurrency, protection against modifying events with sold tickets, and full audit trail.

---

## Architecture Overview

### Event Update Flow
```
┌─────────────────────────────────────────────────────────────┐
│                  EVENT UPDATE FLOW                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   PUT /api/v1/events/:id                                    │
│                         │                                    │
│                         ▼                                    │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              VALIDATION PIPELINE                     │   │
│   ├─────────────────────────────────────────────────────┤   │
│   │  1. Authenticate user (JWT)                         │   │
│   │  2. Set tenant context                              │   │
│   │  3. Validate input schema (additionalProperties:    │   │
│   │     false to prevent prototype pollution)           │   │
│   │  4. Find event (404 if not found)                   │   │
│   │  5. Check ownership (creator or admin)              │   │
│   │  6. Validate venue access                           │   │
│   │  7. Get sold ticket count                           │   │
│   │  8. Validate modifications (based on sold tickets)  │   │
│   │  9. Validate state transition (if status change)    │   │
│   │  10. Check optimistic lock version                  │   │
│   └─────────────────────────────────────────────────────┘   │
│                         │                                    │
│                         ▼                                    │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              UPDATE TRANSACTION                      │   │
│   ├─────────────────────────────────────────────────────┤   │
│   │  1. Update event with version increment             │   │
│   │  2. Log audit entry                                 │   │
│   │  3. Clear Redis cache                               │   │
│   │  4. Publish search sync event                       │   │
│   │  5. Return updated event                            │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## What Works ✅

### 1. Update Event Endpoint

**Route:** `PUT /api/v1/events/:id`

**File:** `backend/services/event-service/src/routes/events.routes.ts`
```typescript
app.put('/events/:id', {
  preHandler: [authenticateFastify, tenantHook],
  schema: {
    params: {
      type: 'object',
      required: ['id'],
      additionalProperties: false,
      properties: {
        id: { type: 'string', pattern: uuidPattern }
      }
    },
    body: {
      type: 'object',
      additionalProperties: false,  // Prevents prototype pollution
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 300 },
        description: { type: 'string', maxLength: 10000 },
        short_description: { type: 'string', maxLength: 500 },
        venue_id: { type: 'string', pattern: uuidPattern },
        status: { type: 'string', enum: eventStatuses },
        visibility: { type: 'string', enum: visibilityTypes },
        is_featured: { type: 'boolean' },
        // ... many more validated fields
      }
    }
  }
}, eventsController.updateEvent as any);
```

### 2. Ownership & Permission Validation

**File:** `backend/services/event-service/src/services/event.service.ts`
```typescript
async updateEvent(eventId, data, authToken, userId, tenantId, requestInfo, user) {
  const event = await this.db('events')
    .where({ id: eventId, tenant_id: tenantId })
    .whereNull('deleted_at')
    .first();

  if (!event) {
    throw new NotFoundError('Event');
  }

  // CRITICAL FIX: Admin bypass for ownership check
  const userIsAdmin = isAdmin(user);
  if (event.created_by !== userId && !userIsAdmin) {
    throw new ForbiddenError('You do not have permission to update this event');
  }

  // Also validate venue access
  const hasAccess = await this.venueServiceClient.validateVenueAccess(event.venue_id, authToken);
  if (!hasAccess) {
    throw new ValidationError([{ field: 'venue_id', message: 'No access to this venue' }]);
  }
  // ...
}
```

### 3. Sold Ticket Protection

**File:** `backend/services/event-service/src/services/event.service.ts`
```typescript
// Get sold ticket count for validation
const soldTicketCount = await this.getSoldTicketCount(eventId, tenantId);

const validationOptions: EventValidationOptions = {
  event: {
    id: eventId,
    status: event.status,
    starts_at: schedule?.starts_at
  },
  soldTicketCount,
  isAdmin: userIsAdmin,
  forceAdminOverride: data.forceAdminOverride === true && userIsAdmin
};

await this.securityValidator.validateEventModification(eventId, data, validationOptions);
```

**getSoldTicketCount Implementation:**
```typescript
private async getSoldTicketCount(eventId: string, tenantId: string): Promise<number> {
  // Get sold count from event_capacity table
  const capacities = await this.db('event_capacity')
    .where({ event_id: eventId, tenant_id: tenantId })
    .select('sold_count');

  const totalSold = capacities.reduce((sum, c) => sum + (c.sold_count || 0), 0);

  // Also check tickets table for accuracy
  const ticketCount = await this.db('tickets')
    .where({ event_id: eventId, tenant_id: tenantId })
    .whereIn('status', ['SOLD', 'USED', 'TRANSFERRED'])
    .count('* as count')
    .first();

  // Return the higher of the two counts to be safe
  return Math.max(totalSold, parseInt(ticketCount?.count) || 0);
}
```

### 4. State Machine Validation

**File:** `backend/services/event-service/src/services/event.service.ts`
```typescript
if (data.status && data.status !== event.status) {
  await this.validateStateTransition(event.status, data.status, eventId, tenantId);
}

private async validateStateTransition(
  currentStatus: string,
  targetStatus: string,
  eventId: string,
  tenantId: string
): Promise<void> {
  const transitionMap: Record<string, Record<string, string>> = {
    'DRAFT': {
      'REVIEW': 'SUBMIT_FOR_REVIEW',
      'PUBLISHED': 'PUBLISH',
    },
    'REVIEW': {
      'APPROVED': 'APPROVE',
      'DRAFT': 'REJECT',
    },
    'APPROVED': {
      'PUBLISHED': 'PUBLISH',
    },
    'PUBLISHED': {
      'ON_SALE': 'START_SALES',
      'CANCELLED': 'CANCEL',
      'POSTPONED': 'POSTPONE',
    },
    // ... more transitions
  };

  const allowedTransitions = transitionMap[currentStatus];
  if (!allowedTransitions) {
    throw new EventStateError(
      `Cannot transition from '${currentStatus}' - status is terminal or unknown`,
      currentStatus,
      targetStatus
    );
  }

  const transition = allowedTransitions[targetStatus];
  if (!transition) {
    throw new EventStateError(
      `Invalid status transition from '${currentStatus}' to '${targetStatus}'.`,
      currentStatus,
      targetStatus
    );
  }
}
```

**Valid State Transitions:**
```
DRAFT → REVIEW, PUBLISHED
REVIEW → APPROVED, DRAFT
APPROVED → PUBLISHED
PUBLISHED → ON_SALE, CANCELLED, POSTPONED
ON_SALE → SOLD_OUT, SALES_PAUSED, IN_PROGRESS, CANCELLED, POSTPONED
SALES_PAUSED → ON_SALE, CANCELLED
SOLD_OUT → IN_PROGRESS, CANCELLED
IN_PROGRESS → COMPLETED, CANCELLED
POSTPONED → PUBLISHED, CANCELLED
COMPLETED → (terminal)
CANCELLED → (terminal)
```

### 5. Optimistic Locking

**File:** `backend/services/event-service/src/services/event.service.ts`
```typescript
const expectedVersion = data.version ?? data.expectedVersion;

const result = await this.db.transaction(async (trx) => {
  const updateData = {
    ...data,
    updated_by: userId,
    updated_at: new Date()
  };

  // Increment version for optimistic locking
  updateData.version = trx.raw('COALESCE(version, 0) + 1');

  let updateQuery = trx('events')
    .where({ id: eventId, tenant_id: tenantId });

  // If client provided expected version, check it
  if (expectedVersion !== undefined && expectedVersion !== null) {
    updateQuery = updateQuery.where('version', expectedVersion);
  }

  const updatedRows = await updateQuery
    .update(updateData)
    .returning('*');

  // Check if update succeeded (version matched)
  if (updatedRows.length === 0) {
    throw new ConflictError(
      `Event ${eventId} was modified by another process. ` +
      `Expected version ${expectedVersion}, but current version has changed. ` +
      `Please refresh and try again.`
    );
  }

  return updatedRows[0];
});
```

### 6. Audit Logging
```typescript
await this.auditLogger.logEventUpdate(userId, eventId, data, {
  previousData: event,
  ...requestInfo
});
```

### 7. Cache Invalidation
```typescript
if (this.redis) {
  try {
    await this.redis.del(`venue:events:${event.venue_id}`);
    await this.redis.del(`event:${eventId}`);
  } catch (err) {
    logger.error({ error: err }, 'Redis cache clear failed for event update');
  }
}
```

### 8. Search Sync
```typescript
await publishSearchSync('event.updated', {
  id: eventId,
  changes: {
    name: data.name,
    description: data.short_description || data.description,
    status: data.status,
    tags: data.tags,
    isFeatured: data.is_featured,
  }
});
```

### 9. API Gateway Routing

**File:** `backend/services/api-gateway/src/routes/events.routes.ts`
```typescript
export default async function eventsRoutes(server: FastifyInstance) {
  const setupProxy = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.event}/api/v1/events`,
    serviceName: 'event-service',
    publicPaths: ['/health', '/metrics'],
    timeout: 5000
  });
  await setupProxy(server);
}
```

**Registered in:** `backend/services/api-gateway/src/routes/index.ts`
```typescript
await server.register(eventsRoutes, { prefix: '/events' });
```

---

## API Endpoints

| Endpoint | Method | Auth | Purpose | Status |
|----------|--------|------|---------|--------|
| `/api/v1/events` | GET | ✅ | List events | ✅ Working |
| `/api/v1/events/:id` | GET | ✅ | Get single event | ✅ Working |
| `/api/v1/events` | POST | ✅ | Create event | ✅ Working |
| `/api/v1/events/:id` | PUT | ✅ | Update event | ✅ Working |
| `/api/v1/events/:id` | DELETE | ✅ | Delete event | ✅ Working |
| `/api/v1/events/:id/publish` | POST | ✅ | Publish event | ✅ Working |
| `/api/v1/venues/:venueId/events` | GET | ✅ | Get venue events | ✅ Working |

---

## Editable Fields

| Field | Max Length | Validation |
|-------|------------|------------|
| name | 300 | minLength: 1 |
| description | 10000 | - |
| short_description | 500 | - |
| venue_id | - | UUID pattern |
| status | - | Enum: eventStatuses |
| visibility | - | Enum: visibilityTypes |
| is_featured | - | Boolean |
| priority_score | - | 0-1000 |
| banner_image_url | 2000 | URI format |
| thumbnail_image_url | 2000 | URI format |
| tags | - | Array, max 20 items, 50 chars each |
| primary_category_id | - | UUID pattern |
| age_restriction | - | 0-100 |
| dress_code | 100 | - |
| cancellation_policy | 5000 | - |
| refund_policy | 5000 | - |
| meta_title | 70 | SEO |
| meta_description | 160 | SEO |
| metadata | - | Object, max 50 properties |

---

## Security Features

| Feature | Status | Details |
|---------|--------|---------|
| Authentication required | ✅ | JWT via authenticateFastify |
| Tenant isolation | ✅ | tenantHook middleware |
| Ownership check | ✅ | created_by or admin |
| Venue access check | ✅ | Via venue-service client |
| Input validation | ✅ | JSON Schema with additionalProperties: false |
| Prototype pollution prevention | ✅ | additionalProperties: false |
| State machine | ✅ | Only valid transitions allowed |
| Optimistic locking | ✅ | Version field prevents concurrent overwrites |
| Sold ticket protection | ✅ | Validates changes against sold count |
| Admin override | ✅ | forceAdminOverride flag |

---

## Files Involved

| File | Purpose |
|------|---------|
| `event-service/src/routes/events.routes.ts` | Route definitions with schemas |
| `event-service/src/controllers/events.controller.ts` | Controller logic |
| `event-service/src/services/event.service.ts` | Business logic |
| `event-service/src/services/venue-service.client.ts` | Venue access validation |
| `event-service/src/validations/event-security.ts` | Security validator |
| `event-service/src/services/event-state-machine.ts` | State transitions |
| `event-service/src/utils/audit-logger.ts` | Audit logging |
| `api-gateway/src/routes/events.routes.ts` | Gateway proxy |

---

## Minor Improvements (P3)

| Issue | Suggestion | Effort |
|-------|------------|--------|
| No partial update (PATCH) | Add PATCH endpoint for single-field updates | 0.5 day |
| Version not in response | Return current version in response for client tracking | 0.25 day |
| No event history/changelog | Add endpoint to view event change history | 1 day |

---

## Related Documents

- `EVENT_CREATION_FLOW_AUDIT.md` - Event creation
- `EVENT_CANCELLATION_FLOW_AUDIT.md` - Event cancellation
- `VENUE_FEATURES_FLOW_AUDIT.md` - Venue management
