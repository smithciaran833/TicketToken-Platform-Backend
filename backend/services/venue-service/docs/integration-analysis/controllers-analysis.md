# Venue Service Controllers Analysis
## Purpose: Integration Testing Documentation
## Source: venues.controller.ts, settings.controller.ts, integrations.controller.ts, analytics.controller.ts, compliance.controller.ts, venue-content.controller.ts, venue-reviews.controller.ts, venue-stripe.controller.ts
## Generated: 2026-01-18

---

## 1. VENUES.CONTROLLER.TS

### Method: GET /
**HTTP**: GET `/`

**INPUT EXTRACTION:**
- Query: `my_venues`, `limit`, `offset`
- Headers: `authorization` (Bearer token - optional)
- User context: Extracted via JWT verification if token present
- Tenant context: None

**SERVICES CALLED:**
1. `venueService.listUserVenues(userId, query)` - if `my_venues=true` and authenticated
2. `venueService.listVenues(query)` - for public venues

**RESPONSE:**
- Success: 200, `{ success: true, data: venues, pagination: { limit, offset } }`

**ERROR HANDLING:**
- Generic 500 with `ErrorResponseBuilder.internal()`
- No specific error types caught

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenant isolation - endpoint can list across tenants
- No tenantId extracted or passed to service

**POTENTIAL ISSUES:**
- ⚠️ Missing tenant filtering for list operations
- ⚠️ Manual JWT verification instead of using middleware
- ⚠️ No input validation middleware

---

### Method: POST /
**HTTP**: POST `/`

**INPUT EXTRACTION:**
- Body: `name`, `type`, `capacity`, `address` (via createVenueSchema)
- User: `request.user.id`, `request.user.tenant_id`
- Tenant: `request.tenantId` (from addTenantContext middleware)
- Metadata: `requestId`, `ipAddress`, `userAgent`

**SERVICES CALLED:**
1. `venueService.createVenue(body, user.id, tenantId, metadata)`

**RESPONSE:**
- Success: 201, venue object
- Error: 409 if "already exists", 500 otherwise

**ERROR HANDLING:**
- ConflictError for duplicates
- Generic error rethrown
- Metrics: `venueOperations.inc()`

**TENANT ISOLATION:**
- ✅ TenantId extracted via `addTenantContext` middleware
- ✅ Passed to `createVenue()`

**POTENTIAL ISSUES:**
- ⚠️ Success response inconsistent with other endpoints (no wrapper object)

---

### Method: GET /user
**HTTP**: GET `/user`

**INPUT EXTRACTION:**
- User: `request.user.id`
- No tenant context extracted

**SERVICES CALLED:**
1. `venueService.listUserVenues(userId, {})`

**RESPONSE:**
- Success: 200, venues array (unwrapped)
- Error: 500 with `ErrorResponseBuilder.internal()`

**ERROR HANDLING:**
- Generic 500 error

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId passed to service
- Service method receives empty query object

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: Missing tenant context - could leak cross-tenant data
- ⚠️ No validation of user existence

---

### Method: GET /:venueId
**HTTP**: GET `/:venueId`

**INPUT EXTRACTION:**
- Params: `venueId`
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `venueService.getVenue(venueId, userId)`

**RESPONSE:**
- Success: 200, venue object (unwrapped)
- Error: 404 if not found

**ERROR HANDLING:**
- NotFoundError thrown
- Generic errors caught with metrics

**TENANT ISOLATION:**
- ⚠️ **FLAG**: TenantId extracted but NOT passed to `getVenue()`
- Service only receives venueId and userId

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: tenantId not passed to service - potential cross-tenant access

---

### Method: GET /:venueId/capacity
**HTTP**: GET `/:venueId/capacity`

**INPUT EXTRACTION:**
- Params: `venueId`
- User: `request.user.id`

**SERVICES CALLED:**
1. `venueService.checkVenueAccess(venueId, userId)` - NO tenantId
2. `venueService.getVenue(venueId, userId)` - NO tenantId

**RESPONSE:**
- Success: 200, `{ venueId, venueName, totalCapacity, available, reserved, utilized }`
- Error: 403, 404, 500

**ERROR HANDLING:**
- Manual error responses (not using custom error classes)

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId extracted or passed

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: Missing tenant isolation
- ⚠️ TODO comment: capacity calculation not implemented

---

### Method: GET /:venueId/stats
**HTTP**: GET `/:venueId/stats`

**INPUT EXTRACTION:**
- Params: `venueId`
- User: `request.user.id`

