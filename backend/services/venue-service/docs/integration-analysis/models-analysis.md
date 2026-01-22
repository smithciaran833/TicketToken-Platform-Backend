# Venue Service Models Analysis

## Purpose: Integration Testing Documentation

**Source Files:**
- base.model.ts
- venue.model.ts
- staff.model.ts
- settings.model.ts
- integration.model.ts
- layout.model.ts
- mongodb/venue-content.model.ts

**Generated:** January 18, 2026

---

## 1. BASE.MODEL.TS

### DATABASE OPERATIONS
- **Tables touched**: Dynamic (determined by child class via `this.tableName`)
- **Operations**:
  - SELECT: `findById()`, `findAll()`, `count()`
  - INSERT: `create()`
  - UPDATE: `update()`, `delete()` (soft delete), `softDelete()`
  - No explicit DELETE operations (all soft deletes)
- **Joins**: None in base model
- **Transactions**: Supports transaction via `withTransaction(trx)` - returns new instance with transaction
- **Soft delete pattern**: Uses `deleted_at` column - all queries filter `whereNull('deleted_at')`

### CONSTRAINTS & VALIDATION
- No constraints enforced at model layer
- No validation rules
- Assumes `id`, `created_at`, `updated_at`, `deleted_at` columns exist

### TENANT ISOLATION
- ⚠️ **CRITICAL CONCERN**: NO tenant_id filtering anywhere in base model
- All queries missing tenant_id - relies on child models to add this filter

### CROSS-FILE DEPENDENCIES
- Imports: Knex from 'knex'
- Exports: BaseModel abstract class

### ERROR HANDLING
- No explicit error handling
- Relies on Knex to throw errors

### CACHING
- None

### POTENTIAL ISSUES
- 🚨 **MISSING TENANT ISOLATION**: Base model does NOT enforce tenant_id filtering - massive security risk if child models forget to add it
- `generateId()` uses weak randomness (Math.random()) - could cause collisions
- No validation that `deleted_at` exists before using it
- `update()` always sets `updated_at` but doesn't validate column exists

---

## 2. VENUE.MODEL.TS

### DATABASE OPERATIONS
- **Tables touched**: `venues`
- **Operations**:
  - SELECT: `findBySlug()`, `findById()`, `searchVenues()`, `getActiveVenues()`, `getVenuesByType()`, `getVenueStats()`
  - INSERT: `createWithDefaults()`
  - UPDATE: `update()`, `updateOnboardingStatus()`
  - No DELETE operations
- **Joins**: None
- **Transactions**: None explicit (inherits transaction support from BaseModel)
- **Soft delete pattern**: Uses `deleted_at` via `whereNull('deleted_at')`

### CONSTRAINTS & VALIDATION
- **Unique constraints**: Assumes `slug` is unique (checks with `findBySlug()`)
- **NOT NULL**: Enforced via TypeScript interface (name, slug, email, address fields, tenant_id)
- **Foreign keys**: `tenant_id` (not enforced in model), `created_by`, `updated_by`
- **Business rules**:
  - `canReceivePayments()`: Checks Stripe Connect flags
  - Default values: status='ACTIVE', is_verified=false, royalty_percentage=2.50, etc.
- **Validation**: None at query level

### TENANT ISOLATION
- 🚨 **CRITICAL CONCERN**: `tenant_id` exists in interface but NO queries filter by it!
- `findBySlug()` - Missing tenant_id filter
- `searchVenues()` - Missing tenant_id filter  
- `getActiveVenues()` - Missing tenant_id filter
- `getVenuesByType()` - Missing tenant_id filter
- All methods can access venues across tenants!

### CROSS-FILE DEPENDENCIES
- Imports: BaseModel from './base.model', Knex from 'knex'
- Exports: VenueModel class, IVenue interface

### ERROR HANDLING
- No explicit error handling
- No error codes defined

### CACHING
- None

### POTENTIAL ISSUES
- 🚨 **MISSING TENANT ISOLATION**: All queries missing tenant_id filter - venues are accessible across tenants!
- 🚨 **DATA CONSISTENCY**: `updateOnboardingStatus()` doesn't use transactions when updating metadata
- Complex transformation logic (`transformForDb`, `transformFromDb`) increases bug risk
- `image_gallery` stored as JSON string - no validation on parse
- `searchVenues()` uses `ilike` - case-insensitive but PostgreSQL specific
- Legacy compatibility fields create confusion (address vs address_line1, type vs venue_type)

