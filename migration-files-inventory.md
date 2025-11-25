# TicketToken Platform - Migration Files Inventory

**Generated:** November 19, 2025  
**Total Migration Files:** 59

---

## Complete Migration Files Inventory

| Service | File Name | File Type | Full Path |
|---------|-----------|-----------|-----------|
| analytics-service | 001_analytics_baseline.ts | .ts | ./backend/services/analytics-service/src/migrations/001_analytics_baseline.ts |
| analytics-service | 002_create_external_analytics_tables.ts | .ts | ./backend/services/analytics-service/src/migrations/002_create_external_analytics_tables.ts |
| analytics-service | 003_add_rls_to_price_tables.ts | .ts | ./backend/services/analytics-service/src/migrations/003_add_rls_to_price_tables.ts |
| auth-service | 001_auth_baseline.ts | .ts | ./backend/services/auth-service/src/migrations/001_auth_baseline.ts |
| blockchain-indexer | 001_baseline_blockchain_indexer.ts | .ts | ./backend/services/blockchain-indexer/src/migrations/001_baseline_blockchain_indexer.ts |
| blockchain-service | 001_baseline_blockchain_service.ts | .ts | ./backend/services/blockchain-service/src/migrations/001_baseline_blockchain_service.ts |
| compliance-service | 001_baseline_compliance.ts | .ts | ./backend/services/compliance-service/src/migrations/001_baseline_compliance.ts |
| compliance-service | 002_add_missing_tables.ts | .ts | ./backend/services/compliance-service/src/migrations/002_add_missing_tables.ts |
| compliance-service | 003_add_tenant_isolation.ts | .ts | ./backend/services/compliance-service/src/migrations/003_add_tenant_isolation.ts |
| compliance-service | 004_add_foreign_keys.ts | .ts | ./backend/services/compliance-service/src/migrations/004_add_foreign_keys.ts |
| compliance-service | 005_add_phase5_6_tables.ts | .ts | ./backend/services/compliance-service/src/migrations/005_add_phase5_6_tables.ts |
| event-service | 001_baseline_event.ts | .ts | ./backend/services/event-service/src/migrations/001_baseline_event.ts |
| event-service | 002_add_performance_indexes.ts | .ts | ./backend/services/event-service/src/migrations/002_add_performance_indexes.ts |
| file-service | 001_baseline_files.ts | .ts | ./backend/services/file-service/src/migrations/001_baseline_files.ts |
| file-service | 002_add_missing_tables.ts | .ts | ./backend/services/file-service/src/migrations/002_add_missing_tables.ts |
| file-service | 003_add_storage_quotas.ts | .ts | ./backend/services/file-service/src/migrations/003_add_storage_quotas.ts |
| integration-service | 001_baseline_integration.ts | .ts | ./backend/services/integration-service/src/migrations/001_baseline_integration.ts |
| integration-service | 002_add_missing_tables.ts | .ts | ./backend/services/integration-service/src/migrations/002_add_missing_tables.ts |
| marketplace-service | 001_baseline_marketplace.ts | .ts | ./backend/services/marketplace-service/src/migrations/001_baseline_marketplace.ts |
| marketplace-service | 002_add_escrow_support.ts | .ts | ./backend/services/marketplace-service/src/migrations/002_add_escrow_support.ts |
| minting-service | 001_baseline_minting.ts | .ts | ./backend/services/minting-service/src/migrations/001_baseline_minting.ts |
| minting-service | 002_add_multitenancy.ts | .ts | ./backend/services/minting-service/src/migrations/002_add_multitenancy.ts |
| minting-service | 003_add_unique_constraints.ts | .ts | ./backend/services/minting-service/src/migrations/003_add_unique_constraints.ts |
| monitoring-service | 001_baseline_monitoring_schema.ts | .ts | ./backend/services/monitoring-service/src/migrations/001_baseline_monitoring_schema.ts |
| monitoring-service | 003_create_advanced_features.sql | .sql | ./database/postgresql/migrations/monitoring-service/003_create_advanced_features.sql |
| notification-service | 001_baseline_notification_schema.ts | .ts | ./backend/services/notification-service/src/migrations/001_baseline_notification_schema.ts |
| notification-service | 003_create_audit_log.sql | .sql | ./database/postgresql/migrations/notification-service/003_create_audit_log.sql |
| notification-service | 004_create_templates.sql | .sql | ./database/postgresql/migrations/notification-service/004_create_templates.sql |
| order-service | 001_baseline_order.ts | .ts | ./backend/services/order-service/src/migrations/001_baseline_order.ts |
| order-service | 002_add_missing_order_tables.ts | .ts | ./backend/services/order-service/src/migrations/002_add_missing_order_tables.ts |
| payment-service | 001_baseline_payment.ts | .ts | ./backend/services/payment-service/src/migrations/001_baseline_payment.ts |
| queue-service | 001_baseline_queue.ts | .ts | ./backend/services/queue-service/src/migrations/001_baseline_queue.ts |
| scanning-service | 001_baseline_scanning.ts | .ts | ./backend/services/scanning-service/src/migrations/001_baseline_scanning.ts |
| scanning-service | 001_add_tenant_isolation.sql | .sql | ./database/postgresql/migrations/scanning-service/001_add_tenant_isolation.sql |
| search-service | 001_search_consistency_tables.ts | .ts | ./backend/services/search-service/src/migrations/001_search_consistency_tables.ts |
| ticket-service | 001_baseline_ticket.ts | .ts | ./backend/services/ticket-service/src/migrations/001_baseline_ticket.ts |
| ticket-service | 002_add_foreign_keys.ts | .ts | ./backend/services/ticket-service/src/migrations/002_add_foreign_keys.ts |
| ticket-service | 003_add_performance_indexes.ts | .ts | ./backend/services/ticket-service/src/migrations/003_add_performance_indexes.ts |
| transfer-service | 001_baseline_transfer.ts | .ts | ./backend/services/transfer-service/src/migrations/001_baseline_transfer.ts |
| transfer-service | 001_create_transfer_tables.sql | .sql | ./database/postgresql/migrations/transfer-service/001_create_transfer_tables.sql |
| transfer-service | 002_add_tenant_isolation.sql | .sql | ./database/postgresql/migrations/transfer-service/002_add_tenant_isolation.sql |
| transfer-service | 003_add_foreign_keys_constraints.sql | .sql | ./database/postgresql/migrations/transfer-service/003_add_foreign_keys_constraints.sql |
| transfer-service | 004_add_performance_functions.sql | .sql | ./database/postgresql/migrations/transfer-service/004_add_performance_functions.sql |
| transfer-service | 005_add_blockchain_columns.sql | .sql | ./database/postgresql/migrations/transfer-service/005_add_blockchain_columns.sql |
| transfer-service | 006_add_phase6_features.sql | .sql | ./database/postgresql/migrations/transfer-service/006_add_phase6_features.sql |
| transfer-service | 007_add_phase8_features.sql | .sql | ./database/postgresql/migrations/transfer-service/007_add_phase8_features.sql |
| venue-service | 001_baseline_venue.ts | .ts | ./backend/services/venue-service/src/migrations/001_baseline_venue.ts |
| venue-service | 004_add_external_verification_tables.ts | .ts | ./backend/services/venue-service/src/migrations/004_add_external_verification_tables.ts |

