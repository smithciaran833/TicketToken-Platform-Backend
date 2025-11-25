# DATABASE AUDIT: minting-service
Generated: Thu Oct  2 15:05:55 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.1.0",
    "pg": "^8.16.3",
    "prom-client": "^15.1.3",
    "rate-limit-redis": "^4.2.2",
```

## 2. DATABASE CONFIGURATION FILES
### database.ts
```typescript
import knex from 'knex';

export const db = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  pool: { min: 2, max: 10 }
});

export default db;
```


## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/minting-service//src/services/ReconciliationService.js:83:      FROM nft_mints
backend/services/minting-service//src/services/ReconciliationService.js:108:            `UPDATE nft_mints 
backend/services/minting-service//src/services/ReconciliationService.js:168:      INSERT INTO reconciliation_reports (
backend/services/minting-service//src/services/MintingOrchestrator.js:165:        INSERT INTO nft_mints (
backend/services/minting-service//src/services/MintingOrchestrator.js:190:      // UPDATE tickets table with asset_id (WP-14 requirement)
backend/services/minting-service//src/services/MintingOrchestrator.js:192:        UPDATE tickets
backend/services/minting-service//src/services/MintingOrchestrator.js:219:      FROM tickets 
backend/services/minting-service//src/services/MintingOrchestrator.js:234:          INSERT INTO tickets (id, ticket_number, status, created_at)
backend/services/minting-service//src/services/MintingOrchestrator.js:241:          INSERT INTO tickets (id, ticket_number, status, created_at)
backend/services/minting-service//src/services/MintingOrchestrator.js:251:      UPDATE tickets 

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

