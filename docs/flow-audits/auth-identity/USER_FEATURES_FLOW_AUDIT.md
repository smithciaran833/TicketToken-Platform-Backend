# USER FEATURES FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | User Features (Profile, Wallet, History, Preferences) |

---

## Executive Summary

**PARTIAL IMPLEMENTATION - Core features exist, extras missing**

| Component | Status |
|-----------|--------|
| User profile (view/update) | ✅ Implemented |
| Wallet connection (Solana) | ✅ Implemented |
| Wallet linking to account | ✅ Implemented |
| User's tickets view | ✅ Implemented |
| User's orders view | ✅ Implemented |
| Order caching | ✅ Implemented |
| Favorites/wishlist | ❌ Not implemented |
| Event alerts/notifications | ❌ Not implemented |
| User preferences | ❌ Not implemented |
| Social sharing | ❌ Not implemented |
| Purchase history export | ⚠️ Via GDPR export only |

**Bottom Line:** Core user features (profile, wallet, tickets, orders) work. Missing "nice to have" features like favorites, alerts, and preferences.

---

## What Works ✅

### 1. User Profile

**File:** `auth-service/src/controllers/profile.controller.ts`

**Get Profile:**
```typescript
GET /auth/profile

Response:
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890",
    "email_verified": true,
    "mfa_enabled": false,
    "role": "user",
    "tenant_id": "uuid",
    "created_at": "2024-01-01T00:00:00Z",
    "last_login_at": "2024-12-31T12:00:00Z"
  }
}
```

**Update Profile:**
```typescript
PATCH /auth/profile
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}
```

**Features:**
- ✅ Cache fallback for resilience
- ✅ Input sanitization (stripHtml)
- ✅ Audit logging
- ✅ Tenant isolation

---

### 2. Wallet Management

**File:** `auth-service/src/controllers/wallet.controller.ts`

**Endpoints:**

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `POST /wallet/nonce` | Get signing nonce | ✅ Works |
| `POST /wallet/register` | Register with wallet | ✅ Works |
| `POST /wallet/login` | Login with wallet | ✅ Works |
| `POST /wallet/link` | Link wallet to existing account | ✅ Works |

**Register with Wallet:**
```typescript
POST /wallet/register
{
  "publicKey": "SolanaPublicKey...",
  "signature": "SignedNonce...",
  "nonce": "abc123",
  "chain": "solana",
  "tenant_id": "uuid"
}
```

**Link Wallet:**
```typescript
POST /wallet/link
Authorization: Bearer <jwt>
{
  "publicKey": "SolanaPublicKey...",
  "signature": "SignedNonce...",
  "nonce": "abc123",
  "chain": "solana"
}
```

**Features:**
- ✅ Nonce-based signature verification
- ✅ Multiple wallet support
- ✅ Duplicate wallet detection
- ✅ Chain-agnostic (supports Solana)

---

### 3. User's Tickets

**File:** `ticket-service/src/controllers/ticketController.ts`

**Endpoints:**

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `GET /tickets` | Current user's tickets | ✅ Works |
| `GET /tickets/users/:userId` | User's tickets (with auth) | ✅ Works |
| `GET /tickets/:ticketId` | Single ticket | ✅ Works |

**Get My Tickets:**
```typescript
GET /tickets
Authorization: Bearer <jwt>

Response:
{
  "tickets": [
    {
      "id": "uuid",
      "event_id": "uuid",
      "ticket_type_id": "uuid",
      "ticket_number": "TKT-XXX",
      "status": "active",
      "section": "A",
      "row": "1",
      "seat": "5",
      "qr_code": "QR-xxx"
    }
  ]
}
```

**Security:**
- ✅ Users can only view their own tickets
- ✅ Tenant isolation enforced

---

### 4. User's Orders

**File:** `order-service/src/services/order-cache.service.ts`

**Features:**
- ✅ Order retrieval by user
- ✅ Redis caching for performance
- ✅ Indexed queries (user_id + status + created_at)

**Cache Keys:**
```typescript
getUserOrdersCacheKey(userId, tenantId) → `orders:user:${userId}:${tenantId}`
```

---

### 5. Purchase History Export (GDPR)

**File:** `compliance-service/src/services/privacy-export.service.ts`
```typescript
// Export includes:
// - purchases.json: Order history
// - profile.json: User data
// - consents.json: Marketing preferences
```

**Status:** Works, but only via GDPR data export request

---

## What's NOT Implemented ❌

### 1. Favorites/Wishlist

**Expected:**
```typescript
// Save favorite events
POST /users/me/favorites
{ "eventId": "uuid" }

GET /users/me/favorites
// Returns list of favorited events

DELETE /users/me/favorites/:eventId
```

