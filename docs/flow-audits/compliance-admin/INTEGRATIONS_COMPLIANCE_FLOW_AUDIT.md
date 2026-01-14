# INTEGRATIONS & COMPLIANCE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | External Integrations & Compliance Features |

---

## Executive Summary

**PARTIAL IMPLEMENTATION - Key integrations exist, some gaps**

### Integrations
| Component | Status |
|-----------|--------|
| OAuth (Google) | ✅ Implemented |
| OAuth (GitHub) | ✅ Implemented |
| OAuth (Apple) | ⚠️ Partial |
| Mailchimp sync | ✅ Implemented |
| QuickBooks | ⚠️ Provider exists |
| Square POS | ✅ Implemented |
| Stripe Connect | ✅ Implemented |
| Calendar (iCal/GCal) | ❌ Not implemented |

### Compliance
| Component | Status |
|-----------|--------|
| GDPR data export | ✅ Implemented |
| GDPR data deletion | ✅ Implemented |
| Privacy export service | ✅ Implemented |
| Fraud detection | ⚠️ Mock only |
| Age verification | ❌ Not implemented |
| Geo-restrictions | ⚠️ Partial (marketplace) |

**Bottom Line:** Social login works (Google, GitHub). Marketing integration (Mailchimp) exists. GDPR compliance is implemented. Fraud detection is mocked. No calendar integration or age verification.

---

## External Integrations

### 1. OAuth / Social Login ✅

**File:** `auth-service/src/services/oauth.service.ts`

**Supported Providers:**
```typescript
type OAuthProvider = 'google' | 'github' | 'apple';

interface OAuthProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  provider: OAuthProvider;
  verified: boolean;
}
```

**Google OAuth:**
```typescript
// Uses google-auth-library
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

async verifyGoogleToken(idToken: string): Promise<OAuthProfile> {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return { id: payload.sub, email: payload.email, ... };
}
```

**GitHub OAuth:**
```typescript
// Token exchange with circuit breaker
const githubTokenExchange = withCircuitBreaker(
  'github-token-exchange',
  async (code) => {
    const response = await axios.post(
      'https://github.com/login/oauth/access_token',
      { client_id, client_secret, code, redirect_uri },
      { headers: { Accept: 'application/json' }, timeout: 5000 }
    );
    return response.data;
  }
);

// User profile fetch
const githubUserProfile = withCircuitBreaker(
  'github-user-profile',
  async (accessToken) => {
    return axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  }
);
```

**Features:**
- ✅ Circuit breaker protection
- ✅ Token exchange
- ✅ Profile fetching
- ✅ Email verification
- ✅ Account linking

---

### 2. Mailchimp Integration ✅

**File:** `integration-service/src/services/providers/mailchimp-sync.service.ts`
```typescript
interface MailchimpContact {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tags?: string[];
  status?: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending';
}

class MailchimpSyncService {
  async initializeClient(venueId: string): Promise<AxiosInstance> {
    // Get encrypted API key
    const credentials = await credentialEncryptionService.retrieveApiKeys(
      venueId, 'mailchimp', 'api_key'
    );
    
    // Extract datacenter from API key (format: xxxxx-usXX)
    const datacenter = credentials.apiKey.split('-')[1];
    
    return axios.create({
      baseURL: `https://${datacenter}.api.mailchimp.com/3.0`,
      headers: { Authorization: `Bearer ${credentials.apiKey}` }
    });
  }

  async syncContacts(venueId: string, contacts: MailchimpContact[]): Promise<MailchimpSyncResult>;
}
```

**Features:**
- ✅ Per-venue API keys (encrypted)
- ✅ Contact sync
- ✅ Tag management
- ✅ Webhook handling

---

### 3. Calendar Integration ❌

**Expected:**
```typescript
// Add to calendar
GET /events/:eventId/calendar/ical
GET /events/:eventId/calendar/google
GET /events/:eventId/calendar/outlook

// Generate .ics file
function generateICalEvent(event: Event, ticket: Ticket): string {
  return `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${event.startTime}
DTEND:${event.endTime}
SUMMARY:${event.name}
LOCATION:${event.venue.name}
DESCRIPTION:Ticket #${ticket.ticketNumber}
END:VEVENT
END:VCALENDAR`;
}
```

**Status:** Not implemented

---

## Compliance Features

### 1. GDPR Data Export ✅

**File:** `compliance-service/src/routes/gdpr.routes.ts`

**Endpoints:**
| Endpoint | Purpose | Status |
|----------|---------|--------|
| `POST /privacy/export` | Request data export | ✅ Works |
| `GET /privacy/export/:requestId` | Check export status | ⚠️ Placeholder |
| `POST /gdpr/delete-data` | Request deletion | ✅ Works |
| `GET /gdpr/status/:requestId` | Deletion status | ✅ Works |
| `POST /privacy/deletion` | Account deletion | ✅ Works |

**Export includes:**
```typescript
// privacy-export.service.ts
- profile.json: User data
- purchases.json: Order history
- consents.json: Marketing preferences
- tickets.json: Ticket history
- activity.json: Login/session history
```

---

### 2. GDPR Data Deletion ✅

**File:** `compliance-service/src/controllers/gdpr.controller.ts`
```typescript
class GDPRController {
  async requestDeletion(request, reply) {
    const { userId, reason } = request.body;
    // Creates deletion request
    // Schedules data removal
    // Maintains audit trail
  }

  async getDeletionStatus(request, reply) {
    // Returns deletion progress
  }
}
```

---

### 3. Fraud Detection ⚠️ MOCK

**File:** `payment-service/src/services/mock/mock-fraud.service.ts`
```typescript
class MockFraudService {
  checkTransaction(userId, amount, deviceFingerprint) {
    // Simulate fraud scoring (random 0-0.5)
    const score = Math.random() * 0.5;
    const isHighRisk = score > 0.4;
    
    return {
      score,
      decision: isHighRisk ? 'review' : 'approve',
      signals: isHighRisk ? ['rapid_purchases', 'new_device'] : [],
    };
  }

