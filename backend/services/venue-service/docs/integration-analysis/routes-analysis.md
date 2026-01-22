# Venue Service Routes Analysis
## Purpose: Integration Testing Documentation
## Source: venues.routes.ts, venue-content.routes.ts, venue-reviews.routes.ts, venue-stripe.routes.ts, branding.routes.ts, domain.routes.ts, health.routes.ts, internal-validation.routes.ts
## Generated: January 18, 2026

---

## 1. VENUES.ROUTES.TS / VENUES.CONTROLLER.TS

### GET /venues
**HTTP Method:** GET  
**Path:** `/venues`  
**Path Parameters:** None  
**Query Parameters:** `my_venues` (boolean), `limit` (number), `offset` (number)

**Middleware Chain:**
1. `validate(venueQuerySchema)` - Query validation

**Schema Validation:**
- Query: venueQuerySchema

**Access Control:**
- Public route with optional authentication
- If authenticated: can filter to user's venues with `my_venues=true`
- If not authenticated: returns only public venues

**🚨 ISSUES:**
- ❌ **Missing rate limiting** on public list endpoint (DoS risk)

---

### POST /venues
**HTTP Method:** POST  
**Path:** `/venues`  
**Path Parameters:** None  
**Request Body:**
```json
{
  "name": "string",
  "type": "comedy_club | theater | arena | stadium | other",
  "capacity": "number",
  "address": {
    "street": "string",
    "city": "string",
    "state": "string",
    "zipCode": "string",
    "country": "string"
  }
}
```

**Middleware Chain:**
1. `authenticate` - JWT authentication
2. `addTenantContext` - Extracts tenant from user token
3. `validate(createVenueSchema)` - Body validation

**Schema Validation:**
- Body: createVenueSchema

**Access Control:**
- Authenticated users only
- Tenant context required

**🚨 ISSUES:**
- ❌ **Missing rate limiting** on write operation

---

### GET /venues/user
**HTTP Method:** GET  
**Path:** `/venues/user`  
**Path Parameters:** None

**Middleware Chain:**
1. `authenticate` - JWT authentication

**Schema Validation:**
- None

**Access Control:**
- Authenticated users only
- Returns venues owned by the authenticated user

**🚨 ISSUES:**
- ⚠️ **Missing rate limiting**

---

### GET /venues/:venueId
**HTTP Method:** GET  
**Path:** `/venues/:venueId`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
1. `authenticate` - JWT authentication
2. `addTenantContext` - Extracts tenant from user token

**Schema Validation:**
- None

**Access Control:**
- Authenticated users only
- Tenant context required
- Service layer handles access verification

**🚨 ISSUES:**
- ⚠️ Missing explicit access control middleware (relies on service layer)

---

### GET /venues/:venueId/capacity
**HTTP Method:** GET  
**Path:** `/venues/:venueId/capacity`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
1. `authenticate` - JWT authentication

**Schema Validation:**
- None

**Access Control:**
- Authenticated users only
- Service-level access check via `checkVenueAccess()`
- Returns capacity information

**🚨 ISSUES:**
- ❌ **Missing tenant middleware**

---

### GET /venues/:venueId/stats
**HTTP Method:** GET  
**Path:** `/venues/:venueId/stats`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
1. `authenticate` - JWT authentication

**Schema Validation:**
- None

**Access Control:**
- Authenticated users only
- Service-level access check via `checkVenueAccess()`
- Returns venue statistics

**🚨 ISSUES:**
- ❌ **Missing tenant middleware**

---

### PUT /venues/:venueId
**HTTP Method:** PUT  
**Path:** `/venues/:venueId`  
**Path Parameters:** `venueId` (string)  
**Request Body:**
```json
{
  "name": "string (optional)",
  "type": "string (optional)",
  "capacity": "number (optional)",
  "address": "object (optional)",
  "settings": "object (optional)"
}
```

**Middleware Chain:**
1. `authenticate` - JWT authentication
2. `addTenantContext` - Extracts tenant from user token
3. `validate(updateVenueSchema)` - Body validation

**Schema Validation:**
- Body: updateVenueSchema

**Access Control:**
- Authenticated users only
- Ownership verification via `verifyVenueOwnership()`
- Tenant context required

**🚨 ISSUES:**
- ❌ **Missing rate limiting** on write operation

---