---

## Statistics

### Total Migration Files
- **Total:** 59 migration files

### Count by File Type
- **TypeScript (.ts):** 48 files
- **SQL (.sql):** 11 files

### Count by Service

| Service | TypeScript | SQL | Total |
|---------|------------|-----|-------|
| analytics-service | 3 | 0 | 3 |
| auth-service | 1 | 0 | 1 |
| blockchain-indexer | 1 | 0 | 1 |
| blockchain-service | 1 | 0 | 1 |
| compliance-service | 5 | 0 | 5 |
| event-service | 2 | 0 | 2 |
| file-service | 3 | 0 | 3 |
| integration-service | 2 | 0 | 2 |
| marketplace-service | 2 | 0 | 2 |
| minting-service | 3 | 0 | 3 |
| monitoring-service | 1 | 1 | 2 |
| notification-service | 1 | 2 | 3 |
| order-service | 2 | 0 | 2 |
| payment-service | 1 | 0 | 1 |
| queue-service | 1 | 0 | 1 |
| scanning-service | 1 | 1 | 2 |
| search-service | 1 | 0 | 1 |
| ticket-service | 3 | 0 | 3 |
| transfer-service | 1 | 7 | 8 |
| venue-service | 2 | 0 | 2 |
| **TOTAL** | **48** | **11** | **59** |

### Services with Split Migrations
These services have migrations in both locations (TypeScript in service directory + SQL in database/postgresql/migrations):

1. **monitoring-service** - 1 TypeScript + 1 SQL = 2 total
2. **notification-service** - 1 TypeScript + 2 SQL = 3 total
3. **scanning-service** - 1 TypeScript + 1 SQL = 2 total
4. **transfer-service** - 1 TypeScript + 7 SQL = 8 total

---

## Migration Locations

### TypeScript/JavaScript Migrations
Location: `./backend/services/*/src/migrations/*.ts`

All TypeScript migration files are located within their respective service directories under the `src/migrations/` folder.

### SQL Migrations
Location: `./database/postgresql/migrations/*/`

SQL migration files are centrally located in the database directory, organized by service name in subdirectories.

---

## Migration Analysis Phases

To systematically investigate and extract schema information, the migrations are organized into phases:

