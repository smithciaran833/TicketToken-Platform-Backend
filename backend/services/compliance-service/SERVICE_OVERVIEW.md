# Compliance Service - Service Overview

**Purpose:** Handles KYC/AML compliance, tax reporting (1099-K forms), OFAC screening, risk assessment, GDPR privacy rights, PCI compliance, and multi-jurisdictional tax compliance for the TicketToken platform.

**Port:** 3008

---

## 📁 Directory Structure

```
src/
├── routes/          # API route definitions
├── controllers/     # Request handlers
├── services/        # Business logic
├── middleware/      # Request middleware
├── config/          # Configuration
├── migrations/      # Database migrations
├── validators/      # Input validation schemas
├── utils/           # Utility functions
└── templates/       # Email templates
```

---

## 🛣️ Routes

### **admin.routes.ts**
| Method | Path | Handler | Middleware | Description |
|--------|------|---------|------------|-------------|
| GET | `/admin/pending` | `getPendingReviews` | requireAdmin | Get venues pending manual review |
| POST | `/admin/approve/:id` | `approveVerification` | - | Approve a venue verification |
| POST | `/admin/reject/:id` | `rejectVerification` | - | Reject a venue verification |

### **bank.routes.ts**
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/bank/verify` | `verifyBankAccount` | Verify bank account (Plaid integration) |
| POST | `/bank/payout-method` | `createPayoutMethod` | Create payout method for venue |
| GET | `/bank/:accountId/status` | `verifyBankAccount` | Get bank verification status |

### **batch.routes.ts**
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/batch/jobs` | `getBatchJobs` | Get batch job status |
| POST | `/batch/kyc` | `runDailyChecks` | Run daily KYC checks |
| POST | `/batch/risk-assessment` | `runDailyChecks` | Run daily risk assessments |
| GET | `/batch/job/:jobId` | `getBatchJobs` | Get specific batch job |
| POST | `/batch/ofac-update` | `updateOFACList` | Update OFAC sanctions list |

### **dashboard.routes.ts**
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/dashboard` | `getComplianceOverview` | Get compliance dashboard overview |

### **document.routes.ts**
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/documents/upload` | `uploadDocument` | Upload compliance document (W9, ID, etc.) |
| GET | `/documents/:documentId` | `getDocument` | Retrieve compliance document |

### **gdpr.routes.ts**
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/gdpr/request-data` | `requestDeletion` | Request GDPR data deletion |
| POST | `/gdpr/delete-data` | `requestDeletion` | Delete user data (GDPR) |
| GET | `/gdpr/status/:requestId` | `getDeletionStatus` | Get deletion request status |
| POST | `/privacy/export` | (inline handler) | Request user data export |
| GET | `/privacy/export/:requestId` | (inline handler) | Get export request status |
| POST | `/privacy/deletion` | (inline handler) | Request account deletion |
| GET | `/privacy/deletion/:requestId` | (inline handler) | Get deletion request status |

### **health.routes.ts**
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/health` | (inline handler) | Basic health check (no auth) |
| GET | `/ready` | (inline handler) | Readiness check (DB, Redis, OFAC data) |

### **metrics.routes.ts**
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/metrics` | (inline handler) | Prometheus metrics endpoint |
| GET | `/metrics/json` | (inline handler) | Metrics in JSON format |

### **ofac.routes.ts**
| Method | Path | Handler | Middleware | Description |
|--------|------|---------|------------|-------------|
| POST | `/ofac/check` | `checkName` | requireComplianceOfficer | Screen name against OFAC sanctions list |

### **risk.routes.ts**
| Method | Path | Handler | Middleware | Description |
|--------|------|---------|------------|-------------|
| POST | `/risk/assess` | `calculateRiskScore` | requireComplianceOfficer | Calculate risk score for entity |
| GET | `/risk/:entityId/score` | `calculateRiskScore` | - | Get entity risk score |
| PUT | `/risk/:entityId/override` | `flagVenue` | requireComplianceOfficer | Override risk assessment |
| POST | `/risk/flag` | `flagVenue` | - | Flag venue for review |
| POST | `/risk/resolve` | `resolveFlag` | - | Resolve risk flag |

### **tax.routes.ts**
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/tax/calculate` | `calculateTax` | Calculate tax for transaction |
| GET | `/tax/reports/:year` | `generateTaxReport` | Generate tax report for year |