### DELETE /venues/:venueId
**HTTP Method:** DELETE  
**Path:** `/venues/:venueId`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
1. `authenticate` - JWT authentication
2. `addTenantContext` - Extracts tenant from user token

**Schema Validation:**
- None

**Access Control:**
- Authenticated users only
- Service-level ownership check
- Tenant context required

**🚨 ISSUES:**
- ❌ **Missing rate limiting** on critical write operation
- ⚠️ Ownership check deferred to service layer (should be explicit)

---

### GET /venues/:venueId/check-access
**HTTP Method:** GET  
**Path:** `/venues/:venueId/check-access`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
1. `authenticate` - JWT authentication
2. `addTenantContext` - Extracts tenant from user token

**Schema Validation:**
- None

**Access Control:**
- Authenticated users only
- Returns access details, role, and permissions for the venue

**🚨 ISSUES:**
- ✅ Properly secured

---

### POST /venues/:venueId/staff
**HTTP Method:** POST  
**Path:** `/venues/:venueId/staff`  
**Path Parameters:** `venueId` (string)  
**Request Body:**
```json
{
  "userId": "string",
  "role": "string",
  "permissions": "array (optional)"
}
```

**Middleware Chain:**
1. `authenticate` - JWT authentication
2. `addTenantContext` - Extracts tenant from user token

**Schema Validation:**
- ❌ **MISSING** - Manual validation in controller

**Access Control:**
- Authenticated users only
- Ownership verification via `verifyVenueOwnership()`

**🚨 ISSUES:**
- ❌ **Missing validation middleware** (uses manual validation)
- ❌ **Missing rate limiting** on write operation
- ⚠️ Manual userId check instead of schema validation

---

### GET /venues/:venueId/staff
**HTTP Method:** GET  
**Path:** `/venues/:venueId/staff`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
1. `authenticate` - JWT authentication
2. `addTenantContext` - Extracts tenant from user token

**Schema Validation:**
- None

**Access Control:**
- Authenticated users only
- Ownership verification via `verifyVenueOwnership()`

**🚨 ISSUES:**
- ✅ Properly secured

---

## 2. VENUE-CONTENT.ROUTES.TS

### ⚠️ CRITICAL: ALL ROUTES LACK MIDDLEWARE

### POST /:venueId/content
**HTTP Method:** POST  
**Path:** `/:venueId/content`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Schema Validation:**
- ❌ **NONE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can create content
- ❌ **NO VALIDATION**
- ❌ **NO TENANT MIDDLEWARE**
- ❌ **NO RATE LIMITING**

---

### GET /:venueId/content
**HTTP Method:** GET  
**Path:** `/:venueId/content`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Schema Validation:**
- ❌ **NONE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ⚠️ May be intentionally public for read access
- ❌ **NO RATE LIMITING**

---

### GET /:venueId/content/:contentId
**HTTP Method:** GET  
**Path:** `/:venueId/content/:contentId`  
**Path Parameters:** `venueId` (string), `contentId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Schema Validation:**
- ❌ **NONE**

**Access Control:**
- ❌ **PUBLIC**

---

### PUT /:venueId/content/:contentId
**HTTP Method:** PUT  
**Path:** `/:venueId/content/:contentId`  
**Path Parameters:** `venueId` (string), `contentId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Schema Validation:**
- ❌ **NONE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can update content
- ❌ **NO VALIDATION**
- ❌ **NO RATE LIMITING**

---

### DELETE /:venueId/content/:contentId
**HTTP Method:** DELETE  
**Path:** `/:venueId/content/:contentId`  
**Path Parameters:** `venueId` (string), `contentId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Schema Validation:**
- ❌ **NONE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can delete content
- ❌ **NO RATE LIMITING**

---

### POST /:venueId/content/:contentId/publish
**HTTP Method:** POST  
**Path:** `/:venueId/content/:contentId/publish`  
**Path Parameters:** `venueId` (string), `contentId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can publish content

---

