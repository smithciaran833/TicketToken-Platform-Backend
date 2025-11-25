# DATABASE PHASE 3 - BLOCKCHAIN & SPECIALIZED SERVICES DETAILED SCHEMAS

**Generated:** November 19, 2025  
**Services Covered:** Blockchain and specialized services  
**Status:** Partial - Transfer service complete, others require verification

---

## OVERVIEW

Phase 3 covers blockchain-related and specialized services:
- transfer-service (8+ tables) ✅ DOCUMENTED
- blockchain-service (tables TBD) ⚠️ NEEDS REVIEW  
- blockchain-indexer (tables TBD) ⚠️ NEEDS REVIEW
- minting-service (tables TBD) ⚠️ NEEDS REVIEW
- marketplace-service (tables TBD) ⚠️ NEEDS REVIEW
- queue-service (minimal PostgreSQL) ⚠️ NEEDS REVIEW
- search-service (minimal PostgreSQL) ⚠️ NEEDS REVIEW
- scanning-service (4 tables est.) ⚠️ NEEDS REVIEW

---

## 1. TRANSFER-SERVICE (8+ TABLES)

### Migration Files
- `database/postgresql/migrations/transfer-service/001_create_transfer_tables.sql`
- `database/postgresql/migrations/transfer-service/002_add_tenant_isolation.sql`
- `database/postgresql/migrations/transfer-service/003_add_foreign_keys_constraints.sql`
- `database/postgresql/migrations/transfer-service/004_add_performance_functions.sql`
- `database/postgresql/migrations/transfer-service/005_add_blockchain_columns.sql`
- `database/postgresql/migrations/transfer-service/006_add_phase6_features.sql`
- `database/postgresql/migrations/transfer-service/007_add_phase8_features.sql`

### Tables

#### 1.1 ticket_transfers
**Purpose:** Core ticket transfer requests and lifecycle  
**Key Fields:**
- id (UUID, PK)
- ticket_id (UUID, NOT NULL)
- from_user_id (UUID, NOT NULL)
- to_user_id (UUID, NOT NULL)
- to_email (VARCHAR 255, NOT NULL)
- transfer_method (VARCHAR 20: GIFT/SALE/CLAIM)
- status (VARCHAR 20: PENDING/COMPLETED/EXPIRED/CANCELLED)
- acceptance_code (VARCHAR 12, NOT NULL)
- message (TEXT)
- is_gift (BOOLEAN, default true)
- price_cents (INTEGER, default 0)
- currency (VARCHAR 3, default USD)
- expires_at (TIMESTAMPTZ, NOT NULL)
- accepted_at, cancelled_at (TIMESTAMPTZ)
- cancellation_reason (TEXT)
- blockchain_signature (VARCHAR 128) - *Added in Phase 5*
- blockchain_explorer_url (TEXT) - *Added in Phase 5*
- blockchain_transferred_at (TIMESTAMPTZ) - *Added in Phase 5*
- tenant_id (UUID) - *Added in Phase 2*
- created_at, updated_at (TIMESTAMPTZ)

**Indexes:**
- ticket_id
- from_user_id, to_user_id
- to_email
- status
- acceptance_code
- created_at DESC
- expires_at (WHERE status = 'PENDING')
- Composite: (status, expires_at), (from_user_id, status), (to_user_id, status)
- blockchain_signature (WHERE NOT NULL)
- tenant_id

**Constraints:**
- valid_price CHECK (price_cents >= 0)
- valid_dates CHECK (expires_at > created_at)
- valid_acceptance CHECK (accepted_at IS NULL OR accepted_at >= created_at)

#### 1.2 transfer_history
**Purpose:** Audit trail for all transfer actions  
**Key Fields:**
- id (UUID, PK)
- transfer_id (UUID, NOT NULL)
- action (VARCHAR 50, NOT NULL)
- old_status, new_status (VARCHAR 20)
- actor_user_id (UUID)
- metadata (JSONB)
- ip_address (INET)
- user_agent (TEXT)
- created_at (TIMESTAMPTZ)

**Indexes:**
- transfer_id
- actor_user_id
- created_at DESC
- action

#### 1.3 transfer_fees
**Purpose:** Transfer fee tracking and payment records  
**Key Fields:**
- id (UUID, PK)
- transfer_id (UUID, FK → ticket_transfers, CASCADE)
- base_fee (DECIMAL 10,2, default 0)
- platform_fee (DECIMAL 10,2, default 0)
- service_fee (DECIMAL 10,2, default 0)
- total_fee (DECIMAL 10,2, NOT NULL)
- currency (VARCHAR 3, default USD)
- payment_method (VARCHAR 50)
- paid_at (TIMESTAMPTZ)
- created_at, updated_at (TIMESTAMPTZ)

**Indexes:**
- transfer_id
- paid_at (WHERE NOT NULL)

**Views:**
- transfer_fee_summary: Daily revenue analytics by currency