---

## 3. STAFF.MODEL.TS

### DATABASE OPERATIONS
- **Tables touched**: `venue_staff`
- **Operations**:
  - SELECT: `findById()`, `findByVenueAndUser()`, `getVenueStaff()`, `getStaffByRole()`, `getUserVenues()`, `hasPermission()`, `validateStaffLimit()`
  - INSERT: `addStaffMember()` (includes reactivation logic) - **NOW USES TRANSACTION** ✅
  - UPDATE: `update()`, `delete()`, `updateRole()`, `deactivateStaffMember()`, `reactivateStaffMember()`, `updateLastLogin()`
  - No hard DELETE
- **Joins**: None
- **Transactions**: ✅ `addStaffMember()` now uses transaction (FIXED)
- **Soft delete pattern**: Uses `is_active` field instead of `deleted_at`

### CONSTRAINTS & VALIDATION
- **Unique constraints**: Composite (venue_id + user_id) checked in `addStaffMember()`
- **NOT NULL**: venue_id, user_id, role
- **Foreign keys**: venue_id, user_id, added_by
- **Business rules**:
  - Role-based default permissions via `getDefaultPermissions()`
  - Owner role gets wildcard '*' permission
  - Staff limit validation (50 per venue)
  - Throws error if staff already exists and is active

### TENANT ISOLATION
- ✅ Filters by `venue_id` consistently
- 🚨 **CONCERN**: `getUserVenues()` does NOT filter by tenant_id - user can see all venue associations across tenants
- 🚨 **CONCERN**: No tenant_id column in interface - relies only on venue_id for isolation

### CROSS-FILE DEPENDENCIES
- Imports: BaseModel from './base.model', Knex from 'knex'
- Exports: StaffModel class, IStaffMember interface, IStaffWithUser interface

### ERROR HANDLING
- Throws generic Error with message: "Staff member already exists for this venue"
- No error codes or custom error types

### CACHING
- None

### POTENTIAL ISSUES
- ✅ **FIXED**: `addStaffMember()` now uses transaction - race condition eliminated
- 🚨 **INCONSISTENT SOFT DELETE**: Uses `is_active` instead of `deleted_at` - breaks pattern from BaseModel
- ⚠️ **MISSING TENANT FILTER**: `getUserVenues()` can leak venue associations across tenants
- Overrides `findById()`, `update()`, `delete()` to NOT use `deleted_at` - could cause confusion
- `validateStaffLimit()` hard-coded to 50 - should be configurable

---

## 4. SETTINGS.MODEL.TS

### DATABASE OPERATIONS
- **Tables touched**: `venue_settings`
- **Operations**:
  - SELECT: `getVenueSettings()`
  - INSERT/UPDATE: `updateVenueSettings()` (upsert pattern) - **NOW USES TRANSACTION** ✅
  - No DELETE
- **Joins**: None
- **Transactions**: ✅ `updateVenueSettings()` now uses transaction (FIXED)
- **Soft delete pattern**: None (no deleted_at or is_active)

### CONSTRAINTS & VALIDATION
- **Unique constraints**: Assumes venue_id is unique/primary key
- **NOT NULL**: venue_id
- **Foreign keys**: venue_id
- **Business validation**:
  - `validateSettings()`: Validates currency codes, color hex format, webhook URL format
  - Supported currencies: USD, EUR, GBP, CAD, AUD (hard-coded)

### TENANT ISOLATION
- ✅ Filters by `venue_id`
- 🚨 **CONCERN**: No direct tenant_id filter - assumes venue_id provides isolation

### CROSS-FILE DEPENDENCIES
- Imports: Knex from 'knex'
- Exports: SettingsModel class, IVenueSettings interface
- **Note**: Does NOT extend BaseModel!

### ERROR HANDLING
- `validateSettings()` returns validation errors array
- URL validation wrapped in try/catch
- No exceptions thrown

### CACHING
- None