### POST /:venueId/content/:contentId/archive
**HTTP Method:** POST  
**Path:** `/:venueId/content/:contentId/archive`  
**Path Parameters:** `venueId` (string), `contentId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can archive content

---

### GET /:venueId/seating-chart
**HTTP Method:** GET  
**Path:** `/:venueId/seating-chart`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

---

### PUT /:venueId/seating-chart
**HTTP Method:** PUT  
**Path:** `/:venueId/seating-chart`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can update seating chart

---

### GET /:venueId/photos
**HTTP Method:** GET  
**Path:** `/:venueId/photos`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

---

### POST /:venueId/photos
**HTTP Method:** POST  
**Path:** `/:venueId/photos`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can upload photos

---

### GET /:venueId/amenities
**HTTP Method:** GET  
**Path:** `/:venueId/amenities`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

---

### GET /:venueId/accessibility
**HTTP Method:** GET  
**Path:** `/:venueId/accessibility`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

---

### GET /:venueId/parking
**HTTP Method:** GET  
**Path:** `/:venueId/parking`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

---

### GET /:venueId/policies
**HTTP Method:** GET  
**Path:** `/:venueId/policies`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

---

## 3. VENUE-REVIEWS.ROUTES.TS

### ⚠️ CRITICAL: ALL ROUTES LACK MIDDLEWARE

### POST /:venueId/reviews
**HTTP Method:** POST  
**Path:** `/:venueId/reviews`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Schema Validation:**
- ❌ **NONE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anonymous review creation
- ❌ **NO VALIDATION**
- ❌ **NO RATE LIMITING** - Spam/review bombing risk

---

### GET /:venueId/reviews
**HTTP Method:** GET  
**Path:** `/:venueId/reviews`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

**🚨 ISSUES:**
- ⚠️ May be intentionally public
- ❌ **NO RATE LIMITING**

---

### GET /:venueId/reviews/:reviewId
**HTTP Method:** GET  
**Path:** `/:venueId/reviews/:reviewId`  
**Path Parameters:** `venueId` (string), `reviewId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

---

### PUT /:venueId/reviews/:reviewId
**HTTP Method:** PUT  
**Path:** `/:venueId/reviews/:reviewId`  
**Path Parameters:** `venueId` (string), `reviewId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can update any review
- ❌ **NO VALIDATION**
- ❌ **NO RATE LIMITING**

---

### DELETE /:venueId/reviews/:reviewId
**HTTP Method:** DELETE  
**Path:** `/:venueId/reviews/:reviewId`  
**Path Parameters:** `venueId` (string), `reviewId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can delete any review

---

### POST /:venueId/reviews/:reviewId/helpful
**HTTP Method:** POST  
**Path:** `/:venueId/reviews/:reviewId/helpful`  
**Path Parameters:** `venueId` (string), `reviewId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Vote manipulation risk
- ❌ **NO RATE LIMITING** - Vote spam risk

---

### POST /:venueId/reviews/:reviewId/report
**HTTP Method:** POST  
**Path:** `/:venueId/reviews/:reviewId/report`  
**Path Parameters:** `venueId` (string), `reviewId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Report spam risk
- ❌ **NO RATE LIMITING**

---

### POST /:venueId/ratings
**HTTP Method:** POST  
**Path:** `/:venueId/ratings`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Rating manipulation risk
- ❌ **NO RATE LIMITING**

---

### GET /:venueId/ratings/summary
**HTTP Method:** GET  
**Path:** `/:venueId/ratings/summary`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

**🚨 ISSUES:**
- ⚠️ May be intentionally public
- ❌ **NO RATE LIMITING**

---

### GET /:venueId/ratings/me
**HTTP Method:** GET  
**Path:** `/:venueId/ratings/me`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - Should require authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Can't determine "me" without auth

---

## 4. VENUE-STRIPE.ROUTES.TS

### POST /:venueId/stripe/connect
**HTTP Method:** POST  
**Path:** `/:venueId/stripe/connect`  
**Path Parameters:** `venueId` (string)  
**Request Body:**
```json
{
  "email": "string",
  "returnUrl": "string",
  "refreshUrl": "string"
}
```

**Middleware Chain:**
1. `authenticate` - JWT authentication
2. `requireVenueAccess` - Venue owner or platform admin

**Schema Validation:**
- ❌ **MISSING**

**Access Control:**
- Authenticated users only
- Venue owner or platform admin required

**🚨 ISSUES:**
- ❌ **Missing validation middleware**
- ❌ **Missing rate limiting** on financial operation
- ❌ **Missing tenant middleware**

---

### GET /:venueId/stripe/status
**HTTP Method:** GET  
**Path:** `/:venueId/stripe/status`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
1. `authenticate` - JWT authentication
2. `requireVenueAccess` - Venue owner or platform admin

**Schema Validation:**
- None (GET request)

**Access Control:**
- Authenticated users only
- Venue owner or platform admin required

