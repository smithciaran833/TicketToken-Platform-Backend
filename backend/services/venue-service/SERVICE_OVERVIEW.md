# Venue Service - Complete Technical Overview

**Service**: venue-service  
**Port**: 3002  
**Database**: PostgreSQL (primary), MongoDB (content), Redis (cache)  
**Message Queue**: RabbitMQ  

## Service Purpose

The venue-service is responsible for managing all venue-related operations including venue CRUD, staff management, settings, integrations with third-party services (Stripe, Square, etc.), white-label branding, custom domains, verification workflows, and venue content management. It serves as the central hub for venue owners to manage their venues and configurations.

---

## 📁 Folder Structure Analysis

### routes/

All HTTP route definitions with their methods and paths:

#### **venues.routes.ts**
Main venue routes router that registers the venues controller routes.
- Delegates to `venueRoutes` controller function
- Registers at `/venues` prefix

#### **Venue Routes (from venues.controller.ts)**
Core venue management endpoints:
- **GET** `/` - List all venues (public/filtered by user)
- **POST** `/` - Create new venue (authenticated)
- **GET** `/user` - List current user's venues (authenticated)
- **GET** `/:venueId` - Get venue by ID (authenticated)
- **GET** `/:venueId/capacity` - Get venue capacity info (authenticated)
- **GET** `/:venueId/stats` - Get venue statistics (authenticated)
- **PUT** `/:venueId` - Update venue (authenticated, owner)
- **DELETE** `/:venueId` - Delete venue (authenticated, owner)
- **GET** `/:venueId/check-access` - Check user access to venue (authenticated)

Staff management:
- **POST** `/:venueId/staff` - Add staff member (authenticated, owner/manager)
- **GET** `/:venueId/staff` - List venue staff (authenticated)

Nested route groups:
- **`/:venueId/settings`** - Venue settings routes
- **`/:venueId/integrations`** - Integration routes
- **`/:venueId/compliance`** - Compliance routes (proxy)
- **`/:venueId/analytics`** - Analytics routes (proxy)

#### **Settings Routes (from settings.controller.ts)**
- **GET** `/:venueId/settings/` - Get venue settings (authenticated)
- **PUT** `/:venueId/settings/` - Update venue settings (authenticated, owner/manager)

#### **Integration Routes (from integrations.controller.ts)**
- **GET** `/:venueId/integrations/` - List venue integrations (authenticated)
- **POST** `/:venueId/integrations/` - Create integration (authenticated, owner/manager)
- **GET** `/:venueId/integrations/:integrationId` - Get integration details (authenticated)
- **PUT** `/:venueId/integrations/:integrationId` - Update integration (authenticated, owner/manager)
- **DELETE** `/:venueId/integrations/:integrationId` - Delete integration (authenticated, owner)
- **POST** `/:venueId/integrations/:integrationId/test` - Test integration connection (authenticated)

#### **venue-stripe.routes.ts**
Stripe Connect onboarding for venues:
- **POST** `/:venueId/stripe/connect` - Initiate Stripe Connect onboarding
- **GET** `/:venueId/stripe/status` - Get Stripe Connect status
- **POST** `/:venueId/stripe/refresh` - Refresh onboarding link

Webhook routes (registered at root level):
- **POST** `/webhooks/stripe/venue-connect` - Stripe account update webhook

#### **venue-content.routes.ts**
Content management for venues:
- **POST** `/:venueId/content` - Create venue content
- **GET** `/:venueId/content` - Get venue content list
- **GET** `/:venueId/content/:contentId` - Get specific content
- **PUT** `/:venueId/content/:contentId` - Update content
- **DELETE** `/:venueId/content/:contentId` - Delete content
- **POST** `/:venueId/content/:contentId/publish` - Publish content
- **POST** `/:venueId/content/:contentId/archive` - Archive content

Seating charts:
- **GET** `/:venueId/seating-chart` - Get seating chart
- **PUT** `/:venueId/seating-chart` - Update seating chart

Photos:
- **GET** `/:venueId/photos` - Get venue photos
- **POST** `/:venueId/photos` - Add photo

Venue information:
- **GET** `/:venueId/amenities` - Get amenities
- **GET** `/:venueId/accessibility` - Get accessibility info
- **GET** `/:venueId/parking` - Get parking info
- **GET** `/:venueId/policies` - Get venue policies