### POTENTIAL ISSUES
- ✅ **FIXED**: `updateVenueSettings()` now uses transaction - race condition eliminated
- ⚠️ Limited mapping between IVenueSettings interface and database columns (only maps 3 fields)
- Most settings in interface don't persist to database (notifications, branding, features sections)
- Inconsistent with other models - doesn't extend BaseModel
- Hard-coded validation rules (currencies, etc.) should be configurable

---

## 5. INTEGRATION.MODEL.TS

### DATABASE OPERATIONS
- **Tables touched**: `venue_integrations`
- **Operations**:
  - SELECT: `findById()`, `findByVenue()`, `findByVenueAndType()`
  - INSERT: `create()`
  - UPDATE: `update()`, `delete()` (soft delete using is_active)
  - No hard DELETE
- **Joins**: None
- **Transactions**: None
- **Soft delete pattern**: Uses `is_active` field, NOT `deleted_at`

### CONSTRAINTS & VALIDATION
- **Unique constraints**: Implied composite (venue_id + integration_type) via `findByVenueAndType()`
- **NOT NULL**: venue_id, integration_type, config_data
- **Foreign keys**: venue_id
- **Business rules**: Field name mapping (config↔config_data, status↔is_active)

### TENANT ISOLATION
- ✅ Filters by `venue_id`
- 🚨 **CONCERN**: No direct tenant_id - assumes venue_id provides isolation

### CROSS-FILE DEPENDENCIES
- Imports: BaseModel from './base.model', Knex from 'knex'
- Exports: IntegrationModel class, IIntegration interface

### ERROR HANDLING
- No explicit error handling
- No validation on integration types or config data

### CACHING
- None

### POTENTIAL ISSUES
- 🚨 **INCONSISTENT SOFT DELETE**: Uses `is_active` instead of `deleted_at` - overrides BaseModel pattern
- 🚨 **SECURITY RISK**: Stores `api_key_encrypted` and `api_secret_encrypted` but no encryption/decryption logic in model
- Complex field mapping in `create()` and `update()` creates confusion
- `findByVenue()` and `findByVenueAndType()` filter by `is_active=true` - can't retrieve inactive integrations for admin purposes
- No validation on `integration_type` values (should be enum)

---

## 6. LAYOUT.MODEL.TS

### DATABASE OPERATIONS
- **Tables touched**: `venue_layouts`
- **Operations**:
  - SELECT: `findByVenue()`, `getDefaultLayout()`
  - UPDATE: `setAsDefault()` (uses transaction!)
  - Inherits: INSERT/UPDATE/DELETE from BaseModel
- **Joins**: None
- **Transactions**: ✅ YES! `setAsDefault()` uses explicit transaction to update multiple rows atomically
- **Soft delete pattern**: Uses `deleted_at` via `whereNull('deleted_at')`

### CONSTRAINTS & VALIDATION
- **Unique constraints**: Only one `is_default=true` per venue_id (enforced via transaction in setAsDefault)
- **NOT NULL**: venue_id, name, type, capacity, is_default
- **Foreign keys**: venue_id
- **Business rules**: One default layout per venue

### TENANT ISOLATION
- ✅ Filters by `venue_id`
- 🚨 **CONCERN**: No direct tenant_id - assumes venue_id provides isolation
- ⚠️ `setAsDefault()` transaction doesn't verify venue ownership before update

### CROSS-FILE DEPENDENCIES
- Imports: BaseModel from './base.model', Knex from 'knex'
- Exports: LayoutModel class, ILayout interface, ISection interface

### ERROR HANDLING
- No explicit error handling
- Transaction will rollback on error

### CACHING
- None

### POTENTIAL ISSUES
- ✅ **GOOD**: Uses transaction for `setAsDefault()` to ensure data consistency
- ⚠️ `setAsDefault()` doesn't validate that layoutId belongs to venueId before updating - could set wrong layout as default
- `sections` field is complex nested object with no validation
- ISection interface defined but not used in queries

---

## 7. VENUE-CONTENT.MODEL.TS (MongoDB)

