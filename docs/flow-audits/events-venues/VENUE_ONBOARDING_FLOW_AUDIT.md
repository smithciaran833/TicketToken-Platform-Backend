# VENUE ONBOARDING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Venue Onboarding |

---

## Flow Overview

**Goal:** A user becomes a venue owner with the ability to create events and receive payments.

---

## Step-by-Step Flow

### Step 1: User Registration

**Endpoint:** `POST /auth/register`

**Service:** auth-service

**File:** `backend/services/auth-service/src/services/auth.service.ts`

**What happens:**
1. Check if email already exists
2. Validate tenant exists
3. Hash password (bcrypt, 10 rounds)
4. Generate email verification token
5. Create user in `users` table
6. Generate JWT tokens
7. Create user session in `user_sessions` table
8. Send verification email

**Database writes:**
- `users` table (new user)
- `user_sessions` table (new session)

**What's published:**
- Verification email via EmailService

**Status:** ✅ Working

---

### Step 2: Email Verification

**Endpoint:** `GET /auth/verify-email?token=xxx`

**Service:** auth-service

**File:** `backend/services/auth-service/src/services/auth-extended.service.ts`

**What happens:**
1. Find user by verification token
2. Update `email_verified = true`

**Database writes:**
- `users` table (email_verified flag)

**Status:** ✅ Working

---

### Step 3: Create Venue

**Endpoint:** `POST /venues`

**Service:** venue-service

**File:** `backend/services/venue-service/src/services/venue.service.ts`

**What happens:**
1. User must be authenticated
2. Transaction begins
3. Create venue in `venues` table
4. Add user as owner in `venue_staff` table (role: 'owner', permissions: ['*'])
5. Create default settings in `venue_settings` table
6. Transaction commits
7. Log to venue audit log
8. Publish `venue.created` event

**Database writes:**
- `venues` table (new venue)
- `venue_staff` table (owner record)
- `venue_settings` table (default settings)
- `venue_audit_log` table (audit entry)

**What's published:**
- `venue.created` event via EventPublisher (RabbitMQ)

**What's MISSING:**
- ❌ **Blockchain venue creation** - Smart contract `create_venue` is never called
- ❌ **venue_pda** is never stored in database

**Status:** ⚠️ Partially Working (no blockchain)

---

### Step 4: Venue Onboarding Steps

**Endpoint:** `GET /venues/:venueId/onboarding/status`

**Service:** venue-service

**File:** `backend/services/venue-service/src/services/onboarding.service.ts`

**What happens:**
Returns onboarding progress with steps:
1. `basic_info` - Name, type, capacity ✅
2. `address` - Location details ✅
3. `layout` - Seating arrangement (optional)
4. `payment` - Stripe Connect integration ✅
5. `staff` - Team members (optional)

**Status:** ✅ Working

---

### Step 5: Stripe Connect Onboarding

**Endpoint:** `POST /venues/:venueId/stripe/connect`

**Service:** venue-service

**File:** `backend/services/venue-service/src/services/venue-stripe-onboarding.service.ts`

**What happens:**
1. Check if venue already has Stripe Connect account
2. If not, create new Stripe Express Connect account
3. Generate account onboarding link
4. Store `stripe_connect_account_id` in venues table
5. Set `stripe_connect_status = 'pending'`
6. Return onboarding URL to frontend

**Database writes:**
- `venues` table (stripe_connect_account_id, stripe_connect_status)

**External calls:**
- `stripe.accounts.create()` - Create Express account
- `stripe.accountLinks.create()` - Generate onboarding link

**Status:** ✅ Working

---

### Step 6: Stripe Connect Webhook (Account Updated)

**Endpoint:** `POST /venues/stripe/webhook`

**Service:** venue-service

**File:** `backend/services/venue-service/src/controllers/venue-stripe.controller.ts`

**What happens:**
1. Verify webhook signature
2. Check for duplicate event (idempotency)
3. Validate venue_id in metadata
4. Call `handleAccountUpdated()`
5. Update venue record with:
   - `stripe_connect_status`
   - `stripe_connect_charges_enabled`
   - `stripe_connect_payouts_enabled`
   - `stripe_connect_details_submitted`
   - `stripe_connect_capabilities`
   - `stripe_connect_onboarded_at`

**Database writes:**
- `venues` table (Stripe status fields)
- `webhook_events` table (deduplication)

**Status:** ✅ Working

---

### Step 7: Verify Venue Can Accept Payments

**File:** `backend/services/venue-service/src/services/venue-stripe-onboarding.service.ts`

**Function:** `canAcceptPayments(venueId)`

**What happens:**
1. Check `stripe_connect_charges_enabled = true`
2. Check `stripe_connect_payouts_enabled = true`
3. Return boolean

**Status:** ✅ Working

---