#### **venue-reviews.routes.ts**
Reviews and ratings:
- **POST** `/:venueId/reviews` - Create review (authenticated)
- **GET** `/:venueId/reviews` - Get venue reviews
- **GET** `/:venueId/reviews/:reviewId` - Get specific review
- **PUT** `/:venueId/reviews/:reviewId` - Update review (authenticated, author)
- **DELETE** `/:venueId/reviews/:reviewId` - Delete review (authenticated, author)
- **POST** `/:venueId/reviews/:reviewId/helpful` - Mark review as helpful (authenticated)
- **POST** `/:venueId/reviews/:reviewId/report` - Report review (authenticated)

Ratings:
- **POST** `/:venueId/ratings` - Submit rating (authenticated)
- **GET** `/:venueId/ratings/summary` - Get rating summary
- **GET** `/:venueId/ratings/me` - Get user's rating (authenticated)

#### **branding.routes.ts**
White-label branding configuration:
- **GET** `/:venueId` - Get branding by venue ID
- **GET** `/domain/:domain` - Get branding by custom domain
- **PUT** `/:venueId` - Create/update branding configuration
- **GET** `/:venueId/css` - Get CSS variables for branding
- **GET** `/pricing/tiers` - Get all pricing tiers
- **POST** `/:venueId/tier` - Change venue pricing tier
- **GET** `/:venueId/tier/history` - Get tier change history

#### **domain.routes.ts**
Custom domain management:
- **POST** `/:venueId/add` - Add custom domain
- **POST** `/:domainId/verify` - Verify domain ownership
- **GET** `/:domainId/status` - Get domain status
- **GET** `/venue/:venueId` - Get all venue domains
- **DELETE** `/:domainId` - Remove custom domain

#### **health.routes.ts**
Health check endpoints:
- **GET** `/health/live` - Liveness probe (Kubernetes)
- **GET** `/health/ready` - Readiness probe (Kubernetes)
- **GET** `/health/full` - Full health check with details
- **GET** `/health` - Simple health check (backward compatibility)

#### **internal-validation.routes.ts**
Internal service-to-service validation (authenticated with internal secret):
- **GET** `/internal/venues/:venueId/validate-ticket/:ticketId` - Validate ticket for venue

---

### services/

Business logic layer - each service handles specific domain responsibilities:

#### **venue.service.ts**
Core venue management service - the main business logic for venue operations.

**Key Methods:**
- `createVenue()` - Create venue with staff, settings, audit logging
- `getVenue()` - Get venue with caching and access control
- `updateVenue()` - Update venue with permission checks
- `deleteVenue()` - Soft delete with constraint validation
- `searchVenues()` - Search venues with filters
- `listVenues()` - List public venues
- `listUserVenues()` - List venues for authenticated user
- `getVenueStats()` - Get venue statistics (cached)
- `checkVenueAccess()` - Verify user access to venue
- `getAccessDetails()` - Get user's role and permissions
- `addStaffMember()` - Add staff to venue
- `getVenueStaff()` - Get all staff for venue
- `removeStaffMember()` - Remove staff from venue
- `updateOnboardingProgress()` - Track onboarding steps
- `canDeleteVenue()` - Validate venue can be safely deleted

**Dependencies:** VenueModel, StaffModel, SettingsModel, EventPublisher, CacheService

#### **integration.service.ts**
Third-party integration management (Stripe, Square, Toast, etc.).

**Key Methods:**
- `getIntegration()` - Get integration with decrypted credentials
- `getVenueIntegrationByType()` - Get integration by provider type
- `listVenueIntegrations()` - List all integrations for venue
- `createIntegration()` - Create new integration with encrypted credentials
- `updateIntegration()` - Update integration configuration
- `deleteIntegration()` - Remove integration
- `testIntegration()` - Test connection to external service
- `syncWithExternalSystem()` - Sync data with external provider

**Supported Integrations:** stripe, square, toast, mailchimp, twilio

#### **verification.service.ts**
Venue verification workflows for compliance.

**Key Methods:**
- `verifyVenue()` - Run verification checks on venue
- `submitDocument()` - Submit verification document
- `getVerificationStatus()` - Get current verification status
- `verifyBusinessInfo()` - Verify business information
- `verifyTaxInfo()` - Verify tax information
- `verifyBankAccount()` - Verify bank account
- `verifyIdentity()` - Verify identity documents
- `markVenueVerified()` - Mark venue as verified
- `triggerBusinessVerification()` - Start external business verification
- `triggerManualVerification()` - Queue for manual review