### **venue.routes.ts**
| Method | Path | Handler | Middleware | Description |
|--------|------|---------|------------|-------------|
| POST | `/venue/start-verification` | `startVerification` | requireComplianceOfficer | Start venue verification workflow |
| GET | `/venue/:venueId/status` | `getVerificationStatus` | - | Get venue verification status |
| GET | `/venue/verifications` | `getAllVerifications` | requireComplianceOfficer | Get all venue verifications |

### **webhook.routes.ts**
| Method | Path | Handler | Middleware | Description |
|--------|------|---------|------------|-------------|
| POST | `/webhooks/compliance/tax-update` | (inline handler) | webhookAuth | Receive tax update webhooks |
| POST | `/webhooks/compliance/kyc-update` | (inline handler) | webhookAuth | Receive KYC update webhooks |
| POST | `/webhooks/compliance/risk-alert` | (inline handler) | webhookAuth | Receive risk alert webhooks |

---

## 🎛️ Controllers

### **AdminController** (`admin.controller.ts`)
- `getPendingReviews()` - Retrieve venues awaiting manual review
- `approveVerification()` - Approve a venue verification
- `rejectVerification()` - Reject a venue verification with reason

### **BankController** (`bank.controller.ts`)
- `verifyBankAccount()` - Verify bank account using Plaid API
- `createPayoutMethod()` - Create payout destination for venue

### **BatchController** (`batch.controller.ts`)
- `generate1099Forms()` - Generate 1099-K forms for venues
- `getBatchJobs()` - Get batch job status/history
- `runDailyChecks()` - Execute daily compliance checks
- `updateOFACList()` - Update OFAC sanctions list

### **DashboardController** (`dashboard.controller.ts`)
- `getComplianceOverview()` - Get compliance metrics and overview

### **DocumentController** (`document.controller.ts`)
- `uploadDocument()` - Upload compliance documents to S3
- `getDocument()` - Retrieve compliance document

### **GDPRController** (`gdpr.controller.ts`)
- `requestDeletion()` - Request GDPR data deletion
- `getDeletionStatus()` - Get deletion request status

### **HealthController** (`health.controller.ts`)
- `checkHealth()` - Basic health check
- `checkReadiness()` - Comprehensive readiness check

### **OFACController** (`ofac.controller.ts`)
- `checkName()` - Screen name against OFAC sanctions list

### **RiskController** (`risk.controller.ts`)
- `calculateRiskScore()` - Calculate and return risk score
- `flagVenue()` - Flag venue for manual review
- `resolveFlag()` - Resolve a risk flag

### **TaxController** (`tax.controller.ts`)
- `trackSale()` - Track venue sale for tax reporting
- `getTaxSummary()` - Get venue tax summary
- `calculateTax()` - Calculate tax for transaction
- `generateTaxReport()` - Generate annual tax report

### **VenueController** (`venue.controller.ts`)
- `startVerification()` - Initiate venue verification workflow
- `getVerificationStatus()` - Get verification status
- `getAllVerifications()` - Get all verifications (admin)

### **WebhookController** (`webhook.controller.ts`)
- `handlePlaidWebhook()` - Process Plaid webhooks
- `handleStripeWebhook()` - Process Stripe webhooks
- `handleSendGridWebhook()` - Process SendGrid email webhooks

---

## 🔧 Services

### **BankService** (`bank.service.ts`)
Handles bank account verification using Plaid integration.
- `verifyBankAccount()` - Verify bank account (currently mock)
- `createPayoutMethod()` - Create payout method for venue

**Tables Used:** `bank_verifications`, `payout_methods`, `venue_verifications`

### **BatchService** (`batch.service.ts`)
Manages batch processing jobs for compliance operations.
- `generateYear1099Forms()` - Generate 1099-K forms for year
- `getMonthlyBreakdown()` - Get monthly earnings breakdown
- `processOFACUpdates()` - Process OFAC list updates
- `dailyComplianceChecks()` - Run daily compliance checks

**Tables Used:** `form_1099_records`, `tax_records`, `compliance_batch_jobs`

### **CacheIntegrationService** (`cache-integration.ts`)
Redis caching layer for performance optimization.
- `get()` - Get cached value with optional fetcher
- `set()` - Set cached value with TTL
- `delete()` - Delete cached keys
- `flush()` - Flush all cache

