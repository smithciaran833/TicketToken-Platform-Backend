# VENUE SERVICE - INTEGRATION TEST MATRIX

> **Purpose:** Complete test specification for venue-service integration tests
> **Total Test Files:** 25
> **Total Tests:** ~1,285
> **Status:** Planning Phase
> **References:** Analysis docs in `docs/integration-analysis/`

---

## OVERVIEW

This document maps all integration test files needed for venue-service based on comprehensive analysis of:
- controllers-analysis.md
- middleware-analysis.md
- models-analysis.md
- routes-analysis.md
- schemas-analysis.md
- services-core-analysis.md
- services-external-analysis.md
- services-support-analysis.md

Each test file validates complete flows from HTTP request → middleware → controller → service → database → cache → external services.

---

## TEST FILE 1: venue-lifecycle.integration.test.ts

**Source Docs:** controllers-analysis.md, services-core-analysis.md, models-analysis.md
**Priority:** CRITICAL
**Estimated Tests:** 120

### Venue Creation (30 tests)
- Create venue with all required fields (name, email, address, capacity, type)
- Database: Venues table INSERT with tenant_id, created_by, timestamps
- Database: UUID generated for venue_id
- Database: Default values applied (status=ACTIVE, is_verified=false, royalty_percentage=2.50)
- Database: Transaction wraps venue + staff + settings creation
- Database: Venue_staff INSERT (role=owner, user_id=creator)
- Database: Venue_settings INSERT with defaults
- Database: Foreign key constraints enforced (tenant_id, created_by)
- Database: Unique constraint (slug per tenant)
- Database: Transaction COMMIT on success
- Database: Transaction ROLLBACK on staff creation failure
- Database: Transaction ROLLBACK on settings creation failure
- Cache: Set at `venue:tenant:{tenantId}:{venueId}:details` with TTL 300s
- Event: Published to RabbitMQ (venue.created, includes tenant_id)
- Event: Search sync message sent
- Audit: Log entry created (action='venue_created')
- Validation: Required fields enforced (name, email, address)
- Validation: Email format validated
- Validation: Capacity bounds (1-1,000,000)
- Validation: Venue type enum (22 types)
- Validation: Address validation (object or flat fields)
- Validation: Phone pattern validated
- Validation: Slug format (lowercase, numbers, hyphens only)
- Error: Duplicate venue name in same tenant (409)
- Error: Invalid tenant_id format (401)
- Error: Missing required fields (400)
- Error: Invalid capacity value (400)
- Response: 201 status code
- Response: Venue object with id, tenant_id matches JWT
- Response: Default values in response

### Venue Search & Filtering (35 tests)
- Search venues by name (query param: search)
- Filter by type (comedy_club, theater, arena, etc.)
- Filter by city
- Filter by state
- Filter by country
- Filter by capacity range (min_capacity, max_capacity_filter)
- Filter by features (array)
- Filter by is_verified (boolean)
- Combine multiple filters
- Pagination: limit (1-100, default 20)
- Pagination: offset (min 0, default 0)
- Sorting: by name (asc/desc)
- Sorting: by created_at (asc/desc)
- Sorting: by capacity (asc/desc)
- Sorting: by rating (asc/desc)
- Tenant isolation: Only returns venues for authenticated user's tenant
- Tenant isolation: Search doesn't return cross-tenant results
- my_venues filter: Returns only user's owned venues when true
- my_venues filter: Requires authentication
- Performance: Search with 1000+ venues
- Performance: Complex filter combinations
- Validation: Invalid sort_by rejected (400)
- Validation: Invalid sort_order rejected (400)
- Validation: Limit exceeds 100 rejected (400)
- Validation: Negative offset rejected (400)
- Response: 200 with venues array
- Response: Pagination metadata (limit, offset, total)
- Response: Empty array when no results
- Error: Search without auth returns public venues only
- Error: Invalid filter values (400)
- Edge case: Search with special characters
- Edge case: Search with Unicode (emoji, multi-byte)
- Edge case: Empty search string
- Edge case: Very long search string (>100 chars) rejected
- Cache: Search results not cached (or cache key includes all params)

### Venue Update (25 tests)
- Update venue name
- Update venue type
- Update capacity
- Update address (full object)
- Update address (flat fields)
- Update settings object
- Partial update (only provided fields changed)
- Database: UPDATE venues table
- Database: updated_at timestamp changed
- Database: created_at timestamp unchanged
- Tenant validation: Can only update own tenant's venues
- Ownership validation: Only owner can update
- Cache invalidation: `venue:tenant:{tenantId}:{venueId}:*` cleared
- Cache invalidation: All venue-related caches cleared
- Event: Published to RabbitMQ (venue.updated, includes changes + tenant_id)
- Audit: Log entry (action='venue_updated', includes changes)
- Validation: Schema validation on update
- Validation: Null/empty string handling (allow('', null) fields)
- Error: Venue doesn't exist (404)
- Error: Not venue owner (403)
- Error: Cross-tenant update attempt (403)
- Error: Invalid field values (400)
- Response: 200 with updated venue object
- Response: Changes reflected in response
- Optimistic locking: Concurrent updates don't overwrite (test race condition)

### Venue Soft Delete (20 tests)
- Delete venue (soft delete: deleted_at timestamp)
- Database: UPDATE venues SET deleted_at=NOW()
- Database: Record still in table (not hard deleted)
- Database: Subsequent queries exclude deleted (whereNull('deleted_at'))
- Business rule: Cannot delete venue with active events
- Business rule: 90-day retention period
- Ownership validation: Only owner can delete
- Tenant validation: Can only delete own tenant's venues
- Cache invalidation: All venue caches cleared
- Event: Published to RabbitMQ (venue.deleted, includes tenant_id)
- Audit: Log entry (action='venue_deleted')
- Error: Venue has active events (400)
- Error: Venue doesn't exist (404)
- Error: Not venue owner (403)
- Error: Cross-tenant delete attempt (403)
- Response: 204 no content
- Soft delete: Can query with deleted records (admin view)
- Soft delete: Regular queries exclude deleted
- Soft delete: Deleted venues don't appear in search
- Soft delete: Can be recovered within 90 days

### Cascade Delete Effects (10 tests)
- Staff records: Check venue_staff after venue delete
- Settings records: Check venue_settings after venue delete
- Integration records: Check venue_integrations after venue delete
- Content records: Check MongoDB venue_contents after venue delete
- Reviews: Check impact on venue reviews
- Domains: Check custom_domains status
- Foreign key handling: Related records remain or cascade
- Orphan detection: Query for orphaned records
- Audit trail: Verify audit logs preserved
- Recovery: What data is recoverable

---

## TEST FILE 2: tenant-isolation.integration.test.ts

**Source Docs:** ALL analysis docs (cross-cutting concern)
**Priority:** CRITICAL
**Estimated Tests:** 80

### Cross-Tenant Venue Access (15 tests)
- Tenant A cannot GET Tenant B venue (/venues/:venueId) → 403
- Tenant A cannot PUT Tenant B venue → 403
- Tenant A cannot DELETE Tenant B venue → 403
- Tenant A cannot GET Tenant B capacity → 403
- Tenant A cannot GET Tenant B stats → 403
- Tenant A cannot check-access Tenant B venue → 403
- Tenant A search doesn't return Tenant B venues
- Tenant A list doesn't return Tenant B venues
- Tenant A my_venues doesn't return Tenant B associations
- Direct database query: Verify RLS filters by tenant_id
- Direct database query: Query without RLS context fails
- Response: 403 (not 404) to prevent venue ID enumeration
- Middleware: Tenant middleware sets RLS context correctly
- Middleware: RLS session variable `app.current_tenant_id` set
- Middleware: RLS context transaction-scoped

### Cross-Tenant Staff Access (10 tests)
- Tenant A cannot POST staff to Tenant B venue → 403
- Tenant A cannot GET Tenant B venue staff → 403
- Tenant A cannot access Tenant B staff details
- getUserVenues: Doesn't return cross-tenant associations
- Database: Queries filter by venue_id (implicit tenant via venue)
- Database: No direct tenant_id in venue_staff table (relies on venue)
- Cache: Staff cache keys include tenant_id
- Cache: Tenant A cannot access cached Tenant B staff data
- Error: Proper error messages (no info leakage)
- Audit: Cross-tenant attempts logged