#### **branding.service.ts**
White-label branding and CSS customization.

**Key Methods:**
- `getBrandingByVenueId()` - Get branding configuration for venue
- `getBrandingByDomain()` - Get branding by custom domain
- `upsertBranding()` - Create or update branding
- `generateCssVariables()` - Generate CSS from branding config
- `getPricingTier()` - Get pricing tier details
- `getAllPricingTiers()` - List all pricing tiers
- `changeTier()` - Upgrade/downgrade venue tier
- `getTierHistory()` - Get tier change history

**Pricing Tiers:** standard, white_label, enterprise

#### **domain-management.service.ts**
Custom domain management and SSL certificates.

**Key Methods:**
- `addCustomDomain()` - Add domain with verification token
- `verifyDomain()` - Verify domain ownership via DNS
- `requestSSLCertificate()` - Request SSL cert from Let's Encrypt
- `getDomainStatus()` - Get domain verification/SSL status
- `getVenueDomains()` - List all domains for venue
- `removeDomain()` - Remove custom domain

#### **venue-content.service.ts**
MongoDB-based content management for rich venue content.

**Key Methods:**
- `createContent()` - Create venue content
- `updateContent()` - Update content
- `deleteContent()` - Delete content
- `getContent()` - Get single content item
- `getVenueContent()` - Get all content for venue
- `publishContent()` - Publish draft content
- `archiveContent()` - Archive published content
- `getSeatingChart()` - Get venue seating chart
- `updateSeatingChart()` - Update seating chart
- `getPhotos()` - Get venue photos
- `addPhoto()` - Add venue photo
- `getAmenities()` - Get amenities list
- `getAccessibilityInfo()` - Get accessibility information
- `getParkingInfo()` - Get parking information
- `getPolicies()` - Get venue policies

**Content Types:** seating_chart, photos, amenities, accessibility, parking, policies

#### **venue-stripe-onboarding.service.ts**
Stripe Connect onboarding for venue payment processing.

**Key Methods:**
- `createConnectAccountAndOnboardingLink()` - Create Stripe Connect account
- `getAccountStatus()` - Get onboarding status
- `refreshOnboardingLink()` - Generate new onboarding link
- `handleAccountUpdated()` - Process Stripe webhook events
- `canAcceptPayments()` - Check if venue can process payments
- `updateVenueStripeStatus()` - Update venue with Stripe status
- `determineAccountStatus()` - Map Stripe status to internal status

#### **compliance.service.ts**
Compliance management and reporting.

**Key Methods:**
- `generateComplianceReport()` - Generate comprehensive compliance report
- `scheduleComplianceReview()` - Schedule review date
- `updateComplianceSettings()` - Update compliance configuration
- `checkDataProtection()` - Check GDPR/data protection compliance
- `checkAgeVerification()` - Check age verification settings
- `checkAccessibility()` - Check accessibility compliance
- `checkFinancialReporting()` - Check financial compliance
- `checkLicensing()` - Check business licenses

**Compliance Categories:** data_protection, age_verification, accessibility, financial_reporting, licensing

#### **onboarding.service.ts**
Venue onboarding workflow management.

**Key Methods:**
- `getOnboardingStatus()` - Get current onboarding progress
- `completeStep()` - Mark onboarding step as complete
- `hasBasicInfo()` - Check if basic info is complete
- `hasAddress()` - Check if address is complete
- `hasLayout()` - Check if layout is configured
- `hasPaymentIntegration()` - Check if payment is setup
- `hasStaff()` - Check if staff members added

**Onboarding Steps:** basic_info, address, layout, payment_integration, staff

#### **analytics.service.ts**
Analytics tracking and event logging.

**Key Methods:**
- `getVenueAnalytics()` - Get analytics data
- `trackEvent()` - Track analytics event

#### **cache.service.ts**
Redis caching layer for performance optimization.

**Key Methods:**
- `get()` - Get cached value
- `set()` - Set cached value with TTL
- `del()` - Delete cached value
- `clearVenueCache()` - Clear all venue caches
- `clearTenantVenueCache()` - Clear tenant's venue caches
- `getOrSet()` - Get from cache or compute and set
- `warmCache()` - Pre-warm cache with data
- `invalidateKeys()` - Invalidate multiple keys
- `exists()` - Check if key exists
- `ttl()` - Get time to live for key

