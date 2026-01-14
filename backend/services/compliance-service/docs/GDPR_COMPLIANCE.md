# GDPR Compliance Documentation

**AUDIT FIXES:**
- COMP-M2: Data Processing Record
- COMP-M3: Cross-border transfer documentation
- COMP-M4: Consent record in export

## Table of Contents

1. [Data Processing Overview](#data-processing-overview)
2. [Lawful Basis for Processing](#lawful-basis-for-processing)
3. [Data Subject Rights](#data-subject-rights)
4. [Data Retention Policies](#data-retention-policies)
5. [Cross-Border Transfers](#cross-border-transfers)
6. [Data Processing Record](#data-processing-record)
7. [Consent Management](#consent-management)
8. [Export Format](#export-format)

---

## Data Processing Overview

### Controller Information

| Field | Value |
|-------|-------|
| Data Controller | TicketToken Inc. |
| Data Protection Officer | dpo@tickettoken.io |
| Address | 123 Tech Street, San Francisco, CA 94102 |
| Registration Number | [Company Registration] |

### Purpose of Processing

The compliance service processes personal data for:

1. **GDPR Request Handling** - Processing data subject requests
2. **Risk Assessment** - Detecting fraud and ensuring platform safety
3. **OFAC Screening** - Compliance with sanctions regulations
4. **Tax Reporting** - IRS 1099 form generation

---

## Lawful Basis for Processing

| Processing Activity | Lawful Basis | Article |
|---------------------|--------------|---------|
| Account Management | Contract Performance | Art. 6(1)(b) |
| Transaction Processing | Contract Performance | Art. 6(1)(b) |
| Fraud Prevention | Legitimate Interest | Art. 6(1)(f) |
| Tax Reporting | Legal Obligation | Art. 6(1)(c) |
| OFAC Screening | Legal Obligation | Art. 6(1)(c) |
| Marketing Communications | Consent | Art. 6(1)(a) |
| Analytics | Legitimate Interest | Art. 6(1)(f) |

### Legitimate Interest Assessment

For processing based on legitimate interest, the following assessment applies:

1. **Purpose Test**: Fraud prevention protects platform integrity
2. **Necessity Test**: No less intrusive means available
3. **Balancing Test**: User interests not overridden; appropriate safeguards in place

---

## Data Subject Rights

### Implemented Rights

| Right | Implementation | Endpoint |
|-------|----------------|----------|
| Access (Art. 15) | Data export | `POST /gdpr/export` |
| Rectification (Art. 16) | Profile update | `PUT /users/:id` |
| Erasure (Art. 17) | Account deletion | `POST /gdpr/delete` |
| Portability (Art. 20) | JSON export | `POST /gdpr/export` |
| Restriction (Art. 18) | Processing pause | `POST /gdpr/restrict` |
| Objection (Art. 21) | Marketing opt-out | `POST /preferences` |

### Request Processing Timeline

| Stage | SLA | Status |
|-------|-----|--------|
| Request Received | Immediate | Confirmation email sent |
| Identity Verification | 2 hours | Automated/Manual |
| Request Processing | 24 hours | Export generation |
| Delivery | 30 days max | Download link via email |

### Identity Verification

Before processing GDPR requests, we verify identity via:

1. Email verification (OTP sent to registered email)
2. Account password confirmation
3. For deletion: Additional confirmation email
4. Manual review for edge cases

---

## Data Retention Policies

### Retention Periods

| Data Category | Retention Period | Legal Basis |
|---------------|------------------|-------------|
| Account Data | Account lifetime + 30 days | Contract |
| Transaction Records | 7 years | Tax law |
| Audit Logs | 7 years | Legal compliance |
| GDPR Request Logs | 5 years | Art. 5(2) accountability |
| Session Data | 24 hours | Security |
| Marketing Preferences | Until opt-out | Consent |

### Automatic Deletion

```typescript
// Data lifecycle management
const RETENTION_POLICIES = {
  accountData: {
    active: 'account_lifetime',
    deleted: '30_days',
  },
  transactionRecords: {
    retention: '7_years',
    reason: 'IRS_requirements',
  },
  auditLogs: {
    retention: '7_years',
    reason: 'compliance_audit',
  },
  sessionData: {
    retention: '24_hours',
    reason: 'security',
  },
};
```

---

## Cross-Border Transfers

### Transfer Mechanisms

| Destination | Mechanism | Documentation |
|-------------|-----------|---------------|
| EU/EEA | Adequacy Decision | N/A (equivalent protection) |
| USA | Standard Contractual Clauses | Annex A |
| UK | UK Addendum + SCCs | Annex B |
| Other | Individual Assessment | Case-by-case |

### Standard Contractual Clauses (SCCs)

For transfers to the USA (AWS infrastructure):

1. **Module 2** (Controller to Processor)
   - TicketToken Inc. as Controller
   - AWS as Processor
   - SCCs signed: [Date]

2. **Supplementary Measures**
   - Encryption at rest (AES-256)
   - Encryption in transit (TLS 1.3)
   - Access logging and monitoring
   - Regional data storage (EU-West-1 for EU users)

### Transfer Impact Assessment (TIA)

For each transfer destination, we assess:

1. Legal framework in recipient country
2. Surveillance laws and practices
3. Data subject rights enforcement
4. Supplementary measures needed

---

## Data Processing Record

### Processing Activities Register (Art. 30)

```yaml
# Processing Activity 1: User Account Management
activity_id: PA-001
activity_name: User Account Management
controller: TicketToken Inc.
purposes:
  - Account creation and maintenance
  - Authentication and authorization
data_categories:
  - Identity data (name, email)
  - Contact data
  - Account credentials
data_subjects:
  - Registered users
  - Venue owners
recipients:
  - Internal teams (support, compliance)
  - Payment processors (Stripe)
third_countries:
  - USA (AWS)
safeguards: Standard Contractual Clauses
retention: Account lifetime + 30 days
technical_measures:
  - Encryption at rest
  - Access controls
  - Audit logging
organizational_measures:
  - Staff training
  - Access review quarterly

# Processing Activity 2: GDPR Request Processing
activity_id: PA-002
activity_name: GDPR Request Processing
purposes:
  - Fulfilling data subject rights
  - Legal compliance
data_categories:
  - All user data for exports
  - Request metadata
data_subjects:
  - Requesting users
recipients:
  - Data subject only
retention: Request logs 5 years
technical_measures:
  - Secure export generation
  - Encrypted download links
  - Automatic expiration

# Processing Activity 3: Fraud Prevention
activity_id: PA-003
activity_name: Fraud Prevention and Risk Assessment
purposes:
  - Platform integrity
  - User protection
data_categories:
  - Transaction patterns
  - Device fingerprints
  - IP addresses
data_subjects:
  - All platform users
recipients:
  - Internal fraud team
third_countries:
  - USA (processing)
safeguards: Legitimate Interest Assessment
retention: 7 years
legal_basis: Legitimate Interest (Art. 6(1)(f))

# Processing Activity 4: Tax Compliance
activity_id: PA-004
activity_name: Tax Reporting (1099)
purposes:
  - IRS compliance
  - Financial reporting
data_categories:
  - Tax identification numbers
  - Payment amounts
  - Address data
data_subjects:
  - US-based venue owners
recipients:
  - IRS
  - State tax authorities
retention: 7 years
legal_basis: Legal Obligation (Art. 6(1)(c))
```

---

## Consent Management

### Consent Categories

| Category | Purpose | Default | Required |
|----------|---------|---------|----------|
| Essential | Account operation | Granted | Yes |
| Analytics | Service improvement | Opt-in | No |
| Marketing | Promotional emails | Opt-in | No |
| Third-Party | Partner services | Opt-in | No |

### Consent Record Schema

```typescript
interface ConsentRecord {
  userId: string;
  tenantId: string;
  consents: {
    category: string;
    granted: boolean;
    timestamp: Date;
    source: 'signup' | 'settings' | 'api';
    ipAddress: string;
    userAgent: string;
    version: string; // Consent text version
  }[];
  withdrawals: {
    category: string;
    timestamp: Date;
    source: string;
  }[];
}
```

### Consent in Export (COMP-M4)

All GDPR exports include consent history:

```json
{
  "gdprExport": {
    "generatedAt": "2026-01-03T23:00:00.000Z",
    "dataSubject": {
      "id": "user-123",
      "email": "user@example.com"
    },
    "consentHistory": [
      {
        "category": "marketing",
        "granted": true,
        "timestamp": "2025-06-15T10:30:00.000Z",
        "source": "signup",
        "consentTextVersion": "v2.0"
      },
      {
        "category": "marketing",
        "granted": false,
        "timestamp": "2025-12-01T14:20:00.000Z",
        "source": "settings",
        "reason": "user_withdrawal"
      }
    ],
    "legalBasis": {
      "accountData": "contract_performance",
      "transactions": "contract_performance",
      "marketing": "consent",
      "analytics": "legitimate_interest"
    }
  }
}
```

---

## Export Format

### Complete Export Structure

```json
{
  "metadata": {
    "exportId": "exp_abc123",
    "generatedAt": "2026-01-03T23:00:00.000Z",
    "expiresAt": "2026-01-04T23:00:00.000Z",
    "format": "gdpr-export-v2",
    "requestedBy": "user@example.com",
    "requestType": "export"
  },
  "dataSubject": {
    "id": "user-123",
    "email": "user@example.com",
    "createdAt": "2024-01-15T10:00:00.000Z"
  },
  "consentHistory": [...],
  "legalBasis": {...},
  "dataCategories": {
    "identity": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "user@example.com"
    },
    "contact": {
      "phoneNumber": "+1-555-0123",
      "address": {...}
    },
    "transactions": [...],
    "communications": [...],
    "preferences": {...},
    "securityLogs": [...],
    "thirdPartySharing": [...]
  },
  "processingActivities": [
    {
      "activity": "Account Management",
      "legalBasis": "contract",
      "retention": "account_lifetime + 30 days"
    }
  ],
  "thirdPartyRecipients": [
    {
      "name": "Stripe",
      "purpose": "Payment processing",
      "safeguards": "SCCs",
      "dataShared": ["transaction_data", "billing_address"]
    }
  ],
  "crossBorderTransfers": [
    {
      "destination": "USA",
      "mechanism": "Standard Contractual Clauses",
      "supplementaryMeasures": ["encryption", "access_controls"]
    }
  ]
}
```

---

## Compliance Contacts

| Role | Contact |
|------|---------|
| Data Protection Officer | dpo@tickettoken.io |
| Privacy Team | privacy@tickettoken.io |
| Compliance Hotline | compliance@tickettoken.io |
| Security Team | security@tickettoken.io |

---

## Audit Trail

All GDPR-related actions are logged:

```typescript
interface GdprAuditLog {
  timestamp: Date;
  action: 'request_submitted' | 'identity_verified' | 'export_generated' |
          'deletion_started' | 'deletion_completed' | 'request_rejected';
  userId: string;
  requestId: string;
  performedBy: string; // system or admin id
  details: Record<string, any>;
  ipAddress: string;
}
```

Last updated: 2026-01-03
Document version: 2.0