### Cross-Tenant Settings Access (5 tests)
- Tenant A cannot GET Tenant B venue settings → 403
- Tenant A cannot PUT Tenant B venue settings → 403
- Database: Direct query bypasses service (controllers-analysis.md issue)
- Database: No tenant_id filter on settings query (CRITICAL BUG)
- Verify: Settings queries should filter by venue's tenant_id

### Cross-Tenant Integration Access (10 tests)
- Tenant A cannot GET Tenant B integrations → 403
- Tenant A cannot POST integration to Tenant B venue → 403
- Tenant A cannot PUT Tenant B integration → 403
- Tenant A cannot DELETE Tenant B integration → 403
- Tenant A cannot TEST Tenant B integration → 403
- Database: Integration queries missing tenant_id (services-external-analysis.md)
- Encryption: Tenant A cannot decrypt Tenant B credentials
- Response: Credentials masked in all responses
- Error: Proper 403 on cross-tenant access
- Audit: All integration access logged

### Cross-Tenant Content Access (MongoDB) (10 tests)
- Tenant A cannot POST content to Tenant B venue → 403
- Tenant A cannot GET Tenant B content by contentId → 403
- Tenant A cannot PUT Tenant B content → 403
- Tenant A cannot DELETE Tenant B content → 403
- Tenant A cannot PUBLISH Tenant B content → 403
- Tenant A cannot ARCHIVE Tenant B content → 403
- PostgreSQL: Venue ownership validated before MongoDB operation
- MongoDB: Content queries include tenant validation
- MongoDB: Content service validates all 14 methods
- MongoDB: No tenant_id field in schema (relies on venue validation)

### Cross-Tenant Review Access (5 tests)
- Tenant A cannot POST review to Tenant B venue → 403 (if auth added)
- Tenant A cannot PUT Tenant B review → 403
- Tenant A cannot DELETE Tenant B review → 403
- Review queries filter by venue (implicit tenant)
- Missing tenant validation in review service (controllers-analysis.md)

### Cross-Tenant Branding Access (5 tests)
- Tenant A cannot PUT Tenant B branding → 403 (if auth added)
- Tenant A cannot GET Tenant B branding config → 403
- Tenant A cannot change Tenant B pricing tier → 403
- Database: Branding queries filter by venue_id
- Currently NO AUTH on branding routes (routes-analysis.md CRITICAL)

### Cross-Tenant Domain Access (5 tests)
- Tenant A cannot POST domain to Tenant B venue → 403 (if auth added)
- Tenant A cannot VERIFY Tenant B domain → 403
- Tenant A cannot DELETE Tenant B domain → 403
- Tenant A cannot GET Tenant B domain status → 403
- Currently NO AUTH on domain routes (routes-analysis.md CRITICAL)

### Cross-Tenant Compliance Access (5 tests)
- Tenant A cannot GET Tenant B compliance report → 403
- Tenant A cannot trigger Tenant B compliance check → 403
- Compliance queries filter by venue_id
- Compliance reports include tenant_id
- Email notifications only to venue's staff

### Cross-Tenant Analytics Access (CRITICAL BUG) (5 tests)
- Tenant A CAN access Tenant B analytics (NO AUTH - prove the bug)
- Tenant A CAN proxy to Tenant B analytics service (prove the bug)
- Anonymous user CAN access any venue analytics (prove the bug)
- Verify: NO middleware on analytics proxy (routes-analysis.md)
- Expected: Should return 401/403, currently returns 200

### Cache Key Tenant Scoping (5 tests)
- Cache keys include tenant_id: `venue:tenant:{tenantId}:*`
- Tenant A cache operations don't affect Tenant B cache
- Cache get/set/delete scoped by tenant
- Idempotency keys scoped by tenant (currently NOT - middleware-analysis.md bug)
- Rate limit keys scoped by tenant

---

## TEST FILE 3: authentication-authorization.integration.test.ts

**Source Docs:** middleware-analysis.md, routes-analysis.md
**Priority:** CRITICAL
**Estimated Tests:** 90

### JWT Authentication (20 tests)
- Valid JWT token accepted
- JWT signature verification
- JWT issuer validation (iss claim vs JWT_ISSUER env)
- JWT audience validation (aud claim vs JWT_AUDIENCE env)
- JWT expiration checked (exp claim)
- User object attached to request (request.user)
- User properties: id, email, permissions, tenant_id
- Missing Authorization header → 401
- Invalid JWT signature → 401
- Expired JWT → 401
- Wrong issuer → 401
- Wrong audience → 401
- Malformed JWT → 401
- JWT without tenant_id claim → 401
- Token from different service (wrong audience) → 401
- Response: Proper 401 error format
- Error: No stack trace in production
- Timing: JWT verification timing consistent (no timing attacks)
- Cache: No caching of JWT validation results
- Audit: Failed auth attempts logged

### API Key Authentication (15 tests)
- Valid API key in x-api-key header accepted
- API key SHA-256 hash lookup in database
- API key is_active checked
- API key expires_at checked (not expired)
- API key cached (5 min TTL)
- Cache hit: API key lookup uses Redis
- Cache miss: API key lookup hits database then caches
- User object populated from API key's user_id
- Tenant_id from user record
- Invalid API key → 401
- Expired API key → 401
- Inactive API key (is_active=false) → 401
- Missing x-api-key header (fallback to JWT)
- Timing attack: Hash lookup vs plaintext fallback (middleware-analysis.md issue)
- Cache poisoning: Disabled API key cached for 5 min (middleware-analysis.md issue)

### Token Expiration & Refresh (10 tests)
- Access token expires after configured duration
- Expired access token returns 401
- Refresh token flow (if implemented in venue-service)
- Session continuation after token refresh
- Multiple simultaneous requests with expiring token
- Token renewal doesn't interrupt operations
- Old token invalidated after refresh
- New token has updated expiration
- Refresh token only valid once
- Refresh token expiration

### Middleware Execution Order (10 tests)
- Correlation middleware runs first (sets correlation ID)
- Load shedding runs before auth (reject early if overloaded)
- Rate limiting runs before auth (prevent brute force)
- Auth middleware runs before tenant
- Tenant middleware runs after auth (needs user for tenant_id)
- Validation middleware runs after tenant
- Middleware chain completes in order
- Error in early middleware stops chain
- Response headers include correlation ID
- Wrong order breaks functionality (test misconfiguration)

### Rate Limiting (15 tests)
- Global rate limit enforced
- Per-tenant rate limit enforced
- Per-user rate limit enforced
- Per-venue rate limit enforced (venue-specific endpoints)
- Per-operation rate limit enforced (POST vs GET different limits)
- Window-based counting (fixed window)
- Rate limit exceeded → 429
- X-RateLimit-Limit header present
- X-RateLimit-Remaining header accurate
- X-RateLimit-Reset header (ISO timestamp)
- Retry-After header on 429 (seconds)
- Rate limits reset after window expires
- Redis unavailable: Fails open (allows requests - middleware-analysis.md issue)
- Window boundary race condition: 2x requests possible (middleware-analysis.md issue)
- Different tenants have independent rate limits

### Idempotency (15 tests)
- Idempotency-Key header required for POST/PUT/PATCH
- Request fingerprint calculated (SHA-256 of method + URL + body)
- Duplicate request returns cached response (200 with cached data)
- X-Idempotency-Replayed header on cache hit
- Same key with different payload → 422
- Concurrent requests with same key → 409 (still processing)
- Lock acquired before processing (Redis SETNX)
- Lock released after completion
- Lock TTL: 30 seconds
- Long-running requests (>30s) lose lock (middleware-analysis.md issue)
- Idempotency record TTL: 24 hours
- Key expiration: Can reuse after 24 hours
- Missing required key → 400
- Idempotency keys NOT scoped by tenant (collision risk - middleware-analysis.md CRITICAL)
- Memory: Idempotency records cleaned up after TTL

### API Versioning (5 tests)
- Version from URL path (/api/v1/venues)
- Version from api-version header
- Version from accept-version header
- Priority: URL > api-version header > accept-version header > default
- Unsupported version → 400 with supported versions list
- Deprecated version returns Deprecation header
- Deprecated version returns Sunset header (ISO date)
- Version-specific behavior (if implemented)
- Response: API-Version header in response
- Error: Unsupported version error format

---

## TEST FILE 4: staff-management.integration.test.ts

**Source Docs:** models-analysis.md, controllers-analysis.md
**Priority:** HIGH
**Estimated Tests:** 40

