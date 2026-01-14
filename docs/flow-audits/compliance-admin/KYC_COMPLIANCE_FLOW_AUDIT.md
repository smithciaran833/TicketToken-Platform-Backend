# KYC COMPLIANCE FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | KYC / Venue Verification |

---

## Executive Summary

**PARTIAL - Basic venue verification, missing full KYC**

| Component | Status |
|-----------|--------|
| venue_verifications table | ✅ Exists |
| Start verification endpoint | ✅ Working |
| Get verification status | ✅ Working |
| Document upload (W-9) | ✅ Working |
| Bank verification (mock Plaid) | ⚠️ Mock only |
| EIN validation | ⚠️ Mock only |
| Identity verification (ID check) | ❌ Not implemented |
| Liveness check | ❌ Not implemented |
| Background check | ❌ Not implemented |
| Audit logging | ✅ Working |

**Bottom Line:** Basic venue verification flow exists for W-9 document upload and bank account verification (mock). Missing true identity verification (ID scan, liveness, background checks) that would be needed for full KYC compliance.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/compliance/venue/verify` | POST | Start verification | ✅ Working |
| `/compliance/venue/:venueId/status` | GET | Get status | ✅ Working |
| `/compliance/venue/verifications` | GET | List all | ✅ Working |
| `/compliance/documents/upload` | POST | Upload W-9 | ✅ Working |
| `/compliance/bank/verify` | POST | Verify bank | ⚠️ Mock |

---

## Verification Flow
```
1. Start Verification
   POST /compliance/venue/verify
   { venueId, ein, businessName }
   → Status: 'pending', nextStep: 'upload_w9'

2. Upload W-9 Document
   POST /compliance/documents/upload
   { venueId, documentType: 'W9', file }
   → Stores document, updates w9_uploaded = true

3. Verify Bank Account
   POST /compliance/bank/verify
   { venueId, accountNumber, routingNumber }
   → (Mock) validates account, updates bank_verified = true

4. Check Status
   GET /compliance/venue/:venueId/status
   → Returns verification status
```

---

## Implementation Details

### Venue Verification Controller

**File:** `backend/services/compliance-service/src/controllers/venue.controller.ts`
```typescript
async startVerification(request, reply) {
  const { venueId, ein, businessName } = request.body;
  
  await db.query(
    `INSERT INTO venue_verifications 
     (venue_id, ein, business_name, status, verification_id, tenant_id)
     VALUES ($1, $2, $3, 'pending', $4, $5)`,
    [venueId, ein, businessName, verificationId, tenantId]
  );
  
  // Audit log
  await db.query(
    `INSERT INTO compliance_audit_log (action, entity_type, entity_id, metadata, tenant_id)
     VALUES ('verification_started', 'venue', $1, $2, $3)`,
    [venueId, JSON.stringify({ ein, businessName }), tenantId]
  );
}
```

### Document Service

**File:** `backend/services/compliance-service/src/services/document.service.ts`
```typescript
async storeDocument(venueId, documentType, buffer, originalName, tenantId) {
  // Store file (local or S3)
  fs.writeFileSync(filepath, buffer);
  
  // Store reference
  await db.query(
    `INSERT INTO compliance_documents
     (document_id, venue_id, document_type, filename, storage_path, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [documentId, venueId, documentType, filename, filepath, tenantId]
  );
  
  // Update verification status
  if (documentType === 'W9') {
    await db.query(
      `UPDATE venue_verifications SET w9_uploaded = true WHERE venue_id = $1`,
      [venueId]
    );
  }
}
```

### Bank Service (Mock)

**File:** `backend/services/compliance-service/src/services/bank.service.ts`
```typescript
async verifyBankAccount(venueId, accountNumber, routingNumber) {
  // In production: Use Plaid Auth API ($0.50 per verification)
  const mockVerified = !accountNumber.includes('000');
  
  await db.query(
    `INSERT INTO bank_verifications
     (venue_id, account_last_four, routing_number, verified)
     VALUES ($1, $2, $3, $4)`,
    [venueId, accountNumber.slice(-4), routingNumber, mockVerified]
  );
  
  if (mockVerified) {
    await db.query(
      `UPDATE venue_verifications SET bank_verified = true WHERE venue_id = $1`,
      [venueId]
    );
  }
}
```

---

## What's Missing

### 1. Identity Verification (IDV)
```typescript
// NOT IMPLEMENTED
async verifyIdentity(userId: string, idDocument: Buffer) {
  // Use Stripe Identity, Jumio, Onfido, etc.
  // OCR to extract data
  // Face match with selfie
  // Document authenticity check
}
```

### 2. Liveness Check
```typescript
// NOT IMPLEMENTED
async livenessCheck(userId: string, video: Buffer) {
  // Verify person is real, not photo/video
  // Typically done via SDK on mobile/web
}
```

### 3. Background Check
```typescript
// NOT IMPLEMENTED
async backgroundCheck(userId: string) {
  // Use Checkr, GoodHire, etc.
  // Criminal history
  // Sanctions screening
  // PEP (Politically Exposed Person) check
}
```

### 4. Real Plaid Integration

Current bank verification is mocked. Need actual Plaid API integration.

---

## Recommendations

### P2 - Implement Full KYC

| Task | Effort |
|------|--------|
| Integrate Stripe Identity or Jumio | 2 days |
| Implement ID document verification | 1 day |
| Add liveness check | 1 day |
| Integrate real Plaid | 1 day |
| Add background check integration | 1 day |
| **Total** | **6 days** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `compliance-service/src/controllers/venue.controller.ts` | Verification endpoints |
| `compliance-service/src/services/document.service.ts` | Document handling |
| `compliance-service/src/services/bank.service.ts` | Bank verification |
| `compliance-service/src/migrations/001_baseline_compliance.ts` | Tables |

---

## Related Documents

- `SELLER_ONBOARDING_FLOW_AUDIT.md` - Stripe Connect onboarding
- `ADMIN_BACKOFFICE_FLOW_AUDIT.md` - Admin verification tools