#### **healthCheck.service.ts**
Service health monitoring for Kubernetes probes.

**Key Methods:**
- `getLiveness()` - Simple liveness check
- `getReadiness()` - Readiness check (DB, Redis, RabbitMQ)
- `getFullHealth()` - Detailed health with all dependencies
- `checkMigrations()` - Verify migrations are up to date
- `checkRabbitMQ()` - Check message queue connection

#### **eventPublisher.ts**
RabbitMQ event publishing for inter-service communication.

**Key Methods:**
- `connect()` - Connect to RabbitMQ
- `publish()` - Publish event message
- `publishVenueCreated()` - Publish venue created event
- `publishVenueUpdated()` - Publish venue updated event
- `publishVenueDeleted()` - Publish venue deleted event
- `close()` - Close connection
- `isConnected()` - Check connection status

**Events Published:**
- `venue.created` - When venue is created
- `venue.updated` - When venue is updated
- `venue.deleted` - When venue is deleted

---

### controllers/

HTTP request handlers that coordinate between routes and services:

#### **venues.controller.ts**
Main venue CRUD controller with nested routes.

**Methods:**
- List venues (public/filtered)
- Create venue
- List user venues
- Get venue by ID
- Get venue capacity
- Get venue stats
- Update venue
- Delete venue
- Check venue access
- Add staff member
- List venue staff

Also registers nested controllers: settings, integrations, compliance, analytics

#### **settings.controller.ts**
Venue settings management.

**Methods:**
- Get venue settings
- Update venue settings (with audit logging)

**Permissions:** owner, manager can update

#### **integrations.controller.ts**
Third-party integration management with credential encryption.

**Methods:**
- List venue integrations (credentials masked)
- Create integration
- Get integration details
- Update integration
- Delete integration (owner only)
- Test integration connection

**Features:**
- Automatic credential masking in responses
- Duplicate integration prevention
- Permission-based access control

#### **compliance.controller.ts**
Proxy controller to compliance-service.

**Routes:** All routes under `/:venueId/compliance/*` are proxied

#### **analytics.controller.ts**
Proxy controller to analytics-service.

**Routes:** All routes under `/:venueId/analytics/*` are proxied

#### **venue-stripe.controller.ts**
Stripe Connect onboarding controller.

**Methods:**
- `initiateConnect()` - Start Stripe Connect onboarding
- `getConnectStatus()` - Get account status
- `refreshConnect()` - Refresh onboarding link
- `handleWebhook()` - Process Stripe webhooks

**Validations:**
- Email format validation
- URL validation (HTTPS required)
- Signature verification for webhooks

#### **venue-content.controller.ts**
Content management controller (MongoDB).

**Methods:**
- Create content
- Get venue content (filtered by type/status)
- Get single content item
- Update content
- Delete content
- Publish content
- Archive content
- Get/update seating chart
- Get/add photos
- Get amenities/accessibility/parking/policies

#### **venue-reviews.controller.ts**
Reviews and ratings controller (uses shared services).

**Methods:**
- Create review
- Get reviews (paginated, sorted)
- Get single review
- Update review
- Delete review
- Mark review helpful
- Report review
- Submit rating
- Get rating summary
- Get user's rating

**Services Used:** ReviewService, RatingService from @tickettoken/shared

---

### repositories/models/

Data access layer with Knex for PostgreSQL:

#### **venue.model.ts**
Venue data access with PostgreSQL.

**Table:** `venues`

**Methods:**
- `findBySlug()` - Find venue by slug
- `findById()` - Find venue by ID
- `createWithDefaults()` - Create with defaults and slug generation
- `update()` - Update venue
- `updateOnboardingStatus()` - Update onboarding progress
- `canReceivePayments()` - Check payment readiness
- `getActiveVenues()` - Get active venues
- `getVenuesByType()` - Filter by venue type
- `searchVenues()` - Search with filters and pagination
- `getVenueStats()` - Get venue statistics
- `softDelete()` - Soft delete venue

**Transforms:** Bidirectional transforms between API format and DB format

#### **staff.model.ts**
Venue staff management.

**Table:** `venue_staff`

