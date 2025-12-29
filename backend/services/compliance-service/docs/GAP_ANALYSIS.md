# Compliance Service - Frontend/Backend Gap Analysis

Generated: 2024-12-27
Status: REVIEWED (No audit files - reviewed codebase directly)

---

## Summary

| Type | Count | Severity |
|------|-------|----------|
| Security | 0 | - |
| Frontend Features | 2 | MEDIUM |
| Operational | 1 | LOW |

**Good News:** This service has proper authentication via `server.ts` hook. All routes under /api/v1 use authenticate middleware.

---

## What Works Well ✅

### Authentication
- Global auth hook in server.ts: `fastify.addHook('onRequest', authenticate)`
- Admin routes use `requireAdmin` middleware
- Role-based access for compliance officers

### Comprehensive Compliance Features
- Venue verification workflow
- OFAC/sanctions screening
- Risk assessment and scoring
- Tax calculation and 1099 generation
- Bank verification
- GDPR data export/deletion
- Document management
- Batch processing jobs

---

## All Routes Inventory

### venue.routes.ts (3 routes) - AUTH ✅
| Method | Path | Purpose |
|--------|------|---------|
| POST | /venue/start-verification | Start venue KYC |
| GET | /venue/:venueId/status | Get verification status |
| GET | /venue/verifications | List verifications |

### admin.routes.ts (3 routes) - ADMIN AUTH ✅
| Method | Path | Purpose |
|--------|------|---------|
| GET | /admin/pending | Pending verifications |
| POST | /admin/approve/:id | Approve verification |
| POST | /admin/reject/:id | Reject verification |

### risk.routes.ts (5 routes) - AUTH ✅
| Method | Path | Purpose |
|--------|------|---------|
| POST | /risk/assess | Run risk assessment |
| GET | /risk/:entityId/score | Get risk score |
| PUT | /risk/:entityId/override | Override risk score |
| POST | /risk/flag | Flag entity |
| POST | /risk/resolve | Resolve flag |

### tax.routes.ts (2 routes) - AUTH ✅
| Method | Path | Purpose |
|--------|------|---------|
| POST | /tax/calculate | Calculate tax |
| GET | /tax/reports/:year | Get tax report |

### bank.routes.ts (3 routes) - AUTH ✅
| Method | Path | Purpose |
|--------|------|---------|
| POST | /bank/verify | Verify bank account |
| POST | /bank/payout-method | Create payout method |
| GET | /bank/:accountId/status | Get status |

### document.routes.ts (2 routes) - AUTH ✅
| Method | Path | Purpose |
|--------|------|---------|
| POST | /documents/upload | Upload document |
| GET | /documents/:documentId | Get document |

### gdpr.routes.ts (6 routes) - AUTH ✅
| Method | Path | Purpose |
|--------|------|---------|
| POST | /gdpr/request-data | Request data export |
| POST | /gdpr/delete-data | Request deletion |
| GET | /gdpr/status/:requestId | Get request status |
| POST | /privacy/export | Request export |
| GET | /privacy/export/:requestId | Get export status |
| POST | /privacy/deletion | Request deletion |
| GET | /privacy/deletion/:requestId | Get deletion status |

### ofac.routes.ts (1 route) - AUTH ✅
| Method | Path | Purpose |
|--------|------|---------|
| POST | /ofac/check | Run OFAC check |

### batch.routes.ts (5 routes) - AUTH ✅
| Method | Path | Purpose |
|--------|------|---------|
| GET | /batch/jobs | List batch jobs |
| POST | /batch/kyc | Run KYC checks |
| POST | /batch/risk-assessment | Run risk assessments |
| GET | /batch/job/:jobId | Get job details |
| POST | /batch/ofac-update | Update OFAC list |

### dashboard.routes.ts (1 route) - AUTH ✅
| Method | Path | Purpose |
|--------|------|---------|
| GET | /dashboard | Compliance overview |

### webhook.routes.ts (3 routes) - Webhook auth
| Method | Path | Purpose |
|--------|------|---------|
| POST | /webhooks/compliance/tax-update | Tax webhook |
| POST | /webhooks/compliance/kyc-update | KYC webhook |
| POST | /webhooks/compliance/risk-alert | Risk alert webhook |

---

## Frontend-Related Gaps

### GAP-COMPLIANCE-001: No User-Facing Verification Status
- **Severity:** MEDIUM
- **User Story:** "As a venue owner, I want to check my verification status in my dashboard"
- **Current:** 
  - GET /venue/:venueId/status exists but requires knowing venueId
  - No /me/verification-status endpoint
- **Needed:**
  - GET /me/verification - Get current user's venue verification status
  - Returns: status, required_documents, pending_items, next_steps
- **Impact:** Venue owners can't easily see their compliance status

### GAP-COMPLIANCE-002: No Document Upload Status for Users
- **Severity:** MEDIUM
- **User Story:** "I want to see which documents I've uploaded and their review status"
- **Current:**
  - POST /documents/upload exists
  - GET /documents/:documentId exists
  - No endpoint to list user's documents
- **Needed:**
  - GET /me/documents - List user's uploaded compliance documents
  - Returns: document_type, upload_date, status (pending/approved/rejected), reason
- **Impact:** Users can't track their document submissions

---

## Database Tables (23 tables) ✅ Comprehensive

| Table | Purpose |
|-------|---------|
| venue_verifications | KYC status |
| tax_records | Tax calculations |
| ofac_checks | Sanctions screening |
| risk_assessments | Risk scores |
| risk_flags | Risk flags |
| compliance_documents | Uploaded docs |
| bank_verifications | Bank verification |
| payout_methods | Payout config |
| notification_log | Notifications |
| compliance_settings | Settings |
| compliance_batch_jobs | Batch jobs |
| form_1099_records | 1099 forms |
| webhook_logs | Webhook history |
| ofac_sdn_list | SDN list cache |
| compliance_audit_log | Audit trail |
| gdpr_deletion_requests | GDPR deletions |
| privacy_export_requests | Data exports |
| pci_access_logs | PCI audit |
| state_compliance_rules | State rules |
| customer_profiles | Customer data |
| customer_preferences | Preferences |
| customer_analytics | Analytics |
| compliance_workflows | Workflows |

---

## Priority Order for Fixes

### This Month (Frontend Features)
1. GAP-COMPLIANCE-001: User verification status endpoint
2. GAP-COMPLIANCE-002: User documents list endpoint