**SERVICES CALLED:**
1. `venueService.checkVenueAccess(venueId, userId)` - NO tenantId
2. `venueService.getVenueStats(venueId)` - NO tenantId

**RESPONSE:**
- Success: 200, stats object
- Error: 403, 404, 500

**ERROR HANDLING:**
- Manual error responses

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId extracted or passed

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: Missing tenant isolation

---

### Method: PUT /:venueId
**HTTP**: PUT `/:venueId`

**INPUT EXTRACTION:**
- Params: `venueId`
- Body: `name`, `type`, `capacity`, `address`, `settings` (via updateVenueSchema)
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `verifyVenueOwnership()` helper (calls `venueService.checkVenueAccess()`)
2. `venueService.updateVenue(venueId, body, userId, tenantId)`

**RESPONSE:**
- Success: 200, updated venue object
- Error: 403, 404, 500

**ERROR HANDLING:**
- NotFoundError, ForbiddenError caught
- Generic errors with ErrorResponseBuilder

**TENANT ISOLATION:**
- ✅ TenantId extracted and passed to `updateVenue()`
- ⚠️ But `verifyVenueOwnership` doesn't pass tenantId to `checkVenueAccess()`

**POTENTIAL ISSUES:**
- ⚠️ Partial tenant isolation - inconsistent

---

### Method: DELETE /:venueId
**HTTP**: DELETE `/:venueId`

**INPUT EXTRACTION:**
- Params: `venueId`
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `venueService.deleteVenue(venueId, userId, tenantId)`

**RESPONSE:**
- Success: 204, no content
- Error: 403 (manual check), 404, 500

**ERROR HANDLING:**
- NotFoundError, ForbiddenError caught
- Special check for "Only venue owners can delete venues" message

**TENANT ISOLATION:**
- ✅ TenantId extracted and passed to service

**POTENTIAL ISSUES:**
- ⚠️ Inconsistent error handling (some manual, some using error classes)

---

### Method: GET /:venueId/check-access
**HTTP**: GET `/:venueId/check-access`

**INPUT EXTRACTION:**
- Params: `venueId`
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `venueService.checkVenueAccess(venueId, userId, tenantId)`
2. `venueService.getAccessDetails(venueId, userId)`

**RESPONSE:**
- Success: 200, `{ hasAccess, role, permissions }`
- Error: 500

**ERROR HANDLING:**
- Generic 500 error

**TENANT ISOLATION:**
- ✅ TenantId passed to `checkVenueAccess()`
- ⚠️ But NOT passed to `getAccessDetails()`

**POTENTIAL ISSUES:**
- ⚠️ Inconsistent tenant passing between service calls

---

### Method: POST /:venueId/staff
**HTTP**: POST `/:venueId/staff`

**INPUT EXTRACTION:**
- Params: `venueId`
- Body: `userId`, `role`, `permissions`
- User: `request.user.id` (as requesterId)
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `verifyVenueOwnership()` helper
2. `venueService.addStaffMember(venueId, staffData, requesterId)`

**RESPONSE:**
- Success: 201, staff member object
- Error: 400 (missing userId), 403, 404, 500