### Phase 1: Baseline Schema Creation (20 files)
**Purpose:** Initial database schema establishment for each service
**Files:**
- analytics-service: 001_analytics_baseline.ts
- auth-service: 001_auth_baseline.ts
- blockchain-indexer: 001_baseline_blockchain_indexer.ts
- blockchain-service: 001_baseline_blockchain_service.ts
- compliance-service: 001_baseline_compliance.ts
- event-service: 001_baseline_event.ts
- file-service: 001_baseline_files.ts
- integration-service: 001_baseline_integration.ts
- marketplace-service: 001_baseline_marketplace.ts
- minting-service: 001_baseline_minting.ts
- monitoring-service: 001_baseline_monitoring_schema.ts
- notification-service: 001_baseline_notification_schema.ts
- order-service: 001_baseline_order.ts
- payment-service: 001_baseline_payment.ts
- queue-service: 001_baseline_queue.ts
- scanning-service: 001_baseline_scanning.ts
- search-service: 001_search_consistency_tables.ts
- ticket-service: 001_baseline_ticket.ts
- transfer-service: 001_baseline_transfer.ts
- venue-service: 001_baseline_venue.ts

### Phase 2: Extension & Missing Tables (7 files)
**Purpose:** Add tables that were missed or needed after initial baseline
**Files:**
- analytics-service: 002_create_external_analytics_tables.ts
- compliance-service: 002_add_missing_tables.ts
- file-service: 002_add_missing_tables.ts
- integration-service: 002_add_missing_tables.ts
- order-service: 002_add_missing_order_tables.ts
- marketplace-service: 002_add_escrow_support.ts
- minting-service: 002_add_multitenancy.ts

### Phase 3: Isolation, Security & Constraints (9 files)
**Purpose:** Add tenant isolation, foreign keys, unique constraints, RLS policies
**Files:**
- compliance-service: 003_add_tenant_isolation.ts
- compliance-service: 004_add_foreign_keys.ts
- ticket-service: 002_add_foreign_keys.ts
- minting-service: 003_add_unique_constraints.ts
- scanning-service: 001_add_tenant_isolation.sql
- transfer-service: 002_add_tenant_isolation.sql
- transfer-service: 003_add_foreign_keys_constraints.sql
- analytics-service: 003_add_rls_to_price_tables.ts
- venue-service: 004_add_external_verification_tables.ts

### Phase 4: Performance & Optimization (4 files)
**Purpose:** Add indexes, performance functions, and optimizations
**Files:**
- event-service: 002_add_performance_indexes.ts
- ticket-service: 003_add_performance_indexes.ts
- transfer-service: 004_add_performance_functions.sql
- transfer-service: 001_create_transfer_tables.sql

### Phase 5: Blockchain & Advanced Features (7 files)
**Purpose:** Blockchain integration, advanced service features
**Files:**
- compliance-service: 005_add_phase5_6_tables.ts
- file-service: 003_add_storage_quotas.ts
- transfer-service: 005_add_blockchain_columns.sql
- transfer-service: 006_add_phase6_features.sql
- transfer-service: 007_add_phase8_features.sql
- monitoring-service: 003_create_advanced_features.sql
- notification-service: 003_create_audit_log.sql

### Phase 6: Templates & Specialized Features (1 file)
**Purpose:** Template systems and specialized service features
**Files:**
- notification-service: 004_create_templates.sql

---

## Schema Analysis Checklist

For each migration file, extract the following information:

### 1. Tables Created
- [ ] Table name
- [ ] Columns (name + data type)
- [ ] Primary key definition
- [ ] Constraints (UNIQUE, CHECK, NOT NULL, DEFAULT)

### 2. Indexes Created
- [ ] Index name
- [ ] Target table
- [ ] Columns in index
- [ ] Index type (btree, unique, partial, composite)

### 3. Foreign Keys Created
- [ ] FK constraint name
- [ ] Source table + column
- [ ] References table + column  
- [ ] ON DELETE/ON UPDATE behavior

### 4. Other Database Objects
- [ ] Functions created
- [ ] Triggers created
- [ ] Views created
- [ ] RLS Policies created

### 5. Data Modifications
- [ ] INSERT statements
- [ ] UPDATE statements
- [ ] ALTER TABLE on existing tables

---

## Investigation Approach

**Recommended Order:**
1. Start with Phase 1 (Baseline) - establishes core schemas
2. Move to Phase 2 (Extensions) - completes table structure
3. Analyze Phase 3 (Security) - understand relationships and isolation
4. Review Phase 4 (Performance) - understand optimization strategy
5. Examine Phase 5 & 6 (Advanced) - specialized features

**Per Phase:**
- Process files sequentially within each phase
- Document findings in separate analysis files
- Track dependencies between migrations
- Note any schema conflicts or inconsistencies

---

## Notes

- All services have at least one baseline migration file
- The transfer-service has the most migrations (8 total, with 7 SQL files)
- Compliance-service has the most TypeScript migrations (5 files)
- 4 services utilize a hybrid approach with both TypeScript and SQL migrations
- Most services follow the pattern of having TypeScript migrations only
- Phase 1 contains all baseline schemas (20 files - one per service)
- Phase 3 focuses heavily on security with tenant isolation and foreign keys
- Phase 5 has the most variation in migration purposes