#### 1.4 transfer_rules
**Purpose:** Configurable business rules for transfer validation  
**Key Fields:**
- id (UUID, PK)
- tenant_id (UUID, NOT NULL)
- ticket_type_id, event_id (UUID, nullable)
- rule_name (VARCHAR 255, NOT NULL)
- rule_type (VARCHAR 50, NOT NULL)
- config (JSONB, default '{}')
- priority (INTEGER, default 0)
- is_active (BOOLEAN, default true)
- is_blocking (BOOLEAN, default true)
- created_at, updated_at (TIMESTAMPTZ)

**Indexes:**
- tenant_id
- rule_type
- is_active (WHERE true)
- priority DESC

#### 1.5 user_blacklist
**Purpose:** Users restricted from transfer operations  
**Key Fields:**
- id (UUID, PK)
- user_id (UUID, NOT NULL)
- reason (TEXT)
- is_active (BOOLEAN, default true)
- blacklisted_at (TIMESTAMPTZ)
- blacklisted_by (UUID)
- expires_at (TIMESTAMPTZ)
- created_at, updated_at (TIMESTAMPTZ)

**Indexes:**
- user_id
- is_active (WHERE true)

#### 1.6 promotional_codes
**Purpose:** Discount codes for transfer fees  
**Key Fields:**
- id (UUID, PK)
- code (VARCHAR 50, UNIQUE, NOT NULL)
- discount_percentage (DECIMAL 5,2)
- discount_flat (DECIMAL 10,2)
- max_uses (INTEGER)
- current_uses (INTEGER, default 0)
- is_active (BOOLEAN, default true)
- expires_at (TIMESTAMPTZ)
- created_at, updated_at (TIMESTAMPTZ)

**Indexes:**
- code
- is_active (WHERE true)

**Functions:**
- increment_promo_usage(code): Increments usage counter

#### 1.7 batch_transfers
**Purpose:** Bulk transfer operations tracking  
**Key Fields:**
- id (VARCHAR 100, PK)
- user_id (UUID, NOT NULL)
- total_items (INTEGER, NOT NULL)
- success_count (INTEGER, default 0)
- failure_count (INTEGER, default 0)
- status (VARCHAR 20, default PROCESSING)
- created_at, completed_at, updated_at (TIMESTAMPTZ)

**Indexes:**
- user_id
- status
- created_at

#### 1.8 batch_transfer_items
**Purpose:** Individual items within batch transfers  
**Key Fields:**
- id (UUID, PK)
- batch_id (VARCHAR 100, FK → batch_transfers, CASCADE)
- ticket_id (UUID, NOT NULL)
- transfer_id (UUID, FK → ticket_transfers)
- status (VARCHAR 20, NOT NULL)
- error_message (TEXT)
- processed_at (TIMESTAMPTZ)

**Indexes:**
- batch_id
- transfer_id

### Integration Notes

**Blockchain Integration (Phase 5):**
- Solana NFT transfer tracking via blockchain_signature
- Explorer URL generation for transaction verification
- Blockchain verification status on tickets table

**Tenant Isolation (Phase 2):**
- tenant_id added to ticket_transfers
- RLS policies for multi-tenancy
- Tenant context: `current_setting('app.current_tenant')::uuid`

**Performance Optimizations (Phase 4):**
- Custom functions for common operations
- Materialized views for analytics
- Partitioning strategies (if needed for scale)

**Views & Analytics:**
- blockchain_transfer_stats: Daily blockchain transfer metrics
- transfer_fee_summary: Revenue tracking

---

## 2. BLOCKCHAIN-SERVICE

**Status:** ⚠️ REQUIRES FULL SCHEMA EXTRACTION

**Known Migration:**
- `backend/services/blockchain-service/src/migrations/001_baseline_blockchain_service.ts`

**Expected Tables (estimation):**
- blockchain_transactions
- blockchain_wallets
- blockchain_sync_status
- blockchain_events
- nft_metadata

**Primary Functions:**
- Solana blockchain interaction
- NFT minting coordination
- Transaction verification
- Wallet management

---

## 3. BLOCKCHAIN-INDEXER

**Status:** ⚠️ REQUIRES FULL SCHEMA EXTRACTION

**Known Migrations Folder:**
- `backend/services/blockchain-indexer/src/migrations/`

**Expected Tables (estimation):**
- indexed_blocks
- indexed_transactions
- indexed_accounts
- indexer_state
- reconciliation_logs

**Primary Functions:**
- Blockchain data indexing
- Historical data sync
- Transaction reconciliation
- Real-time event processing

---

## 4. MINTING-SERVICE

**Status:** ⚠️ REQUIRES FULL SCHEMA EXTRACTION

**Expected Tables (estimation):**
- nft_mints
- mint_queue
- mint_status
- mint_errors

**Primary Functions:**
- NFT minting operations
- Batch minting
- Mint status tracking
- Error handling

---

## 5. MARKETPLACE-SERVICE

**Status:** ⚠️ REQUIRES FULL SCHEMA EXTRACTION

**Expected Tables (estimation):**
- marketplace_listings
- marketplace_offers
- marketplace_sales
- marketplace_analytics

**Primary Functions:**
- Secondary market listings
- Offer management
- Sales tracking
- Marketplace analytics

---

## 6. QUEUE-SERVICE

**Status:** ⚠️ MINIMAL POSTGRESQL USAGE