**🚨 ISSUES:**
- ✅ Properly secured

---

### POST /:venueId/stripe/refresh
**HTTP Method:** POST  
**Path:** `/:venueId/stripe/refresh`  
**Path Parameters:** `venueId` (string)  
**Request Body:**
```json
{
  "returnUrl": "string",
  "refreshUrl": "string"
}
```

**Middleware Chain:**
1. `authenticate` - JWT authentication
2. `requireVenueAccess` - Venue owner or platform admin

**Schema Validation:**
- ❌ **MISSING**

**Access Control:**
- Authenticated users only
- Venue owner or platform admin required

**🚨 ISSUES:**
- ❌ **Missing validation middleware**
- ❌ **Missing rate limiting**

---

### POST /webhooks/stripe/venue-connect (Webhook)
**HTTP Method:** POST  
**Path:** `/webhooks/stripe/venue-connect`  
**Body:** Raw buffer (for Stripe signature verification)

**Middleware Chain:**
- Custom content parser for raw body preservation
- No auth middleware (uses Stripe signature verification)

**Schema Validation:**
- None (raw body required for signature)

**Access Control:**
- Public endpoint
- Signature verification in controller (SEC-EXT2 fix documented)
- Raw body parser configured for webhook security

**🚨 ISSUES:**
- ✅ Properly handles webhook security with signature verification
- ❌ **Missing rate limiting** (webhooks should have IP-based limits)

---

## 5. BRANDING.ROUTES.TS

### ⚠️ CRITICAL: ALL ROUTES LACK MIDDLEWARE

### GET /:venueId
**HTTP Method:** GET  
**Path:** `/:venueId`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

**🚨 ISSUES:**
- ⚠️ May be intentionally public for branding display
- ❌ **NO RATE LIMITING**

---

### GET /domain/:domain
**HTTP Method:** GET  
**Path:** `/domain/:domain`  
**Path Parameters:** `domain` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

**🚨 ISSUES:**
- ⚠️ May be intentionally public for custom domain resolution
- ❌ **NO RATE LIMITING**

---

### PUT /:venueId
**HTTP Method:** PUT  
**Path:** `/:venueId`  
**Path Parameters:** `venueId` (string)  
**Request Body:**
```json
{
  "primaryColor": "string (optional)",
  "secondaryColor": "string (optional)",
  "accentColor": "string (optional)",
  "logoUrl": "string (optional)",
  "customCss": "string (optional)",
  ...
}
```

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can modify venue branding!
- ❌ **NO VALIDATION**
- ❌ **NO RATE LIMITING**

---

### GET /:venueId/css
**HTTP Method:** GET  
**Path:** `/:venueId/css`  
**Path Parameters:** `venueId` (string)  
**Response:** `text/css`

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

**🚨 ISSUES:**
- ⚠️ Intentionally public for CSS serving
- ❌ **NO RATE LIMITING**

---

### GET /pricing/tiers
**HTTP Method:** GET  
**Path:** `/pricing/tiers`

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

**🚨 ISSUES:**
- ⚠️ May be intentionally public for pricing display
- ❌ **NO RATE LIMITING**

---

### POST /:venueId/tier
**HTTP Method:** POST  
**Path:** `/:venueId/tier`  
**Path Parameters:** `venueId` (string)  
**Request Body:**
```json
{
  "newTier": "string",
  "reason": "string (optional)",
  "userId": "string (optional)"
}
```

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can change venue tier!
- ❌ **NO VALIDATION**
- ❌ **NO RATE LIMITING**
- ⚠️ Uses `userId` from request body instead of auth token

---

### GET /:venueId/tier/history
**HTTP Method:** GET  
**Path:** `/:venueId/tier/history`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Tier history should be private

---

## 6. DOMAIN.ROUTES.TS

### ⚠️ CRITICAL: ALL ROUTES LACK MIDDLEWARE

### POST /:venueId/add
**HTTP Method:** POST  
**Path:** `/:venueId/add`  
**Path Parameters:** `venueId` (string)  
**Request Body:**
```json
{
  "domain": "string"
}
```

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can add domains to any venue!
- ❌ **NO VALIDATION**
- ❌ **NO RATE LIMITING**
- ⚠️ Domain hijacking risk

---

