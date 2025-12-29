# Venue Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Security | 5 | CRITICAL |
| Data Integrity | 2 | HIGH |
| Frontend Features | 3 | HIGH |

---

## Security Issues (CRITICAL)

### GAP-VENUE-001: Stripe Routes Have No Authentication
- **Severity:** CRITICAL
- **Audit:** 01-security.md
- **Location:** `venue-stripe.routes.ts` lines 19, 28, 38
- **Current:** Stripe Connect routes have TODO comments but no actual auth
- **Risk:** Anyone can connect/disconnect Stripe accounts, steal payouts
- **Fix:** Add authentication middleware requiring venue owner or admin role

### GAP-VENUE-002: Default Tenant Fallback Bypass
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:** Falls back to `'00000000-0000-0000-0000-000000000001'` if no tenant
- **Risk:** Requests without tenant get default tenant access, data leakage
- **Fix:** Remove fallback, reject requests with missing tenant (401/403)

### GAP-VENUE-003: No Dedicated Tenant Middleware
- **Severity:** CRITICAL
- **Audit:** 09-multi-tenancy.md
- **Current:** Every controller manually extracts tenant with unsafe fallback
- **Risk:** Inconsistent handling, easy to forget, unsafe fallback repeated everywhere
- **Fix:** Create centralized tenant middleware that rejects missing tenant

### GAP-VENUE-004: API Keys Stored in Plaintext
- **Severity:** CRITICAL
- **Audit:** 01-security.md
- **Current:** API keys stored as-is in database
- **Risk:** Database breach exposes all API keys
- **Fix:** Hash API keys before storing, only show once on creation

### GAP-VENUE-005: Hardcoded HMAC Secret
- **Severity:** CRITICAL
- **Audit:** 05-s2s-auth.md
- **Current:** Default HMAC secret in code used if env var missing
- **Risk:** Anyone who reads code can forge S2S requests
- **Fix:** Remove default, crash on startup if HMAC_SECRET not set

---

## Data Integrity Issues (HIGH)

### GAP-VENUE-006: RLS Context Not Set in Transactions
- **Severity:** HIGH
- **Audit:** 09-multi-tenancy.md
- **Current:** RLS policies exist but `SET LOCAL app.current_tenant_id` not called
- **Risk:** RLS might fail open/closed unpredictably, data isolation not guaranteed
- **Fix:** At start of every transaction run:
```sql
SET LOCAL app.current_tenant_id = '<tenant-uuid>';
```

### GAP-VENUE-007: No Stripe Idempotency Keys
- **Severity:** HIGH
- **Audit:** 07-idempotency.md
- **Current:** Stripe API calls don't include idempotency keys
- **Risk:** Timeout + retry = duplicate charges or duplicate connections
- **Fix:** Generate idempotency key per operation, pass to Stripe, store to prevent replays

### GAP-VENUE-008: Settings Route Missing Validation
- **Severity:** HIGH
- **Audit:** 02-input-validation.md
- **Current:** PUT settings accepts any JSON without validation
- **Risk:** Inject unexpected fields, corrupt settings, no type safety
- **Fix:** Add Joi/Zod schema defining allowed fields and types

---

## Frontend-Related Gaps

### GAP-VENUE-009: No Venue Follow System
- **Severity:** HIGH
- **User Story:** "I want to follow this venue to see their new events"
- **Current:** No table, no endpoints
- **Needed:**
  - Uses platform-wide `user_follows` table (see PLATFORM_GAPS.md)
  - POST /venues/:id/follow
  - DELETE /venues/:id/follow
  - GET /venues/:id should include `follower_count` and `is_following`
- **Impact:** Can't build "Follow" button, can't build "Following" feed

### GAP-VENUE-010: No Trending/Popular Venues
- **Severity:** MEDIUM
- **User Story:** "Show me popular venues near me"
- **Current:** No endpoint
- **Needed:**
  - GET /venues/popular or /venues/trending
  - Sort by: upcoming event count, ticket sales, follower count, rating
  - Filter by: location, category
- **Impact:** Can't build "Popular Venues" section on home screen

### GAP-VENUE-011: No Public Venue Stats
- **Severity:** MEDIUM
- **User Story:** "I want to see how popular this venue is before buying tickets"
- **Current:** GET /:venueId/stats exists but is owner-only dashboard data
- **Needed:**
  - GET /venues/:id should include public stats:
    - upcoming_event_count
    - average_rating
    - follower_count
    - total_events_hosted
  - Or separate GET /venues/:id/public-stats
- **Impact:** Venue pages look empty without social proof

---

## Existing Endpoints (Verified Working)

### Venues
- GET /venues ✅
- POST /venues ✅
- GET /venues/user ✅
- GET /venues/:venueId ✅
- GET /venues/:venueId/capacity ✅
- GET /venues/:venueId/stats ✅ (owner only)
- PUT /venues/:venueId ✅
- DELETE /venues/:venueId ✅
- GET /venues/:venueId/check-access ✅