## Complete Flow Diagram
```
User Registration (auth-service)
    ↓
    └── users table created
    └── verification email sent
    
Email Verification (auth-service)
    ↓
    └── email_verified = true
    
Create Venue (venue-service)
    ↓
    └── venues table created
    └── venue_staff table (owner)
    └── venue_settings table (defaults)
    └── venue.created event published
    └── ❌ MISSING: Blockchain venue creation
    
Stripe Connect Onboarding (venue-service)
    ↓
    └── Stripe Express account created
    └── venues.stripe_connect_account_id stored
    └── User redirected to Stripe onboarding
    
Stripe Webhook (venue-service)
    ↓
    └── venues.stripe_connect_status updated
    └── venues.stripe_connect_charges_enabled updated
    └── venues.stripe_connect_payouts_enabled updated
    
Venue Ready to Create Events
    ↓
    └── ❌ BUT events will fail blockchain creation
        (venue doesn't exist on-chain)
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `backend/services/auth-service/src/services/auth.service.ts` | User registration |
| `backend/services/auth-service/src/services/auth-extended.service.ts` | Email verification |
| `backend/services/venue-service/src/services/venue.service.ts` | Create venue |
| `backend/services/venue-service/src/services/onboarding.service.ts` | Onboarding status |
| `backend/services/venue-service/src/services/venue-stripe-onboarding.service.ts` | Stripe Connect |
| `backend/services/venue-service/src/controllers/venue-stripe.controller.ts` | Stripe webhooks |
| `backend/services/venue-service/src/services/eventPublisher.ts` | Event publishing |

---

## Database Tables Touched

| Table | Service | Action |
|-------|---------|--------|
| `users` | auth-service | INSERT, UPDATE |
| `user_sessions` | auth-service | INSERT |
| `venues` | venue-service | INSERT, UPDATE |
| `venue_staff` | venue-service | INSERT |
| `venue_settings` | venue-service | INSERT |
| `venue_audit_log` | venue-service | INSERT |
| `webhook_events` | venue-service | INSERT |

---

## External Services Called

| Service | Purpose | Status |
|---------|---------|--------|
| Email Service | Send verification email | ✅ |
| Stripe API | Create Connect account | ✅ |
| Stripe API | Generate onboarding link | ✅ |
| RabbitMQ | Publish venue.created event | ✅ |
| **Solana Blockchain** | **Create venue on-chain** | ❌ MISSING |

---

## Gaps Found

### Gap 1: No Blockchain Venue Creation

**Problem:** 
Venue is created in database but never on blockchain.

**Impact:**
- Events cannot be created on-chain (smart contract requires verified venue)
- Tickets cannot be minted (they reference events which reference venues)
- The entire NFT flow is broken at the root

**Smart contract exists:**
```rust
// smart-contracts/programs/tickettoken/src/instructions/create_venue.rs
pub fn create_venue(
    ctx: Context<CreateVenue>,
    venue_id: String,
    name: String,
    metadata_uri: String,
) -> Result<()>
```

**What needs to happen:**
1. After venue created in database, call blockchain to create venue
2. Store `venue_pda` in venues table
3. Optionally verify venue on-chain (platform admin function)

**Files that need changes:**
| File | Change |
|------|--------|
| `backend/services/venue-service/src/services/venue.service.ts` | Add blockchain call after DB insert |
| `backend/services/venue-service/src/services/blockchain.service.ts` | **CREATE** - New file |
| `backend/shared/src/blockchain/client.ts` | Add `createVenue()` method |
| Database migration | Add `venue_pda` column to venues table |

---

### Gap 2: No Venue Verification Flow

**Problem:**
Smart contract has `verify_venue` instruction, but no service calls it.

**Impact:**
- Events require `venue.verified = true` on-chain
- Without verification, event creation fails

**What needs to happen:**
1. Admin endpoint to verify venues
2. Call `verify_venue` instruction on blockchain
3. Update venue status in database

**Files that need changes:**
| File | Change |
|------|--------|
| `backend/services/venue-service/src/services/verification.service.ts` | Add blockchain verification |
| `backend/services/venue-service/src/routes/admin.routes.ts` | **CREATE** - Admin verification endpoint |

---

### Gap 3: No Retry/Recovery for Failed Blockchain Operations

**Problem:**
If blockchain call fails during venue creation, there's no recovery.

**What needs to happen:**
1. Queue blockchain operations
2. Retry on failure
3. Alert on persistent failures
4. Reconciliation job

---

## Summary

| Component | Status |
|-----------|--------|
| User Registration | ✅ Complete |
| Email Verification | ✅ Complete |
| Database Venue Creation | ✅ Complete |
| Venue Onboarding Flow | ✅ Complete |
| Stripe Connect | ✅ Complete |
| Stripe Webhooks | ✅ Complete |
| **Blockchain Venue Creation** | ❌ Missing |
| **Blockchain Venue Verification** | ❌ Missing |
| **Blockchain Retry/Recovery** | ❌ Missing |

---

## Related Documents

- `BLOCKCHAIN_INTEGRATION_REMEDIATION.md` - Overall blockchain fixes
- `CORE_FLOWS_AUDIT.md` - All core flows summary