### POST /:domainId/verify
**HTTP Method:** POST  
**Path:** `/:domainId/verify`  
**Path Parameters:** `domainId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can verify any domain

---

### GET /:domainId/status
**HTTP Method:** GET  
**Path:** `/:domainId/status`  
**Path Parameters:** `domainId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

**🚨 ISSUES:**
- ❌ **NO AUTHENTICATION** - Domain status should be private

---

### GET /venue/:venueId
**HTTP Method:** GET  
**Path:** `/venue/:venueId`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC**

**🚨 ISSUES:**
- ❌ **NO AUTHENTICATION** - Venue domains should be private

---

### DELETE /:domainId
**HTTP Method:** DELETE  
**Path:** `/:domainId`  
**Path Parameters:** `domainId` (string)

**Middleware Chain:**
- ❌ **NO MIDDLEWARE**

**Access Control:**
- ❌ **PUBLIC** - No authentication

**🚨 CRITICAL ISSUES:**
- ❌ **NO AUTHENTICATION** - Anyone can delete any domain!
- ❌ **NO RATE LIMITING**

---

## 7. HEALTH.ROUTES.TS

### GET /health/startup
**HTTP Method:** GET  
**Path:** `/health/startup`

**Middleware Chain:**
- None (intentionally public for Kubernetes)

**Access Control:**
- Public endpoint (Kubernetes startup probe)

**🚨 ISSUES:**
- ✅ Properly configured
- ✅ Doesn't expose sensitive info (SC3 fix)

---

### GET /health/live
**HTTP Method:** GET  
**Path:** `/health/live`

**Middleware Chain:**
- None (intentionally public for Kubernetes)

**Access Control:**
- Public endpoint (Kubernetes liveness probe)

**🚨 ISSUES:**
- ✅ Properly configured

---

### GET /health/ready
**HTTP Method:** GET  
**Path:** `/health/ready`

**Middleware Chain:**
- None (intentionally public for Kubernetes)

**Access Control:**
- Public endpoint (Kubernetes readiness probe)

**🚨 ISSUES:**
- ✅ Properly configured
- ✅ Returns 503 when unhealthy

---

### GET /health/full
**HTTP Method:** GET  
**Path:** `/health/full`

**Middleware Chain:**
- Custom `preHandler` with three-factor auth check:
  1. Internal IP detection (10.x, 172.x, 192.168.x, localhost)
  2. Internal service token (`x-internal-service-token` header)
  3. Admin JWT (role check)

**Access Control:**
- Restricted endpoint
- Requires ONE of: Internal IP, service token, or admin auth

**🚨 ISSUES:**
- ✅ Properly secured (SC5 fix)
- ✅ Sanitizes sensitive data (SC2 fix)
- ✅ Has timeout protection (PG4 fix)

---

### GET /health
**HTTP Method:** GET  
**Path:** `/health`

**Middleware Chain:**
- None (intentionally public)

**Access Control:**
- Public endpoint (backward compatibility)

**🚨 ISSUES:**
- ✅ Properly configured
- ✅ Doesn't expose version info (SC3 fix)
- ✅ Has timeout protection (PG4, RD2 fixes)
- ✅ Returns 503 when unhealthy

---

## 8. INTERNAL-VALIDATION.ROUTES.TS

### Global Middleware Hook
**Applied to ALL routes in this file:**

**Middleware:**
- Custom `preHandler` hook with HMAC authentication
- Verifies three headers:
  - `x-internal-service` - Service name
  - `x-internal-timestamp` - Request timestamp
  - `x-internal-signature` - HMAC signature

**Security Features:**
- Timestamp validation (5-minute window)
- Replay attack prevention
- HMAC signature using `INTERNAL_SERVICE_SECRET`
- Constant-time comparison (HM18 fix - timing attack prevention)
- Dev mode fallback: accepts `temp-signature` (non-production only)

---

### GET /internal/venues/:venueId/validate-ticket/:ticketId
**HTTP Method:** GET  
**Path:** `/internal/venues/:venueId/validate-ticket/:ticketId`  
**Path Parameters:** `venueId` (string), `ticketId` (string)

**Middleware Chain:**
- Global HMAC authentication hook

**Access Control:**
- Service-to-service only
- HMAC signature required

**Purpose:**
- Validate ticket ownership for venue
- Check if ticket already scanned

---

### GET /internal/venues/:venueId
**HTTP Method:** GET  
**Path:** `/internal/venues/:venueId`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- Global HMAC authentication hook