### Staff Addition (15 tests)
- Add staff with transaction (BEGIN → check → insert → COMMIT)
- Database: venue_staff INSERT with venue_id, user_id, role, permissions
- Transaction: Atomic check-then-insert
- Race condition: Two concurrent adds for same user → only one succeeds
- Race condition: Second request gets "already exists" error
- Staff limit: 50 staff per venue enforced
- Staff limit: Count query accurate under concurrent load
- Staff limit: 51st staff rejected (400)
- Reactivation: Deactivated staff (is_active=false) can be reactivated
- Reactivation: UPDATE instead of INSERT
- Reactivation: Role and permissions reset on reactivation
- Default permissions: Owner role gets wildcard '*'
- Default permissions: Manager role gets manager set
- Default permissions: Staff role gets staff set
- Custom permissions: Override defaults if provided

### Staff Roles & Permissions (10 tests)
- Owner role: Full access (wildcard permission)
- Manager role: Most access (specific permissions)
- Staff role: Limited access
- hasPermission check: Wildcard grants all
- hasPermission check: Specific permission matching
- hasPermission query: SELECT permissions WHERE user_id AND venue_id AND is_active
- Permission array stored as JSON
- Permission validation: Valid permission strings
- Error: Invalid role (400)
- Error: Invalid permission format (400)

### Staff Listing & Queries (8 tests)
- getVenueStaff: Returns all active staff
- getVenueStaff: Ownership verified before returning
- getVenueStaff: Includes user details (JOIN with users table)
- getVenueStaff: Ordered by role (owner, manager, staff)
- getStaffByRole: Filters by specific role
- getStaffByRole: Returns active staff only
- getUserVenues: Returns all venues where user is staff
- getUserVenues: Missing tenant_id filter (models-analysis.md issue)

### Staff Updates & Deactivation (7 tests)
- updateRole: Changes role and updates permissions
- updateRole: Can't demote owner (business logic)
- deactivateStaffMember: Sets is_active=false
- deactivateStaffMember: Doesn't hard delete record
- deactivateStaffMember: Can be reactivated later
- Deactivated staff: Don't count toward limit
- Deactivated staff: Don't appear in staff list

---

## TEST FILE 5: settings-management.integration.test.ts

**Source Docs:** models-analysis.md, controllers-analysis.md, schemas-analysis.md
**Priority:** HIGH
**Estimated Tests:** 35

### Settings Upsert with Transaction (10 tests)
- First creation: INSERT into venue_settings
- Subsequent update: UPDATE venue_settings
- Transaction: Upsert operation atomic
- Race condition: Concurrent updates don't cause lost updates
- Race condition: Either UPDATE or INSERT, never both
- Partial updates: Only provided fields changed
- Database: venue_id foreign key
- Database: max_tickets_per_order stored
- Database: service_fee_percentage stored
- Field mapping: Limited (only 3 fields persist - models-analysis.md issue)