  checkVelocity(userId) {
    // Mock velocity check
    const recentPurchases = Math.floor(Math.random() * 5);
    return {
      allowed: recentPurchases < 3,
      recentPurchases,
      limit: 3,
      timeWindow: '1 hour'
    };
  }
}
```

**Fraud Types Defined:**
```typescript
enum SignalType {
  KNOWN_SCALPER = 'known_scalper',
  RAPID_PURCHASES = 'rapid_purchases',
  MULTIPLE_ACCOUNTS = 'multiple_accounts',
  PROXY_DETECTED = 'proxy_detected',
  SUSPICIOUS_CARD = 'suspicious_card',
  BOT_BEHAVIOR = 'bot_behavior'
}

enum FraudDecision {
  APPROVE = 'approve',
  REVIEW = 'review',
  CHALLENGE = 'challenge',
  DECLINE = 'decline'
}
```

**Status:** Types comprehensive, but implementation is mock/random

---

### 4. Age Verification ❌

**Expected:**
```typescript
interface AgeVerification {
  eventId: string;
  minimumAge: number;  // e.g., 21 for bar events
  verificationMethod: 'self_certify' | 'id_check' | 'third_party';
}

// At purchase
if (event.ageRestriction) {
  await verifyAge(user, event.minimumAge);
}

// At entry
if (ticket.requiresAgeVerification) {
  // Door staff must verify ID
}
```

**Status:** Not implemented - no birth date field, no verification flow

---

### 5. Geo-Restrictions ⚠️ PARTIAL

**Marketplace has:**
```typescript
// venue-settings.types.ts
interface VenueMarketplaceSettings {
  allowInternationalSales: boolean;
  blockedCountries: string[];
}
```

**Missing:**
- Event-level geo restrictions
- IP-based blocking
- Purchase-time verification

---

## What's NOT Implemented ❌

### 1. Calendar Integration

**Effort:** 1-2 days
```typescript
// Generate iCal
GET /tickets/:ticketId/calendar.ics

// Google Calendar link
GET /tickets/:ticketId/calendar/google
// Returns: https://calendar.google.com/calendar/render?action=TEMPLATE&...

// Outlook link
GET /tickets/:ticketId/calendar/outlook
```

---

### 2. Real Fraud Detection

**Effort:** 3-5 days

**Options:**
1. **Stripe Radar** - Built into Stripe, minimal effort
2. **Sift** - Comprehensive fraud prevention
3. **Custom rules** - Velocity limits, device fingerprinting

**Needed:**
```typescript
class FraudService {
  async checkTransaction(params: {
    userId: string;
    amount: number;
    paymentMethodId: string;
    ipAddress: string;
    deviceFingerprint: string;
    eventId: string;
  }): Promise<FraudDecision>;

  async reportChargeback(transactionId: string): Promise<void>;
  async updateUserRisk(userId: string, signal: FraudSignal): Promise<void>;
}
```

---

### 3. Age Verification

**Effort:** 2-3 days

**Needed:**
```sql
-- Add to events
ALTER TABLE events ADD COLUMN age_restriction INTEGER;
ALTER TABLE events ADD COLUMN age_verification_required BOOLEAN DEFAULT false;

-- Add to users (optional)
ALTER TABLE users ADD COLUMN date_of_birth DATE;
ALTER TABLE users ADD COLUMN age_verified BOOLEAN DEFAULT false;
```

---

### 4. Apple OAuth

**Current:** Partial implementation

**Needed:**
- Apple Sign In with Services
- Token validation
- Private email relay handling

---

## Configuration

### OAuth Providers
```bash
# Google
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback

# GitHub
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_REDIRECT_URI=http://localhost:3001/auth/github/callback

# Apple
APPLE_CLIENT_ID=xxx
APPLE_TEAM_ID=xxx
APPLE_KEY_ID=xxx
APPLE_PRIVATE_KEY=xxx
```

### Integrations
```bash
# Mailchimp (per-venue, encrypted)
# Stored in credential_vault table

# QuickBooks
QUICKBOOKS_CLIENT_ID=xxx
QUICKBOOKS_CLIENT_SECRET=xxx
```

---

## Summary

| Aspect | Status |
|--------|--------|
| Google OAuth | ✅ Working |
| GitHub OAuth | ✅ Working |
| Apple OAuth | ⚠️ Partial |
| Mailchimp sync | ✅ Working |
| Square POS | ✅ Working |
| Stripe Connect | ✅ Working |
| QuickBooks | ⚠️ Provider exists |
| Calendar (iCal) | ❌ Not implemented |
| GDPR export | ✅ Working |
| GDPR deletion | ✅ Working |
| Privacy compliance | ✅ Working |
| Fraud detection | ⚠️ Mock only |
| Age verification | ❌ Not implemented |
| Geo-restrictions | ⚠️ Partial |

**Bottom Line:** Core integrations (OAuth, Mailchimp, Stripe) work. GDPR compliance is solid. Gaps are in fraud detection (real implementation), age verification, and calendar integration.

---

## Related Documents

- `USER_REGISTRATION_AUTH_FLOW_AUDIT.md` - Auth flow
- `KYC_COMPLIANCE_FLOW_AUDIT.md` - Compliance checks
- `PLATFORM_OPS_FLOW_AUDIT.md` - Platform operations
- `MARKETPLACE_PRICING_RULES_FLOW_AUDIT.md` - Geo-restrictions in marketplace