### Staff
- POST /venues/:venueId/staff ✅
- GET /venues/:venueId/staff ✅

### Settings
- GET /venues/:venueId/settings ✅
- PUT /venues/:venueId/settings ⚠️ (no validation)

### Integrations
- GET /venues/:venueId/integrations ✅
- POST /venues/:venueId/integrations ✅
- GET /venues/:venueId/integrations/:id ✅
- PUT /venues/:venueId/integrations/:id ✅
- DELETE /venues/:venueId/integrations/:id ✅
- POST /venues/:venueId/integrations/:id/test ✅

### Stripe Connect
- POST /venues/:venueId/stripe/connect ⚠️ (no auth)
- GET /venues/:venueId/stripe/status ⚠️ (no auth)
- POST /venues/:venueId/stripe/refresh ⚠️ (no auth)

### Branding
- GET /venues/:venueId/branding ✅
- PUT /venues/:venueId/branding ✅
- GET /venues/:venueId/branding/css ✅
- GET /branding/pricing/tiers ✅
- POST /venues/:venueId/tier ✅

### Custom Domains
- POST /venues/:venueId/domains/add ✅
- POST /domains/:domainId/verify ✅
- GET /domains/:domainId/status ✅
- DELETE /domains/:domainId ✅

### Content (MongoDB)
- POST /venues/:venueId/content ✅
- GET /venues/:venueId/content ✅
- PUT /venues/:venueId/content/:id ✅
- DELETE /venues/:venueId/content/:id ✅
- POST /venues/:venueId/content/:id/publish ✅
- GET /venues/:venueId/seating-chart ✅
- PUT /venues/:venueId/seating-chart ✅
- GET /venues/:venueId/photos ✅
- POST /venues/:venueId/photos ✅

### Reviews
- POST /venues/:venueId/reviews ✅
- GET /venues/:venueId/reviews ✅
- PUT /venues/:venueId/reviews/:id ✅
- DELETE /venues/:venueId/reviews/:id ✅
- POST /venues/:venueId/reviews/:id/helpful ✅
- POST /venues/:venueId/ratings ✅

### Health
- GET /health/live ✅
- GET /health/ready ✅
- GET /health/full ✅

### Internal
- GET /internal/venues/:venueId/validate-ticket/:ticketId ✅ (HMAC auth)

---

## Database Tables (21 tables)

| Table | Status | Notes |
|-------|--------|-------|
| venues | ✅ | Main table, 60+ columns |
| venue_staff | ✅ | Staff assignments |
| venue_settings | ✅ | Configuration |
| venue_integrations | ✅ | Third-party integrations |
| venue_layouts | ✅ | Seating layouts |
| venue_branding | ✅ | White-label branding |
| custom_domains | ✅ | Custom domain management |
| white_label_pricing | ✅ | Pricing tiers |
| venue_tier_history | ✅ | Tier change tracking |
| venue_audit_log | ✅ | Audit trail |
| api_keys | ⚠️ | Stored unhashed |
| user_venue_roles | ✅ | Role assignments |
| external_verifications | ✅ | Stripe Identity, Plaid |
| manual_review_queue | ✅ | Review workflows |
| notifications | ✅ | In-app notifications |
| email_queue | ✅ | Email delivery queue |
| venue_compliance_reviews | ✅ | Scheduled reviews |
| venue_compliance | ✅ | Compliance settings |
| venue_compliance_reports | ✅ | Report history |
| venue_documents | ✅ | Verification documents |
| venue_followers | ❌ | MISSING - use platform user_follows |

---

## Cross-Service Dependencies

| This service needs from | What |
|------------------------|------|
| auth-service | User authentication, role verification |
| payment-service | Stripe Connect coordination |
| file-service | Image uploads (logo, cover, gallery) |

| Other services need from this | What |
|------------------------------|------|
| event-service | Venue validation, capacity checks |
| ticket-service | Venue info for tickets |
| scanning-service | Venue validation for scanners |
| search-service | Venue data for indexing |

---

## Priority Order for Fixes

### Immediate (Security - Before Launch)
1. GAP-VENUE-001: Add auth to Stripe routes
2. GAP-VENUE-002: Remove default tenant fallback
3. GAP-VENUE-003: Create tenant middleware
4. GAP-VENUE-004: Hash API keys
5. GAP-VENUE-005: Remove hardcoded HMAC secret

### This Week (Data Integrity)
6. GAP-VENUE-006: Add SET LOCAL for RLS
7. GAP-VENUE-007: Add Stripe idempotency keys
8. GAP-VENUE-008: Add settings validation

### This Month (Frontend Features)
9. GAP-VENUE-009: Venue follows (with platform user_follows)
10. GAP-VENUE-010: Trending/popular venues endpoint
11. GAP-VENUE-011: Public venue stats