### Settings Categories (20 tests)
- General: timezone (max 50 chars)
- General: currency (3 chars, ISO 4217 format but not validated against list)
- General: language (2 chars, ISO 639-1 format but not validated against list)
- General: dateFormat (max 20 chars)
- General: timeFormat ('12h' | '24h' enum)
- Ticketing: allowRefunds (boolean)
- Ticketing: refundWindow (0-720 hours)
- Ticketing: maxTicketsPerOrder (1-100)
- Ticketing: requirePhoneNumber (boolean)
- Ticketing: enableWaitlist (boolean)
- Ticketing: transferDeadline (0-168 hours)
- Notifications: emailEnabled (boolean)
- Notifications: smsEnabled (boolean)
- Notifications: webhookUrl (URI, allow empty)
- Notifications: notifyOnPurchase (boolean)
- Notifications: notifyOnRefund (boolean)
- Notifications: dailyReportEnabled (boolean)
- Branding: primaryColor (hex pattern /^#[0-9A-F]{6}$/i)
- Branding: secondaryColor (hex pattern)
- Branding: logo (URI, allow empty)
- Branding: emailFooter (max 500 chars)

### Validation & Error Handling (5 tests)
- Invalid currency format → 400
- Invalid language format → 400
- Invalid hex color → 400
- max_tickets_per_order out of range (1-100) → 400
- service_fee_percentage out of range (0-100) → 400

---

## TEST FILE 6: content-management.integration.test.ts

**Source Docs:** services-core-analysis.md, models-analysis.md
**Priority:** HIGH
**Estimated Tests:** 50

### Content Creation (PostgreSQL + MongoDB) (15 tests)
- PostgreSQL: Verify venue exists before MongoDB insert
- PostgreSQL: Verify venue.tenant_id matches request tenant_id
- PostgreSQL: Venue doesn't exist → 404
- PostgreSQL: Venue belongs to different tenant → 403
- MongoDB: INSERT with tenantId field
- MongoDB: venueId stored correctly
- MongoDB: contentType enum validated (11 types)
- MongoDB: status defaults to 'draft'
- MongoDB: displayOrder defaults to 0
- MongoDB: featured defaults to false
- MongoDB: version defaults to 1
- MongoDB: createdBy and updatedBy stored
- MongoDB: Timestamps automatic
- Error: PostgreSQL failure prevents MongoDB insert
- Error: MongoDB failure after PostgreSQL check (no rollback - mixed DB)

### Content Types (11 tests)
- SEATING_CHART content structure
- PHOTO content with media URLs
- VIDEO content with embed codes
- VIRTUAL_TOUR content
- AMENITIES list validation
- DIRECTIONS content
- PARKING_INFO structure
- ACCESSIBILITY_INFO structure
- POLICIES text content
- FAQ array structure
- Content type validation: Invalid type rejected

### Status Transitions (8 tests)
- draft → published (POST /:contentId/publish)
- published → archived (POST /:contentId/archive)
- Cannot publish without required fields
- Cannot archive non-published content
- Status change updates updatedBy
- Status change updates updatedAt
- Status validation: Invalid status rejected
- TTL: archivedAt timestamp set on archive

### Mixed Database Consistency (10 tests)
- PostgreSQL failure prevents MongoDB insert
- MongoDB failure doesn't leave orphan PostgreSQL data
- No distributed transaction (document limitation)
- Venue deletion: Content remains in MongoDB (orphan detection needed)
- Consistency check: Query orphaned content
- Recovery: Can we detect inconsistencies?
- Manual cleanup: Process for fixing orphans
- Content queries fail gracefully if venue deleted
- Error handling: Both database failures
- Transaction boundaries: What's atomic, what's not

### Tenant Isolation (6 tests)
- All 14 service methods require tenantId parameter
- validateTenantContext on all operations
- verifyVenueOwnership before MongoDB operations
- Tenant A cannot create content for Tenant B venue
- Tenant A cannot read Tenant B content by contentId
- Tenant A cannot update/delete Tenant B content

---

## TEST FILE 7: integration-management.integration.test.ts

**Source Docs:** services-external-analysis.md, schemas-analysis.md
**Priority:** HIGH
**Estimated Tests:** 45

### Integration Creation with Encryption (15 tests)
- Encryption: AES-256-GCM algorithm
- Encryption: 32-byte key from CREDENTIALS_ENCRYPTION_KEY env
- Encryption: Random 16-byte IV per encryption
- Encryption: 16-byte auth tag for integrity
- Encryption: Format base64(IV + AuthTag + EncryptedData)
- Encryption: Round-trip (encrypt → decrypt → original data)
- Encryption: Missing key → error on startup
- Encryption: Invalid key format → error on startup
- Encryption: Tampered ciphertext detected (auth tag fails)
- Database: encrypted_credentials stored
- Database: tenant_id stored
- Database: Composite unique (venue_id, integration_type)
- Duplicate integration → 409 (Postgres error code 23505)
- Field mapping: type/integration_type inconsistency
- Field mapping: config/config_data inconsistency

### Provider-Specific Validation (20 tests)
- Stripe: apiKey required, secretKey required
- Stripe: webhookSecret optional, accountId optional
- Stripe: Schema validation with stripUnknown
- Square: accessToken required, applicationId required
- Square: locationId optional, environment enum
- Toast: clientId required, clientSecret required
- Toast: restaurantGuid optional
- Mailchimp: apiKey required, serverPrefix required
- Mailchimp: listId optional
- Twilio: accountSid required, authToken required
- Twilio: phoneNumber optional
- Invalid provider → 400
- Wrong credentials for provider → 400
- Missing required credentials → 400
- Unknown properties stripped (stripUnknown: true)
- Config: webhookUrl (URI)
- Config: apiVersion (max 50 chars)
- Config: environment enum (sandbox/production)
- Config: features array (max 20 items, max 100 chars each)
- Config: enabled (boolean)

### Integration Testing & Management (10 tests)
- testIntegration: Decrypts credentials
- testIntegration: Calls provider test API (mocked)
- testIntegration: Validates tenant ownership first
- getDecryptedCredentials: Validates tenant before decrypt
- getDecryptedCredentials: Never logs decrypted credentials
- Update integration: Config without re-encrypting credentials
- Update integration: Credentials with re-encryption
- Update integration: Status (active/inactive)
- Delete integration: Soft delete (is_active=false)
- Response masking: Credentials masked ('***') in all responses

---

## TEST FILE 8: verification-workflows.integration.test.ts

**Source Docs:** services-external-analysis.md
**Priority:** MEDIUM
**Estimated Tests:** 40

### Verification Types (10 tests)
- Business info verification
- Tax ID verification (masking last 4 only in display)
- Bank account verification (Plaid integration)
- Identity verification (Stripe Identity integration)
- Document submission (with tenant_id)
- Manual review fallback (when adapters fail)
- External verifications table (includes tenant_id)
- Manual review queue (includes tenant_id)
- Verification status aggregation
- Venue is_verified flag update

### Stripe Identity Adapter (10 tests)
- POST /identity/verification_sessions API call
- Authorization: Bearer {STRIPE_SECRET_KEY}
- Timeout: 30s
- Returns verification session URL
- checkStatus polls for completion
- Tenant_id stored in external_verifications
- Error: API timeout
- Error: Invalid credentials
- Error: API error response
- Fallback: Manual review on adapter failure

### Plaid Adapter (10 tests)
- POST /link/token/create API call
- POST /item/public_token/exchange
- POST /auth/get (bank account details)
- Headers: PLAID-CLIENT-ID, PLAID-SECRET
- Timeout: 30s
- Sandbox vs Production URLs
- Webhook: {API_BASE_URL}/webhooks/plaid
- Tenant_id stored in external_verifications
- Error: API failures
- Fallback: Manual review

### Tenant Isolation & Error Handling (10 tests)
- validateTenantContext on all public methods
- verifyVenueOwnership before operations
- All database queries filter by tenant_id
- Dynamic adapter imports (try-catch on import failures)
- Adapter failures caught, fallback to manual
- Venue doesn't exist → 404
- Not venue owner → 403
- Missing verification type → 400
- Document submission with placeholder (if no URL)
- Verification status check with tenant validation

---

## TEST FILE 9: onboarding-process.integration.test.ts

**Source Docs:** services-core-analysis.md
**Priority:** MEDIUM
**Estimated Tests:** 45

### 5-Step Onboarding Flow (25 tests)
- Step 1 (basic-info): name, type, capacity required
- Step 1: UPDATE venues, mark step complete
- Step 2 (address): street, city, state, zipCode, country required
- Step 2: UPDATE venues, mark step complete
- Step 3 (layout): OPTIONAL, INSERT venue_layouts
- Step 3: Mark step complete
- Step 4 (payment): REQUIRED, INSERT venue_integrations
- Step 4: Validate integration provider (Stripe/Square)
- Step 4: Encrypt credentials
- Step 4: Mark step complete
- Step 5 (staff): OPTIONAL, INSERT venue_staff
- Step 5: Check staff limits (50)
- Step 5: Prevent duplicate staff
- Step 5: Mark step complete
- Progress calculation: (completed / total) percentage
- Progress with optional steps: Accurate even when skipped
- Required steps: basic-info, address, payment must complete
- Optional steps: layout, staff can be skipped
- Completion flag: Set when all required done
- Completion timestamp: onboarding.completed_at set
- Can complete in any order (but required must be done)
- GET /onboarding/status: Shows current state
- Step dependencies: None enforced (can do out of order)
- Invalid step name → 400
- Missing required data for step → 400

### Tenant Validation (10 tests)
- Every step validates tenant ownership
- Step 1: validateTenantContext + verifyVenueOwnership
- Step 2: validateTenantContext + verifyVenueOwnership
- Step 3: validateTenantContext + verifyVenueOwnership
- Step 4: validateTenantContext + verifyVenueOwnership
- Step 5: validateTenantContext + verifyVenueOwnership
- Cross-tenant onboarding blocked on all steps
- Tenant_id in validateTenantContext with UUID validation
- All database queries filter by tenant_id (via venue_id)
- Venue ownership verified before each step

### Transaction Issues (10 tests - testing the BUG)
- Step 1: UPDATE not wrapped in transaction
- Step 2: UPDATE not wrapped in transaction
- Step 3: INSERT layout + UPDATE venue not atomic
- Step 3: Partial failure leaves layout but onboarding not updated
- Step 4: INSERT integration + UPDATE venue not atomic
- Step 4: Partial failure leaves integration but onboarding not updated
- Step 5: INSERT staff + UPDATE venue not atomic
- Race condition: Two steps submitted simultaneously (no transaction protection)
- Error recovery: No rollback mechanism
- Manual cleanup: Required after partial failures

---

## TEST FILE 10: stripe-connect.integration.test.ts

**Source Docs:** services-external-analysis.md, controllers-analysis.md
**Priority:** HIGH
**Estimated Tests:** 50

### Stripe Account Creation (15 tests)
- Circuit breaker wraps stripe.accounts.create()
- Idempotency key: `connect-create:{venueId}`
- Account metadata includes venue_id and tenant_id
- API version locked: '2025-12-15.clover'
- Database UPDATE: stripe_connect_account_id stored
- Database UPDATE: stripe_connect_status = 'pending'
- Database UPDATE: stripe_connect_charges_enabled = false
- Database UPDATE: stripe_connect_payouts_enabled = false
- accountLinks.create() called
- Idempotency key: `connect-link:{venueId}:{timestamp}`
- Return URL and refresh URL passed
- accounts.retrieve() gets account status
- Error: Stripe API timeout (30s)
- Error: Stripe API error response
- Error: Invalid email format → 400

### Circuit Breaker (10 tests)
- Circuit breaker: 'stripe-circuit'
- Threshold: 5 failures
- Reset timeout: 30000ms
- Circuit OPEN after 5 failures → 503
- Circuit HALF-OPEN after reset timeout
- Circuit CLOSED after successful call
- Failure count tracked
- Last failure timestamp recorded
- Error response when circuit open
- Circuit state transitions

### Webhook Processing (15 tests)
- Signature verification (Stripe-Signature header)
- Invalid signature → 400
- Event ID deduplication (check venue_webhook_events)
- Duplicate event returns 200 {duplicate: true}
- Tenant_id extracted from event.metadata.tenant_id
- Venue_id extracted from event.metadata.venue_id
- Validate venue.tenant_id matches event.metadata.tenant_id
- Webhook with wrong tenant_id → rejected
- Webhook for non-existent venue → rejected
- Status tracking: pending → processing → completed
- Database UPDATE: stripe_connect_details_submitted
- Database UPDATE: stripe_connect_capabilities (JSON)
- Database UPDATE: stripe_connect_country
- Database UPDATE: stripe_connect_onboarded_at timestamp
- Mark webhook processed in venue_webhook_events

### Idempotency & Error Handling (10 tests)
- Same idempotency key returns cached Stripe response
- Different payload with same key → conflict
- Idempotency keys scoped by venue
- Redis stores idempotency records (24h TTL)
- Database update failure after Stripe success (no rollback to Stripe!)
- Webhook processing failure (retry logic)
- Circuit breaker open → 503
- Missing venue ownership → 403
- Non-HTTPS URLs → 400
- Tenant isolation: TenantA cannot onboard TenantB venue

---

## TEST FILE 11: domain-verification.integration.test.ts

**Source Docs:** services-support-analysis.md
**Priority:** MEDIUM
**Estimated Tests:** 40

### Domain Addition (15 tests)
- Domain format validation: `/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i`
- tickettoken.com domain blocked
- Subdomain of tickettoken.com blocked
- Tier validation: Check venue pricing tier
- Tier validation: Free tier cannot add domains → 403
- Domain limit: Count active domains per venue
- Domain limit: Exceeds tier limit → 403
- Verification token: crypto.randomBytes(32).toString('hex')
- Database INSERT: custom_domains (domain, venue_id, tenant_id, verification_token, status='pending')
- Required DNS records: Stored as JSON
- Tenant validation: Verify venue ownership before add
- Error: Invalid domain format → 400
- Error: Domain already exists → 409
- Response: Return verification instructions
- Response: Verification token exposed (should be internal only - issue)

### DNS Verification (15 tests)
- Uses Node dns.promises.resolveTxt()
- Looks for TXT record at domain
- Expected format: `tickettoken-verify={verification_token}`
- TXT record match → verification success
- TXT record mismatch → verification failure
- DNS lookup error → verification failure
- Database UPDATE: status='verified', verified_at=NOW()
- Database UPDATE: error_message on failure
- Update venues.custom_domain if primary
- DNS lookup timeout: NONE (BUG - could hang indefinitely)
- No timeout configured (services-support-analysis.md issue)
- CNAME record: Documented but not verified
- Tenant validation: Verify venue ownership before verify
- Error: Domain doesn't exist → 404
- Response: Verification result

### SSL Certificate (MOCKED - BUG) (10 tests)
- Check domain is verified first
- Mock Let's Encrypt request (NO ACTUAL API CALL)
- Database UPDATE: ssl_status='active'
- Database UPDATE: ssl_issued_at=NOW()
- Database UPDATE: ssl_expires_at=NOW() + 90 days
- Database UPDATE: ssl_auto_renew=true
- SSL expiry: Set to 90 days but never renewed
- No actual certificate generated (CRITICAL BUG)
- HTTPS will NOT work in production
- Document: Mock implementation, needs real Let's Encrypt integration

---

## TEST FILE 12: branding-css.integration.test.ts

**Source Docs:** services-support-analysis.md
**Priority:** HIGH (CSS injection vulnerability)
**Estimated Tests:** 35

### Tier Validation (5 tests)
- Query: SELECT pricing_tier FROM venues
- Check: Tier supports white-label branding
- Free tier cannot customize branding → 403
- Premium/Enterprise tier can customize
- Tier downgrade removes custom branding

### Color Validation (5 tests)
- Hex color pattern: `/^#[0-9A-F]{6}$/i`
- primaryColor validated
- secondaryColor validated
- accentColor validated
- Invalid hex rejected → 400

### CSS Injection Vulnerability (CRITICAL - 10 tests)
- custom_css field accepts arbitrary CSS
- NO sanitization before storage
- NO sandboxing on render
- XSS possible via CSS expressions
- UI manipulation via injected styles
- JavaScript injection via CSS url()
- Attack: `custom_css: "body { background: url('javascript:alert(1)') }"`
- Attack: `custom_css: "* { display: none !important }"`
- Attack: CSS import external malicious stylesheet
- Document: CRITICAL vulnerability, needs CSP and sanitization

### URL Validation (Missing - 5 tests)
- logoUrl not validated (could be malformed/malicious)
- faviconUrl not validated
- No content-type check (could be executable)
- No file size limits
- No URL whitelist

### Database & Caching (10 tests)
- INSERT if branding doesn't exist
- UPDATE if branding exists
- Upsert pattern
- venue_id foreign key
- Field mapping: snake_case ↔ camelCase (brittle)
- generateCssVariables creates CSS file
- No escaping of special characters in CSS generation
- CSS served at GET /branding/:venueId/css (Content-Type: text/css)
- No Redis caching (should cache with 1h TTL)
- Default branding if none configured

---

## TEST FILE 13: compliance-system.integration.test.ts

**Source Docs:** services-support-analysis.md
**Priority:** MEDIUM
**Estimated Tests:** 55

### Data Protection Category (8 tests)
- GDPR compliance check: settings.gdpr.enabled
- GDPR: Privacy policy URL required
- GDPR enabled without URL → fail
- Data retention policy check: retention days configured
- No retention policy → warning
- Data encryption check (assumed, not verified in code)
- Transit encryption check (HTTPS)
- All checks have severity: critical/high/medium/low

### Age Verification Category (5 tests)
- Query: SELECT type FROM venues
- If type IN ('bar', 'nightclub', 'casino'): age verification required
- Check: settings.ageVerification.enabled
- Age-restricted venue without verification → critical fail
- Verification method validation: id_scan, manual, third_party

### Accessibility Category (3 tests)
- Wheelchair accessibility flag: settings.accessibility.wheelchairAccessible
- Not specified → warning
- Accessibility features documented: venue.accessibility_features array
- No info provided → suggestion

### Financial Reporting Category (5 tests)
- Tax reporting: tax_id exists → critical
- No tax ID → critical fail
- Payout compliance: Payment provider configured (Stripe/Square)
- Query: SELECT * FROM venue_integrations WHERE integration_type IN ('stripe', 'square')
- Provider is active
- No payment provider → warning

### Licensing Category (5 tests)
- Business license: SELECT * FROM venue_documents WHERE document_type='business_license' AND status='approved'
- License exists and approved
- No license → critical fail
- License pending → warning
- Entertainment license: Required for comedy_club, theater
- Missing for required type → fail

### Report Generation (10 tests)
- Aggregate all check results
- Determine category statuses: compliant/non_compliant/review_needed
- Calculate overall status (worst of all categories)
- Generate prioritized recommendations
- INSERT INTO venue_compliance_reports (report_json, created_at)
- Set due dates by severity: critical=7d, high=30d, medium=60d, low=90d
- Next review: NOW() + 90 days
- INSERT INTO venue_compliance_reviews (scheduled_date, status='pending')
- UPDATE venues SET onboarding.compliance_last_reviewed=NOW()
- No caching (expensive to regenerate - should cache)

### Notification System (9 tests)
- Get staff emails: SELECT email FROM users JOIN venue_staff
- Filter by role IN ('owner', 'admin')
- INSERT INTO notifications (type='compliance_critical')
- INSERT INTO email_queue (template='compliance-alert')
- Email queue failures logged but don't block
- No notification retry mechanism (issue)
- Settings changes trigger immediate review
- Notification sent on settings change
- Compliance report notifications

### Tier Changes (10 tests)
- Query: SELECT tier FROM white_label_pricing
- Check: New tier supports required features
- UPDATE venues SET pricing_tier=?
- INSERT INTO venue_tier_history (reason, changed_by)
- If custom_domain: UPDATE custom_domains SET status='suspended'
- No transaction wrapping (partial state possible - issue)
- No proactive notification to user (issue)
- Tier downgrade affects domain
- Branding removed on downgrade
- Feature access changes

---

## TEST FILE 14: resale-anti-scalping.integration.test.ts

**Source Docs:** services-core-analysis.md
**Priority:** MEDIUM
**Estimated Tests:** 55

### Jurisdiction Price Caps - US States (10 tests)
- Connecticut (CT): Face value only, no markup
- Louisiana (LA): Face value only
- Michigan (MI): Face value only
- Minnesota (MN): Face value only
- New York (NY): No price cap
- Other states: No restrictions
- Price above face value in CT → rejected
- Price above face value in LA → rejected
- Price above face value in MI → rejected
- Price above face value in MN → rejected

### Jurisdiction Price Caps - EU (8 tests)
- France (FR): Face value only
- Italy (IT): Face value only
- Belgium (BE): Face value only
- United Kingdom (UK): Face value + 10% allowed
- Germany (DE): Platform-specific rules
- Other EU: No restrictions
- Price above face value in FR → rejected
- Price above face value + 10% in UK → rejected

### Anti-Scalping Detection (12 tests)
- High volume purchases: >10 tickets per event
- Query: SELECT COUNT(*) FROM ticket_purchases WHERE user_id=? AND event_id=?
- >10 tickets = medium risk
- Elevated resale activity: Count resales in last 30 days
- Query: SELECT COUNT(*) FROM resale_policies WHERE seller_id=? AND created_at > NOW() - INTERVAL '30 days'
- >5 resales = low risk, >10 = medium, >20 = high
- Price markup patterns: (resale_price - face_value) / face_value * 100
- 50-100% markup = medium risk
- >100% markup = high risk (excessive)
- Quick flip: Time between purchase and listing
- <24 hours = high risk
- <7 days = medium risk

### Fraud Detection (15 tests)
- Same device check: Compare buyer and seller device_id
- Query: SELECT device_id FROM user_devices WHERE user_id=?
- Same device = critical risk (collusion/self-dealing)
- Suspicious pricing: <50% of face value
- Below-market pricing = suspicious (laundering/fraud)
- New account selling: Account age <7 days
- Query: SELECT created_at FROM users WHERE id=?
- New account = high risk
- High velocity: >10 sales in 1 hour
- Query: SELECT COUNT(*) FROM resale_policies WHERE seller_id=? AND created_at > NOW() - INTERVAL '1 hour'
- High velocity = critical risk
- IP reputation: Query suspicious_ips table
- Known bad IP = critical risk
- Pattern matching: Query fraud_patterns table
- Pattern matching on behavior

### Risk Scoring & Database Issues (10 tests)
- Combine all signals for risk score
- Risk levels: low/medium/high/critical
- Scoring algorithm documented
- Return risk level with reasons
- Transfer counting NOT atomic (race condition - CRITICAL)
- No transaction wrapping (BUG)
- Concurrent transfers could bypass limits
- No locking on count queries
- Two simultaneous transfers both succeed (test the race)
- Audit: INSERT INTO fraud_logs (risk_level, reasons)

---

## TEST FILE 15: event-publishing.integration.test.ts

**Source Docs:** services-external-analysis.md
**Priority:** MEDIUM
**Estimated Tests:** 40

### Event Message Structure (10 tests)
- eventType field: 'venue.created', 'venue.updated', 'venue.deleted'
- aggregateId = venueId
- aggregateType = 'venue'
- payload contains venue data
- metadata.userId present
- metadata.tenantId present (FIXED)
- metadata.timestamp present
- metadata.correlationId present
- metadata.version present
- Message structure validation

### Exchange & Routing (10 tests)
- Exchange name: 'venue-events'
- Exchange type: 'topic'
- Exchange durable: true
- Exchange created on startup
- Routing key: 'venue.created'
- Routing key: 'venue.updated'
- Routing key: 'venue.deleted'
- Routing key format for topic exchange
- Message persistence: {persistent: true}
- Messages survive broker restart

### Circuit Breaker (10 tests)
- Name: 'rabbitmq-publish'
- Timeout: 2000ms
- Error threshold: 50%
- Reset timeout: 30000ms
- Circuit opens after threshold failures
- Circuit half-opens after reset timeout
- Circuit closes after successful publish
- Failure count tracked
- Last failure timestamp recorded
- Error response when circuit open

### Connection & Error Handling (10 tests)
- Auto-reconnect on connection error
- Auto-reconnect on connection close
- Reconnection attempts logged
- Connection failure during publish (graceful degradation)
- isConnected flag checked before publish
- Skip publish if not connected (silent)
- Search sync integration: publishSearchSync() called
- Search sync includes tenant_id (FIXED)
- Event publishing failures logged but not surfaced (fire-and-forget)
- No retry mechanism (events can be lost - ISSUE)

---

## TEST FILE 16: webhook-deduplication.integration.test.ts

**Source Docs:** services-external-analysis.md
**Priority:** MEDIUM
**Estimated Tests:** 30

### Signature Verification (5 tests)
- Stripe-Signature header required
- Format: `t={timestamp},v1={signature}`
- HMAC-SHA256 validation
- Webhook secret from config
- Invalid signature → 400
- Missing signature → 400
- Timestamp tolerance (5 minutes)

### Event Deduplication (10 tests)
- event_id extracted from webhook body
- SELECT from venue_webhook_events by event_id
- Duplicate returns early (200 {duplicate: true})
- Idempotent processing
- Headers hash: SHA-256 of all headers
- Headers hash stored in headers_hash column
- Headers hash prevents replay with different headers
- Distributed lock: Redis SETNX `webhook:lock:{event_id}`
- Lock TTL: 30000ms (30 seconds)
- Concurrent webhooks → 409 (still processing)

### Status Tracking & Retry (10 tests)
- Status: pending → processing → completed
- Status: failed (on error)
- Status: retrying (on retry)
- processing_started_at timestamp
- processing_completed_at timestamp
- processed_at timestamp
- Retry: Max 3 attempts
- Retry: 5 minute cooldown between retries
- retry_count incremented
- last_retry_at timestamp

### Tenant Validation & Cleanup (5 tests)
- tenant_id extracted from event metadata
- venue_id extracted from event metadata
- Validate venue.tenant_id matches event.metadata.tenant_id
- Wrong tenant_id → rejected
- cleanupOldEvents: DELETE WHERE created_at < NOW() - INTERVAL '30 days'
- Retention: Default 30 days
- Cleanup keeps pending/processing/retrying events

---

## TEST FILE 17: cache-invalidation.integration.test.ts

**Source Docs:** services-support-analysis.md, services-core-analysis.md
**Priority:** MEDIUM
**Estimated Tests:** 35

### Cache Keys & Patterns (10 tests)
- Pattern: `venue:tenant:{tenantId}:{venueId}:details`
- Pattern: `venue:tenant:{tenantId}:{venueId}:stats`
- Pattern: `venue:tenant:{tenantId}:{venueId}:staff`
- Pattern: `venue:tenant:{tenantId}:{venueId}:events`
- Pattern: `venue:tenant:{tenantId}:{venueId}:settings`
- All keys include tenant_id
- Wildcard match: `venue:tenant:{tenantId}:{venueId}:*`
- Cross-tenant cache isolation
- Legacy pattern support during migration
- Pattern deletion: Redis SCAN (batch 100)

### Invalidation Triggers (15 tests)
- Venue updated → clear venue cache
- Venue deleted → clear venue cache
- Venue created → set cache (FIXED)
- Staff added → clear staff cache
- Staff updated → clear staff cache
- Staff removed → clear staff cache
- Settings updated → clear settings cache
- Integration added → NO cache clear (MISSING)
- Integration updated → NO cache clear (MISSING)
- Content added → NO cache clear (MISSING)
- Content updated → NO cache clear (MISSING)
- Branding updated → NO cache clear (CRITICAL - stale data)
- Compliance report → NO cache clear (MISSING)
- Batch invalidation: clearTenantVenueCache(tenantId)
- clearVenueCache: Pattern match and delete all related keys

### Stale Data Scenarios (5 tests)
- Branding updated but cached branding still served
- Integration status changed but cached integration shown
- Content published but cached as draft
- Compliance status changed but cached status shown
- Settings changed but old settings in cache

### getOrSet Pattern & Errors (5 tests)
- Check cache first (GET)
- Cache miss → call fetcher function
- Store result in cache (fire-and-forget SET)
- Cache write failures silent (ISSUE - could hide problems)
- Repeatedly missing cache if writes fail

---

## TEST FILE 18: file-uploads.integration.test.ts

**Source Docs:** Routes analysis (mentions photo uploads), general requirements
**Priority:** HIGH
**Estimated Tests:** 40

### Photo Upload Flow (15 tests)
- POST /venues/:venueId/photos (multipart/form-data)
- Auth + Tenant middleware required
- File size validation (max 10MB)
- Content-type validation (image/jpeg, image/png, image/gif, image/webp)
- File too large → 413 (Payload Too Large)
- Invalid content-type → 400
- Virus scan (ClamAV or similar)
- Malicious file detected → 400
- Upload to S3 or local storage
- Generate thumbnail (200x200, 400x400)
- INSERT into venue_photos or UPDATE venue.image_gallery array
- Return photo URL
- S3 upload failure → 500
- Concurrent uploads (multiple files)
- Tenant isolation: Storage paths include tenant_id

### Document Upload Flow (10 tests)
- Business license upload
- Tax ID document upload
- Entertainment license upload
- File size limits (max 50MB for PDFs)
- Content-type: application/pdf, image/jpeg, image/png
- INSERT into venue_documents (venue_id, tenant_id, document_type, url, status='pending')
- Document approval workflow
- Virus scanning on documents
- Storage: S3 with encryption at rest
- Tenant isolation in document storage

### Seating Chart & Logo Uploads (10 tests)
- Seating chart image upload
- Interactive seating chart JSON upload
- Logo upload for branding (venue.logo_url)
- Favicon upload (venue.favicon_url)
- Image optimization (resize, compress)
- CDN integration (CloudFront, Cloudflare)
- Image URL returned in response
- Old image cleanup when replaced
- Tenant isolation in image storage
- Error: Upload failure (storage unavailable)

### Error Scenarios (5 tests)
- Disk full (local storage)
- S3 unavailable
- Network timeout during upload
- Corrupted file (cannot process)
- Quota exceeded (storage limits per tenant)

---

## TEST FILE 19: notification-delivery.integration.test.ts

**Source Docs:** services-support-analysis.md (email_queue table)
**Priority:** MEDIUM
**Estimated Tests:** 30

### Email Queue Operations (10 tests)
- INSERT into email_queue (to, subject, body, template)
- Email templates: compliance-alert, password-reset, verification, etc.
- Queue processing: SELECT * FROM email_queue WHERE status='pending' ORDER BY created_at
- Update status: processing → sent/failed
- Delivery via email service (SendGrid, SES, Mailgun)
- Retry logic: Max 3 retries on failure
- Retry delay: Exponential backoff (1min, 5min, 15min)
- Failed email: Status = 'failed', error_message stored
- Batch sending: Process 100 emails per batch
- Tenant isolation: Email queue scoped by tenant (via venue/user relationship)

### Email Templates & Content (8 tests)
- Compliance critical notification template
- Staff invitation template
- Venue verification template
- Payment notification template
- Review notification template
- Template variables: {venueName}, {userName}, {url}, etc.
- HTML email generation
- Plain text fallback

### SMS Queue (if implemented) (5 tests)
- INSERT into sms_queue (to, message)
- SMS provider integration (Twilio)
- Delivery status tracking
- Retry logic
- Tenant isolation

### Notification Preferences (7 tests)
- User notification preferences (email_enabled, sms_enabled)
- Venue notification settings
- Opt-out handling
- Notification frequency limits (max 10 emails/day per user)
- Unsubscribe link in emails
- Do-not-disturb hours
- Preference updates via API

---

## TEST FILE 20: background-jobs.integration.test.ts

**Source Docs:** services-support-analysis.md (cleanup jobs mentioned)
**Priority:** MEDIUM
**Estimated Tests:** 35

### Compliance Review Scheduler (8 tests)
- Daily cron job: Check venues needing review
- Query: SELECT * FROM venue_compliance_reviews WHERE scheduled_date <= NOW() AND status='pending'
- Trigger compliance check for each venue
- Update status: pending → in_progress → completed
- Next review scheduled: +90 days
- Error handling: Individual failures don't stop batch
- Distributed lock: Only one scheduler instance runs
- Tenant scoping: Process all tenants

### Webhook Cleanup Job (5 tests)
- Daily cron job: Delete old webhook events
- Query: DELETE FROM venue_webhook_events WHERE created_at < NOW() - INTERVAL '30 days' AND status IN ('completed', 'failed')
- Retention: 30 days default
- Keep pending/processing/retrying events
- Batch delete: 1000 records at a time

### Expired Content Cleanup (MongoDB) (5 tests)
- MongoDB TTL index on archivedAt field
- Automatic deletion after 30 days
- No manual cleanup needed (TTL handles it)
- Monitor: Deleted count logged
- Error: TTL index not working (manual cleanup fallback)

### SSL Certificate Renewal (5 tests)
- Daily cron job: Check expiring certificates
- Query: SELECT * FROM custom_domains WHERE ssl_expires_at < NOW() + INTERVAL '7 days'
- Renew certificate via Let's Encrypt
- Update ssl_expires_at, ssl_issued_at
- NOT IMPLEMENTED (currently mocked - CRITICAL)

### Cache Warming (5 tests)
- Hourly cron job: Pre-load popular venues
- Query: SELECT * FROM venues WHERE total_events > 10 ORDER BY total_events DESC LIMIT 100
- Load into cache with full TTL
- Prevents cache stampede on popular venues
- Error: Cache unavailable (skip warming)

### Analytics Aggregation (5 tests)
- Hourly cron job: Calculate venue stats
- Aggregate: total_events, total_tickets_sold, average_rating
- UPDATE venues SET total_events=?, total_tickets_sold=?, average_rating=?
- Tenant scoping: Process per tenant
- Error: Individual venue failures logged

### Job Execution & Locking (2 tests)
- Distributed lock: Redis lock `job:lock:{jobName}`
- Lock TTL: 3600s (job must complete in 1 hour)
- Lock acquired before job runs
- Lock released after completion
- Concurrent job runs prevented
- Job failure: Lock released
- Monitoring: Job duration, success/failure rate logged

---

## TEST FILE 21: internal-apis.integration.test.ts

**Source Docs:** routes-analysis.md (internal-validation.routes.ts)
**Priority:** MEDIUM
**Estimated Tests:** 35

### HMAC Authentication (10 tests)
- x-internal-service header: Service name
- x-internal-timestamp header: Request timestamp (Unix seconds)
- x-internal-signature header: HMAC-SHA256 signature
- Signature calculation: HMAC(service + timestamp + body, INTERNAL_SERVICE_SECRET)
- Constant-time comparison (prevents timing attacks)
- Valid signature → 200
- Invalid signature → 403
- Missing headers → 403
- Expired timestamp (>5 min) → 403
- Replay attack: Same timestamp + signature → 403

### GET /internal/venues/:venueId/validate-ticket/:ticketId (8 tests)
- Validate ticket ownership for venue
- Check if ticket already scanned
- Return: {valid: boolean, scanned: boolean, owner: userId}
- Query: SELECT * FROM tickets WHERE id=? AND venue_id=?
- Query: SELECT * FROM ticket_scans WHERE ticket_id=?
- Tenant isolation: Ticket must belong to venue's tenant
- Error: Ticket doesn't exist → 404
- Error: Ticket belongs to different venue → 403

### GET /internal/venues/:venueId (8 tests)
- Return complete venue data
- Include blockchain fields (wallet_address, collection_address)
- Include contact info
- Include verification status
- Query: SELECT * FROM venues WHERE id=?
- Used by: blockchain-service, compliance-service
- Tenant isolation: Verify tenant_id
- Error: Venue doesn't exist → 404

### GET /internal/venues/:venueId/bank-info (5 tests)
- Return bank account information (last 4 digits only)
- Return payout schedule and minimums
- Return tax ID (last 4 digits only)
- Return verification status
- Query: SELECT * FROM venue_integrations WHERE venue_id=? AND integration_type IN ('stripe', 'square')
- Used by: compliance-service, payment-service
- Sensitive data: Ensure encryption in transit (HTTPS)
- Error: Bank info not configured → 404

### GET /internal/venues/:venueId/chargeback-rate (4 tests)
- Calculate chargeback rate for venue
- Query param: monthsBack (default 12)
- Return: {count, amount, rate, risk_level, reserve_recommendation}
- Query: SELECT COUNT(*), SUM(amount) FROM chargebacks WHERE venue_id=? AND created_at > NOW() - INTERVAL ? MONTH
- Used by: payment-service (chargeback-reserve.service)
- Tenant isolation: Verify venue's tenant
- Error: Insufficient data → return zeros

---

## TEST FILE 22: health-checks.integration.test.ts

**Source Docs:** services-support-analysis.md
**Priority:** LOW
**Estimated Tests:** 25

### Liveness Endpoint (3 tests)
- GET /health/live → 200 {status: 'alive'}
- Always returns alive (no dependencies checked)
- Used by: Kubernetes liveness probe

### Readiness Endpoint (5 tests)
- GET /health/ready
- Check: Database connectivity (SELECT 1)
- Check: Redis connectivity (PING)
- Database down → 503 {status: 'not ready'}
- Redis down → 503 {status: 'not ready'}
- Both up → 200 {status: 'ready'}
- Used by: Kubernetes readiness probe

### Full Health Endpoint - Access Control (5 tests)
- GET /health/full
- Three-factor auth: Internal IP OR service token OR admin JWT
- Internal IP: 10.x, 172.x, 192.168.x, localhost
- Service token: x-internal-service-token header
- Admin JWT: Role check
- ONE of three required
- No auth → 403

### Full Health Endpoint - Checks (8 tests)
- Database: SELECT 1, venue count query
- Redis: PING, test operations (set/get/delete)
- RabbitMQ: Connection status (cached 10s, never errors)
- MongoDB: Connection check (MISSING - should add)
- Business logic: Migration status (applied, pending)
- Response times: Measured for each check
- Overall status: healthy/degraded/unhealthy
- Timeout: 10s (prevents hanging)

### Status Determination (4 tests)
- Healthy: All critical checks pass (DB + Redis)
- Degraded: Redis down (non-critical) or RabbitMQ down
- Unhealthy: Database down (critical)
- Pending migrations: Warning (not degraded - ISSUE)

---

## TEST FILE 23: schema-validation.integration.test.ts

**Source Docs:** schemas-analysis.md
**Priority:** MEDIUM
**Estimated Tests:** 60

### Unknown Property Handling (10 tests)
- integration.schema: stripUnknown=true (rejects unknown)
- params venueId/integrationId: .unknown(false) (rejects unknown)
- params contentId/reviewId: NO PROTECTION (accepts unknown - BUG)
- venue.schema: NO PROTECTION (accepts unknown - BUG)
- settings.schema: NO PROTECTION (accepts unknown - BUG)
- Test: Send unknown property to each schema
- Test: Verify rejected vs accepted
- Test: Unknown property in nested object
- Test: Unknown property in array item
- Test: Schema inconsistency documented

### UUID Validation (5 tests)
- Strict UUID v4 regex: params.schema
- Lenient .uuid(): venue.schema
- Pattern: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
- Invalid UUID v1 rejected by strict
- Invalid UUID v5 rejected by strict

### Backward Compatibility (5 tests)
- capacity OR max_capacity (both accepted)
- type OR venue_type (both accepted)
- address object OR flat fields (both accepted)
- Unclear precedence if both provided
- Custom validation logic complexity

### Read-Only Fields (5 tests)
- average_rating in create → should reject (currently accepts - BUG)
- total_reviews in create → should reject
- total_events in create → should reject
- total_tickets_sold in create → should reject
- Calculated/aggregated values shouldn't be user-submitted

### Unbounded Objects (5 tests)
- metadata: pattern(any, any) - no structure
- amenities: pattern(any, any) - no structure
- settings: object - unstructured
- onboarding: object - unstructured
- Test: Send huge nested object (10+ levels)
- Test: No depth limit enforced
- Test: Memory exhaustion risk

### Enum Validation (5 tests)
- currency: length 3 (not validated against ISO 4217 list)
- language: length 2 (not validated against ISO 639-1 list)
- Test: Invalid currency "XXX" accepted
- Test: Invalid language "ZZ" accepted
- Test: Should validate against actual ISO lists

### Boundary Values (15 tests)
- capacity: 0 (invalid), 1 (valid), 1000000 (valid), 1000001 (invalid)
- latitude: -90 (valid), -91 (invalid), 90 (valid), 91 (invalid)
- longitude: -180 (valid), -181 (invalid), 180 (valid), 181 (invalid)
- royalty_percentage: -0.01 (invalid), 0 (valid), 100 (valid), 100.01 (invalid)
- age_restriction: -1 (invalid), 0 (valid), 99 (valid), 100 (invalid)
- max_tickets_per_order: 0 (invalid), 1 (valid), 100 (valid), 101 (invalid)
- pagination limit: 0 (invalid), 1 (valid), 100 (valid), 101 (invalid)
- pagination offset: -1 (invalid), 0 (valid)

### Pattern Matching (10 tests)
- Email pattern: valid/invalid formats
- Phone pattern: international formats, special chars
- Slug pattern: uppercase (invalid), underscores (invalid), hyphens (valid)
- Hex color pattern: without # (invalid), wrong length (invalid), valid
- Wallet address pattern: invalid chars, wrong length
- Blockchain address pattern validation
- URL pattern: relative URLs (invalid), missing protocol (invalid)
- Test: Pattern bypass attempts
- Test: Special characters in patterns
- Test: Unicode in patterns

---

## TEST FILE 24: error-recovery.integration.test.ts

**Source Docs:** General resilience requirements
**Priority:** MEDIUM
**Estimated Tests:** 45

### Network Errors (10 tests)
- Database connection drops mid-request
- Redis connection drops mid-request
- RabbitMQ connection drops mid-request
- Stripe API timeout (30s)
- Plaid API timeout (30s)
- DNS resolution failure (domain verification)
- External service unavailable (analytics, compliance)
- Network partition (split brain scenarios)
- Connection pool exhausted
- Retry with exponential backoff

### Resource Exhaustion (10 tests)
- Out of memory (large request)
- Disk full (file uploads, logs)
- Database locks (concurrent updates)
- Connection pool exhausted (20 connections max)
- Redis memory full (cache eviction)
- RabbitMQ queue full
- CPU throttling
- Rate limit exceeded (429 response)
- Request timeout (service-level)
- Graceful degradation on exhaustion

### Data Corruption (8 tests)
- Invalid UTF-8 in database
- Corrupted cache entry (malformed JSON)
- Malformed JSON in database fields (metadata, settings)
- Inconsistent foreign keys (orphaned records)
- Invalid enum values in database
- Corrupted Redis data
- MongoDB document schema mismatch
- Data type mismatch (string stored as number)

### Recovery Scenarios (10 tests)
- System restart mid-transaction (rollback)
- Database failover (connection re-establishment)
- Redis failover (connection re-establishment)
- RabbitMQ failover (reconnection)
- Service degradation mode (Redis down, continue without cache)
- Circuit breaker recovery (open → half-open → closed)
- Transaction retry after deadlock
- Idempotent operation retry
- Event replay after RabbitMQ recovery
- Manual intervention scenarios (admin fixes data)

### Error Logging & Monitoring (7 tests)
- All errors logged with context (correlation ID, user, tenant)
- Error severity levels (critical, error, warning, info)
- Stack traces in development (not production)
- Structured logging (JSON format)
- Error rate monitoring (metrics)
- Alert thresholds (error rate >5% → alert)
- Error aggregation (group similar errors)

---

## TEST FILE 25: database-management.integration.test.ts

**Source Docs:** models-analysis.md, setup.ts
**Priority:** MEDIUM
**Estimated Tests:** 40

### Connection Pool Management (10 tests)
- Pool configuration: max 20 connections
- Pool exhaustion: All 20 connections in use → new request waits
- Connection timeout: 10s (after 10s waiting → error)
- Connection leak detection
- Idle connection timeout: 30s
- Connection reuse (not creating new connections unnecessarily)
- Pool metrics: active, idle, waiting connections
- Pool full → 503 or queue
- Connection close on error
- Pool recovery after database restart

### Transaction Isolation (8 tests)
- Transaction isolation level: READ COMMITTED
- Dirty reads prevented
- Non-repeatable reads allowed (expected at READ COMMITTED)
- Phantom reads allowed (expected at READ COMMITTED)
- Concurrent transactions don't interfere
- Transaction rollback on error
- Nested transactions (savepoints)
- Long-running transaction timeout

### Database Constraints (12 tests)
- Unique constraint: (slug, tenant_id) on venues
- Unique constraint: (venue_id, user_id) on venue_staff
- Unique constraint: (venue_id, integration_type) on venue_integrations
- Foreign key: venue_id → venues.id
- Foreign key: user_id → users.id
- Foreign key: tenant_id → tenants.id
- NOT NULL: All required fields enforced
- Check constraint: capacity > 0
- Check constraint: service_fee_percentage 0-100
- Constraint violation → proper error (23505, 23503, etc.)
- Constraint error messages clear
- Cascade delete behavior (or prevent with foreign key)

### Mixed Database Consistency (5 tests)
- PostgreSQL + MongoDB consistency
- Venue in PostgreSQL but content orphaned in MongoDB
- Orphan detection: Query MongoDB for content without venue
- Consistency check job: Find and log orphans
- Manual cleanup process for orphans

### Migration Management (5 tests)
- Migration version tracking
- Applied migrations list: Query from knex_migrations
- Pending migrations detection
- Migration rollback capability
- Schema changes don't break existing data

---

## SUMMARY

**Total Test Files:** 25
**Total Tests:** ~1,285

### Priority Breakdown
- **CRITICAL:** 5 files, ~455 tests (tenant isolation, auth, unprotected routes, content, integrations)
- **HIGH:** 8 files, ~445 tests (lifecycle, staff, settings, stripe, verification, file uploads, branding, CSS)
- **MEDIUM:** 12 files, ~385 tests (onboarding, resale, compliance, domain, events, webhooks, cache, notifications, jobs, internal APIs, schema, error recovery, database)

### By Category
- **Security:** ~320 tests (tenant isolation, auth, unprotected routes, validation)
- **Data Integrity:** ~280 tests (transactions, race conditions, mixed DB, constraints)
- **External Integrations:** ~240 tests (Stripe, Plaid, RabbitMQ, webhooks, adapters)
- **Business Logic:** ~245 tests (compliance, resale, onboarding, branding, domain)
- **Infrastructure:** ~200 tests (cache, health, errors, database, files, notifications, jobs)

### Test Execution Strategy
1. Run CRITICAL tests first (catch major security issues)
2. Run HIGH priority (data integrity, core flows)
3. Run MEDIUM priority (supporting systems)
4. Full suite in CI/CD pipeline (~30-60 min runtime estimated)

### Infrastructure Requirements
- PostgreSQL test database
- MongoDB test database
- Redis test instance
- RabbitMQ test instance (optional, can mock)
- S3 or local storage for file uploads
- Mock external services (Stripe, Plaid, email)

**Document Status:** COMPLETE
**Next Steps:** Begin test implementation starting with tenant-isolation.integration.test.ts