### **CustomerTaxService** (`customer-tax.service.ts`)
Tracks customer-side tax obligations for NFT resales.
- `trackNFTSale()` - Track NFT sale for customer tax reporting
- `getCustomerTaxSummary()` - Get customer tax summary

**Tables Used:** `tax_records`, `customer_profiles`

### **DataRetentionService** (`data-retention.service.ts`)
Enforces data retention policies and GDPR compliance.
- `enforceRetention()` - Delete old records per retention policy
- `handleGDPRDeletion()` - Execute GDPR data deletion
- `deleteOldRecords()` - Delete old records from table

**Tables Used:** Multiple tables for cleanup

### **DatabaseService** (`database.service.ts`)
PostgreSQL database connection management.
- `connect()` - Establish database connection
- `getPool()` - Get connection pool
- `query()` - Execute SQL query
- `close()` - Close database connection

### **DocumentService** (`document.service.ts`)
Manages compliance document storage and retrieval.
- `storeDocument()` - Store document in S3
- `getDocument()` - Retrieve document from S3
- `getContentType()` - Determine file content type
- `validateW9()` - Validate W9 form

**Tables Used:** `compliance_documents`
**External Services:** AWS S3

### **EmailRealService** (`email-real.service.ts`)
Real email service using SendGrid for notifications.
- `sendEmail()` - Send email with attachments
- `send1099Notification()` - Send 1099 notification to venue

**External Services:** SendGrid

### **EnhancedAuditService** (`enhanced-audit.service.ts`)
Comprehensive audit logging for compliance and security.
- `log()` - Log audit entry
- `getAuditTrail()` - Get audit trail for resource
- `getSecurityEvents()` - Get security events
- `searchAuditLogs()` - Search audit logs
- `generateAuditReport()` - Generate audit report

**Tables Used:** `compliance_audit_log`

### **MultiJurisdictionTaxService** (`multi-jurisdiction-tax.service.ts`)
Handles multi-state and international tax compliance.
- `calculateTax()` - Calculate tax for jurisdiction
- `calculateMultiJurisdictionTax()` - Calculate tax across multiple jurisdictions
- `getJurisdiction()` - Get jurisdiction details
- `getAllJurisdictions()` - Get all jurisdictions
- `checkThreshold1099()` - Check if venue meets 1099 threshold
- `getVenuesRequiring1099()` - Get venues requiring 1099
- `recordTaxableTransaction()` - Record taxable transaction
- `getTaxSummary()` - Get tax summary for venue
- `getJurisdictionsRequiringRegistration()` - Get jurisdictions requiring business registration
- `getFilingCalendar()` - Get tax filing deadlines
- `checkMultiJurisdictionCompliance()` - Check compliance across jurisdictions

**Tables Used:** `tax_records`, `state_compliance_rules`

### **NotificationService** (`notification.service.ts`)
Sends email and SMS notifications for compliance events.
- `sendEmail()` - Send email notification
- `sendSMS()` - Send SMS notification
- `notifyThresholdReached()` - Notify when tax threshold reached
- `notifyVerificationStatus()` - Notify venue verification status

**Tables Used:** `notification_log`
**External Services:** SendGrid, Twilio

### **OFACService** (`ofac.service.ts`)
Basic OFAC sanctions screening (fuzzy matching).
- `checkName()` - Check name against OFAC list
- `fuzzyMatch()` - Perform fuzzy string matching
- `updateOFACList()` - Update OFAC sanctions list

**Tables Used:** `ofac_sdn_list`, `ofac_checks`

### **OFACRealService** (`ofac-real.service.ts`)
Real-time OFAC screening using official OFAC API.
- `downloadAndUpdateOFACList()` - Download and update OFAC SDN list
- `checkAgainstOFAC()` - Check entity against OFAC with fuzzy matching

**Tables Used:** `ofac_sdn_list`, `ofac_checks`

### **PCIComplianceService** (`pci-compliance.service.ts`)
PCI DSS compliance monitoring and audit logging.
- `logCardDataAccess()` - Log access to cardholder data
- `validatePCICompliance()` - Validate PCI compliance status

**Tables Used:** `pci_access_logs`