### DATABASE OPERATIONS
- **Database**: MongoDB (Mongoose)
- **Collection**: `venue_content`
- **Operations**: Model definition only - no custom query methods
- **Indexes**:
  - Compound: (venueId, contentType, status), (venueId, status, displayOrder), (contentType, status), (venueId, content.media.type), (featured, status)
  - TTL: (archivedAt) - 30 day expiration
- **Joins**: None (NoSQL)
- **Transactions**: None defined
- **Soft delete pattern**: Uses `status='archived'` and `archivedAt` timestamp

### CONSTRAINTS & VALIDATION
- **Required fields**: venueId, contentType, createdBy, updatedBy
- **Enums**: 
  - contentType: 11 types (FLOOR_PLAN, SEATING_CHART, etc.)
  - status: draft, published, archived
  - Multiple nested enums for media types, amenity types, accessibility types, parking types
- **Defaults**: status='draft', displayOrder=0, featured=false, primaryImage=false, version=1
- **Timestamps**: Automatic via Mongoose

### TENANT ISOLATION
- 🚨 **CRITICAL CONCERN**: Uses `venueId` but NO tenant validation
- Queries by venueId alone - no tenant_id filtering at all
- Could access content across tenants if venueId is known

### CROSS-FILE DEPENDENCIES
- Imports: mongoose (Schema, model, Document, Types)
- Exports: VenueContentModel, IVenueContent interface, VenueContentType type, VenueContentStatus type

### ERROR HANDLING
- None - relies on Mongoose validation
- No custom error types

### CACHING
- None
- TTL index auto-deletes archived content after 30 days

### POTENTIAL ISSUES
- 🚨 **MISSING TENANT ISOLATION**: No tenant_id field - relies only on venueId
- 🚨 **SCHEMA COMPLEXITY**: Massive nested schema with conditional fields based on contentType - hard to validate
- ⚠️ All fields in `content` object are optional - no validation that required fields exist per contentType
- ⚠️ Version tracking exists but no versioning logic implemented
- ⚠️ `previousVersionId` links to old version but no cascade delete handling
- TTL index will permanently delete archived content - no recovery possible
- Mixed database usage (PostgreSQL + MongoDB) adds complexity to testing

---

## CRITICAL FINDINGS SUMMARY

### 🚨 HIGHEST PRIORITY ISSUES

#### 1. TENANT ISOLATION FAILURES (Security Critical)
- **venue.model.ts**: ALL queries missing tenant_id filter
- **staff.model.ts**: `getUserVenues()` missing tenant_id
- **venue-content.model.ts**: No tenant_id field at all
- All models rely on venue_id but never validate tenant owns the venue
- **Risk**: Cross-tenant data access, data leakage, unauthorized access

#### 2. RACE CONDITIONS (Data Integrity) - PARTIALLY FIXED ✅
- ✅ **FIXED**: staff.model.ts: `addStaffMember()` now uses transaction
- ✅ **FIXED**: settings.model.ts: `updateVenueSettings()` now uses transaction
- **Impact**: Eliminated check-then-act race conditions in critical operations

#### 3. INCONSISTENT SOFT DELETE PATTERNS
- **base.model.ts**: Uses `deleted_at`
- **staff.model.ts**: Uses `is_active` (overrides base)
- **integration.model.ts**: Uses `is_active` (overrides base)
- **venue-content.model.ts**: Uses `status='archived'` + TTL
- **Risk**: Developer confusion, inconsistent behavior, bugs in restoration logic

#### 4. SECURITY CONCERNS
- **integration.model.ts**: Encrypted credentials stored but no encryption/decryption logic
- **base.model.ts**: Weak ID generation using Math.random()
- **Risk**: Credential exposure, ID collisions

### ✅ GOOD PATTERNS FOUND

1. **layout.model.ts**: Uses transaction for `setAsDefault()` ✅
2. **Multiple models**: Use appropriate database indexes
3. **General approach**: Soft delete preferred over hard delete
4. **staff.model.ts**: Role-based permission system with sensible defaults
5. **settings.model.ts**: Validation logic for business rules
6. **Recent fixes**: Transaction patterns now implemented in staff and settings models ✅

### 📋 TESTING RECOMMENDATIONS

Integration tests MUST verify:

