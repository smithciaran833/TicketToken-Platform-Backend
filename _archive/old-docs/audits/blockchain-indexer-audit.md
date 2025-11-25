# DATABASE AUDIT: blockchain-indexer
Generated: Thu Oct  2 15:05:54 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "pg": "^8.16.3",
    "pino": "^9.5.0",
    "pino-pretty": "^11.3.0",
```

## 2. DATABASE CONFIGURATION FILES

## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/blockchain-indexer//src/sync/historicalSync.js:138:            UPDATE indexer_state 
backend/services/blockchain-indexer//src/indexer.js:39:                FROM indexer_state
backend/services/blockchain-indexer//src/indexer.js:50:                    INSERT INTO indexer_state (id, last_processed_slot, indexer_version)
backend/services/blockchain-indexer//src/indexer.js:85:            UPDATE indexer_state
backend/services/blockchain-indexer//src/indexer.js:113:            UPDATE indexer_state
backend/services/blockchain-indexer//src/indexer.js:251:            UPDATE indexer_state
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:265:            'SELECT 1 FROM tickets WHERE token_id = $1',
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:276:                'SELECT id FROM tickets WHERE token_id = $1',
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:284:                INSERT INTO marketplace_activity 
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:317:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:330:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:338:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:63:            'SELECT 1 FROM indexed_transactions WHERE signature = $1',
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:93:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:119:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:130:                INSERT INTO ticket_transfers 
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:135:                FROM tickets 
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:162:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:204:            INSERT INTO indexed_transactions 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:101:            INSERT INTO reconciliation_runs (started_at, status)
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:110:            UPDATE reconciliation_runs
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:125:            UPDATE reconciliation_runs
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:146:            FROM tickets
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:240:                INSERT INTO ownership_discrepancies 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:251:                        UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:259:                        UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:267:                        UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:276:                INSERT INTO reconciliation_log
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:294:            UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:70:                    UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:86:                UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:101:            FROM tickets
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:119:                        UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:129:                        INSERT INTO ownership_discrepancies 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:168:            FROM marketplace_activity ma
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:169:            JOIN tickets t ON ma.token_id = t.token_id
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:198:                        UPDATE tickets 
backend/services/blockchain-indexer//src/api/server.js:135:            'SELECT * FROM indexer_state WHERE id = 1'
backend/services/blockchain-indexer//src/api/server.js:161:        const state = await db.query('SELECT * FROM indexer_state WHERE id = 1');
backend/services/blockchain-indexer//src/api/server.js:162:        const txCount = await db.query('SELECT COUNT(*) FROM indexed_transactions');
backend/services/blockchain-indexer//src/api/server.js:165:            FROM indexed_transactions
backend/services/blockchain-indexer//src/api/server.js:194:            FROM indexed_transactions
backend/services/blockchain-indexer//src/api/server.js:205:            SELECT * FROM reconciliation_runs
backend/services/blockchain-indexer//src/api/server.js:214:            FROM ownership_discrepancies

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES

## 6. ENVIRONMENT VARIABLES
```
# Database
DATABASE_URL=postgresql://tickettoken:CHANGE_ME@localhost:5432/tickettoken_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=tickettoken
DB_PASSWORD=CHANGE_ME
```

---