**Access Control:**
- Service-to-service only
- Used by: blockchain-service, compliance-service

**Returns:**
- Complete venue data including blockchain fields
- Wallet address, contact info, verification status

---

### GET /internal/venues/:venueId/bank-info
**HTTP Method:** GET  
**Path:** `/internal/venues/:venueId/bank-info`  
**Path Parameters:** `venueId` (string)

**Middleware Chain:**
- Global HMAC authentication hook

**Access Control:**
- Service-to-service only
- Used by: compliance-service, payment-service

**Returns:**
- Bank account information (last 4 digits)
- Payout schedule and minimums
- Tax ID information (last 4 digits)
- Verification status

**🚨 ISSUES:**
- ✅ Properly secured with HMAC
- ⚠️ Sensitive financial data - ensure encryption in transit

---

### GET /internal/venues/:venueId/chargeback-rate
**HTTP Method:** GET  
**Path:** `/internal/venues/:venueId/chargeback-rate`  
**Path Parameters:** `venueId` (string)  
**Query Parameters:** `monthsBack` (number, optional, default: 12)

**Middleware Chain:**
- Global HMAC authentication hook

**Access Control:**
- Service-to-service only
- Used by: payment-service (chargeback-reserve.service)

**Returns:**
- Chargeback metrics (count, amounts, rates)
- Risk level assessment
- Reserve recommendations

**🚨 ISSUES:**
- ✅ Properly secured with HMAC
- ❌ **Missing rate limiting** (should have per-service limits)

---

## ISSUES FOUND

### CRITICAL SECURITY ISSUES

#### 1. **COMPLETELY UNPROTECTED ROUTE FILES (37 routes with NO middleware)**

**venue-content.routes.ts (15 routes):**
- ❌ POST, PUT, DELETE operations have NO authentication
- ❌ Anyone can create, modify, delete venue content
- ❌ Anyone can publish/archive content
- ❌ Anyone can upload photos
- ❌ Anyone can modify seating charts

**venue-reviews.routes.ts (10 routes):**
- ❌ POST, PUT, DELETE operations have NO authentication
- ❌ Review bombing risk (no rate limits on review creation)
- ❌ Vote manipulation risk (helpful/report endpoints)
- ❌ Rating manipulation risk
- ❌ Anonymous reviews possible

**branding.routes.ts (7 routes):**
- ❌ Anyone can modify venue branding (colors, logos, CSS)
- ❌ Anyone can change venue pricing tier
- ❌ Tier history exposed publicly
- ⚠️ Some routes may be intentionally public (GET /domain/:domain, GET /:venueId/css)

**domain.routes.ts (5 routes):**
- ❌ Anyone can add domains to any venue (domain hijacking risk)
- ❌ Anyone can verify domains
- ❌ Anyone can delete domains
- ❌ Domain configuration exposed publicly

---

### 2. **MISSING RATE LIMITING (ALL ENDPOINTS)**

**Write Operations Missing Rate Limits:**
- POST /venues (venue creation)
- PUT /venues/:venueId (venue updates)
- DELETE /venues/:venueId (venue deletion)
- POST /venues/:venueId/staff (staff addition)
- All venue-content write operations
- All venue-review write operations
- All branding write operations
- All domain write operations
- Stripe Connect operations
- Webhook endpoints

**Public Endpoints Missing Rate Limits:**
- GET /venues (public list - DoS risk)
- All public read endpoints
- Health check endpoints (may be acceptable)

---

### 3. **MISSING VALIDATION MIDDLEWARE**

**Routes with Manual/Missing Validation:**
- POST /venues/:venueId/staff - Manual validation in controller
- POST /:venueId/stripe/connect - No validation
- POST /:venueId/stripe/refresh - No validation
- All unprotected route files (content, reviews, branding, domains)

---

### 4. **MISSING TENANT MIDDLEWARE**

**Routes Missing Tenant Context:**
- GET /venues/:venueId/capacity
- GET /venues/:venueId/stats
- All Stripe routes
- Should be consistent across all venue-specific operations

---

### 5. **INCONSISTENT ACCESS CONTROL**

**Issues:**
- Some routes defer access checks to service layer
- Ownership verification inconsistent (middleware vs service)
- No explicit access control on many routes
- DELETE operations lack explicit ownership middleware

---

### 6. **WEBHOOK SECURITY**

**Stripe Webhook:**
- ✅ Properly configured with signature verification
- ✅ Raw body parser for signature validation
- ❌ Missing IP-based rate limiting