**Methods:**
- `findById()` - Get staff member
- `findByVenueAndUser()` - Find staff by venue and user
- `getVenueStaff()` - Get all staff for venue
- `getStaffByRole()` - Filter staff by role
- `addStaffMember()` - Add new staff with default permissions
- `updateRole()` - Update staff role and permissions
- `deactivateStaffMember()` - Deactivate staff
- `reactivateStaffMember()` - Reactivate staff
- `updateLastLogin()` - Track last login
- `getUserVenues()` - Get all venues for user
- `hasPermission()` - Check if user has specific permission
- `validateStaffLimit()` - Check staff limit for pricing tier

**Roles:** owner, manager, staff, security, box_office

**Default Permissions:** Role-based permission sets

#### **settings.model.ts**
Venue settings management.

**Table:** `venue_settings`

**Methods:**
- `getVenueSettings()` - Get settings with defaults
- `updateVenueSettings()` - Update settings
- `updateSettingSection()` - Update specific setting section
- `getDefaultSettings()` - Get default settings
- `validateSettings()` - Validate settings structure

**Setting Sections:** ticketing, fees, payment

#### **integration.model.ts**
Integration data access.

**Table:** `venue_integrations`

**Methods:**
- `findById()` - Get integration
- `findByVenue()` - Get all venue integrations
- `findByVenueAndType()` - Get specific integration type
- `create()` - Create integration
- `update()` - Update integration
- `delete()` - Delete integration

**Integration Types:** stripe, square, toast, mailchimp, twilio

#### **layout.model.ts**
Venue layout management.

**Table:** `venue_layouts`

**Methods:**
- `findByVenue()` - Get all layouts for venue
- `getDefaultLayout()` - Get default layout
- `setAsDefault()` - Set layout as default

#### **base.model.ts**
Abstract base model with common CRUD operations.

**Methods:**
- `findById()` - Find by ID
- `findAll()` - Find with conditions
- `create()` - Create record
- `update()` - Update record
- `delete()` - Delete record
- `count()` - Count records
- `softDelete()` - Soft delete record
- `generateId()` - Generate UUID
- `withTransaction()` - Use with transaction

#### **models/mongodb/venue-content.model.ts**
MongoDB model for rich content storage (seating charts, media, policies).

---

### middleware/

Request processing middleware:

#### **auth.middleware.ts**
Authentication and authorization.

**Functions:**
- `authenticate()` - JWT token verification
- `requireVenueAccess()` - Verify user has access to venue
- `authenticateWithApiKey()` - API key authentication

**Features:**
- JWT verification with JWT_ACCESS_SECRET
- User context extraction
- API key support for service-to-service

#### **validation.middleware.ts**
Request validation using Joi schemas.

**Function:**
- `validate(schema)` - Validate request against Joi schema

**Validates:** body, query, params

#### **error-handler.middleware.ts**
Global error handling middleware.

**Function:**
- `errorHandler()` - Catch and format errors

**Error Types Handled:**
- NotFoundError → 404
- ForbiddenError → 403
- ValidationError → 400
- Generic errors → 500

#### **rate-limit.middleware.ts**
Redis-based rate limiting.

**Class:** `RateLimiter`

**Methods:**
- `createMiddleware()` - Create rate limit middleware
- `checkAllLimits()` - Check all limit types
- `updateLimits()` - Update limit configuration
- `resetLimit()` - Reset limit for identifier

**Limit Types:**
- global - Service-wide limit
- perUser - Per user limits
- perVenue - Per venue limits
- perOperation - Per operation limits

#### **versioning.middleware.ts**
API versioning support.

**Functions:**
- `versionMiddleware()` - Extract API version from headers
- `registerVersionedRoute()` - Register version-specific routes

---

### config/

Service configuration and setup:

#### **database.ts**
PostgreSQL database configuration.

**Functions:**
- `startPoolMonitoring()` - Monitor connection pool
- `checkDatabaseConnection()` - Health check with retries

**Features:**
- Connection pooling
- Health monitoring
- Retry logic

#### **redis.ts**
Redis configuration with pub/sub support.

**Functions:**
- `initRedis()` - Initialize Redis clients
- `getRedis()` - Get main Redis client
- `getPub()` - Get pub client
- `getSub()` - Get sub client
- `closeRedisConnections()` - Close all connections

**Clients:**
- Main client for caching
- Pub client for publishing
- Sub client for subscribing