### **PDFService** (`pdf.service.ts`)
Generates PDF tax forms using PDFKit.
- `generate1099K()` - Generate 1099-K PDF form
- `generateW9()` - Generate W9 PDF form

**External Libraries:** PDFKit

### **PrivacyExportService** (`privacy-export.service.ts`)
Handles GDPR data export and account deletion requests.
- `requestDataExport()` - Create data export request
- `processExportAsync()` - Process export in background
- `collectUserData()` - Collect all user data
- `createExportArchive()` - Create ZIP archive of data
- `generateReadme()` - Generate README for export
- `requestAccountDeletion()` - Request account deletion
- `generateDownloadUrl()` - Generate S3 presigned URL
- `notifyUserExportReady()` - Notify user when export ready
- `sendDeletionConfirmation()` - Send deletion confirmation

**Tables Used:** `privacy_export_requests`, `customer_profiles`, `gdpr_deletion_requests`
**External Services:** AWS S3

### **PrometheusMetricsService** (`prometheus-metrics.service.ts`)
Exports Prometheus metrics for monitoring.
- `getMetrics()` - Get metrics in Prometheus format
- `getMetricsJSON()` - Get metrics in JSON format
- `resetMetrics()` - Reset all metrics
- `recordHttpRequest()` - Record HTTP request metrics
- `recordDbQuery()` - Record database query metrics
- `updateDbMetrics()` - Update database pool metrics
- `recordCacheOperation()` - Record cache hit/miss metrics

### **RedisService** (`redis.service.ts`)
Redis connection and operations management.
- `connect()` - Connect to Redis
- `getClient()` - Get Redis client
- `get()` - Get value from Redis
- `set()` - Set value in Redis with TTL
- `close()` - Close Redis connection

### **RiskService** (`risk.service.ts`)
Calculates risk scores and manages risk flags.
- `calculateRiskScore()` - Calculate comprehensive risk score
- `checkVelocity()` - Check transaction velocity
- `flagForReview()` - Flag venue for manual review
- `resolveFlag()` - Resolve risk flag

**Tables Used:** `risk_assessments`, `risk_flags`, `tax_records`

### **S3StorageService** (`s3-storage.service.ts`)
AWS S3 file storage operations.
- `uploadFile()` - Upload file to S3
- `getPresignedDownloadUrl()` - Get presigned download URL
- `getPresignedUploadUrl()` - Get presigned upload URL
- `downloadFile()` - Download file from S3
- `deleteFile()` - Delete file from S3
- `fileExists()` - Check if file exists
- `getFileMetadata()` - Get file metadata
- `setExpirationPolicy()` - Set lifecycle policy
- `listFiles()` - List files with prefix
- `copyFile()` - Copy file within S3
- `getBucketStats()` - Get bucket statistics

**External Services:** AWS S3

### **SchedulerService** (`scheduler.service.ts`)
Manages scheduled compliance tasks using node-cron.
- `startScheduledJobs()` - Start all scheduled jobs
- `scheduleDaily()` - Schedule daily job
- `scheduleWeekly()` - Schedule weekly job
- `scheduleYearly()` - Schedule yearly job (1099 generation)
- `stopAllJobs()` - Stop all scheduled jobs

### **StateComplianceService** (`state-compliance.service.ts`)
Enforces state-specific ticket resale regulations.
- `validateResale()` - Validate resale against state rules
- `checkLicenseRequirement()` - Check if license required
- `loadFromDatabase()` - Load state rules from database

**Tables Used:** `state_compliance_rules`

### **TaxService** (`tax.service.ts`)
Tracks sales and generates tax reports for venues.
- `trackSale()` - Record sale for tax tracking
- `getVenueTaxSummary()` - Get venue tax summary
- `calculateTax()` - Calculate tax for transaction
- `generateTaxReport()` - Generate comprehensive tax report

**Tables Used:** `tax_records`, `form_1099_records`, `venue_verifications`