**ERROR HANDLING:**
- Complex error handling with statusCode checking (FIX #3 comment)
- Manual 400 for missing userId

**TENANT ISOLATION:**
- ⚠️ **FLAG**: TenantId extracted but NOT passed to `addStaffMember()`

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: Missing tenant context in service call
- ⚠️ Complex error handling pattern

---

### Method: GET /:venueId/staff
**HTTP**: GET `/:venueId/staff`

**INPUT EXTRACTION:**
- Params: `venueId`
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `verifyVenueOwnership()` helper
2. `venueService.getVenueStaff(venueId, userId)`

**RESPONSE:**
- Success: 200, staff array
- Error: 403, 404, 500

**ERROR HANDLING:**
- ForbiddenError, NotFoundError caught
- ErrorResponseBuilder for generic errors

**TENANT ISOLATION:**
- ⚠️ **FLAG**: TenantId NOT passed to `getVenueStaff()`

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: Missing tenant context in service call

---

## 2. SETTINGS.CONTROLLER.TS

### Method: GET /
**HTTP**: GET `/:venueId/settings` (nested under venue routes)

**INPUT EXTRACTION:**
- Params: `venueId`
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `venueService.checkVenueAccess(venueId, userId)` - NO tenantId
2. `db('venue_settings').where({ venue_id: venueId }).first()` - Direct DB query

**RESPONSE:**
- Success: 200, settings object
- Error: 403, 404, 500

**ERROR HANDLING:**
- ForbiddenError, NotFoundError thrown
- Generic 500 for others

**TENANT ISOLATION:**
- ⚠️ **FLAG**: TenantId extracted but NOT used
- Direct DB query with NO tenant filtering

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: Direct DB access bypasses service layer and tenant isolation
- ⚠️ No tenant filtering on database query

---

### Method: PUT /
**HTTP**: PUT `/:venueId/settings`

**INPUT EXTRACTION:**
- Params: `venueId`
- Body: settings fields (via updateSettingsSchema)
- User: `request.user.id`, `request.user.role`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `venueService.checkVenueAccess(venueId, userId)` - NO tenantId
2. `venueService.getAccessDetails(venueId, userId)` - NO tenantId
3. `db('venue_settings')` - Multiple direct DB queries
4. `auditService.logAction()` - For audit trail (twice: success and failure)

**RESPONSE:**
- Success: 200, updated settings
- Error: 400 (validation), 403, 404, 500

**ERROR HANDLING:**
- Manual validation for `max_tickets_per_order` and `service_fee_percentage`
- ForbiddenError, NotFoundError caught
- Audit log for both success and failure

**TENANT ISOLATION:**
- ⚠️ **FLAG**: TenantId NOT used in service calls or DB queries

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: Direct DB access with NO tenant filtering
- ⚠️ TenantId extracted but never used
- ✅ Good: Schema validation (SECURITY FIX RD1)
- ✅ Good: Comprehensive audit logging

---

## 3. INTEGRATIONS.CONTROLLER.TS

### Method: GET /
**HTTP**: GET `/:venueId/integrations`

**INPUT EXTRACTION:**
- Params: `venueId`
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `venueService.checkVenueAccess(venueId, userId, tenantId)` - ✅ Includes tenantId
2. `integrationService.listVenueIntegrations(venueId)` - NO tenantId

**RESPONSE:**
- Success: 200, sanitized integrations array
- Credentials masked: `apiKey: '***'`, `secretKey: '***'`

**ERROR HANDLING:**
- ForbiddenError caught
- Generic errors rethrown

**TENANT ISOLATION:**
- ⚠️ **FLAG**: TenantId passed to access check but NOT to `listVenueIntegrations()`

**POTENTIAL ISSUES:**
- ⚠️ Service call missing tenant context
- ✅ Good: Credential masking (FIXED comment)

---

### Method: POST /
**HTTP**: POST `/:venueId/integrations`

**INPUT EXTRACTION:**
- Params: `venueId`
- Body: `provider`/`type`, `config`, `credentials` (via createIntegrationSchema)
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `venueService.checkVenueAccess(venueId, userId, tenantId)`
2. `venueService.getAccessDetails(venueId, userId)` - NO tenantId
3. `integrationService.createIntegration(venueId, integrationData)` - NO tenantId

**RESPONSE:**
- Success: 201, integration object
- Error: 403, 409 (duplicate), 500

**ERROR HANDLING:**
- Role check: owner/manager only
- Postgres constraint violation (error code 23505) for duplicates

**TENANT ISOLATION:**
- ⚠️ **FLAG**: TenantId NOT passed to createIntegration

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: Missing tenant context in service call
- ⚠️ `getAccessDetails` missing tenantId
- ✅ Good: Role-based authorization

---

### Method: GET /:integrationId
**HTTP**: GET `/:venueId/integrations/:integrationId`

**INPUT EXTRACTION:**
- Params: `venueId`, `integrationId`
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `venueService.checkVenueAccess(venueId, userId, tenantId)`
2. `integrationService.getIntegration(integrationId)` - NO tenantId
3. Manual verification: `integration.venue_id !== venueId`

**RESPONSE:**
- Success: 200, sanitized integration object
- Error: 403, 404, 500

**ERROR HANDLING:**
- ForbiddenError, NotFoundError caught
- Manual venue ownership check

**TENANT ISOLATION:**
- ⚠️ **FLAG**: TenantId NOT passed to `getIntegration()`
- Manual venue_id check (controller-level, not service-level)

**POTENTIAL ISSUES:**
- ⚠️ Business logic in controller (venue_id verification)
- ⚠️ Missing tenant context in service call

---

### Method: PUT /:integrationId
**HTTP**: PUT `/:venueId/integrations/:integrationId`

**INPUT EXTRACTION:**
- Params: `venueId`, `integrationId`
- Body: `config`, `status` (via updateIntegrationSchema)
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `venueService.checkVenueAccess(venueId, userId, tenantId)`
2. `venueService.getAccessDetails(venueId, userId)` - NO tenantId
3. `integrationService.getIntegration(integrationId)` - NO tenantId
4. `integrationService.updateIntegration(integrationId, body)` - NO tenantId

**RESPONSE:**
- Success: 200, updated integration
- Error: 403, 404, 500

**ERROR HANDLING:**
- Role check: owner/manager only
- ForbiddenError, NotFoundError caught

**TENANT ISOLATION:**
- ⚠️ **FLAG**: TenantId NOT passed to any integration service calls

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: All service calls missing tenant context

---

### Method: DELETE /:integrationId
**HTTP**: DELETE `/:venueId/integrations/:integrationId`

**INPUT EXTRACTION:**
- Params: `venueId`, `integrationId`
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `venueService.checkVenueAccess(venueId, userId, tenantId)`
2. `venueService.getAccessDetails(venueId, userId)` - NO tenantId
3. `integrationService.getIntegration(integrationId)` - NO tenantId
4. `integrationService.deleteIntegration(integrationId)` - NO tenantId

**RESPONSE:**
- Success: 204, no content
- Error: 403 (only owner can delete), 404, 500

**ERROR HANDLING:**
- Stricter role check: owner ONLY

**TENANT ISOLATION:**
- ⚠️ **FLAG**: TenantId NOT passed to service calls

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: Missing tenant context throughout

---

### Method: POST /:integrationId/test
**HTTP**: POST `/:venueId/integrations/:integrationId/test`

**INPUT EXTRACTION:**
- Params: `venueId`, `integrationId`
- User: `request.user.id`
- Tenant: `request.tenantId` (from addTenantContext middleware)

**SERVICES CALLED:**
1. `venueService.checkVenueAccess(venueId, userId, tenantId)`
2. `integrationService.getIntegration(integrationId)` - NO tenantId
3. `integrationService.testIntegration(integrationId)` - NO tenantId

**RESPONSE:**
- Success: 200, `{ success, message }`
- Error: 403, 404, 500

**ERROR HANDLING:**
- ForbiddenError, NotFoundError caught

**TENANT ISOLATION:**
- ⚠️ **FLAG**: TenantId NOT passed to integration service

**POTENTIAL ISSUES:**
- ⚠️ Missing tenant context in service calls

---

## 4. ANALYTICS.CONTROLLER.TS

### Method: ALL /*
**HTTP**: ALL `/:venueId/analytics/*` (proxy)

**INPUT EXTRACTION:**
- Params: `venueId`, catch-all path
- Headers: ALL headers forwarded + `x-venue-id`, `x-forwarded-for`
- Body: forwarded
- Query: forwarded

**SERVICES CALLED:**
- External service: axios to ANALYTICS_SERVICE_URL

**RESPONSE:**
- Success: Proxied from analytics service
- Error: 503 if service unavailable, or proxied error status

**ERROR HANDLING:**
- Axios error handling
- 503 for service unavailability

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenant validation before proxying
- No tenantId extracted or forwarded

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: No authentication/authorization middleware
- ⚠️ **CRITICAL**: No tenant isolation - ANY user can access ANY venue's analytics
- ⚠️ No input validation
- ⚠️ No rate limiting on proxy

---

## 5. COMPLIANCE.CONTROLLER.TS

### Method: ALL /*
**HTTP**: ALL `/:venueId/compliance/*` (proxy)

**INPUT EXTRACTION:**
- Params: `venueId`, catch-all path
- Headers: ALL headers forwarded + `x-venue-id`, `x-forwarded-for`
- Body: forwarded
- Query: forwarded

**SERVICES CALLED:**
- External service: axios to COMPLIANCE_SERVICE_URL

**RESPONSE:**
- Success: Proxied from compliance service
- Error: 503 if service unavailable, or proxied error status

**ERROR HANDLING:**
- Axios error handling
- 503 for service unavailability

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenant validation before proxying
- No tenantId extracted or forwarded

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: No authentication/authorization middleware
- ⚠️ **CRITICAL**: No tenant isolation
- ⚠️ No input validation
- ⚠️ No rate limiting on proxy
- ⚠️ Identical security issues as analytics controller

---

## 6. VENUE-REVIEWS.CONTROLLER.TS

### Method: POST /
**HTTP**: POST `/api/venues/:venueId/reviews`

**INPUT EXTRACTION:**
- Params: `venueId`
- Body: `title`, `body`, `pros`, `cons`, `attendedDate`, `verifiedAttendee`
- User: `request.user.id`

**SERVICES CALLED:**
1. `reviewService.createReview(userId, 'venue', venueId, reviewData)`

**RESPONSE:**
- Success: 201, `{ success: true, data: review }`
- Error: 401 (no userId), 500

**ERROR HANDLING:**
- Manual 401 check
- Generic 500 error

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId extracted or passed

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: Missing tenant context
- ⚠️ Uses shared service without tenant isolation

---

### Method: GET /
**HTTP**: GET `/api/venues/:venueId/reviews`

**INPUT EXTRACTION:**
- Params: `venueId`
- Query: `page`, `limit`, `sortBy`, `sortOrder`

**SERVICES CALLED:**
1. `reviewService.getReviewsForTarget('venue', venueId, options)`

**RESPONSE:**
- Success: 200, `{ success: true, data, pagination }`
- Error: 500

**ERROR HANDLING:**
- Generic 500 error

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId extracted or passed
- ⚠️ NO authentication required (public endpoint?)

**POTENTIAL ISSUES:**
- ⚠️ Missing tenant context
- ⚠️ No authentication check

---

### Method: GET /:reviewId
**HTTP**: GET `/api/venues/:venueId/reviews/:reviewId`

**INPUT EXTRACTION:**
- Params: `reviewId` (venueId not used)

**SERVICES CALLED:**
1. `reviewService.getReview(reviewId)`

**RESPONSE:**
- Success: 200, `{ success: true, data: review }`
- Error: 404, 500

**ERROR HANDLING:**
- Manual 404 check
- Generic 500 error

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId

**POTENTIAL ISSUES:**
- ⚠️ venueId parameter not validated against review

---

### Method: PUT /:reviewId
**HTTP**: PUT `/api/venues/:venueId/reviews/:reviewId`

**INPUT EXTRACTION:**
- Params: `reviewId`
- Body: review update fields
- User: `request.user.id`

**SERVICES CALLED:**
1. `reviewService.updateReview(reviewId, userId, body)`

**RESPONSE:**
- Success: 200, `{ success: true, data: review }`
- Error: 401, 404 (unauthorized), 500

**ERROR HANDLING:**
- Manual 401 check
- Service returns null for unauthorized

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId

**POTENTIAL ISSUES:**
- ⚠️ Missing tenant context

---

### Method: DELETE /:reviewId
**HTTP**: DELETE `/api/venues/:venueId/reviews/:reviewId`

**INPUT EXTRACTION:**
- Params: `reviewId`
- User: `request.user.id`

**SERVICES CALLED:**
1. `reviewService.deleteReview(reviewId, userId)`

**RESPONSE:**
- Success: 200, `{ success: true, message }`
- Error: 401, 404, 500

**ERROR HANDLING:**
- Manual 401 check
- Service returns false for unauthorized

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId

**POTENTIAL ISSUES:**
- ⚠️ Missing tenant context

---

### Method: POST /:reviewId/helpful
**HTTP**: POST `/api/venues/:venueId/reviews/:reviewId/helpful`

**INPUT EXTRACTION:**
- Params: `reviewId`
- User: `request.user.id`

**SERVICES CALLED:**
1. `reviewService.markHelpful(reviewId, userId)`

**RESPONSE:**
- Success: 200, `{ success: true, message }`
- Error: 401, 500

**ERROR HANDLING:**
- Manual 401 check
- Generic 500 error

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId

---

### Method: POST /:reviewId/report
**HTTP**: POST `/api/venues/:venueId/reviews/:reviewId/report`

**INPUT EXTRACTION:**
- Params: `reviewId`
- Body: `reason`
- User: `request.user.id`

**SERVICES CALLED:**
1. `reviewService.reportReview(reviewId, userId, reason)`

**RESPONSE:**
- Success: 200, `{ success: true, message }`
- Error: 401, 500

**ERROR HANDLING:**
- Manual 401 check

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId

---

### Method: POST /ratings
**HTTP**: POST `/api/venues/:venueId/ratings`

**INPUT EXTRACTION:**
- Params: `venueId`
- Body: `overall`, `categories`
- User: `request.user.id`

**SERVICES CALLED:**
1. `ratingService.submitRating(userId, 'venue', venueId, ratingData)`

**RESPONSE:**
- Success: 201, `{ success: true, data: rating }`
- Error: 401, 500

**ERROR HANDLING:**
- Manual 401 check

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId

---

### Method: GET /ratings/summary
**HTTP**: GET `/api/venues/:venueId/ratings/summary`

**INPUT EXTRACTION:**
- Params: `venueId`

**SERVICES CALLED:**
1. `ratingService.getRatingSummary('venue', venueId)`

**RESPONSE:**
- Success: 200, `{ success: true, data: summary }`
- Error: 500

**ERROR HANDLING:**
- Generic 500 error

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId
- ⚠️ NO authentication (public endpoint?)

---

### Method: GET /ratings/me
**HTTP**: GET `/api/venues/:venueId/ratings/me`

**INPUT EXTRACTION:**
- Params: `venueId`
- User: `request.user.id`

**SERVICES CALLED:**
1. `ratingService.getUserRating(userId, 'venue', venueId)`

**RESPONSE:**
- Success: 200, `{ success: true, data: rating }`
- Error: 401, 500

**ERROR HANDLING:**
- Manual 401 check

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId

---

## 7. VENUE-STRIPE.CONTROLLER.TS

### Method: POST /connect/initiate
**HTTP**: POST (route not shown in controller, likely `/stripe/connect/initiate`)

**INPUT EXTRACTION:**
- Params: `venueId`
- Body: `email`, `returnUrl`, `refreshUrl`

**SERVICES CALLED:**
1. `venueStripeOnboardingService.createConnectAccountAndOnboardingLink(venueId, email, returnUrl, refreshUrl)`

**RESPONSE:**
- Success: 200, `{ success: true, data: { accountId, onboardingUrl } }`
- Error: 400 (validation), 500

**ERROR HANDLING:**
- Manual input validation:
  - Email format regex
  - HTTPS URL validation
- Generic 500 error

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId extracted or passed

**POTENTIAL ISSUES:**
- ⚠️ **CRITICAL**: Missing tenant context
- ⚠️ No authentication middleware visible
- ✅ Good: Input validation (email, HTTPS URLs)

---

### Method: GET /connect/status
**HTTP**: GET (route not shown)

**INPUT EXTRACTION:**
- Params: `venueId`

**SERVICES CALLED:**
1. `venueStripeOnboardingService.getAccountStatus(venueId)`

**RESPONSE:**
- Success: 200, `{ success: true, data: status }`
- Error: 500

**ERROR HANDLING:**
- Generic 500 error

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId

**POTENTIAL ISSUES:**
- ⚠️ Missing tenant context
- ⚠️ No authentication check visible

---

### Method: POST /connect/refresh
**HTTP**: POST (route not shown)

**INPUT EXTRACTION:**
- Params: `venueId`
- Body: `returnUrl`, `refreshUrl`

**SERVICES CALLED:**
1. `venueStripeOnboardingService.refreshOnboardingLink(venueId, returnUrl, refreshUrl)`

**RESPONSE:**
- Success: 200, `{ success: true, data: { onboardingUrl } }`
- Error: 400, 500

**ERROR HANDLING:**
- Manual validation for required fields

**TENANT ISOLATION:**
- ⚠️ **FLAG**: NO tenantId

---

### Method: POST /webhook
**HTTP**: POST `/webhook`

**INPUT EXTRACTION:**
- Headers: `stripe-signature`
- Body: Raw webhook payload
- Event metadata: `venue_id`, `tenant_id` (from Stripe event)

**SERVICES CALLED:**
1. `stripe.webhooks.constructEvent()` - Signature verification
2. `isWebhookProcessed(eventId)` - Deduplication check
3. `db('venues')` - Tenant validation query
4. `venueStripeOnboardingService.handleAccountUpdated()`
5. `markWebhookProcessed(eventId, eventType, tenantId)`

**RESPONSE:**
- Success: 200, `{ received: true }`
- Duplicate: 200, `{ received: true, duplicate: true }`
- Invalid: 200, `{ received: true, processed: false, reason }`
- Error: 200, `{ received: true, processed: false, error }` (SECURITY FIX ST2)

**ERROR HANDLING:**
- Signature verification (400 for invalid)
- ✅ Returns 200 for processing errors (prevents retry loops)
- ✅ Comprehensive error logging

**TENANT ISOLATION:**
- ✅ **EXCELLENT**: Tenant validation from webhook metadata
- ✅ Validates `venue_id` and `tenant_id` from event.data.object.metadata
- ✅ DB query to verify venue belongs to tenant

**POTENTIAL ISSUES:**
- ✅ Excellent: Webhook deduplication (SECURITY FIX WH2-WH3)
- ✅ Excellent: Tenant validation (SECURITY FIX AE7)
- ✅ Good: Centralized Stripe client (SECURITY FIX ST8)
- ⚠️ Webhook secret check could fail silently in non-webhook flows

---

## 8. VENUE-CONTENT.CONTROLLER.TS

### Method: POST /
**HTTP**: POST `/api/venues/:venueId/content`

**INPUT EXTRACTION:**
- Params: `venueId`
- Body: `contentType`, `content`, `displayOrder`, `featured`
- User: `request.user.id` (defaults to 'system')
- Tenant: `getTenantId(req)`

**SERVICES CALLED:**
1. `contentService.createContent({ venueId, tenantId, contentType, content, createdBy, displayOrder, featured })`

**RESPONSE:**
- Success: 201, `{ success: true, data: result }`
- Error: 500

**ERROR HANDLING:**
- Generic 500 error

**TENANT ISOLATION:**
- ✅ TenantId extracted via `getTenantId()` helper
- ✅ Passed to service

**POTENTIAL ISSUES:**
- ⚠️ User defaults to 'system' if not present (should require auth)

---

### Method: GET /
**HTTP**: GET `/api/venues/:venueId/content`

**INPUT EXTRACTION:**
- Params: `venueId`
- Query: `contentType`, `status`
- Tenant: `getTenantId(req)`

**SERVICES CALLED:**
1. `contentService.getVenueContent(venueId, tenantId, contentType, status)`

**RESPONSE:**
- Success: 200, `{ success: true, data: content }`
- Error: 500

**ERROR HANDLING:**
- Generic 500 error

**TENANT ISOLATION:**
- ✅ TenantId extracted and passed

---

### Method: GET /:contentId
**HTTP**: GET `/api/venues/:venueId/content/:contentId`

**INPUT EXTRACTION:**
- Params: `contentId` (venueId not used)
- Tenant: `getTenantId(req)`

**SERVICES CALLED:**
1. `contentService.getContent(contentId, tenantId)`

**RESPONSE:**
- Success: 200, `{ success: true, data: content }`
- Error: 404, 500

**ERROR HANDLING:**
- Manual 404 check

**TENANT ISOLATION:**
- ✅ TenantId extracted and passed

**POTENTIAL ISSUES:**
- ⚠️ venueId param not validated against content

---

### Method: PUT /:contentId
**HTTP**: PUT `/api/venues/:venueId/content/:contentId`

**INPUT EXTRACTION:**
- Params: `contentId`
- Body: `content`, `displayOrder`, `featured`, `primaryImage`
- User: `request.user.id` (defaults to 'system')
- Tenant: `getTenantId(req)`

**SERVICES CALLED:**
1. `contentService.updateContent(contentId, { tenantId, content, displayOrder, featured, primaryImage, updatedBy })`

**RESPONSE:**
- Success: 200, `{ success: true, data: result }`
- Error: 404, 500

**ERROR HANDLING:**
- Manual 404 check

**TENANT ISOLATION:**
- ✅ TenantId extracted and passed

---

### Method: DELETE /:contentId
**HTTP**: DELETE `/api/venues/:venueId/content/:contentId`

**INPUT EXTRACTION:**
- Params: `contentId`
- Tenant: `getTenantId(req)`

**SERVICES CALLED:**
1. `contentService.deleteContent(contentId, tenantId)`

**RESPONSE:**
- Success: 200, `{ success: true, message }`
- Error: 404, 500

**ERROR HANDLING:**
- Manual 404 check

**TENANT ISOLATION:**
- ✅ TenantId extracted and passed

---

### Method: POST /:contentId/publish
**HTTP**: POST `/api/venues/:venueId/content/:contentId/publish`

**INPUT EXTRACTION:**
- Params: `contentId`
- User: `request.user.id` (defaults to 'system')
- Tenant: `getTenantId(req)`

**SERVICES CALLED:**
1. `contentService.publishContent(contentId, tenantId, userId)`

**RESPONSE:**
- Success: 200, `{ success: true, data: result }`
- Error: 500

**ERROR HANDLING:**
- Generic 500 error

**TENANT ISOLATION:**
- ✅ TenantId extracted and passed

---

### Method: POST /:contentId/archive
**HTTP**: POST `/api/venues/:venueId/content/:contentId/archive`

**INPUT EXTRACTION:**
- Params: `contentId`
- User: `request.user.id` (defaults to 'system')
- Tenant: `getTenantId(req)`

**SERVICES CALLED:**
1. `contentService.archiveContent(contentId, tenantId, userId)`

**RESPONSE:**
- Success: 200, `{ success: true, data: result }`
- Error: 500

**ERROR HANDLING:**
- Generic 500 error

**TENANT ISOLATION:**
- ✅ TenantId extracted and passed

---

### Methods: Seating Chart, Photos, Amenities, Accessibility, Parking, Policies

**HTTP**: Various GET/POST/PUT operations

All follow similar patterns:
- ✅ TenantId extracted via `getTenantId(req)`
- ✅ TenantId passed to service methods
- ⚠️ User defaults to 'system' when not present
- Generic 500 error handling

**Methods Include:**
- GET/PUT `/seating-chart`
- GET/POST `/photos`
- GET `/amenities`
- GET `/accessibility`
- GET `/parking`
- GET `/policies`

---

## ISSUES FOUND

### 🔴 CRITICAL SECURITY ISSUES:

1. **Analytics & Compliance Controllers (2 controllers)**: 
   - NO authentication middleware
   - NO tenant isolation on proxy endpoints
   - ANY user can access ANY venue's analytics/compliance data
   - No rate limiting

2. **Settings Controller Direct DB Access**:
   - Bypasses service layer entirely
   - NO tenant filtering on database queries
   - TenantId extracted but never used

3. **Venues Controller - Multiple Methods (8+ methods)**:
   - TenantId extracted but not passed to services
   - Methods affected: `GET /:venueId`, `GET /:venueId/capacity`, `GET /:venueId/stats`, `GET /user`, staff operations
   - Potential cross-tenant data access

4. **Integrations Controller (All 6 methods)**:
   - TenantId missing in ALL service calls
   - `getAccessDetails` consistently missing tenantId

5. **Reviews Controller (All 11 methods)**:
   - NO tenant context throughout entire controller
   - Uses shared service without tenant isolation

6. **Venue-Stripe Controller (3 non-webhook methods)**:
   - Missing tenant context in initiate, status, and refresh operations

### ⚠️ HIGH PRIORITY ISSUES:

1. **Inconsistent Tenant Passing**:
   - Many methods extract tenantId but don't pass it to service calls
   - Affects ~20+ controller methods across 6 controllers

2. **Missing Input Validation**:
   - Several endpoints lack schema validation
   - Manual JWT verification instead of middleware (venues list endpoint)

3. **Inconsistent Error Handling**:
   - Mix of custom error classes, manual responses, and generic 500s
   - No standardized error response format

4. **Business Logic in Controllers**:
   - Verification and validation happening in controller layer
   - Example: Integration venue_id verification in controller

5. **User Context Defaults**:
   - Venue-content controller defaults user to 'system' when not authenticated
   - Should require proper authentication

### ✅ GOOD PRACTICES FOUND:

1. **Venue-Stripe Webhook Handler**:
   - Excellent webhook security with deduplication
   - Proper tenant validation from metadata
   - Signature verification
   - SECURITY FIX comments: ST2, ST8, WH2-WH3, AE7

2. **Venue-Content Controller**:
   - Consistent tenant isolation throughout
   - All service calls include tenantId

3. **Settings Controller Audit Logging**:
   - Comprehensive audit trails for both success and failure
   - Uses auditService properly

4. **Integrations Controller Credential Masking**:
   - Sensitive data properly masked in responses
   - FIXED comment indicates security improvement

5. **Schema Validation**:
   - Where present, uses proper schema validation
   - Settings controller SECURITY FIX RD1

---

## INTEGRATION TEST COVERAGE

Controllers are tested via route integration tests. Each route test file covers the corresponding controller methods.

**Recommended Integration Test Focus Areas:**

1. **Tenant Isolation Tests**: Verify cross-tenant access prevention
2. **Authentication/Authorization Tests**: Verify proper middleware enforcement
3. **Service Integration Tests**: Verify correct parameters passed to services
4. **Error Handling Tests**: Verify consistent error responses
5. **Input Validation Tests**: Verify schema validation enforcement
6. **Proxy Security Tests**: Verify analytics/compliance proxy security
7. **Webhook Tests**: Verify deduplication and tenant validation

**Critical Test Scenarios:**

- Cross-tenant venue access attempts
- Direct database access vs service layer patterns
- Missing tenantId parameter propagation
- Proxy endpoint authentication
- Webhook replay attacks
- Credential exposure in responses