#### **mongodb.ts**
MongoDB configuration for content storage.

**Functions:**
- `initializeMongoDB()` - Connect to MongoDB
- `getMongoDB()` - Get connection
- `closeMongoDB()` - Close connection
- `checkMongoDBHealth()` - Health check

**Usage:** Storing rich content (seating charts, media galleries)

#### **fastify.ts**
Fastify server configuration.

**Function:**
- `configureFastify()` - Setup Fastify with middleware, CORS, swagger, etc.

**Plugins:**
- CORS support
- Helmet security
- Swagger/OpenAPI
- Compression
- Rate limiting

#### **dependencies.ts**
Dependency injection container setup.

**Function:**
- `registerDependencies()` - Register services with Awilix container

**Pattern:** Dependency injection for testability and maintainability

#### **secrets.ts**
AWS Secrets Manager integration.

**Function:**
- `loadSecrets()` - Load secrets from AWS or environment

---

### migrations/

Database schema migrations:

#### **001_baseline_venue.ts**
**Creates 12 core tables:**

1. **venues** - Core venue information
   - Identity, contact, address, capacity
   - Business info, blockchain addresses
   - Media, features, policies
   - White-label support (custom domains, branding)
   - Social stats, ratings, metadata
   - Row Level Security enabled

2. **venue_staff** - Staff members and roles
   - User assignments with roles
   - Permissions, departments, schedules
   - Emergency contacts, compensation

3. **venue_settings** - Venue configuration
   - Ticketing settings
   - Fee configuration
   - Payment settings

4. **venue_integrations** - Third-party integrations
   - Integration type and config
   - Encrypted credentials
   - Sync status

5. **venue_layouts** - Seating layouts
   - Layout sections and capacities
   - Default layout support

6. **venue_branding** - White-label branding
   - Colors, fonts, logos
   - Custom CSS
   - Email and ticket branding

7. **custom_domains** - Custom domain management
   - Domain verification
   - SSL certificate management
   - DNS records

8. **white_label_pricing** - Pricing tiers
   - Tier features and limits
   - Fee structures
   - Default tiers: standard, white_label, enterprise

9. **venue_tier_history** - Tier change tracking

10. **venue_audit_log** - Audit trail for compliance

11. **api_keys** - API key management

12. **user_venue_roles** - User-venue role assignments

**Features:**
- Full-text search indexes
- GIN indexes for JSONB
- Automatic updated_at triggers
- Audit triggers
- Row Level Security policies
- Foreign key constraints

#### **003_add_external_verification_tables.ts**
**Creates 7 additional tables:**

1. **external_verifications** - External verification tracking
   - Provider integration (Stripe Identity, Plaid, etc.)
   - Verification status and metadata

2. **manual_review_queue** - Manual review workflows
   - Review assignments and priorities
   - Status tracking

3. **notifications** - In-app notifications
   - User and venue notifications
   - Read status tracking

4. **email_queue** - Email delivery queue
   - Template-based emails
   - Retry logic

5. **venue_compliance_reviews** - Scheduled compliance reviews

6. **venue_compliance** - Compliance settings

7. **venue_compliance_reports** - Compliance report history

8. **venue_documents** - Verification documents
   - Document type and status
   - Approval/rejection tracking

---

### validators/schemas/

Request validation schemas using Joi:

#### **venue.schema.ts**
Venue validation schemas.

**Schemas:**
- `createVenueSchema` - Validates venue creation
  - Required: name, email, address, capacity, type
  - 60+ optional fields for comprehensive venue data
  - Supports both legacy and new field formats
  
- `updateVenueSchema` - Validates venue updates
  - All fields optional
  - At least one field required
  
- `venueQuerySchema` - Validates list/search queries
  - Pagination: limit, offset
  - Search: search term
  - Filters: type, status, city, state, features
  - Sorting: sort_by, sort_order

**Venue Types:** 23 types including stadium, arena, theater, comedy_club, nightclub, etc.

**Status Values:** PENDING, ACTIVE, INACTIVE, SUSPENDED, CLOSED

#### **settings.schema.ts**
Settings validation.

**Schema:**
- `updateSettingsSchema` - Validates settings updates
  - general: timezone, currency, language
  - ticketing: refunds, limits, waitlist
  - notifications: email, SMS, webhooks
  - branding: colors, logo