### **WorkflowEngineService** (`workflow-engine.service.ts`)
Orchestrates multi-step compliance workflows.
- `createWorkflow()` - Create new workflow
- `startWorkflow()` - Start workflow execution
- `executeWorkflow()` - Execute workflow steps
- `executeStep()` - Execute individual step
- `executeVerificationStep()` - Execute verification step
- `executeDocumentUploadStep()` - Execute document upload step
- `executeOfacCheckStep()` - Execute OFAC check step
- `executeRiskAssessmentStep()` - Execute risk assessment step
- `executeApprovalStep()` - Execute approval step
- `executeNotificationStep()` - Execute notification step
- `checkDependencies()` - Check step dependencies
- `getWorkflowSteps()` - Get workflow step definitions
- `getWorkflow()` - Get workflow by ID
- `updateWorkflowStatus()` - Update workflow status
- `saveWorkflow()` - Save workflow state
- `cancelWorkflow()` - Cancel workflow
- `getVenueWorkflows()` - Get workflows for venue

**Tables Used:** `compliance_workflows`

### **InitTablesService** (`init-tables.ts`)
Initializes database tables programmatically.

### **MigrateTablesService** (`migrate-tables.ts`)
Runs database migrations programmatically.

---

## 🗄️ Repositories

**Note:** This service does not use a separate repository pattern. Database queries are executed directly within service classes using the `DatabaseService` (`db.query()`).

**Tables Queried Across Services:**
- `venue_verifications`
- `tax_records`
- `ofac_checks`
- `risk_assessments`
- `risk_flags`
- `compliance_documents`
- `bank_verifications`
- `payout_methods`
- `notification_log`
- `compliance_settings`
- `compliance_batch_jobs`
- `form_1099_records`
- `webhook_logs`
- `ofac_sdn_list`
- `compliance_audit_log`
- `gdpr_deletion_requests`
- `privacy_export_requests`
- `pci_access_logs`
- `state_compliance_rules`
- `customer_profiles`
- `customer_preferences`
- `customer_analytics`
- `compliance_workflows`

---

## 🛡️ Middleware

### **auth.middleware.ts**
Authentication and authorization middleware.
- `authenticate()` - Verify JWT token
- `requireAdmin()` - Require admin role
- `requireComplianceOfficer()` - Require compliance officer role
- `webhookAuth()` - Verify webhook signatures

### **tenant.middleware.ts**
Multi-tenant data isolation middleware.
- `tenantMiddleware()` - Extract and validate tenant ID
- `requireTenantId()` - Require tenant ID (throws if missing)
- `getTenantId()` - Get tenant ID (returns undefined if missing)

### **validation.middleware.ts**
Input validation using Zod schemas.
- `formatZodError()` - Format Zod validation errors
- `validateBody()` - Validate request body
- `validateQuery()` - Validate query parameters
- `validateParams()` - Validate URL parameters
- `validate()` - Validate multiple parts (body/query/params)
- `safeValidateBody()` - Safe validation returning result object
- `sanitizeString()` - Sanitize string input
- `validateFileUpload()` - Validate file uploads
- `setupValidationErrorHandler()` - Setup global validation error handler

### **rate-limit.middleware.ts**
Rate limiting using fastify-rate-limit and Redis.
- `setupRateLimiting()` - Configure rate limiting
- `applyCustomRateLimit()` - Apply custom rate limit to route
- `bypassRateLimit()` - Check if request should bypass rate limit
- `addRateLimitHeaders()` - Add rate limit headers to response
- `getRateLimitStatus()` - Get current rate limit status for key

---

## ⚙️ Config

### **database.ts**
PostgreSQL database configuration.
- Connection pool settings (max 10 connections)
- PgBouncer connection on port 6432
- Timeouts: 30s idle, 2s connection

### **secrets.ts**
Secrets management using AWS Secrets Manager.
- Loads: `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`, `REDIS_PASSWORD`
- Integration with shared secrets manager utility

---

## 📊 Migrations

### **001_baseline_compliance.ts**
**Creates 15 baseline tables:**
1. `venue_verifications` - Venue KYC/business verification
2. `tax_records` - Transaction tracking for 1099-K
3. `ofac_checks` - OFAC sanctions screening results
4. `risk_assessments` - Risk scoring for venues
5. `risk_flags` - Manual review flags
6. `compliance_documents` - Stored compliance documents
7. `bank_verifications` - Bank account verification (Plaid)
8. `payout_methods` - Payout destinations
9. `notification_log` - Notification history
10. `compliance_settings` - Configuration settings
11. `compliance_batch_jobs` - Batch job tracking
12. `form_1099_records` - Generated 1099-K forms
13. `webhook_logs` - Webhook event logs
14. `ofac_sdn_list` - OFAC Specially Designated Nationals list
15. `compliance_audit_log` - Comprehensive audit trail