**Database:**
```sql
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id UUID NOT NULL,
  created_at TIMESTAMP,
  UNIQUE(user_id, event_id)
);
```

**Status:** No model, no routes, no table

---

### 2. Event Alerts/Notifications Preferences

**Expected:**
```typescript
// Subscribe to event alerts
POST /users/me/alerts
{
  "eventId": "uuid",
  "alertTypes": ["price_drop", "tickets_available", "event_reminder"]
}

// Get alert preferences
GET /users/me/alerts
```

**Status:** Notification service exists but no user-controlled alerts

---

### 3. User Preferences

**Expected:**
```typescript
interface UserPreferences {
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  marketing: boolean;
  currency: string;
  language: string;
  timezone: string;
}

GET /users/me/preferences
PUT /users/me/preferences
```

**Status:** No preferences table or API

---

### 4. Social Sharing

**Expected:**
```typescript
// Generate shareable ticket link
GET /tickets/:ticketId/share

// Track shares
POST /tickets/:ticketId/share
{ "platform": "twitter" }
```

**Status:** Not implemented

---

### 5. Purchase History View (Dedicated)

**Expected:**
```typescript
GET /users/me/purchases
{
  "purchases": [
    {
      "orderId": "uuid",
      "orderNumber": "ORD-XXX",
      "eventName": "Concert",
      "purchaseDate": "2024-01-01",
      "totalAmount": "$150.00",
      "tickets": 2,
      "status": "completed"
    }
  ],
  "pagination": { ... }
}
```

**Current:** Must query orders + join events manually. No dedicated history endpoint with rich data.

---

## Database Schema

### Exists
```sql
-- users table (auth-service)
id, email, first_name, last_name, phone, role, tenant_id, ...

-- user_wallets table (auth-service)
id, user_id, public_key, chain, verified, created_at, ...

-- tickets table (ticket-service)
id, user_id, event_id, status, ...

-- orders table (order-service)
id, user_id, event_id, status, total_cents, ...
```

### Missing
```sql
-- User favorites
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  event_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

-- User preferences
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  sms_notifications BOOLEAN DEFAULT false,
  marketing_emails BOOLEAN DEFAULT false,
  preferred_currency VARCHAR(3) DEFAULT 'USD',
  preferred_language VARCHAR(5) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'UTC',
  updated_at TIMESTAMP
);

-- Event alerts
CREATE TABLE user_event_alerts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  event_id UUID NOT NULL,
  alert_type VARCHAR(50) NOT NULL,  -- price_drop, tickets_available, reminder
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  triggered_at TIMESTAMP
);
```

---

## What Would Need to Be Built

### Phase 1: Preferences (2-3 days)

| Task | Effort |
|------|--------|
| Create user_preferences table | 0.5 day |
| Preferences API endpoints | 1 day |
| Integrate with notification service | 1 day |

### Phase 2: Favorites (1-2 days)

| Task | Effort |
|------|--------|
| Create user_favorites table | 0.5 day |
| Favorites API endpoints | 0.5 day |
| Show on event listings | 0.5 day |

### Phase 3: Event Alerts (2-3 days)

| Task | Effort |
|------|--------|
| Create alerts table | 0.5 day |
| Alert subscription API | 1 day |
| Alert trigger logic | 1 day |
| Integration with events | 0.5 day |

### Phase 4: Purchase History (1 day)

| Task | Effort |
|------|--------|
| Rich purchase history endpoint | 0.5 day |
| Join events/tickets data | 0.5 day |

---

## Summary

| Aspect | Status |
|--------|--------|
| User profile | ✅ Working |
| Profile update | ✅ Working |
| Wallet registration | ✅ Working |
| Wallet login | ✅ Working |
| Wallet linking | ✅ Working |
| My tickets | ✅ Working |
| My orders | ✅ Working (basic) |
| Order caching | ✅ Working |
| Favorites | ❌ Not implemented |
| Event alerts | ❌ Not implemented |
| Preferences | ❌ Not implemented |
| Purchase history (rich) | ❌ Not implemented |
| Social sharing | ❌ Not implemented |

**Bottom Line:** Core user features work well. The gaps are in engagement features (favorites, alerts, preferences) that enhance user experience but aren't strictly necessary for MVP.

---

## Related Documents

- `USER_REGISTRATION_AUTH_FLOW_AUDIT.md` - Registration/login
- `NOTIFICATION_FLOW_AUDIT.md` - Notification delivery
- `CUSTODIAL_WALLET_FLOW_AUDIT.md` - Platform-managed wallets