#### **integration.schema.ts**
Integration validation.

**Schemas:**
- `createIntegrationSchema` - Validates integration creation
  - provider/type: square, stripe, toast, mailchimp, twilio
  - config: provider-specific configuration
  - credentials: encrypted credentials (required)
  
- `updateIntegrationSchema` - Validates integration updates
  - config: configuration updates
  - status: active/inactive

---

### Other Folders

#### **integrations/**
External service adapters.

**Files:**
- `verification-adapters.ts` - Adapters for external verification services (Stripe Identity, Plaid, etc.)

#### **utils/**
Utility functions and helpers.

**Files:**
- `logger.ts` - Pino logger configuration
- `metrics.ts` - Prometheus metrics (venue operations, cache hits/misses)
- `errors.ts` - Custom error classes (NotFoundError, ForbiddenError, ConflictError)
- `error-response.ts` - Error response builder
- `tracing.ts` - OpenTelemetry tracing
- `circuitBreaker.ts` - Circuit breaker pattern
- `dbCircuitBreaker.ts` - DB-specific circuit breaker
- `dbWithRetry.ts` - DB retry logic
- `retry.ts` - Generic retry utility
- `httpClient.ts` - HTTP client with retry and circuit breaker
- `venue-audit-logger.ts` - Venue audit logging

#### **types/**
TypeScript type definitions.

**Files:**
- `routes.ts` - Route type definitions

#### **models/mongodb/**
MongoDB models for content storage.

**Files:**
- `venue-content.model.ts` - Mongoose model for venue content (seating charts, media, policies)

#### **tests/**
Test files.

**Files:**
- `setup.ts` - Test setup and teardown
- `services/` - Service unit tests

---

## Database Schema Summary

### PostgreSQL Tables (venue-service owns):

1. **venues** - 60+ columns for comprehensive venue data
2. **venue_staff** - Staff members and permissions
3. **venue_settings** - Ticketing and payment settings
4. **venue_integrations** - Third-party integrations
5. **venue_layouts** - Seating layouts
6. **venue_branding** - White-label branding
7. **custom_domains** - Custom domain management
8. **white_label_pricing** - Pricing tier definitions
9. **venue_tier_history** - Tier change audit trail
10. **venue_audit_log** - Comprehensive audit log
11. **api_keys** - API key management
12. **user_venue_roles** - User role assignments
13. **external_verifications** - External verification tracking
14. **manual_review_queue** - Manual review workflows
15. **notifications** - In-app notifications
16. **email_queue** - Email delivery queue
17. **venue_compliance_reviews** - Compliance reviews
18. **venue_compliance** - Compliance settings
19. **venue_compliance_reports** - Compliance reports
20. **venue_documents** - Verification documents

### MongoDB Collections:

- **venue_content** - Rich content (seating charts, media galleries, policies)

---

## External Services Configured

**config/ folder shows integrations with:**

1. **PostgreSQL** - Primary database
   - Connection pooling
   - Health monitoring
   - Knex query builder

2. **Redis** - Caching and pub/sub
   - Main client for caching
   - Pub/sub for real-time events
   - Rate limiting storage

3. **MongoDB** - Content storage
   - Rich content and media
   - Mongoose ODM

4. **RabbitMQ** - Message queue
   - Event publishing
   - Inter-service communication

5. **AWS Secrets Manager** - Secrets management
   - Credential storage
   - Environment-based fallback

6. **Stripe** - Payment processing
   - Stripe Connect onboarding
   - Webhook handling

7. **Third-party Integrations** (via integration.service.ts)
   - Square - POS integration
   - Toast - Restaurant POS
   - Mailchimp - Email marketing
   - Twilio - SMS notifications

8. **External Verification Services** (via verification-adapters.ts)
   - Stripe Identity - Identity verification
   - Plaid - Bank verification
   - Business verification services
   - Tax ID verification

---

## Key Features

### 🏢 Venue Management
- Comprehensive venue CRUD with 60+ fields
- Multi-venue support per user
- Soft deletion with constraint validation
- Full-text search with filters
- Capacity and statistics tracking

### 👥 Staff & Access Control
- Role-based access (owner, manager, staff, security, box_office)
- Permission system per staff member
- Staff limits per pricing tier
- Multi-venue staff assignments