**Default Settings Inserted:**
- Tax threshold: $600
- High risk score: 70
- Review required score: 50
- OFAC auto-update: enabled
- Auto-approve low risk: disabled

### **002_add_missing_tables.ts**
**Creates 6 additional tables:**
1. `gdpr_deletion_requests` - GDPR right to be forgotten requests
2. `privacy_export_requests` - GDPR data export requests (with RLS policy)
3. `pci_access_logs` - PCI DSS audit trail for card data access
4. `state_compliance_rules` - State-level ticket resale regulations
5. `customer_profiles` - Customer data for retention policies
6. `customer_preferences` - User consent and preferences
7. `customer_analytics` - Analytics tracking (for retention)

**Default State Rules Inserted:**
- Tennessee: 20% markup limit
- Texas: License required
- New York: Full price disclosure required
- California: Registration required if >$2000/year

### **003_add_tenant_isolation.ts**
**Adds multi-tenant data isolation:**
- Adds `tenant_id` column to all 21 tables
- Creates composite indexes for common queries
- Enables RLS (Row Level Security) on privacy_export_requests
- Sets default tenant_id for existing records
- Makes tenant_id NOT NULL

**Critical for:** Preventing cross-tenant data leaks in SaaS model

### **004_add_foreign_keys.ts**
**Adds 11 internal foreign key constraints:**
- Enforces referential integrity within service
- CASCADE deletes for orphaned records
- Links child records to parent tables:
  - Tax records → venue_verifications
  - OFAC checks → venue_verifications
  - Risk assessments → venue_verifications
  - Risk flags → risk_assessments
  - Documents → venue_verifications
  - Bank verifications → venue_verifications
  - Payout methods → venue_verifications
  - 1099 records → venue_verifications
  - Customer preferences → customer_profiles
  - Customer analytics → customer_profiles
  - GDPR deletion requests → customer_profiles

**Note:** Cross-service foreign keys intentionally omitted per microservice architecture.

### **005_add_phase5_6_tables.ts**
**Creates Phase 5 & 6 tables:**
1. `compliance_workflows` - Workflow orchestration engine
2. Adds `jurisdiction` column to `tax_records` - Multi-jurisdiction tax tracking
3. Adds `metadata` column to `tax_records` - Additional tax metadata
4. Adds `jurisdiction` column to `form_1099_records` - Jurisdiction-specific 1099 forms

**Creates indexes:**
- Jurisdiction-based tax record queries
- Workflow status queries

---

## ✅ Validators

**File:** `schemas.ts`

### **Common Validators:**
- `einSchema` - EIN format: XX-XXXXXXX
- `emailSchema` - Email validation
- `phoneSchema` - US phone number format
- `currencySchema` - Non-negative currency amounts
- `uuidSchema` - UUID v4 validation
- `yearSchema` - Year range 1900-2100
- `venueIdSchema` - Venue ID validation
- `accountNumberSchema` - 6-17 digits
- `routingNumberSchema` - 9 digits
- `addressSchema` - Full address validation

### **Endpoint-Specific Schemas:**
- `startVerificationSchema` - Venue verification initiation
- `uploadW9Schema` - W9 document upload
- `trackSaleSchema` - Tax sale tracking
- `ofacCheckSchema` - OFAC screening
- `calculateRiskSchema` - Risk assessment
- `flagVenueSchema` - Flag for review
- `verifyBankAccountSchema` - Bank verification
- `uploadDocumentSchema` - Document upload
- `gdprDeletionSchema` - GDPR deletion request
- `plaidWebhookSchema` - Plaid webhook validation
- `stripeWebhookSchema` - Stripe webhook validation
- `sendgridWebhookSchema` - SendGrid webhook validation
- And many more...

### **Helper Functions:**
- `validateBody()` - Validate request body
- `validateQuery()` - Validate query params
- `validateParams()` - Validate URL params
- `safeValidate()` - Safe validation returning result object

---

## 🛠️ Utils

