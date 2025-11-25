# VENUE SERVICE - TEST SPECIFICATIONS

**Version:** 1.0  
**Last Updated:** October 22, 2025  
**Service:** venue-service

---

## 📖 OVERVIEW

This document provides detailed test specifications for every function in the venue service. Each function has multiple test cases covering:
- ✅ Happy path (expected behavior)
- ❌ Error cases (validation, authorization, edge cases)
- 🔒 Security (tenant isolation, access control)
- 📊 Performance (caching, rate limiting)

---

## TABLE OF CONTENTS

1. [Controllers](#controllers)
2. [Services](#services)
3. [Middleware](#middleware)
4. [Models](#models)
5. [Utils](#utils)

---

## CONTROLLERS

### venues.controller.ts

---

#### Function: `addTenantContext(request, reply)`

**Purpose:** Middleware to add tenant context to request  
**Priority:** P2  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('addTenantContext', () => {
  test('TC-VC-001: should add tenantId from authenticated user', () => {
    // Given: Request with authenticated user
    // When: addTenantContext is called
    // Then: tenantId is set on request
  });

  test('TC-VC-002: should default to system tenant if no user', () => {
    // Given: Request without authenticated user
    // When: addTenantContext is called
    // Then: tenantId defaults to 00000000-0000-0000-0000-000000000001
  });

  test('TC-VC-003: should not override existing tenantId', () => {
    // Given: Request with tenantId already set
    // When: addTenantContext is called
    // Then: Existing tenantId is preserved
  });
});
```

---

#### Function: `verifyVenueOwnership(request, reply, venueService)`

**Purpose:** Verify user has access to venue  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('verifyVenueOwnership', () => {
  test('TC-VV-001: should allow owner to access venue', async () => {
    // Given: User owns venue
    // When: verifyVenueOwnership is called
    // Then: Access is granted
  });

  test('TC-VV-002: should allow staff member to access venue', async () => {
    // Given: User is staff member of venue
    // When: verifyVenueOwnership is called
    // Then: Access is granted
  });

  test('TC-VV-003: should throw ForbiddenError for non-owner', async () => {
    // Given: User does not own venue
    // When: verifyVenueOwnership is called
    // Then: ForbiddenError is thrown
  });

  test('TC-VV-004: should handle non-existent venue', async () => {
    // Given: VenueId does not exist
    // When: verifyVenueOwnership is called
    // Then: NotFoundError is thrown
  });

  test('TC-VV-005: should enforce tenant isolation', async () => {
    // Given: Venue exists but in different tenant
    // When: verifyVenueOwnership is called
    // Then: ForbiddenError is thrown
  });
});
```

---

#### Route: `GET / (list venues)`

**Purpose:** List venues with filtering  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('GET /', () => {
  test('TC-LV-001: should list public venues when not authenticated', async () => {
    // Given: No authentication
    // When: GET / is called
    // Then: Returns public venues only
  });

  test('TC-LV-002: should list user venues when my_venues=true', async () => {
    // Given: Authenticated user with my_venues=true
    // When: GET / is called
    // Then: Returns only user's venues
  });

  test('TC-LV-003: should apply pagination (limit, offset)', async () => {
    // Given: limit=10, offset=5
    // When: GET / is called
    // Then: Returns 10 venues starting from offset 5
  });

  test('TC-LV-004: should filter by venue type', async () => {
    // Given: Query param type=theater
    // When: GET / is called
    // Then: Returns only theater venues
  });

  test('TC-LV-005: should filter by capacity range', async () => {
    // Given: Query params min_capacity=100, max_capacity=500
    // When: GET / is called
    // Then: Returns venues within capacity range
  });

  test('TC-LV-006: should search by name', async () => {
    // Given: Query param search="Madison"
    // When: GET / is called
    // Then: Returns venues matching search term
  });

  test('TC-LV-007: should return empty array when no matches', async () => {
    // Given: Search criteria matches no venues
    // When: GET / is called
    // Then: Returns { venues: [], total: 0 }
  });

  test('TC-LV-008: should enforce tenant isolation', async () => {
    // Given: Authenticated user
    // When: GET / is called
    // Then: Only returns venues from user's tenant
  });
});
```

---

#### Route: `POST / (create venue)`

**Purpose:** Create new venue  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('POST /', () => {
  test('TC-CV-001: should create venue with valid data', async () => {
    // Given: Valid venue data (name, type, capacity, address)
    // When: POST / is called
    // Then: Returns 201 with created venue
  });

  test('TC-CV-002: should set authenticated user as owner', async () => {
    // Given: Authenticated user creates venue
    // When: POST / is called
    // Then: Venue owner_id is set to user ID
  });

  test('TC-CV-003: should require authentication', async () => {
    // Given: No authentication token
    // When: POST / is called
    // Then: Returns 401 Unauthorized
  });

  test('TC-CV-004: should validate required fields', async () => {
    // Given: Missing required field (e.g., name)
    // When: POST / is called
    // Then: Returns 422 Validation Error
  });

  test('TC-CV-005: should validate capacity is positive', async () => {
    // Given: Capacity = -100
    // When: POST / is called
    // Then: Returns 422 Validation Error
  });

  test('TC-CV-006: should validate venue type is valid', async () => {
    // Given: Invalid venue type
    // When: POST / is called
    // Then: Returns 422 Validation Error
  });

  test('TC-CV-007: should set tenant_id from user', async () => {
    // Given: Authenticated user with tenant
    // When: POST / is called
    // Then: Venue tenant_id matches user's tenant
  });

  test('TC-CV-008: should generate unique ID', async () => {
    // Given: Multiple venue creation requests
    // When: POST / is called multiple times
    // Then: Each venue has unique ID
  });

  test('TC-CV-009: should cache created venue', async () => {
    // Given: Venue is created successfully
    // When: POST / is called
    // Then: Venue is cached in Redis
  });

  test('TC-CV-010: should handle database errors gracefully', async () => {
    // Given: Database is down
    // When: POST / is called
    // Then: Returns 500 with error message
  });
});
```

---

#### Route: `GET /user (list user's venues)`

**Purpose:** Get venues owned by authenticated user  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('GET /user', () => {
  test('TC-UV-001: should list all venues owned by user', async () => {
    // Given: User owns 3 venues
    // When: GET /user is called
    // Then: Returns all 3 venues
  });

  test('TC-UV-002: should include venues where user is staff', async () => {
    // Given: User is staff at 2 additional venues
    // When: GET /user is called
    // Then: Returns owned + staff venues
  });

  test('TC-UV-003: should require authentication', async () => {
    // Given: No authentication token
    // When: GET /user is called
    // Then: Returns 401 Unauthorized
  });

  test('TC-UV-004: should return empty array if user has no venues', async () => {
    // Given: User has no associated venues
    // When: GET /user is called
    // Then: Returns { venues: [], total: 0 }
  });

  test('TC-UV-005: should enforce tenant isolation', async () => {
    // Given: User has venues in different tenants
    // When: GET /user is called
    // Then: Returns only venues from current tenant
  });
});
```

---

#### Route: `GET /:venueId (get venue by ID)`

**Purpose:** Retrieve single venue details  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('GET /:venueId', () => {
  test('TC-GV-001: should return venue when user has access', async () => {
    // Given: User owns venue
    // When: GET /:venueId is called
    // Then: Returns full venue details
  });

  test('TC-GV-002: should require authentication', async () => {
    // Given: No authentication token
    // When: GET /:venueId is called
    // Then: Returns 401 Unauthorized
  });

  test('TC-GV-003: should return 403 when user lacks access', async () => {
    // Given: User does not own venue
    // When: GET /:venueId is called
    // Then: Returns 403 Forbidden
  });

  test('TC-GV-004: should return 404 for non-existent venue', async () => {
    // Given: VenueId does not exist
    // When: GET /:venueId is called
    // Then: Returns 404 Not Found
  });

  test('TC-GV-005: should use cache when available', async () => {
    // Given: Venue is cached in Redis
    // When: GET /:venueId is called
    // Then: Returns cached venue without DB query
  });

  test('TC-GV-006: should cache venue on first fetch', async () => {
    // Given: Venue not in cache
    // When: GET /:venueId is called
    // Then: Venue is fetched from DB and cached
  });

  test('TC-GV-007: should enforce tenant isolation', async () => {
    // Given: Venue exists but in different tenant
    // When: GET /:venueId is called
    // Then: Returns 403 Forbidden
  });
});
```

---

#### Route: `GET /:venueId/capacity (get venue capacity)`

**Purpose:** Get venue capacity information  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('GET /:venueId/capacity', () => {
  test('TC-CP-001: should return capacity info', async () => {
    // Given: Venue with capacity data
    // When: GET /:venueId/capacity is called
    // Then: Returns { total, available, reserved, utilized }
  });

  test('TC-CP-002: should calculate available capacity', async () => {
    // Given: Venue with active events
    // When: GET /:venueId/capacity is called
    // Then: Available = total - reserved - sold
  });

  test('TC-CP-003: should require venue access', async () => {
    // Given: User does not own venue
    // When: GET /:venueId/capacity is called
    // Then: Returns 403 Forbidden
  });

  test('TC-CP-004: should return 0 available if overbooked', async () => {
    // Given: Reserved + sold > total capacity
    // When: GET /:venueId/capacity is called
    // Then: Available = 0
  });

  test('TC-CP-005: should filter by date range', async () => {
    // Given: Date range in query params
    // When: GET /:venueId/capacity is called
    // Then: Returns capacity for that date range
  });

  test('TC-CP-006: should handle venues with no events', async () => {
    // Given: Venue has no events
    // When: GET /:venueId/capacity is called
    // Then: Available = total capacity
  });
});
```

---

#### Route: `GET /:venueId/stats (get venue statistics)`

**Purpose:** Get venue performance statistics  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('GET /:venueId/stats', () => {
  test('TC-ST-001: should return venue statistics', async () => {
    // Given: Venue with event history
    // When: GET /:venueId/stats is called
    // Then: Returns { total_events, total_revenue, avg_capacity_used }
  });

  test('TC-ST-002: should require venue access', async () => {
    // Given: User does not own venue
    // When: GET /:venueId/stats is called
    // Then: Returns 403 Forbidden
  });

  test('TC-ST-003: should filter by date range', async () => {
    // Given: Date range in query params
    // When: GET /:venueId/stats is called
    // Then: Returns stats for that period only
  });

  test('TC-ST-004: should return zeros for venue with no events', async () => {
    // Given: Venue has no events
    // When: GET /:venueId/stats is called
    // Then: All stats are 0
  });

  test('TC-ST-005: should calculate average capacity utilization', async () => {
    // Given: Venue with multiple events
    // When: GET /:venueId/stats is called
    // Then: Returns accurate avg_capacity_used percentage
  });

  test('TC-ST-006: should cache stats result', async () => {
    // Given: Stats calculated for venue
    // When: GET /:venueId/stats is called
    // Then: Result is cached for 5 minutes
  });
});
```

---

#### Route: `PATCH /:venueId (update venue)`

**Purpose:** Update venue details  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('PATCH /:venueId', () => {
  test('TC-UP-001: should update venue with valid data', async () => {
    // Given: Valid update data
    // When: PATCH /:venueId is called
    // Then: Venue is updated and returned
  });

  test('TC-UP-002: should require venue ownership', async () => {
    // Given: User does not own venue
    // When: PATCH /:venueId is called
    // Then: Returns 403 Forbidden
  });

  test('TC-UP-003: should allow partial updates', async () => {
    // Given: Only name field in update
    // When: PATCH /:venueId is called
    // Then: Only name is updated, other fields unchanged
  });

  test('TC-UP-004: should validate updated fields', async () => {
    // Given: Invalid capacity (negative)
    // When: PATCH /:venueId is called
    // Then: Returns 422 Validation Error
  });

  test('TC-UP-005: should invalidate cache on update', async () => {
    // Given: Venue is cached
    // When: PATCH /:venueId is called
    // Then: Cache is cleared for that venue
  });

  test('TC-UP-006: should not allow changing tenant_id', async () => {
    // Given: Update includes tenant_id
    // When: PATCH /:venueId is called
    // Then: tenant_id change is ignored
  });

  test('TC-UP-007: should update updated_at timestamp', async () => {
    // Given: Venue update
    // When: PATCH /:venueId is called
    // Then: updated_at is set to current time
  });

  test('TC-UP-008: should audit log the update', async () => {
    // Given: Venue update
    // When: PATCH /:venueId is called
    // Then: Audit log entry is created
  });
});
```

---

#### Route: `DELETE /:venueId (delete venue)`

**Purpose:** Soft delete venue  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('DELETE /:venueId', () => {
  test('TC-DV-001: should soft delete venue', async () => {
    // Given: Valid venue owned by user
    // When: DELETE /:venueId is called
    // Then: Venue deleted_at is set
  });

  test('TC-DV-002: should require venue ownership', async () => {
    // Given: User does not own venue
    // When: DELETE /:venueId is called
    // Then: Returns 403 Forbidden
  });

  test('TC-DV-003: should invalidate cache on delete', async () => {
    // Given: Venue is cached
    // When: DELETE /:venueId is called
    // Then: Cache is cleared
  });

  test('TC-DV-004: should return success message', async () => {
    // Given: Venue deleted successfully
    // When: DELETE /:venueId is called
    // Then: Returns { message: 'Venue deleted successfully' }
  });

  test('TC-DV-005: should audit log the deletion', async () => {
    // Given: Venue deletion
    // When: DELETE /:venueId is called
    // Then: Audit log entry is created
  });

  test('TC-DV-006: should not hard delete venue', async () => {
    // Given: Venue deleted
    // When: DELETE /:venueId is called
    // Then: Venue still exists in DB with deleted_at set
  });
});
```

---

#### Route: `POST /:venueId/staff (add staff member)`

**Purpose:** Add staff member to venue  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('POST /:venueId/staff', () => {
  test('TC-AS-001: should add staff member with valid data', async () => {
    // Given: Valid staff data (user_id, role)
    // When: POST /:venueId/staff is called
    // Then: Staff member is added
  });

  test('TC-AS-002: should require venue ownership', async () => {
    // Given: User does not own venue
    // When: POST /:venueId/staff is called
    // Then: Returns 403 Forbidden
  });

  test('TC-AS-003: should validate staff role', async () => {
    // Given: Invalid role type
    // When: POST /:venueId/staff is called
    // Then: Returns 422 Validation Error
  });

  test('TC-AS-004: should check user exists', async () => {
    // Given: user_id does not exist
    // When: POST /:venueId/staff is called
    // Then: Returns 404 Not Found
  });

  test('TC-AS-005: should prevent duplicate staff assignments', async () => {
    // Given: User already staff at venue
    // When: POST /:venueId/staff is called
    // Then: Returns 409 Conflict
  });

  test('TC-AS-006: should set default permissions by role', async () => {
    // Given: Staff role = "manager"
    // When: POST /:venueId/staff is called
    // Then: Staff has manager permissions
  });

  test('TC-AS-007: should enforce tenant matching', async () => {
    // Given: User from different tenant
    // When: POST /:venueId/staff is called
    // Then: Returns 400 Bad Request
  });

  test('TC-AS-008: should audit log staff addition', async () => {
    // Given: Staff added successfully
    // When: POST /:venueId/staff is called
    // Then: Audit log entry is created
  });
});
```

---

#### Route: `GET /:venueId/staff (list staff)`

**Purpose:** List all staff members for venue  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('GET /:venueId/staff', () => {
  test('TC-LS-001: should list all staff members', async () => {
    // Given: Venue has 3 staff members
    // When: GET /:venueId/staff is called
    // Then: Returns all 3 staff members
  });

  test('TC-LS-002: should require venue ownership', async () => {
    // Given: User does not own venue
    // When: GET /:venueId/staff is called
    // Then: Returns 403 Forbidden
  });

  test('TC-LS-003: should include user details', async () => {
    // Given: Staff members exist
    // When: GET /:venueId/staff is called
    // Then: Returns staff with user info (name, email)
  });

  test('TC-LS-004: should filter by role', async () => {
    // Given: Query param role=manager
    // When: GET /:venueId/staff is called
    // Then: Returns only managers
  });

  test('TC-LS-005: should return empty array if no staff', async () => {
    // Given: Venue has no staff
    // When: GET /:venueId/staff is called
    // Then: Returns { staff: [] }
  });
});
```

---

#### Route: `DELETE /:venueId/staff/:staffId (remove staff)`

**Purpose:** Remove staff member from venue  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/venues.controller.test.ts`

**Test Cases:**

```typescript
describe('DELETE /:venueId/staff/:staffId', () => {
  test('TC-RS-001: should remove staff member', async () => {
    // Given: Valid staff member exists
    // When: DELETE /:venueId/staff/:staffId is called
    // Then: Staff member is removed
  });

  test('TC-RS-002: should require venue ownership', async () => {
    // Given: User does not own venue
    // When: DELETE is called
    // Then: Returns 403 Forbidden
  });

  test('TC-RS-003: should prevent owner removal', async () => {
    // Given: staffId is venue owner
    // When: DELETE is called
    // Then: Returns 400 Bad Request
  });

  test('TC-RS-004: should return 404 if staff not found', async () => {
    // Given: staffId does not exist
    // When: DELETE is called
    // Then: Returns 404 Not Found
  });

  test('TC-RS-005: should revoke all permissions', async () => {
    // Given: Staff member has permissions
    // When: DELETE is called
    // Then: All permissions are revoked
  });

  test('TC-RS-006: should audit log staff removal', async () => {
    // Given: Staff removed
    // When: DELETE is called
    // Then: Audit log entry created
  });
});
```

---

### settings.controller.ts

---

#### Route: `GET /:venueId/settings`

**Purpose:** Get all venue settings  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/settings.controller.test.ts`

**Test Cases:**

```typescript
describe('GET /:venueId/settings', () => {
  test('TC-GS-001: should return all settings', async () => {
    // Given: Venue has settings
    // When: GET /:venueId/settings
    // Then: Returns all key-value pairs
  });

  test('TC-GS-002: should require authentication', async () => {
    // Given: No auth token
    // When: GET called
    // Then: Returns 401
  });

  test('TC-GS-003: should return empty object if no settings', async () => {
    // Given: Venue has no settings
    // When: GET called
    // Then: Returns {}
  });

  test('TC-GS-004: should use cache when available', async () => {
    // Given: Settings cached
    // When: GET called
    // Then: Returns from cache
  });

  test('TC-GS-005: should enforce tenant isolation', async () => {
    // Given: Settings from different tenant
    // When: GET called
    // Then: Not visible
  });
});
```

---

#### Route: `PUT /:venueId/settings`

**Purpose:** Update venue settings  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/settings.controller.test.ts`

**Test Cases:**

```typescript
describe('PUT /:venueId/settings', () => {
  test('TC-US-001: should update settings', async () => {
    // Given: Valid settings object
    // When: PUT called
    // Then: Settings updated
  });

  test('TC-US-002: should validate settings schema', async () => {
    // Given: Invalid setting value
    // When: PUT called
    // Then: Returns 422
  });

  test('TC-US-003: should merge with existing settings', async () => {
    // Given: Existing settings
    // When: PUT with partial update
    // Then: Merges, doesn't replace
  });

  test('TC-US-004: should invalidate cache', async () => {
    // Given: Settings cached
    // When: PUT called
    // Then: Cache cleared
  });

  test('TC-US-005: should require ownership', async () => {
    // Given: User doesn't own venue
    // When: PUT called
    // Then: Returns 403
  });

  test('TC-US-006: should support nested settings', async () => {
    // Given: Setting with nested object
    // When: PUT called
    // Then: Nested values saved
  });

  test('TC-US-007: should validate data types', async () => {
    // Given: Boolean setting with string value
    // When: PUT called
    // Then: Returns 422
  });

  test('TC-US-008: should audit log changes', async () => {
    // Given: Settings updated
    // When: PUT called
    // Then: Audit logged
  });
});
```

---

#### Route: `DELETE /:venueId/settings/:key`

**Purpose:** Delete specific setting  
**Priority:** P1 Critical  
**Test File:** `unit/controllers/settings.controller.test.ts`

**Test Cases:**

```typescript
describe('DELETE /:venueId/settings/:key', () => {
  test('TC-DS-001: should delete setting key', async () => {
    // Given: Setting exists
    // When: DELETE called
    // Then: Key removed
  });

  test('TC-DS-002: should return 404 if key not found', async () => {
    // Given: Key doesn't exist
    // When: DELETE called
    // Then: Returns 404
  });

  test('TC-DS-003: should invalidate cache', async () => {
    // Given: Settings cached
    // When: DELETE called
    // Then: Cache cleared
  });

  test('TC-DS-004: should require ownership', async () => {
    // Given: User doesn't own venue
    // When: DELETE called
    // Then: Returns 403
  });

  test('TC-DS-005: should handle nested key deletion', async () => {
    // Given: Nested setting key
    // When: DELETE called with dot notation
    // Then: Nested key removed
  });

  test('TC-DS-006: should audit log deletion', async () => {
    // Given: Setting deleted
    // When: DELETE called
    // Then: Audit logged
  });
});
```

---

### integrations.controller.ts

---

#### Route: `GET /:venueId/integrations`

**Purpose:** List all integrations for venue  
**Priority:** P2 Important  
**Test File:** `unit/controllers/integrations.controller.test.ts`

**Test Cases:**

```typescript
describe('GET /:venueId/integrations', () => {
  test('TC-LI-001: should list all active integrations', async () => {
    // Given: Venue has 3 integrations
    // When: GET called
    // Then: Returns all 3
  });

  test('TC-LI-002: should filter inactive integrations', async () => {
    // Given: 2 active, 1 inactive
    // When: GET called
    // Then: Returns only active
  });

  test('TC-LI-003: should mask sensitive credentials', async () => {
    // Given: Integrations with API keys
    // When: GET called
    // Then: Keys partially masked
  });

  test('TC-LI-004: should require authentication', async () => {
    // Given: No auth
    // When: GET called
    // Then: Returns 401
  });

  test('TC-LI-005: should return empty array if none', async () => {
    // Given: No integrations
    // When: GET called
    // Then: Returns []
  });
});
```

---

#### Route: `POST /:venueId/integrations`

**Purpose:** Create new integration  
**Priority:** P2 Important  
**Test File:** `unit/controllers/integrations.controller.test.ts`

**Test Cases:**

```typescript
describe('POST /:venueId/integrations', () => {
  test('TC-CI-001: should create integration with valid data', async () => {
    // Given: Valid integration config
    // When: POST called
    // Then: Integration created
  });

  test('TC-CI-002: should validate provider type', async () => {
    // Given: Invalid provider
    // When: POST called
    // Then: Returns 422
  });

  test('TC-CI-003: should encrypt credentials', async () => {
    // Given: API key in request
    // When: POST called
    // Then: Key encrypted in DB
  });

  test('TC-CI-004: should prevent duplicate integrations', async () => {
    // Given: Same provider already exists
    // When: POST called
    // Then: Returns 409
  });

  test('TC-CI-005: should validate required config fields', async () => {
    // Given: Missing required config
    // When: POST called
    // Then: Returns 422
  });

  test('TC-CI-006: should support multiple providers', async () => {
    // Given: Different provider types
    // When: POST called for each
    // Then: All created successfully
  });

  test('TC-CI-007: should test connection on create', async () => {
    // Given: Valid credentials
    // When: POST called
    // Then: Connection tested before saving
  });

  test('TC-CI-008: should require ownership', async () => {
    // Given: User doesn't own venue
    // When: POST called
    // Then: Returns 403
  });

  test('TC-CI-009: should set default config values', async () => {
    // Given: Minimal config provided
    // When: POST called
    // Then: Defaults applied
  });

  test('TC-CI-010: should audit log creation', async () => {
    // Given: Integration created
    // When: POST called
    // Then: Audit logged
  });
});
```

---

#### Route: `GET /:venueId/integrations/:integrationId`

**Purpose:** Get integration details  
**Priority:** P2 Important  
**Test File:** `unit/controllers/integrations.controller.test.ts`

**Test Cases:**

```typescript
describe('GET /:venueId/integrations/:integrationId', () => {
  test('TC-GI-001: should return integration details', async () => {
    // Given: Integration exists
    // When: GET called
    // Then: Returns full details
  });

  test('TC-GI-002: should mask credentials', async () => {
    // Given: Integration with API key
    // When: GET called
    // Then: Key partially masked
  });

  test('TC-GI-003: should return 404 if not found', async () => {
    // Given: Invalid ID
    // When: GET called
    // Then: Returns 404
  });

  test('TC-GI-004: should require ownership', async () => {
    // Given: User doesn't own venue
    // When: GET called
    // Then: Returns 403
  });

  test('TC-GI-005: should include sync status', async () => {
    // Given: Integration has sync history
    // When: GET called
    // Then: Returns last_sync_at, sync_status
  });
});
```

---

#### Route: `PATCH /:venueId/integrations/:integrationId`

**Purpose:** Update integration  
**Priority:** P2 Important  
**Test File:** `unit/controllers/integrations.controller.test.ts`

**Test Cases:**

```typescript
describe('PATCH /:venueId/integrations/:integrationId', () => {
  test('TC-UI-001: should update integration config', async () => {
    // Given: Valid update data
    // When: PATCH called
    // Then: Config updated
  });

  test('TC-UI-002: should re-encrypt credentials if changed', async () => {
    // Given: New API key
    // When: PATCH called
    // Then: New key encrypted
  });

  test('TC-UI-003: should validate updated config', async () => {
    // Given: Invalid config value
    // When: PATCH called
    // Then: Returns 422
  });

  test('TC-UI-004: should test connection if credentials changed', async () => {
    // Given: New credentials
    // When: PATCH called
    // Then: Connection tested
  });

  test('TC-UI-005: should allow partial updates', async () => {
    // Given: Only updating one field
    // When: PATCH called
    // Then: Other fields unchanged
  });

  test('TC-UI-006: should require ownership', async () => {
    // Given: User doesn't own venue
    // When: PATCH called
    // Then: Returns 403
  });

  test('TC-UI-007: should audit log changes', async () => {
    // Given: Integration updated
    // When: PATCH called
    // Then: Audit logged
  });

  test('TC-UI-008: should not allow changing provider type', async () => {
    // Given: Update includes provider change
    // When: PATCH called
    // Then: Provider unchanged
  });
});
```

---

#### Route: `DELETE /:venueId/integrations/:integrationId`

**Purpose:** Delete integration  
**Priority:** P2 Important  
**Test File:** `unit/controllers/integrations.controller.test.ts`

**Test Cases:**

```typescript
describe('DELETE /:venueId/integrations/:integrationId', () => {
  test('TC-DI-001: should soft delete integration', async () => {
    // Given: Integration exists
    // When: DELETE called
    // Then: is_active set to false
  });

  test('TC-DI-002: should revoke external access', async () => {
    // Given: Integration with OAuth token
    // When: DELETE called
    // Then: Token revoked at provider
  });

  test('TC-DI-003: should return success message', async () => {
    // Given: Integration deleted
    // When: DELETE called
    // Then: Returns { message: 'Integration deleted' }
  });

  test('TC-DI-004: should require ownership', async () => {
    // Given: User doesn't own venue
    // When: DELETE called
    // Then: Returns 403
  });

  test('TC-DI-005: should return 404 if not found', async () => {
    // Given: Invalid ID
    // When: DELETE called
    // Then: Returns 404
  });

  test('TC-DI-006: should audit log deletion', async () => {
    // Given: Integration deleted
    // When: DELETE called
    // Then: Audit logged
  });
});
```

---

#### Route: `POST /:venueId/integrations/:integrationId/test`

**Purpose:** Test integration connection  
**Priority:** P2 Important  
**Test File:** `unit/controllers/integrations.controller.test.ts`

**Test Cases:**

```typescript
describe('POST /:venueId/integrations/:integrationId/test', () => {
  test('TC-TI-001: should test successful connection', async () => {
    // Given: Valid integration credentials
    // When: POST /test called
    // Then: Returns { success: true, message }
  });

  test('TC-TI-002: should handle connection failure', async () => {
    // Given: Invalid credentials
    // When: POST /test called
    // Then: Returns { success: false, error }
  });

  test('TC-TI-003: should timeout long connections', async () => {
    // Given: Provider not responding
    // When: POST /test called
    // Then: Returns timeout error after 10s
  });

  test('TC-TI-004: should validate API permissions', async () => {
    // Given: Valid key, insufficient permissions
    // When: POST /test called
    // Then: Returns permission error
  });

  test('TC-TI-005: should test all provider endpoints', async () => {
    // Given: Multiple endpoints to test
    // When: POST /test called
    // Then: Tests all and returns results
  });

  test('TC-TI-006: should not modify integration', async () => {
    // Given: Test connection fails
    // When: POST /test called
    // Then: Integration unchanged
  });

  test('TC-TI-007: should require ownership', async () => {
    // Given: User doesn't own venue
    // When: POST /test called
    // Then: Returns 403
  });

  test('TC-TI-008: should rate limit test requests', async () => {
    // Given: Multiple rapid test requests
    // When: POST /test called repeatedly
    // Then: Rate limited after 5 attempts
  });
});
```

---

#### Route: `POST /:venueId/integrations/:integrationId/sync`

**Purpose:** Trigger data sync  
**Priority:** P2 Important  
**Test File:** `unit/controllers/integrations.controller.test.ts`

**Test Cases:**

```typescript
describe('POST /:venueId/integrations/:integrationId/sync', () => {
  test('TC-SI-001: should initiate async sync', async () => {
    // Given: Valid integration
    // When: POST /sync called
    // Then: Returns { job_id, status: 'pending' }
  });

  test('TC-SI-002: should prevent concurrent syncs', async () => {
    // Given: Sync already in progress
    // When: POST /sync called again
    // Then: Returns 409 Conflict
  });

  test('TC-SI-003: should sync all data types', async () => {
    // Given: Integration with events, tickets
    // When: POST /sync called
    // Then: Syncs all supported data
  });

  test('TC-SI-004: should handle partial failures', async () => {
    // Given: Some records fail to sync
    // When: POST /sync called
    // Then: Continues, logs failures
  });

  test('TC-SI-005: should update last_sync_at', async () => {
    // Given: Sync completes
    // When: POST /sync called
    // Then: last_sync_at updated
  });

  test('TC-SI-006: should require ownership', async () => {
    // Given: User doesn't own venue
    // When: POST /sync called
    // Then: Returns 403
  });

  test('TC-SI-007: should validate integration is active', async () => {
    // Given: Integration is_active = false
    // When: POST /sync called
    // Then: Returns 400 Bad Request
  });
});
```

---

## SERVICES

### venue.service.ts

---

#### Function: `createVenue(data, userId, tenantId)`

**Purpose:** Create new venue in database  
**Priority:** P1 Critical  
**Test File:** `unit/services/venue.service.test.ts`

**Test Cases:**

```typescript
describe('createVenue', () => {
  test('TC-VS-CV-001: should create venue with all fields', async () => {
    // Given: Complete venue data
    // When: createVenue called
    // Then: Venue inserted with all fields
  });

  test('TC-VS-CV-002: should generate UUID for venue', async () => {
    // Given: No ID provided
    // When: createVenue called
    // Then: UUID generated
  });

  test('TC-VS-CV-003: should set owner_id to userId', async () => {
    // Given: userId provided
    // When: createVenue called
    // Then: owner_id = userId
  });

  test('TC-VS-CV-004: should set tenant_id', async () => {
    // Given: tenantId provided
    // When: createVenue called
    // Then: tenant_id set correctly
  });

  test('TC-VS-CV-005: should set created_at and updated_at', async () => {
    // Given: Venue creation
    // When: createVenue called
    // Then: Timestamps set to now
  });

  test('TC-VS-CV-006: should initialize default values', async () => {
    // Given: Optional fields not provided
    // When: createVenue called
    // Then: Defaults applied (is_active=true, etc)
  });

  test('TC-VS-CV-007: should handle database errors', async () => {
    // Given: DB connection fails
    // When: createVenue called
    // Then: Throws appropriate error
  });

  test('TC-VS-CV-008: should validate unique constraint violations', async () => {
    // Given: Duplicate venue name + tenant
    // When: createVenue called
    // Then: Throws ConflictError
  });

  test('TC-VS-CV-009: should return created venue', async () => {
    // Given: Venue created successfully
    // When: createVenue called
    // Then: Returns venue object with ID
  });

  test('TC-VS-CV-010: should publish venue.created event', async () => {
    // Given: Venue created
    // When: createVenue called
    // Then: Event published to message bus
  });

  test('TC-VS-CV-011: should cache created venue', async () => {
    // Given: Venue created
    // When: createVenue called
    // Then: Venue cached in Redis
  });

  test('TC-VS-CV-012: should rollback on event publish failure', async () => {
    // Given: Event publish fails
    // When: createVenue called
    // Then: DB insert rolled back
  });
});
```

---

#### Function: `getVenue(venueId, tenantId)`

**Purpose:** Retrieve venue by ID  
**Priority:** P1 Critical  
**Test File:** `unit/services/venue.service.test.ts`

**Test Cases:**

```typescript
describe('getVenue', () => {
  test('TC-VS-GV-001: should return venue from cache if available', async () => {
    // Given: Venue cached in Redis
    // When: getVenue called
    // Then: Returns cached venue
  });

  test('TC-VS-GV-002: should fetch from DB if not cached', async () => {
    // Given: Venue not in cache
    // When: getVenue called
    // Then: Fetches from DB and caches
  });

  test('TC-VS-GV-003: should throw NotFoundError if not exists', async () => {
    // Given: venueId doesn't exist
    // When: getVenue called
    // Then: Throws NotFoundError
  });

  test('TC-VS-GV-004: should enforce tenant isolation', async () => {
    // Given: Venue exists but different tenant
    // When: getVenue called
    // Then: Throws NotFoundError
  });

  test('TC-VS-GV-005: should exclude soft-deleted venues', async () => {
    // Given: Venue has deleted_at set
    // When: getVenue called
    // Then: Throws NotFoundError
  });

  test('TC-VS-GV-006: should include staff count', async () => {
    // Given: Venue with staff members
    // When: getVenue called
    // Then: Returns staff_count field
  });

  test('TC-VS-GV-007: should handle DB errors gracefully', async () => {
    // Given: DB query fails
    // When: getVenue called
    // Then: Throws appropriate error
  });

  test('TC-VS-GV-008: should set cache TTL to 1 hour', async () => {
    // Given: Venue fetched from DB
    // When: getVenue called
    // Then: Cached with 3600s TTL
  });
});
```

---

#### Function: `listVenues(filters, tenantId)`

**Purpose:** List venues with filtering and pagination  
**Priority:** P1 Critical  
**Test File:** `unit/services/venue.service.test.ts`

**Test Cases:**

```typescript
describe('listVenues', () => {
  test('TC-VS-LV-001: should list all venues for tenant', async () => {
    // Given: Tenant has 5 venues
    // When: listVenues called
    // Then: Returns all 5
  });

  test('TC-VS-LV-002: should apply pagination', async () => {
    // Given: limit=10, offset=5
    // When: listVenues called
    // Then: Returns 10 venues starting at offset 5
  });

  test('TC-VS-LV-003: should filter by venue type', async () => {
    // Given: type=theater in filters
    // When: listVenues called
    // Then: Returns only theaters
  });

  test('TC-VS-LV-004: should filter by capacity range', async () => {
    // Given: min_capacity=100, max_capacity=500
    // When: listVenues called
    // Then: Returns venues in range
  });

  test('TC-VS-LV-005: should search by name', async () => {
    // Given: search="Madison" in filters
    // When: listVenues called
    // Then: Returns venues matching name
  });

  test('TC-VS-LV-006: should filter by active status', async () => {
    // Given: is_active=true in filters
    // When: listVenues called
    // Then: Returns only active venues
  });

  test('TC-VS-LV-007: should exclude soft-deleted', async () => {
    // Given: Some venues have deleted_at
    // When: listVenues called
    // Then: Deleted venues not included
  });

  test('TC-VS-LV-008: should return total count', async () => {
    // Given: 50 total venues, returning 10
    // When: listVenues called
    // Then: Returns { venues: [...], total: 50 }
  });

  test('TC-VS-LV-009: should sort by created_at DESC by default', async () => {
    // Given: No sort specified
    // When: listVenues called
    // Then: Newest venues first
  });

  test('TC-VS-LV-010: should support custom sorting', async () => {
    // Given: sort_by=name, sort_order=asc
    // When: listVenues called
    // Then: Returns alphabetically sorted
  });
});
```

---

#### Function: `updateVenue(venueId, updateData, tenantId)`

**Purpose:** Update venue details  
**Priority:** P1 Critical  
**Test File:** `unit/services/venue.service.test.ts`

**Test Cases:**

```typescript
describe('updateVenue', () => {
  test('TC-VS-UV-001: should update specified fields', async () => {
    // Given: Update data for name, capacity
    // When: updateVenue called
    // Then: Only those fields updated
  });

  test('TC-VS-UV-002: should update updated_at timestamp', async () => {
    // Given: Venue update
    // When: updateVenue called
    // Then: updated_at set to current time
  });

  test('TC-VS-UV-003: should invalidate cache', async () => {
    // Given: Venue is cached
    // When: updateVenue called
    // Then: Cache entry deleted
  });

  test('TC-VS-UV-004: should throw NotFoundError if not exists', async () => {
    // Given: Invalid venueId
    // When: updateVenue called
    // Then: Throws NotFoundError
  });

  test('TC-VS-UV-005: should enforce tenant isolation', async () => {
    // Given: Venue from different tenant
    // When: updateVenue called
    // Then: Throws NotFoundError
  });

  test('TC-VS-UV-006: should not allow updating immutable fields', async () => {
    // Given: Update includes id, created_at, tenant_id
    // When: updateVenue called
    // Then: Those fields ignored
  });

  test('TC-VS-UV-007: should return updated venue', async () => {
    // Given: Venue updated successfully
    // When: updateVenue called
    // Then: Returns updated venue object
  });

  test('TC-VS-UV-008: should publish venue.updated event', async () => {
    // Given: Venue updated
    // When: updateVenue called
    // Then: Event published
  });

  test('TC-VS-UV-009: should handle concurrent updates', async () => {
    // Given: Two simultaneous updates
    // When: updateVenue called concurrently
    // Then: Uses optimistic locking
  });

  test('TC-VS-UV-010: should validate updated values', async () => {
    // Given: Invalid capacity (negative)
    // When: updateVenue called
    // Then: Throws ValidationError
  });
});
```

---

*[Additional service functions would follow the same pattern...]*

---

## MIDDLEWARE

### auth.middleware.ts

---

#### Function: `authenticate(request, reply)`

**Purpose:** Main authentication middleware  
**Priority:** P1 Critical  
**Test File:** `unit/middleware/auth.middleware.test.ts`

**Test Cases:**

```typescript
describe('authenticate', () => {
  test('TC-AM-AUTH-001: should authenticate with valid JWT', async () => {
    // Given: Valid JWT in Authorization header
    // When: authenticate called
    // Then: User set on request
  });

  test('TC-AM-AUTH-002: should authenticate with valid API key', async () => {
    // Given: Valid API key in x-api-key header
    // When: authenticate called
    // Then: User set on request
  });

  test('TC-AM-AUTH-003: should prefer API key over JWT', async () => {
    // Given: Both API key and JWT provided
    // When: authenticate called
    // Then: API key used for auth
  });

  test('TC-AM-AUTH-004: should throw UnauthorizedError with no credentials', async () => {
    // Given: No auth headers
    // When: authenticate called
    // Then: Throws UnauthorizedError
  });

  test('TC-AM-AUTH-005: should throw UnauthorizedError with invalid JWT', async () => {
    // Given: Malformed or expired JWT
    // When: authenticate called
    // Then: Throws UnauthorizedError
  });

  test('TC-AM-AUTH-006: should throw UnauthorizedError with invalid API key', async () => {
    // Given: Invalid or expired API key
    // When: authenticate called
    // Then: Throws UnauthorizedError
  });

  test('TC-AM-AUTH-007: should extract user permissions from JWT', async () => {
    // Given: JWT with permissions claim
    // When: authenticate called
    // Then: request.user.permissions populated
  });

  test('TC-AM-AUTH-008: should extract user permissions from API key', async () => {
    // Given: API key with permissions
    // When: authenticate called
    // Then: request.user.permissions populated
  });

  test('TC-AM-AUTH-009: should handle Bearer token format', async () => {
    // Given: Authorization: Bearer {token}
    // When: authenticate called
    // Then: Token extracted and verified
  });

  test('TC-AM-AUTH-010: should reject blacklisted tokens', async () => {
    // Given: Valid but blacklisted JWT
    // When: authenticate called
    // Then: Throws UnauthorizedError
  });
});
```

---

#### Function: `authenticateWithApiKey(apiKey, request, reply)`

**Purpose:** Authenticate using API key  
**Priority:** P1 Critical  
**Test File:** `unit/middleware/auth.middleware.test.ts`

**Test Cases:**

```typescript
describe('authenticateWithApiKey', () => {
  test('TC-AM-AK-001: should authenticate with valid active key', async () => {
    // Given: Valid, active API key
    // When: authenticateWithApiKey called
    // Then: User set on request
  });

  test('TC-AM-AK-002: should use cached key data when available', async () => {
    // Given: API key cached in Redis
    // When: authenticateWithApiKey called
    // Then: Uses cache, no DB query
  });

  test('TC-AM-AK-003: should cache API key data for 5 minutes', async () => {
    // Given: API key fetched from DB
    // When: authenticateWithApiKey called
    // Then: Cached with 300s TTL
  });

  test('TC-AM-AK-004: should throw with inactive key', async () => {
    // Given: API key with is_active=false
    // When: authenticateWithApiKey called
    // Then: Throws UnauthorizedError
  });

  test('TC-AM-AK-005: should throw with expired key', async () => {
    // Given: API key with expires_at in past
    // When: authenticateWithApiKey called
    // Then: Throws UnauthorizedError
  });

  test('TC-AM-AK-006: should throw with non-existent key', async () => {
    // Given: API key not in database
    // When: authenticateWithApiKey called
    // Then: Throws UnauthorizedError
  });

  test('TC-AM-AK-007: should load user associated with key', async () => {
    // Given: Valid API key
    // When: authenticateWithApiKey called
    // Then: User data loaded and set
  });

  test('TC-AM-AK-008: should extract permissions from key', async () => {
    // Given: API key with permissions array
    // When: authenticateWithApiKey called
    // Then: request.user.permissions set
  });
});
```

---

*[Continue with additional middleware, models, and utils following the same pattern...]*

---

## CONCLUSION

This test specification document provides the foundation for comprehensive test coverage of the venue service. Each function has detailed test cases covering:

- **Happy path scenarios**
- **Error handling**  
- **Edge cases**
- **Security concerns**  
- **Performance considerations**

**Next Steps:**
1. Implement tests following these specifications
2. Track progress in 00-MASTER-COVERAGE.md
3. Update test case IDs as tests are written
4. Add integration tests for multi-component flows
5. Develop E2E tests for complete user journeys

**Conventions:**
- Test case IDs: `TC-{MODULE}-{FUNCTION}-{NUMBER}`
- Status tracked in master coverage doc
- Each test should be independent and repeatable
- Use test fixtures from `tests/fixtures/test-data.ts`