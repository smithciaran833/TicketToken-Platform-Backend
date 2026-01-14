# KYC/COMPLIANCE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | KYC/Identity Verification & Compliance |

---

## Executive Summary

**GOOD NEWS:** This is a **comprehensive compliance system** focused on **VENUE verification**, not end-user KYC.

**What Exists:**
- ✅ Venue business verification (EIN, W-9)
- ✅ OFAC sanctions screening
- ✅ Risk scoring and assessment
- ✅ Bank account verification (Plaid mock)
- ✅ Document storage
- ✅ Workflow automation engine
- ✅ GDPR data export/deletion
- ✅ Tax compliance (1099 generation)
- ✅ Audit logging

**What's Missing:**
- ❌ **End-user KYC** - No identity verification for ticket buyers
- ⚠️ OFAC list is mocked (not real Treasury data)
- ⚠️ Bank verification is mocked (not real Plaid)

---

## Files Verified

| Component | File | Status |
|-----------|------|--------|
| Document Routes | document.routes.ts | ✅ Verified |
| Venue Routes | venue.routes.ts | ✅ Verified |
| GDPR Routes | gdpr.routes.ts | ✅ Verified |
| Document Service | document.service.ts | ✅ Verified |
| Risk Service | risk.service.ts | ✅ Verified |
| OFAC Service | ofac.service.ts | ✅ Verified |
| Bank Service | bank.service.ts | ✅ Verified |
| Workflow Engine | workflow-engine.service.ts | ✅ Verified |
| Venue Controller | venue.controller.ts | ✅ Verified |
| Database Schema | 001_baseline_compliance.ts | ✅ Verified |

---

## Venue Verification Flow

### What Happens
```
Venue starts verification
        ↓
POST /venue/start-verification
  - venueId, ein, businessName
        ↓
Insert into venue_verifications (status: pending)
        ↓
Audit log entry created
        ↓
Response: nextStep = 'upload_w9'
        ↓
Venue uploads W-9 document
        ↓
POST /documents/upload
        ↓
OFAC screening runs
        ↓
Risk assessment calculates score
        ↓
Final approval (auto or manual)
```

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /venue/start-verification` | Start verification process |
| `GET /venue/:venueId/status` | Get verification status |
| `GET /venue/verifications` | List all verifications (admin) |
| `POST /documents/upload` | Upload compliance documents |
| `GET /documents/:documentId` | Retrieve document |

---

## Risk Scoring System

### Implementation

**File:** `risk.service.ts`
```typescript
async calculateRiskScore(venueId, tenantId) {
  let score = 0;
  const factors = [];

  // Verification status (0-30 points)
  if (!verification) score += 30;  // No verification
  if (status === 'rejected') score += 50;
  if (status === 'pending') score += 20;
  if (!ein) score += 15;
  if (!w9_uploaded) score += 10;
  if (!bank_verified) score += 10;

  // OFAC status (0-40 points)
  if (ofac_match) score += 40;

  // Transaction velocity (0-30 points)
  if (count > 100 in 24h) score += 20;
  if (total > $10k in 24h) score += 25;

  // Recommendation
  if (score >= 70) return 'BLOCK';
  if (score >= 50) return 'MANUAL_REVIEW';
  if (score >= 30) return 'MONITOR';
  return 'APPROVE';
}
```

### Risk Thresholds

| Score | Recommendation |
|-------|---------------|
| 0-29 | APPROVE |
| 30-49 | MONITOR |
| 50-69 | MANUAL_REVIEW |
| 70+ | BLOCK |

---

## OFAC Sanctions Screening

### Implementation

**File:** `ofac.service.ts`
```typescript
// MOCK IMPLEMENTATION
private mockOFACList = [
  'Bad Actor Company',
  'Sanctioned Venue LLC',
  'Blocked Entertainment Inc'
];

