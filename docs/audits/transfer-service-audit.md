# DATABASE AUDIT: transfer-service
Generated: Thu Oct  2 15:05:56 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "pg": "^8.11.0",
    "pino": "^9.9.0",
    "pino-pretty": "^13.1.1",
```

## 2. DATABASE CONFIGURATION FILES

## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/transfer-service//src/index.js:45:      'SELECT * FROM tickets WHERE id = $1 AND user_id = $2 FOR UPDATE',
backend/services/transfer-service//src/index.js:57:      'SELECT is_transferable, transfer_blocked_before_hours FROM ticket_types WHERE id = $1',
backend/services/transfer-service//src/index.js:68:      'SELECT id FROM users WHERE email = $1',
backend/services/transfer-service//src/index.js:76:        'INSERT INTO users (id, email, status) VALUES ($1, $2, $3) RETURNING id',
backend/services/transfer-service//src/index.js:89:      INSERT INTO ticket_transfers (
backend/services/transfer-service//src/index.js:129:      `SELECT * FROM ticket_transfers 
backend/services/transfer-service//src/index.js:144:        "UPDATE ticket_transfers SET status = 'EXPIRED' WHERE id = $1",
backend/services/transfer-service//src/index.js:152:      'UPDATE tickets SET user_id = $1, updated_at = NOW() WHERE id = $2',
backend/services/transfer-service//src/index.js:158:      `UPDATE ticket_transfers 
backend/services/transfer-service//src/index.js:166:      INSERT INTO ticket_transactions (

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