1. **Tenant Isolation** (Highest Priority):
   - Every query includes proper tenant filtering
   - Cross-tenant data access attempts are blocked
   - RLS context is properly set via middleware

2. **Transaction Boundaries**:
   - Multi-step operations complete atomically
   - Rollback on errors works correctly
   - No partial state commits

3. **Race Conditions**:
   - Concurrent requests to same resource handled correctly
   - Staff addition doesn't allow duplicates under concurrent load
   - Settings updates don't overwrite each other

4. **Cross-tenant Data Leakage**:
   - User with access to Tenant A cannot see Tenant B venues
   - Staff member cannot see venues from other tenants
   - Search results properly filtered by tenant

5. **Soft Delete Consistency**:
   - Deleted records don't appear in queries
   - Soft-deleted records can be restored
   - Different soft-delete patterns work correctly

6. **Business Logic**:
   - Stripe Connect payment eligibility logic
   - Staff permission inheritance and validation
   - Default layout switching atomicity

7. **MongoDB Integration**:
   - TTL index behavior for archived content
   - Content type validation
   - Mixed PostgreSQL/MongoDB consistency

8. **Security**:
   - Encrypted credentials handled securely
   - No weak ID collisions occur
   - RLS policies enforced at database level

---

## INTEGRATION TEST FILE MAPPING

| Model | Test File | Priority | Key Test Scenarios |
|-------|-----------|----------|-------------------|
| base.model.ts | (covered by other tests) | - | Soft delete behavior, transaction support inheritance |
| venue.model.ts | venue-crud.integration.test.ts | **HIGH** | CRUD operations with tenant isolation, venue search with tenant filtering, stats calculation, Stripe Connect payment eligibility, slug uniqueness per tenant |
| staff.model.ts | staff-management.integration.test.ts | **HIGH** | Add/remove staff with transaction safety, role-based permissions enforcement, concurrent staff addition (race condition), staff limits per venue, cross-tenant staff access prevention |
| settings.model.ts | venue-settings.integration.test.ts | **MEDIUM** | Upsert with transaction safety, settings validation (currency, colors, URLs), concurrent updates (race condition), default values application |
| integration.model.ts | venue-integrations.integration.test.ts | **MEDIUM** | CRUD operations, encrypted credential storage/retrieval, soft delete with is_active, integration type validation |
| layout.model.ts | venue-layouts.integration.test.ts | **MEDIUM** | CRUD operations, default layout switching with transaction, concurrent default changes, layout-venue ownership validation |
| venue-content.model.ts | venue-content.integration.test.ts | **MEDIUM** | MongoDB CRUD operations, TTL index behavior (30-day expiration), content type validation, version tracking, mixed DB (PostgreSQL + MongoDB) consistency |

### Test Priority Levels

- **HIGH**: Critical for security (tenant isolation) and data integrity (transactions)
- **MEDIUM**: Important for business logic and system reliability
- **LOW**: Nice to have, covered incidentally by other tests

### Cross-Cutting Concerns

All integration tests should verify:
1. ✅ RLS context properly set via tenant middleware
2. ✅ Tenant isolation enforced at database level
3. ✅ Transaction rollback on errors
4. ✅ Proper error handling and logging
5. ✅ No N+1 query problems
6. ✅ Index usage for performance

---

## RECENT FIXES APPLIED

### Fix 1: RLS Context in Tenant Middleware ✅
**File**: `src/middleware/tenant.middleware.ts`
- Added database RLS context setting in `requireTenant()` function
- Sets `app.current_tenant_id` session variable for PostgreSQL RLS policies
- Enables database-level tenant isolation enforcement

### Fix 2: Transaction in Staff Model ✅
**File**: `src/models/staff.model.ts`
- Wrapped `addStaffMember()` method in transaction
- Eliminates race condition in check-then-create logic
- Ensures atomic staff addition/reactivation

### Fix 3: Transaction in Settings Model ✅
**File**: `src/models/settings.model.ts`
- Wrapped `updateVenueSettings()` method in transaction
- Ensures atomic upsert operation
- Prevents concurrent update conflicts

---

**Document Status**: Complete
**Last Updated**: January 18, 2026
**Reviewer**: Integration Testing Team
**Action Items**: Implement integration tests per mapping table above