async checkName(name: string) {
  // Exact match
  if (normalizedName.includes(sanctionedName)) {
    return { isMatch: true, confidence: 95 };
  }
  
  // Fuzzy match
  if (fuzzyMatch(name, sanctionedName)) {
    return { isMatch: true, confidence: 75 };
  }
  
  return { isMatch: false };
}
```

**⚠️ WARNING:** This is mocked! Production should use:
- Treasury OFAC SDN list: `https://www.treasury.gov/ofac/downloads/sdn.xml`
- Real fuzzy matching (Levenshtein distance)

---

## Bank Verification

### Implementation

**File:** `bank.service.ts`
```typescript
// MOCK PLAID INTEGRATION
async verifyBankAccount(venueId, accountNumber, routingNumber) {
  // Mock verification - in production use Plaid Auth API
  const mockVerified = !accountNumber.includes('000');
  
  // Store result
  await db.query('INSERT INTO bank_verifications...');
  
  // Update venue verification
  if (mockVerified) {
    await db.query('UPDATE venue_verifications SET bank_verified = true...');
  }
  
  return { verified: mockVerified };
}
```

**⚠️ WARNING:** This is mocked! Production should use Plaid Auth API (~$0.50/verification).

---

## Document Management

### Implementation

**File:** `document.service.ts`
```typescript
async storeDocument(venueId, documentType, buffer, originalName, tenantId) {
  // Generate unique filename
  const documentId = `doc_${uuidv4()}`;
  
  // Save file (local in dev, S3 in production)
  fs.writeFileSync(filepath, buffer);
  
  // Store reference in database
  await db.query('INSERT INTO compliance_documents...');
  
  // Update verification status if W9
  if (documentType === 'W9') {
    await db.query('UPDATE venue_verifications SET w9_uploaded = true...');
  }
}
```

### Document Types

- W-9 (tax form)
- Business license
- Bank statements
- ID verification

---

## Workflow Engine

### Implementation

**File:** `workflow-engine.service.ts`

Automated multi-step compliance workflows:

### Workflow Types

| Type | Steps |
|------|-------|
| venue_verification | verify_business → upload_w9 → ofac_screening → risk_assessment → final_approval → notify_venue |
| tax_year_end | collect_tax_data → generate_1099 → notify_venues |
| compliance_review | review_documents → assess_compliance → approval |
| document_renewal | check_expiry → request_renewal |

### Step Types

| Step Type | Description |
|-----------|-------------|
| verification | Verify business information |
| document_upload | Check required documents |
| ofac_check | OFAC sanctions screening |
| risk_assessment | Calculate risk score |
| approval | Auto or manual approval |
| notification | Send notifications |

---

