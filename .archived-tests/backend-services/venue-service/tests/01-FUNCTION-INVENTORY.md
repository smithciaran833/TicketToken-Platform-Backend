# VENUE SERVICE - COMPLETE FUNCTION INVENTORY

**Last Updated:** October 22, 2025  
**Total Functions:** ~150+  
**Total Files:** 83

This document lists EVERY function in venue-service with signatures, purposes, and dependencies.

---

## 📋 TABLE OF CONTENTS

1. [Controllers (5 files, ~20 functions)](#controllers)
2. [Services (11 files, ~80 functions)](#services)
3. [Middleware (5 files, ~12 functions)](#middleware)
4. [Models (6 files, ~30 functions)](#models)
5. [Utils (11 files, ~20 functions)](#utils)
6. [Routes (Endpoints reference)](#routes)

---

## CONTROLLERS

### File: venues.controller.ts

#### 1. addTenantContext(request, reply)
- **Purpose:** Middleware to add tenant context to request
- **Parameters:** request (any), reply (any)
- **Returns:** void
- **Dependencies:** None
- **Notes:** Sets tenantId from user or defaults to system tenant
- **Complexity:** Low

#### 2. verifyVenueOwnership(request, reply, venueService)
- **Purpose:** Verify user has access to venue
- **Parameters:** request (any), reply (any), venueService (any)
- **Returns:** void (throws ForbiddenError if no access)
- **Dependencies:** venueService.checkVenueAccess()
- **Complexity:** Medium
- **Error Cases:** 403 if no access

#### 3. GET / - List Venues
- **Purpose:** List public venues or user's venues
- **Parameters:** query: { my_venues?, limit?, offset? }
- **Returns:** { venues: [], total, limit, offset }
- **Dependencies:** venueService.listUserVenues() or venueService.listVenues()
- **Complexity:** Medium
- **Notes:** Optional auth, filters based on my_venues flag

#### 4. POST / - Create Venue
- **Purpose:** Create new venue
- **Parameters:** body: { name, type, capacity, address }
- **Returns:** 201 with { venue }
- **Dependencies:** venueService.createVenue()
- **Complexity:** Medium
- **Error Cases:** Validation errors (422), unauthorized (401)

#### 5. GET /user - List User's Venues
- **Purpose:** Get all venues owned by user
- **Parameters:** None (uses authenticated user)
- **Returns:** { venues: [] }
- **Dependencies:** venueService.listUserVenues()
- **Complexity:** Low

#### 6. GET /:venueId - Get Venue
- **Purpose:** Get single venue details
- **Parameters:** params: { venueId }
- **Returns:** { venue }
- **Dependencies:** venueService.getVenue()
- **Complexity:** Low
- **Error Cases:** 403 if access denied, 404 if not found

#### 7. GET /:venueId/capacity - Get Capacity
- **Purpose:** Get venue capacity info
- **Parameters:** params: { venueId }
- **Returns:** { total, available, reserved, utilized }
- **Dependencies:** venueService.getVenue()
- **Complexity:** Medium
- **Notes:** TODO - calculate available from active events

#### 8. GET /:venueId/stats - Get Statistics
- **Purpose:** Get venue statistics
- **Parameters:** params: { venueId }
- **Returns:** { stats }
- **Dependencies:** venueService.getVenueStats()
- **Complexity:** Medium

#### 9. PATCH /:venueId - Update Venue
- **Purpose:** Update venue details
- **Parameters:** params: { venueId }, body: { name?, type?, capacity?, address? }
- **Returns:** { venue }
- **Dependencies:** verifyVenueOwnership(), venueService.updateVenue()
- **Complexity:** Medium

#### 10. DELETE /:venueId - Delete Venue
- **Purpose:** Soft delete venue
- **Parameters:** params: { venueId }
- **Returns:** 204 No Content
- **Dependencies:** verifyVenueOwnership(), venueService.deleteVenue()
- **Complexity:** Low

#### 11. POST /:venueId/staff - Add Staff
- **Purpose:** Add staff member to venue
- **Parameters:** params: { venueId }, body: { user_id, role }
- **Returns:** 201 with { staff }
- **Dependencies:** verifyVenueOwnership(), venueService.addStaffMember()
- **Complexity:** Medium

#### 12. GET /:venueId/staff - List Staff
- **Purpose:** List all staff for venue
- **Parameters:** params: { venueId }
- **Returns:** { staff: [] }
- **Dependencies:** verifyVenueOwnership(), venueService.listStaffMembers()
- **Complexity:** Low

#### 13. DELETE /:venueId/staff/:staffId - Remove Staff
- **Purpose:** Remove staff member
- **Parameters:** params: { venueId, staffId }
- **Returns:** 204 No Content
- **Dependencies:** verifyVenueOwnership(), venueService.removeStaffMember()
- **Complexity:** Low

---

### File: settings.controller.ts

#### 14. GET /:venueId/settings - Get Settings
- **Purpose:** Get all settings for venue
- **Parameters:** params: { venueId }
- **Returns:** { settings }
- **Dependencies:** settingsService.getSettings()
- **Complexity:** Low

#### 15. PUT /:venueId/settings - Update Settings
- **Purpose:** Update venue settings
- **Parameters:** params: { venueId }, body: { settings object }
- **Returns:** { settings }
- **Dependencies:** settingsService.updateSettings()
- **Complexity:** Medium

#### 16. DELETE /:venueId/settings/:key - Delete Setting
- **Purpose:** Remove specific setting
- **Parameters:** params: { venueId, key }
- **Returns:** 204 No Content
- **Dependencies:** settingsService.deleteSetting()
- **Complexity:** Low

---

### File: integrations.controller.ts

#### 17. GET /:venueId/integrations - List Integrations
- **Purpose:** List all active integrations
- **Parameters:** params: { venueId }
- **Returns:** { integrations: [] }
- **Dependencies:** integrationService.listIntegrations()
- **Complexity:** Low

#### 18. POST /:venueId/integrations - Create Integration
- **Purpose:** Create new integration
- **Parameters:** params: { venueId }, body: { type, name, config, credentials }
- **Returns:** 201 with { integration }
- **Dependencies:** integrationService.createIntegration()
- **Complexity:** High
- **Notes:** Encrypts credentials, validates config

#### 19. GET /:venueId/integrations/:integrationId - Get Integration
- **Purpose:** Get integration details
- **Parameters:** params: { venueId, integrationId }
- **Returns:** { integration }
- **Dependencies:** integrationService.getIntegration()
- **Complexity:** Low

#### 20. PATCH /:venueId/integrations/:integrationId - Update Integration
- **Purpose:** Update integration config/credentials
- **Parameters:** params: { venueId, integrationId }, body: { config?, credentials? }
- **Returns:** { integration }
- **Dependencies:** integrationService.updateIntegration()
- **Complexity:** Medium

#### 21. DELETE /:venueId/integrations/:integrationId - Delete Integration
- **Purpose:** Remove integration (soft delete)
- **Parameters:** params: { venueId, integrationId }
- **Returns:** 204 No Content
- **Dependencies:** integrationService.deleteIntegration()
- **Complexity:** Low
- **Notes:** Sets is_active to false

#### 22. POST /:venueId/integrations/:integrationId/test - Test Integration
- **Purpose:** Test integration connection
- **Parameters:** params: { venueId, integrationId }
- **Returns:** { success: boolean, details }
- **Dependencies:** integrationService.testIntegration()
- **Complexity:** High
- **Notes:** Makes actual API call to third-party

#### 23. POST /:venueId/integrations/:integrationId/sync - Sync Integration
- **Purpose:** Trigger data sync
- **Parameters:** params: { venueId, integrationId }
- **Returns:** { jobId, status }
- **Dependencies:** integrationService.syncIntegration()
- **Complexity:** High
- **Notes:** Async operation, returns job ID

---

### File: analytics.controller.ts

#### 24-28. Various analytics endpoints
- getVenueAnalytics()
- getEventMetrics()
- getRevenueReport()
- getCapacityUtilization()
- exportAnalytics()

*See source documentation for detailed specs*

---

### File: compliance.controller.ts

#### 29-33. Compliance management endpoints
- getComplianceChecks()
- createComplianceCheck()
- updateComplianceCheck()
- deleteComplianceCheck()
- getExpiringCompliance()

*See source documentation for detailed specs*

---

## SERVICES

### File: venue.service.ts (Main Service - ~20 functions)

#### 1. createVenue(data)
- **Purpose:** Create new venue in database
- **Parameters:** { name, type, capacity, address, owner_id, tenant_id }
- **Returns:** Promise<Venue>
- **Dependencies:**
  - venueModel.create()
  - staffModel.create() (add owner as staff)
  - eventPublisher.publish('venue.created')
  - cache.set()
- **Complexity:** High
- **Notes:** Transaction wraps venue + staff creation

#### 2. getVenue(venueId, userId?)
- **Purpose:** Get venue by ID with access check
- **Parameters:** venueId (string), optional userId
- **Returns:** Promise<Venue>
- **Dependencies:**
  - cache.get() (cache-first)
  - venueModel.findById()
  - checkVenueAccess() (if userId provided)
- **Complexity:** Medium

#### 3. listVenues(filters)
- **Purpose:** List venues with filtering
- **Parameters:** { tenant_id?, type?, city?, limit?, offset? }
- **Returns:** Promise<{ venues: [], total }>
- **Dependencies:** venueModel.findAll()
- **Complexity:** Medium
- **Notes:** Supports pagination, filtering

#### 4. listUserVenues(userId, tenantId)
- **Purpose:** Get all venues user has access to
- **Parameters:** userId, tenantId
- **Returns:** Promise<Venue[]>
- **Dependencies:**
  - venueModel.findAll()
  - staffModel.findByUser()
- **Complexity:** Medium
- **Notes:** Includes owned and staffed venues

#### 5. updateVenue(venueId, updates, userId)
- **Purpose:** Update venue details
- **Parameters:** venueId, updates object, userId
- **Returns:** Promise<Venue>
- **Dependencies:**
  - checkVenueAccess()
  - venueModel.update()
  - eventPublisher.publish('venue.updated')
  - cache.delete()
- **Complexity:** Medium
- **Notes:** Audit logging included

#### 6. deleteVenue(venueId, userId)
- **Purpose:** Soft delete venue
- **Parameters:** venueId, userId
- **Returns:** Promise<void>
- **Dependencies:**
  - checkVenueAccess()
  - venueModel.softDelete()
  - eventPublisher.publish('venue.deleted')
  - cache.delete()
- **Complexity:** Medium

#### 7. checkVenueAccess(venueId, userId, requiredRole?)
- **Purpose:** Verify user has access to venue
- **Parameters:** venueId, userId, optional requiredRole
- **Returns:** Promise<boolean>
- **Dependencies:**
  - venueModel.findById()
  - staffModel.findByVenueAndUser()
- **Complexity:** Medium
- **Notes:** Checks ownership + staff roles

#### 8. getVenueStats(venueId)
- **Purpose:** Calculate venue statistics
- **Parameters:** venueId
- **Returns:** Promise<{ total_events, revenue, utilization }>
- **Dependencies:**
  - Database aggregation queries
- **Complexity:** High

#### 9. addStaffMember(venueId, staffData, userId)
- **Purpose:** Add staff to venue
- **Parameters:** venueId, { user_id, role, permissions }, userId
- **Returns:** Promise<Staff>
- **Dependencies:**
  - checkVenueAccess()
  - staffModel.create()
  - eventPublisher.publish('staff.added')
- **Complexity:** Medium

#### 10. listStaffMembers(venueId, userId)
- **Purpose:** Get all staff for venue
- **Parameters:** venueId, userId
- **Returns:** Promise<Staff[]>
- **Dependencies:**
  - checkVenueAccess()
  - staffModel.findByVenue()
- **Complexity:** Low

#### 11. removeStaffMember(venueId, staffId, userId)
- **Purpose:** Remove staff from venue
- **Parameters:** venueId, staffId, userId
- **Returns:** Promise<void>
- **Dependencies:**
  - checkVenueAccess()
  - staffModel.delete()
  - eventPublisher.publish('staff.removed')
- **Complexity:** Medium

#### 12. searchVenues(query, filters)
- **Purpose:** Full-text search venues
- **Parameters:** query string, filters object
- **Returns:** Promise<Venue[]>
- **Dependencies:**
  - venueModel.search()
- **Complexity:** Medium
- **Notes:** Uses PostgreSQL full-text search

*Additional methods (~10 more) for venue operations, capacity, verification, etc.*

---

### File: onboarding.service.ts (~8 functions)

#### 1. startOnboarding(venueId)
- **Purpose:** Initialize onboarding flow
- **Parameters:** venueId
- **Returns:** Promise<OnboardingState>
- **Dependencies:** Database insert
- **Complexity:** Low

#### 2. completeStep(venueId, step)
- **Purpose:** Mark onboarding step complete
- **Parameters:** venueId, step name
- **Returns:** Promise<OnboardingState>
- **Dependencies:** Database update
- **Complexity:** Low

*Additional onboarding methods...*

---

### File: verification.service.ts (~6 functions)

#### 1. initiateVerification(venueId)
- **Purpose:** Start venue verification
- **Parameters:** venueId
- **Returns:** Promise<Verification>
- **Dependencies:** Database insert
- **Complexity:** Medium

*Additional verification methods...*

---

### File: integration.service.ts (~10 functions)

#### 1. createIntegration(venueId, data)
- **Purpose:** Create integration
- **Parameters:** venueId, { type, config, credentials }
- **Returns:** Promise<Integration>
- **Dependencies:**
  - integrationModel.create()
  - encryptCredentials()
- **Complexity:** High
- **Notes:** Encrypts API keys/secrets

#### 2. testIntegration(integrationId)
- **Purpose:** Test integration connection
- **Parameters:** integrationId
- **Returns:** Promise<{ success, message }>
- **Dependencies:**
  - integrationModel.findById()
  - httpClient (with circuit breaker)
  - Third-party API
- **Complexity:** High
- **Notes:** Uses circuit breaker

#### 3. syncIntegration(integrationId)
- **Purpose:** Sync data from third-party
- **Parameters:** integrationId
- **Returns:** Promise<{ jobId }>
- **Dependencies:**
  - Background job queue
  - httpClient
  - Circuit breaker
- **Complexity:** Very High
- **Notes:** Async operation

*Additional integration methods...*

---

### File: analytics.service.ts (~8 functions)
### File: compliance.service.ts (~8 functions)
### File: healthCheck.service.ts (~3 functions)
### File: cache.service.ts (~10 functions)
### File: cache-integration.ts (~8 functions)
### File: eventPublisher.ts (~3 functions)

*See source documentation for full method details*

---

## MIDDLEWARE

### File: auth.middleware.ts

#### 1. authenticate(request, reply)
- **Purpose:** Verify JWT or API key
- **Parameters:** request, reply
- **Returns:** void (sets request.user)
- **Dependencies:**
  - fastify.jwt.verify()
  - authenticateWithApiKey()
- **Complexity:** Medium
- **Notes:** Checks API key first, then JWT

#### 2. authenticateWithApiKey(apiKey, request, reply)
- **Purpose:** Authenticate using API key
- **Parameters:** apiKey, request, reply
- **Returns:** Promise<void>
- **Dependencies:**
  - redis.get() (cache check)
  - db query (api_keys table)
  - redis.setex() (cache result)
- **Complexity:** Medium
- **Notes:** 5-minute cache TTL

#### 3. requireVenueAccess(request, reply)
- **Purpose:** Ensure user has venue access
- **Parameters:** request, reply
- **Returns:** Promise<void>
- **Dependencies:** venueService.checkVenueAccess()
- **Complexity:** Medium
- **Error Cases:** 403 if no access

---

### File: validation.middleware.ts

#### 1. validate(schema)
- **Purpose:** Validate request against Joi schema
- **Parameters:** { body?, querystring?, params? }
- **Returns:** Middleware function
- **Dependencies:** Joi validation
- **Complexity:** Low
- **Notes:** Validates body, query, and params

---

### File: rate-limit.middleware.ts

#### RateLimiter Class

##### 1. checkLimit(key, options)
- **Purpose:** Check if rate limit exceeded
- **Parameters:** key, { max, windowMs }
- **Returns:** Promise<{ allowed, remaining, resetTime }>
- **Dependencies:** redis.pipeline()
- **Complexity:** Medium
- **Notes:** Sliding window algorithm

##### 2. middleware(options)
- **Purpose:** Create rate limit middleware
- **Parameters:** { max, windowMs, keyGenerator? }
- **Returns:** Middleware function
- **Dependencies:** checkLimit()
- **Complexity:** Medium

##### 3. checkAllLimits(request, reply)
- **Purpose:** Run all rate limit checks
- **Parameters:** request, reply
- **Returns:** Promise<void>
- **Dependencies:**
  - checkGlobal()
  - checkPerUser()
  - checkPerVenue()
  - checkPerOperation()
- **Complexity:** High

*Additional rate limiter methods...*

---

### File: error-handler.middleware.ts

#### 1. errorHandler(error, request, reply)
- **Purpose:** Global error handler
- **Parameters:** error, request, reply
- **Returns:** void (sends error response)
- **Dependencies:**
  - logger.error()
  - ErrorResponseBuilder
- **Complexity:** Medium
- **Notes:** Formats all errors consistently

---

### File: versioning.middleware.ts

*API versioning middleware*

---

## MODELS

### File: venue.model.ts (Extends BaseModel)

#### 1. findById(id)
- **Purpose:** Find venue by ID
- **Parameters:** id (string)
- **Returns:** Promise<Venue | undefined>
- **Dependencies:** db.query()
- **Notes:** Excludes soft-deleted

#### 2. findAll(conditions, options)
- **Purpose:** Find all venues matching conditions
- **Parameters:** conditions object, { limit, offset, orderBy }
- **Returns:** Promise<Venue[]>
- **Dependencies:** db.query()
- **Notes:** Supports pagination

#### 3. create(data)
- **Purpose:** Create new venue
- **Parameters:** venue data object
- **Returns:** Promise<Venue>
- **Dependencies:** db.insert()

#### 4. update(id, data)
- **Purpose:** Update venue
- **Parameters:** id, updates object
- **Returns:** Promise<Venue>
- **Dependencies:** db.update()

#### 5. delete(id)
- **Purpose:** Soft delete venue
- **Parameters:** id
- **Returns:** Promise<number>
- **Dependencies:** db.update({ deleted_at })

#### 6. search(query, filters)
- **Purpose:** Full-text search
- **Parameters:** query string, filters
- **Returns:** Promise<Venue[]>
- **Dependencies:** PostgreSQL full-text search
- **Complexity:** High

*Additional model methods...*

---

### File: staff.model.ts (Extends BaseModel)
### File: settings.model.ts (Extends BaseModel)
### File: layout.model.ts (Extends BaseModel)
### File: integration.model.ts (Extends BaseModel)

*Similar CRUD methods for each model*

---

### File: base.model.ts (Abstract Base Class)

Provides common CRUD operations:
- findById()
- findAll()
- create()
- update()
- delete() (soft delete)
- count()
- softDelete()
- generateId()
- withTransaction()

---

## UTILS

### File: circuitBreaker.ts

#### CircuitBreaker Class

##### 1. execute(fn)
- **Purpose:** Execute function with circuit breaker
- **Parameters:** async function
- **Returns:** Promise<any>
- **Complexity:** High
- **Notes:** Opens after 5 failures

##### 2. open()
- **Purpose:** Open circuit
- **Returns:** void
- **Notes:** Fails fast when open

##### 3. halfOpen()
- **Purpose:** Test if service recovered
- **Returns:** void
- **Notes:** Allows 1 test request

##### 4. close()
- **Purpose:** Close circuit
- **Returns:** void
- **Notes:** Normal operation

---

### File: retry.ts

#### 1. withRetry(fn, options)
- **Purpose:** Retry function with exponential backoff
- **Parameters:** fn, { maxRetries, baseDelay }
- **Returns:** Promise<any>
- **Complexity:** Medium
- **Notes:** Exponential backoff

---

### File: httpClient.ts

#### 1. request(url, options)
- **Purpose:** HTTP client with circuit breaker
- **Parameters:** url, options object
- **Returns:** Promise<Response>
- **Dependencies:**
  - Circuit breaker
  - Retry logic
- **Complexity:** High

---

### File: logger.ts
### File: metrics.ts
### File: errors.ts
### File: error-response.ts
### File: tracing.ts
### File: venue-audit-logger.ts

*See source documentation for utility function details*

---

## ROUTES (Endpoint Reference)

### Venue Routes (/venues)

**Public:**
- GET / - List venues

**Authenticated:**
- POST / - Create venue
- GET /user - User's venues
- GET /:venueId - Get venue
- GET /:venueId/capacity - Get capacity
- GET /:venueId/stats - Get stats
- PATCH /:venueId - Update venue
- DELETE /:venueId - Delete venue

**Staff Management:**
- POST /:venueId/staff - Add staff
- GET /:venueId/staff - List staff
- DELETE /:venueId/staff/:staffId - Remove staff

### Settings Routes (/venues/:venueId/settings)
- GET / - Get settings
- PUT / - Update settings
- DELETE /:key - Delete setting

### Integration Routes (/venues/:venueId/integrations)
- GET / - List integrations
- POST / - Create integration
- GET /:id - Get integration
- PATCH /:id - Update integration
- DELETE /:id - Delete integration
- POST /:id/test - Test connection
- POST /:id/sync - Sync data

### Analytics Routes
- GET /:venueId/analytics
- GET /:venueId/metrics
- GET /:venueId/revenue

### Compliance Routes
- GET /:venueId/compliance
- POST /:venueId/compliance
- PATCH /:venueId/compliance/:id

### Internal Routes (/internal)
- GET /internal/venues/:venueId/validate-ticket/:ticketId

### Health Routes
- GET /health
- GET /health/live
- GET /health/ready
- GET /health/full

---

## 📝 NOTES

- Multi-tenant isolation via tenant_id throughout
- Soft deletes via deleted_at column
- Audit logging on all modifications
- Event-driven with event publisher
- Redis caching with cache-first strategy
- Circuit breaker for external services
- Retry logic with exponential backoff
- HMAC authentication for internal routes
- Rate limiting at multiple levels

**For detailed test specifications, see:** `02-TEST-SPECIFICATIONS.md`