**Primary Storage:** Redis (Bull queues)

**Expected PostgreSQL Tables (if any):**
- queue_jobs (metadata backup)
- dead_letter_queue
- job_metrics

**Primary Functions:**
- Payment processing queues
- NFT minting queues
- Email sending queues
- Webhook delivery queues
- Refund processing

---

## 7. SEARCH-SERVICE

**Status:** ⚠️ MINIMAL POSTGRESQL USAGE

**Primary Storage:** Elasticsearch

**Expected PostgreSQL Tables (if any):**
- search_indexes (metadata)
- search_sync_status

**Primary Functions:**
- Full-text search
- Faceted search
- Search analytics
- Index management

---

## 8. SCANNING-SERVICE

**Status:** ⚠️ REQUIRES FULL SCHEMA EXTRACTION

**Known Migration:**
- `database/postgresql/migrations/scanning-service/001_add_tenant_isolation.sql`

**Expected Tables (estimation from audit):**
- scans (QR code scan events)
- scan_logs (audit trail)
- device_registrations
- offline_cache

**Primary Functions:**
- QR code validation
- Ticket scanning
- Offline mode support
- Scan analytics

---

## BLOCKCHAIN ARCHITECTURE NOTES

### Solana Integration
The platform integrates with Solana blockchain for NFT tickets:

1. **Minting Flow:**
   - Ticket purchase triggers mint queue job
   - minting-service creates NFT on Solana
   - blockchain-service records transaction
   - ticket record updated with nft_mint_address

2. **Transfer Flow:**
   - Transfer request created in ticket_transfers
   - blockchain-service initiates Solana transfer
   - Transaction signature recorded
   - blockchain-indexer confirms

3. **Verification:**
   - blockchain-indexer monitors blockchain
   - Verifies ownership via wallet addresses
   - Updates blockchain_verified flag
   - Provides explorer URLs

### Key Blockchain Fields

**On tickets table (via migrations):**
- nft_mint_address (VARCHAR 44)
- nft_last_transfer_signature (VARCHAR 128)
- blockchain_verified (BOOLEAN)
- blockchain_verified_at (TIMESTAMPTZ)

**On ticket_transfers table:**
- blockchain_signature (VARCHAR 128)
- blockchain_explorer_url (TEXT)
- blockchain_transferred_at (TIMESTAMPTZ)

---

## DATA FLOW DIAGRAM

```
User Purchase → Payment Service → Queue Service
                                       ↓
                               Minting Service → Blockchain Service
                                                        ↓
                              NFT Minted ← Solana Blockchain ← Blockchain Indexer
                                    ↓
                           Ticket Updated (nft_mint_address)
                                    ↓
                    Transfer Request → Transfer Service
                                          ↓
                              Blockchain Transfer → Blockchain Service
                                                           ↓
                                        Update transfer_history & blockchain_signature
```

---

## PRODUCTION READINESS GAPS

### Transfer Service
- ✅ Complete schema documented
- ✅ Tenant isolation implemented
- ✅ Blockchain integration ready
- ⚠️ Need to verify Phase 7 migrations (007_add_phase8_features.sql)

### Blockchain Services
- ⚠️ blockchain-service schema needs extraction
- ⚠️ blockchain-indexer schema needs extraction
- ⚠️ minting-service schema needs extraction
- ⚠️ marketplace-service schema needs extraction

### Support Services
- ⚠️ queue-service: Verify PostgreSQL usage (primarily Redis)
- ⚠️ search-service: Verify PostgreSQL usage (primarily Elasticsearch)
- ⚠️ scanning-service: Extract complete schema

---

## NEXT STEPS

1. **Priority 1 - Blockchain Core:**
   - Extract blockchain-service migrations
   - Extract blockchain-indexer migrations
   - Document table relationships

2. **Priority 2 - NFT Operations:**
   - Extract minting-service migrations
   - Extract marketplace-service migrations
   - Document minting/transfer flow

3. **Priority 3 - Support Services:**
   - Verify queue-service PostgreSQL tables
   - Verify search-service PostgreSQL tables
   - Complete scanning-service documentation

4. **Priority 4 - Integration Testing:**
   - Validate cross-service relationships
   - Test blockchain transaction flow
   - Verify data consistency

---

## SUMMARY

| Service | Tables | Complexity | Status |
|---------|--------|-----------|---------|
| transfer-service | 8 | HIGH | ✅ Complete |
| blockchain-service | TBD | HIGH | ⚠️ Pending |
| blockchain-indexer | TBD | HIGH | ⚠️ Pending |
| minting-service | TBD | MEDIUM | ⚠️ Pending |
| marketplace-service | TBD | MEDIUM | ⚠️ Pending |
| queue-service | ~0-3 | LOW | ⚠️ Pending |
| search-service | ~0-2 | LOW | ⚠️ Pending |
| scanning-service | ~4 | LOW | ⚠️ Pending |

---

**Document Version:** 1.0 (Partial)  
**Last Updated:** November 19, 2025  
**Completion:** ~15% (1 of 8 services fully documented)

**NOTE:** This document is a work in progress. Additional services require migration file analysis to complete the schema documentation.