## GDPR Compliance

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /gdpr/request-data` | Request data deletion |
| `POST /gdpr/delete-data` | Request data deletion |
| `GET /gdpr/status/:requestId` | Check deletion status |
| `POST /privacy/export` | Export user data |
| `GET /privacy/export/:requestId` | Check export status |
| `POST /privacy/deletion` | Request account deletion |

### Status

- Export functionality: ⚠️ Placeholder (not fully implemented)
- Deletion status: ⚠️ Placeholder (not fully implemented)

---

## Database Schema

### venue_verifications

| Column | Type | Purpose |
|--------|------|---------|
| venue_id | VARCHAR | Venue being verified |
| ein | VARCHAR | Employer ID Number |
| business_name | VARCHAR | Business name |
| status | VARCHAR | pending, approved, rejected |
| w9_uploaded | BOOLEAN | W-9 on file |
| bank_verified | BOOLEAN | Bank account verified |
| ofac_cleared | BOOLEAN | Passed OFAC check |
| risk_score | INT | Calculated risk score |
| manual_review_required | BOOLEAN | Needs human review |

### ofac_checks

| Column | Type | Purpose |
|--------|------|---------|
| venue_id | VARCHAR | Venue checked |
| name_checked | VARCHAR | Name that was checked |
| is_match | BOOLEAN | Match found |
| confidence | INT | Match confidence % |
| matched_name | VARCHAR | Which SDN entry matched |
| reviewed | BOOLEAN | Human reviewed |

### risk_assessments

| Column | Type | Purpose |
|--------|------|---------|
| venue_id | VARCHAR | Venue assessed |
| risk_score | INT | Calculated score |
| factors | JSONB | Risk factors found |
| recommendation | VARCHAR | BLOCK, MANUAL_REVIEW, MONITOR, APPROVE |

### risk_flags

| Column | Type | Purpose |
|--------|------|---------|
| venue_id | VARCHAR | Flagged venue |
| reason | TEXT | Why flagged |
| severity | VARCHAR | low, medium, high, critical |
| resolved | BOOLEAN | Issue resolved |
| resolution | TEXT | How resolved |

### compliance_documents

| Column | Type | Purpose |
|--------|------|---------|
| document_id | VARCHAR | Unique ID |
| venue_id | VARCHAR | Owner venue |
| document_type | VARCHAR | W9, license, etc. |
| storage_path | TEXT | File location |
| verified | BOOLEAN | Document verified |

### bank_verifications

| Column | Type | Purpose |
|--------|------|---------|
| venue_id | VARCHAR | Venue verified |
| account_last_four | VARCHAR | Last 4 digits |
| routing_number | VARCHAR | Bank routing |
| verified | BOOLEAN | Verification passed |
| plaid_item_id | VARCHAR | Plaid reference |

### form_1099_records

| Column | Type | Purpose |
|--------|------|---------|
| venue_id | VARCHAR | Venue |
| year | INT | Tax year |
| gross_amount | DECIMAL | Total payments |
| form_data | JSONB | 1099 form data |
| sent_to_irs | BOOLEAN | Filed with IRS |
| sent_to_venue | BOOLEAN | Sent to venue |

---

## What Works ✅

| Component | Status |
|-----------|--------|
| Venue verification flow | ✅ Works |
| Document upload/storage | ✅ Works |
| Risk scoring | ✅ Works |
| Risk flags | ✅ Works |
| OFAC screening | ⚠️ Mocked |
| Bank verification | ⚠️ Mocked |
| Workflow engine | ✅ Works |
| Audit logging | ✅ Works |
| Multi-tenant | ✅ Works |
| GDPR export | ⚠️ Partial |
| GDPR deletion | ⚠️ Partial |

---

## What's Missing

### 1. End-User KYC

**There is NO identity verification for ticket buyers.**

The system only verifies:
- Venues (business entities)
- NOT individual users

If you need user KYC (for high-value tickets, age verification, etc.), you'd need:
- Integration with identity provider (Jumio, Onfido, etc.)
- ID document verification
- Selfie matching
- User verification status in auth-service

### 2. Real OFAC Integration
```typescript
// Current: Mock list
private mockOFACList = ['Bad Actor Company', ...];

// Needed: Real Treasury integration
await fetch('https://www.treasury.gov/ofac/downloads/sdn.xml');
```

### 3. Real Plaid Integration
```typescript
// Current: Mock verification
const mockVerified = !accountNumber.includes('000');

// Needed: Real Plaid API
const plaidClient = new PlaidClient({ clientId, secret });
const result = await plaidClient.authGet({ access_token });
```

### 4. GDPR Status Endpoints
```typescript
// Current: Placeholder
return { status: 'pending', message: 'Status check not yet implemented' };

// Needed: Actual implementation
const request = await db.query('SELECT * FROM deletion_requests...');
return { status: request.status, ... };
```

---

## Summary

| Aspect | Status |
|--------|--------|
| Venue verification | ✅ Complete |
| Document management | ✅ Complete |
| Risk scoring | ✅ Complete |
| OFAC screening | ⚠️ Mocked |
| Bank verification | ⚠️ Mocked |
| Workflow automation | ✅ Complete |
| Audit logging | ✅ Complete |
| Tax compliance | ✅ Complete |
| GDPR export | ⚠️ Partial |
| End-user KYC | ❌ Missing |

**Bottom Line:** Venue compliance is solid. End-user identity verification doesn't exist.

---

## Related Documents

- `VENUE_ONBOARDING_FLOW_AUDIT.md` - Venue creation (before verification)
- `USER_REGISTRATION_AUTH_FLOW_AUDIT.md` - User auth (no KYC)