### **encryption.util.ts**
Encryption utilities for sensitive data.
- `encrypt()` - Encrypt plaintext
- `decrypt()` - Decrypt ciphertext
- `hash()` - SHA-256 hashing
- `encryptFields()` - Encrypt object fields
- `decryptFields()` - Decrypt object fields
- `redact()` - Redact sensitive data for logging
- `validateEncryptionKey()` - Validate encryption key strength

**Algorithm:** AES-256-GCM with PBKDF2 key derivation

### **performance.util.ts**
Database performance optimization utilities.
- `createPerformanceIndexes()` - Create optimization indexes
- `analyzeTable()` - Analyze table statistics
- `getSlowQueries()` - Identify slow queries
- `getConnectionPoolStats()` - Monitor connection pool
- `vacuumAnalyzeTables()` - Run VACUUM ANALYZE
- `getTableSizes()` - Get table size statistics
- `getIndexUsageStats()` - Analyze index usage
- `prepareQuery()` - Prepare parameterized query
- `getCacheStatistics()` - Get cache hit ratios
- `getLongRunningQueries()` - Find long-running queries
- `killQuery()` - Terminate query by PID

### **logger.ts**
Centralized logging utility (assumed, not analyzed in detail).

---

## 📧 Templates

### **emails/**
Contains email templates for compliance notifications:
- 1099 form notifications
- Verification status updates
- Risk alerts
- GDPR request confirmations

*(Exact template files not detailed in current analysis)*

---

## 🗄️ Database Tables Owned by This Service

Based on migrations, this service owns **26 tables**:

### **Core Compliance Tables:**
1. `venue_verifications` - Venue KYC/business verification status
2. `tax_records` - Transaction tracking for tax reporting
3. `ofac_checks` - OFAC sanctions screening results
4. `risk_assessments` - Risk scoring calculations
5. `risk_flags` - Manual review flags
6. `compliance_documents` - Stored compliance documents (metadata)
7. `bank_verifications` - Bank account verification results
8. `payout_methods` - Payout destinations for venues

### **Tax & Reporting Tables:**
9. `form_1099_records` - Generated 1099-K tax forms
10. `compliance_batch_jobs` - Batch job status tracking
11. `compliance_settings` - System configuration

### **OFAC & Sanctions:**
12. `ofac_sdn_list` - OFAC Specially Designated Nationals list

### **Notifications & Webhooks:**
13. `notification_log` - Notification delivery history
14. `webhook_logs` - Webhook event logs

### **Audit & Security:**
15. `compliance_audit_log` - Comprehensive audit trail
16. `pci_access_logs` - PCI DSS cardholder data access logs

### **GDPR & Privacy:**
17. `gdpr_deletion_requests` - GDPR right to be forgotten requests
18. `privacy_export_requests` - GDPR data export requests

### **Customer Data:**
19. `customer_profiles` - Customer personal information
20. `customer_preferences` - User consent and preferences
21. `customer_analytics` - Analytics event tracking

### **State Compliance:**
22. `state_compliance_rules` - State-specific regulations

### **Workflows:**
23. `compliance_workflows` - Workflow orchestration state

### **Indexes & Optimizations:**
- Tenant isolation indexes on all tables
- Composite indexes for common query patterns
- Full-text search indexes on names
- Time-series indexes for audit logs

---

## 🔗 External Service Integrations

### **Configured in Code:**

1. **PostgreSQL** (database.ts)
   - Primary data store
   - PgBouncer connection pooling
   - Port: 6432

2. **Redis** (redis.service.ts)
   - Caching layer
   - Rate limiting storage
   - Session storage

3. **AWS S3** (s3-storage.service.ts)
   - Document storage
   - Compliance document uploads
   - Data export archives

4. **AWS Secrets Manager** (secrets.ts)
   - Database credentials
   - API keys
   - Encryption keys

5. **Plaid** (bank.service.ts)
   - Bank account verification
   - Currently mocked, ready for production

6. **SendGrid** (email-real.service.ts)
   - Email delivery
   - 1099 form notifications
   - Compliance alerts

7. **Twilio** (notification.service.ts)
   - SMS notifications
   - Alert delivery

8. **OFAC API** (ofac-real.service.ts)
   - Real-time sanctions screening
   - SDN list updates

9. **Prometheus** (prometheus-metrics.service.ts)
   - Metrics export
   - Monitoring integration

---

## 📝 Key Features