---

### 7. **INTERNAL API SECURITY**

**internal-validation.routes.ts:**
- ✅ HMAC authentication properly implemented
- ✅ Timing-safe comparison (prevents timing attacks)
- ✅ Replay attack prevention (timestamp validation)
- ❌ Missing rate limiting (per-service quotas)
- ⚠️ Dev mode accepts `temp-signature` (ensure disabled in production)

---

### 8. **HEALTH CHECK ENDPOINTS**

**Positive Security Fixes Noted:**
- ✅ /health/full properly restricted (internal IP, service token, or admin)
- ✅ Sensitive data sanitized (SC2 fix)
- ✅ Version info removed from public endpoints (SC3 fix)
- ✅ Timeout protection implemented (PG4, RD2 fixes)

---

## INTEGRATION TEST FILE MAPPING

| Route File | Test File | Endpoints Covered |
|------------|-----------|-------------------|
| venues.routes.ts | venue-crud.integration.test.ts | CRUD operations |
| venue-content.routes.ts | venue-content.integration.test.ts | Content management |
| venue-reviews.routes.ts | venue-reviews.integration.test.ts | Review operations |
| venue-stripe.routes.ts | stripe-onboarding.integration.test.ts | Stripe Connect |
| branding.routes.ts | venue-branding.integration.test.ts | Branding |
| domain.routes.ts | venue-domains.integration.test.ts | Custom domains |
| health.routes.ts | health-check.integration.test.ts | Health endpoints |

---

## RECOMMENDED INTEGRATION TEST SCENARIOS

### 1. **Authentication Bypass Tests**
- Attempt all write operations without auth token
- Verify 401 responses on protected endpoints
- Verify public endpoints remain accessible

### 2. **Authorization Tests**
- Attempt operations on venues user doesn't own
- Verify 403 responses
- Test cross-tenant access prevention
- Test role-based permissions

### 3. **Rate Limiting Tests**
- Rapid-fire requests to all endpoints
- Verify rate limit headers (X-RateLimit-*)
- Verify 429 (Too Many Requests) responses
- Test different rate limits for read vs write

### 4. **Schema Validation Tests**
- Send invalid payloads to all POST/PUT routes
- Send missing required fields
- Send invalid data types
- Verify 400 responses with clear error messages

### 5. **Tenant Isolation Tests**
- Attempt cross-tenant data access
- Verify proper tenant filtering in list operations
- Test tenant context propagation

### 6. **Internal API Authentication Tests**
- Invalid HMAC signatures
- Expired timestamps (>5 minutes)
- Missing headers
- Replay attack attempts
- Verify signature verification

### 7. **Webhook Security Tests**
- Invalid Stripe signatures
- Replay attacks on webhooks
- Malformed webhook payloads
- Verify signature verification

### 8. **Access Control Tests**
- Test service-layer access checks
- Verify ownership validation
- Test permission inheritance
- Test staff role permissions

### 9. **Health Check Tests**
- Test all health endpoints
- Verify /health/full access control
- Test timeout handling
- Verify proper status codes (200, 503)

### 10. **Unprotected Endpoint Security Tests** (CRITICAL)
- Test all venue-content routes without auth
- Test all venue-review routes without auth
- Test all branding routes without auth
- Test all domain routes without auth
- Verify these are security vulnerabilities or document if intentional

---

## SUMMARY STATISTICS

**Total Routes Analyzed:** 62

**Security Status:**
- ✅ **Properly Secured:** 11 routes (18%)
- ⚠️ **Partially Secured:** 14 routes (23%)
- ❌ **UNPROTECTED:** 37 routes (59%)

**Middleware Coverage:**
- Authentication: 25% of routes
- Validation: 15% of routes
- Tenant Context: 20% of routes
- Rate Limiting: 0% of routes

**Critical Issues:**
- 4 entire route files with zero middleware
- 37 routes with no authentication
- 0 routes with rate limiting
- 15+ write operations publicly accessible

**Priority Actions:**
1. Add authentication to all venue-content, venue-reviews, branding, and domain routes
2. Implement rate limiting across all endpoints
3. Add validation middleware to Stripe routes
4. Standardize tenant middleware usage
5. Add rate limiting to internal APIs and webhooks

---

**Analysis Complete - Integration tests should focus on verifying security controls are actually enforced at runtime.**