### ⚙️ Settings & Configuration
- Ticketing settings (limits, refunds, transfers)
- Fee configuration (service fees, facility fees)
- Payment settings (methods, currencies, payouts)
- Notification preferences

### 🔌 Third-Party Integrations
- Payment processors (Stripe, Square)
- POS systems (Toast)
- Marketing (Mailchimp)
- SMS (Twilio)
- Encrypted credential storage
- Integration testing endpoints

### 🎨 White-Label Branding
- Custom colors, fonts, logos
- Custom CSS support
- Email branding
- Ticket branding
- Custom domains with SSL
- Three pricing tiers (standard, white_label, enterprise)

### 🌐 Custom Domains
- Domain verification via DNS
- Automated SSL certificate issuance (Let's Encrypt)
- Multi-domain support
- Domain status tracking

### ✅ Verification & Compliance
- External verification workflows (Stripe Identity, Plaid)
- Manual review queue
- Document submission and approval
- Compliance reporting
- Scheduled compliance reviews
- Audit logging for all actions

### 📄 Content Management
- Rich content storage in MongoDB
- Seating charts with sections
- Photo galleries
- Amenities and accessibility info
- Parking information
- Venue policies
- Content publishing workflow (draft → published → archived)

### ⭐ Reviews & Ratings
- User reviews with pros/cons
- Rating system with categories
- Helpful votes
- Review reporting
- Verified attendee badges

### 🔔 Notifications
- In-app notifications
- Email queue with templates
- Priority-based delivery
- Retry logic for failed emails

### 🚀 Performance & Reliability
- Redis caching with TTL
- Circuit breaker pattern for external calls
- Retry logic with exponential backoff
- Connection pooling
- Rate limiting per user/venue/operation
- Health checks for Kubernetes

### 🔒 Security & Audit
- Row Level Security on venues table
- JWT authentication
- API key support
- Comprehensive audit logging
- Encrypted credentials for integrations
- Internal service authentication with signatures

### 📊 Monitoring & Observability
- Prometheus metrics
- OpenTelemetry tracing
- Structured logging with Pino
- Health check endpoints
- Database pool monitoring

---

## Inter-Service Dependencies

**Calls Out To:**
- **auth-service** - User authentication and validation (via JWT)
- **compliance-service** - Proxied compliance requests
- **analytics-service** - Proxied analytics requests
- **@tickettoken/shared** - Shared services (ReviewService, RatingService, AuditService)

**Called By:**
- **event-service** - Venue validation and access checks
- **ticket-service** - Venue information and validation
- **order-service** - Venue data for orders
- **marketplace-service** - Venue listings

**Events Published** (RabbitMQ):
- `venue.created` - When venue is created
- `venue.updated` - When venue is updated
- `venue.deleted` - When venue is deleted

---

## Environment Variables Required

```
# Database
DATABASE_URL
DATABASE_POOL_MIN
DATABASE_POOL_MAX

# Redis
REDIS_URL

# MongoDB
MONGODB_URI

# RabbitMQ
RABBITMQ_URL

# JWT
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET

# AWS
AWS_REGION
AWS_ACCESS_KEY_ID (optional, uses IAM roles in production)
AWS_SECRET_ACCESS_KEY (optional)

# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET_VENUE

# Service URLs
COMPLIANCE_SERVICE_URL
ANALYTICS_SERVICE_URL

# Internal Authentication
INTERNAL_SERVICE_SECRET

# Encryption
ENCRYPTION_KEY (for credential encryption)

# Node Environment
NODE_ENV
PORT
```

---

## API Documentation

The service uses Fastify with Swagger/OpenAPI for automatic API documentation. Access at:
- **Swagger UI:** `http://localhost:3002/documentation`

---

## Summary

The **venue-service** is a comprehensive venue management platform that handles:
- ✅ Complete venue CRUD operations with 60+ fields
- ✅ Staff management with role-based access control
- ✅ White-label branding and custom domains
- ✅ Third-party integrations with encrypted credentials
- ✅ Verification workflows and compliance management
- ✅ Rich content management with MongoDB
- ✅ Reviews and ratings system
- ✅ Notification and email delivery
- ✅ Robust caching, monitoring, and error handling
- ✅ Event-driven architecture with RabbitMQ
- ✅ Security with RLS, JWT, and audit logging

It serves as the central hub for venue owners to manage all aspects of their venues, from basic information to advanced white-label customization and compliance requirements.