### **✅ Implemented:**
1. **Venue Verification Workflow** - Multi-step KYC/AML verification
2. **Tax Tracking & 1099-K Generation** - IRS-compliant tax reporting
3. **OFAC Sanctions Screening** - Real-time sanctions list checking
4. **Risk Assessment Engine** - Automated risk scoring
5. **Bank Account Verification** - Plaid integration (mocked)
6. **Document Management** - S3-based document storage
7. **GDPR Compliance** - Data export and deletion requests
8. **PCI DSS Logging** - Cardholder data access audit trail
9. **Multi-Tenant Isolation** - Complete tenant data segregation
10. **State-Level Compliance** - State-specific resale regulations
11. **Multi-Jurisdiction Tax** - Support for multiple tax jurisdictions
12. **Workflow Orchestration** - Automated compliance workflows
13. **Batch Processing** - Daily compliance checks and 1099 generation
14. **Audit Logging** - Comprehensive compliance audit trail
15. **Rate Limiting** - API protection with Redis-backed rate limiting
16. **Prometheus Metrics** - Production monitoring and alerting
17. **Data Retention Policies** - Automated data cleanup

### **🚧 Mocked/Incomplete:**
1. **Plaid Integration** - Bank verification is currently mocked
2. **Some Webhook Handlers** - Placeholder implementations

---

## 🔐 Security Features

1. **Field-Level Encryption** - Sensitive data encrypted at rest
2. **Tenant Isolation** - Row-level security policies
3. **JWT Authentication** - Token-based auth with role checks
4. **Input Validation** - Comprehensive Zod schema validation
5. **Rate Limiting** - Per-endpoint and per-user rate limits
6. **Audit Logging** - All compliance actions logged
7. **PCI Compliance** - Access logging for cardholder data
8. **Webhook Signature Verification** - HMAC signature validation
9. **SQL Injection Prevention** - Parameterized queries throughout

---

## 📈 Monitoring & Observability

1. **Health Checks** - `/health` and `/ready` endpoints
2. **Prometheus Metrics** - `/metrics` endpoint with custom metrics
3. **Audit Logging** - Comprehensive audit trail
4. **Database Performance Monitoring** - Slow query tracking
5. **Connection Pool Monitoring** - Pool stats and alerts
6. **Cache Hit Rate Tracking** - Redis performance metrics

---

## 🚀 Getting Started

### **Prerequisites:**
- PostgreSQL 14+ (via PgBouncer on port 6432)
- Redis 6+
- AWS S3 bucket
- AWS Secrets Manager configured
- SendGrid API key
- Plaid API keys (for production)

### **Environment Variables:**
```env
# Database
DB_HOST=postgres
DB_PORT=6432
DB_NAME=tickettoken_db
DB_USER=postgres
DB_PASSWORD=<from-secrets-manager>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<from-secrets-manager>

# AWS
AWS_REGION=us-east-1
AWS_S3_BUCKET=tickettoken-compliance-docs

# External Services
SENDGRID_API_KEY=<from-secrets-manager>
PLAID_CLIENT_ID=<your-plaid-client-id>
PLAID_SECRET=<your-plaid-secret>
TWILIO_ACCOUNT_SID=<your-twilio-sid>
TWILIO_AUTH_TOKEN=<your-twilio-token>

# Service
SERVICE_NAME=compliance-service
PORT=3008
NODE_ENV=production

# Secrets
ENCRYPTION_KEY=<32-byte-hex-key>
WEBHOOK_SECRET=<webhook-signing-secret>
```

### **Running Migrations:**
```bash
npm run migrate:latest
```

### **Starting Service:**
```bash
npm run dev          # Development
npm run build        # Build
npm start            # Production
```

---

## 📚 Additional Notes

- **No Repository Pattern:** Direct database queries via `DatabaseService`
- **Microservice Architecture:** No cross-service foreign keys
- **Multi-Tenant:** All tables include `tenant_id` for isolation
- **Async Processing:** Scheduled jobs for batch operations
- **GDPR-Ready:** Complete data export and deletion workflows
- **Tax Compliance:** IRS 1099-K reporting with $600 threshold
- **State Regulations:** Enforces state-specific resale limits
- **Workflow Engine:** Flexible multi-step compliance processes

---

**Last Updated:** 2025-12-21  
**Service Version:** Phase 5-6 Implementation Complete
