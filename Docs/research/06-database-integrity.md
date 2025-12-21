# Database Integrity Audit Guide for TicketToken

**Platform:** TicketToken - Blockchain-based Ticketing Platform  
**Stack:** PostgreSQL, Knex.js, Node.js/TypeScript, Fastify, Multi-tenant Architecture  
**Date:** December 2025

---

## 1. Standards & Best Practices

### 1.1 ACID Properties and When They Matter

PostgreSQL is fully ACID-compliant, providing atomicity, consistency, isolation, and durability for all database transactions.

**Atomicity** ensures transactions are all-or-nothing. For TicketToken, this is critical when:
- Processing ticket purchases (payment + NFT minting must both succeed or both fail)
- Handling resale transactions (transfer ownership + split royalties atomically)
- Multi-step operations like event creation with venue/artist associations

**Consistency** guarantees the database transitions between valid states only. PostgreSQL enforces this through constraints (CHECK, UNIQUE, FOREIGN KEY) and triggers.

**Isolation** prevents concurrent transactions from interfering. This is crucial for:
- Preventing double-selling of tickets (two buyers selecting same seat)
- Accurate inventory counts during high-demand sales
- Royalty calculations during concurrent resales

**Durability** ensures committed transactions survive system failures via Write-Ahead Logging (WAL).

*Sources:*
- https://www.postgresql.org/docs/current/transaction-iso.html
- https://www.tigerdata.com/learn/understanding-acid-compliance
- https://webdock.io/en/docs/how-guides/postgresql-guides/data-integrity-in-postgres

---

### 1.2 Transaction Isolation Levels

PostgreSQL supports four isolation levels (though only three are distinct internally):

| Level | Dirty Reads | Non-Repeatable Reads | Phantom Reads | Serialization Anomaly |
|-------|-------------|---------------------|---------------|----------------------|
| Read Uncommitted* | Not possible | Possible | Possible | Possible |
| Read Committed (default) | Not possible | Possible | Possible | Possible |
| Repeatable Read | Not possible | Not possible | Not possible** | Possible |
| Serializable | Not possible | Not possible | Not possible | Not possible |

*PostgreSQL's Read Uncommitted behaves like Read Committed  
**PostgreSQL's Repeatable Read prevents phantom reads (stricter than SQL standard)

**For TicketToken, recommended usage:**

- **Read Committed (default):** General queries, event browsing, non-critical reads
- **Repeatable Read:** Financial reports, royalty calculations, analytics queries that need consistent snapshots
- **Serializable:** Ticket purchases, inventory management, balance transfers

Serializable transactions may fail with error code `40001` (serialization failure) and must be retried by the application.

**Knex.js implementation:**
```typescript
await knex.transaction({ isolationLevel: 'serializable' }, async (trx) => {
  // Critical ticket purchase logic
});
```

*Sources:*
- https://www.postgresql.org/docs/current/transaction-iso.html
- https://www.thenile.dev/blog/transaction-isolation-postgres
- https://www.cockroachlabs.com/blog/sql-isolation-levels-explained/

---

### 1.3 Referential Integrity (Foreign Keys & Constraints)

Foreign keys ensure relationships between tables remain valid. PostgreSQL enforces these at the database level.

**ON DELETE/UPDATE Actions:**

| Action | Behavior |
|--------|----------|
| NO ACTION (default) | Prevents deletion if child records exist |
| RESTRICT | Same as NO ACTION (checked immediately) |
| CASCADE | Automatically delete/update child records |
| SET NULL | Set foreign key to NULL on parent deletion |
| SET DEFAULT | Set foreign key to default value |

**TicketToken recommendations:**

```sql
-- Events → Venues: Prevent venue deletion if events exist
CONSTRAINT fk_venue FOREIGN KEY (venue_id) 
  REFERENCES venues(id) ON DELETE RESTRICT

-- Tickets → Events: Cascade delete tickets when event is deleted
CONSTRAINT fk_event FOREIGN KEY (event_id) 
  REFERENCES events(id) ON DELETE CASCADE

-- Transactions → Users: Keep transaction history, set user to NULL
CONSTRAINT fk_user FOREIGN KEY (user_id) 
  REFERENCES users(id) ON DELETE SET NULL

-- Resales → Original Tickets: Prevent deletion if resale exists
CONSTRAINT fk_original_ticket FOREIGN KEY (original_ticket_id) 
  REFERENCES tickets(id) ON DELETE RESTRICT
```

**Essential constraints for ticketing:**
- CHECK constraints for valid price ranges, dates, quantities
- UNIQUE constraints on ticket serial numbers, event slugs
- NOT NULL on critical fields (user_id on purchases, event_id on tickets)

*Sources:*
- https://www.postgresql.org/docs/current/ddl-constraints.html
- https://www.postgresql.org/docs/current/tutorial-fk.html
- https://wiki.postgresql.org/wiki/Referential_Integrity_Tutorial

---

### 1.4 Optimistic vs Pessimistic Locking

**Pessimistic Locking (SELECT FOR UPDATE)**

Locks rows when reading, preventing other transactions from modifying until commit.

```sql
-- Lock ticket row before purchase
SELECT * FROM tickets WHERE id = $1 FOR UPDATE;
-- Other transactions wait until this one commits
UPDATE tickets SET owner_id = $2 WHERE id = $1;
```

**Best for TicketToken:**
- High-contention scenarios (popular events)
- Ticket inventory management
- Seat selection during checkout
- Payment processing

**Optimistic Locking (Version column)**

Allows concurrent reads, checks version at write time.

```sql
-- Add version column
ALTER TABLE tickets ADD COLUMN version INTEGER DEFAULT 1;

-- Update with version check
UPDATE tickets 
SET owner_id = $2, version = version + 1 
WHERE id = $1 AND version = $3;
-- If no rows affected, another transaction modified the row
```

**Best for TicketToken:**
- User profile updates
- Event metadata edits
- Low-contention scenarios
- Long-running user sessions

**Knex.js with FOR UPDATE:**
```typescript
await knex.transaction(async (trx) => {
  const ticket = await trx('tickets')
    .where({ id: ticketId })
    .forUpdate()  // Pessimistic lock
    .first();
  
  if (ticket.status !== 'available') {
    throw new Error('Ticket no longer available');
  }
  
  await trx('tickets')
    .where({ id: ticketId })
    .update({ status: 'sold', owner_id: userId });
});
```

*Sources:*
- https://www.postgresql.org/docs/current/explicit-locking.html
- https://vladmihalcea.com/optimistic-vs-pessimistic-locking/
- https://learning-notes.mistermicheels.com/data/sql/optimistic-pessimistic-locking-sql/

---

### 1.5 Database Constraints vs Application Validation

**Defense in depth:** Always validate at both layers.

| Validation Type | Application Layer | Database Layer |
|----------------|-------------------|----------------|
| Format validation | ✓ Primary | Backup |
| Business rules | ✓ Primary | Where possible |
| Referential integrity | Backup | ✓ Primary |
| Uniqueness | Backup | ✓ Primary |
| Data types | ✓ Both | ✓ Both |
| Range checks | ✓ Both | ✓ Both |

**Critical database constraints for TicketToken:**

```sql
-- Price must be positive
CHECK (price > 0)

-- Quantity must be reasonable
CHECK (quantity BETWEEN 1 AND 1000)

-- Event dates must be logical
CHECK (end_date >= start_date)

-- Royalty percentage valid
CHECK (royalty_percentage BETWEEN 0 AND 100)

-- Ticket status enum
CHECK (status IN ('available', 'reserved', 'sold', 'used', 'cancelled'))

-- Tenant isolation
CHECK (tenant_id IS NOT NULL)
```

**Never rely solely on application validation for:**
- Foreign key relationships
- Unique constraints (race conditions)
- NOT NULL constraints
- Multi-table consistency

*Sources:*
- https://www.postgresql.org/docs/current/ddl-constraints.html
- https://brandur.org/soft-deletion

---

### 1.6 Handling Concurrent Modifications

**Three strategies to prevent race conditions:**

**1. Atomic Updates (Preferred)**
```sql
-- Instead of read-modify-write
UPDATE tickets SET quantity = quantity - 1 
WHERE id = $1 AND quantity > 0;
```

**2. SELECT FOR UPDATE**
```sql
BEGIN;
SELECT * FROM inventory WHERE event_id = $1 FOR UPDATE;
-- Application logic
UPDATE inventory SET available = available - 1 WHERE event_id = $1;
COMMIT;
```

**3. Optimistic Locking with Retry**
```typescript
async function purchaseWithRetry(ticketId: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await attemptPurchase(ticketId);
    } catch (err) {
      if (err.code === '40001' && i < maxRetries - 1) {
        await delay(Math.random() * 100); // Random backoff
        continue;
      }
      throw err;
    }
  }
}
```

**Critical TicketToken scenarios requiring concurrency control:**
- Ticket inventory deduction during purchase
- Seat reservation (timed locks)
- Royalty pool balance updates
- Resale listing creation (prevent double-listing)

*Sources:*
- https://www.2ndquadrant.com/en/blog/postgresql-anti-patterns-read-modify-write-cycles/
- https://on-systems.tech/blog/128-preventing-read-committed-sql-concurrency-errors/
- https://blog.doyensec.com/2024/07/11/database-race-conditions.html

---

### 1.7 Data Consistency in Distributed Systems

With 23 microservices, TicketToken operates in a distributed environment. Key patterns:

**Saga Pattern for Cross-Service Transactions**

For ticket purchase spanning multiple services:
1. Payment Service: Reserve funds
2. Inventory Service: Reserve ticket
3. NFT Service: Mint token
4. Payment Service: Capture funds
5. Notification Service: Send confirmation

Each step has a compensating transaction if later steps fail.

**Outbox Pattern for Reliable Events**

```sql
-- In the same transaction as business logic
INSERT INTO outbox (event_type, payload, created_at)
VALUES ('ticket_purchased', $1, NOW());
```

A separate process polls outbox and publishes to message queue, ensuring exactly-once delivery.

**Idempotency Keys**

```sql
CREATE TABLE idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  response JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

Check before processing, store result after:
```typescript
const existing = await trx('idempotency_keys').where({ key }).first();
if (existing) return existing.response;
// Process request...
await trx('idempotency_keys').insert({ key, response: result });
```

**Multi-Tenant Data Isolation**

For TicketToken's white-label deployments:

```sql
-- Row Level Security
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tickets
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Always include tenant_id in:
- All table primary keys (composite key pattern)
- All foreign key relationships
- All queries (enforced by RLS)

*Sources:*
- https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/
- https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy
- https://docs.citusdata.com/en/v7.3/articles/designing_saas.html

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Missing Foreign Key Constraints

**The problem:** Application logic handles relationships, but nothing prevents invalid references at the database level.

**Symptoms:**
- Orphaned records (tickets referencing deleted events)
- Referential integrity errors during migrations
- Inconsistent data after service failures

**TicketToken risks:**
- Tickets without valid events
- Transactions without valid users
- Resale listings without original tickets
- Royalty splits without valid recipients

**Detection query:**
```sql
-- Find orphaned tickets
SELECT t.id FROM tickets t
LEFT JOIN events e ON t.event_id = e.id
WHERE e.id IS NULL;
```

---

### 2.2 Race Conditions in Read-Modify-Write Operations

**The problem:** Reading a value, modifying in application, writing back without locking.

**Classic example (WRONG):**
```typescript
const ticket = await knex('tickets').where({ id }).first();
if (ticket.quantity > 0) {
  await knex('tickets')
    .where({ id })
    .update({ quantity: ticket.quantity - 1 });
}
```

**Two concurrent requests can both see quantity=1, both decrement, result: quantity=-1**

**TicketToken risks:**
- Overselling tickets
- Double-spending loyalty points
- Incorrect royalty distributions
- Duplicate NFT minting

**Correct approach:**
```typescript
await knex.transaction(async (trx) => {
  const result = await trx('tickets')
    .where({ id, quantity: knex.raw('quantity > 0') })
    .update({ quantity: knex.raw('quantity - 1') });
  
  if (result === 0) {
    throw new Error('No tickets available');
  }
});
```

---

### 2.3 Improper Transaction Boundaries

**The problem:** Transactions that are too broad or too narrow.

**Too narrow (WRONG):**
```typescript
// Each operation is its own transaction
await knex('payments').insert(payment);
await knex('tickets').update({ owner_id: userId }).where({ id: ticketId });
// If second fails, payment is orphaned
```

**Too broad (WRONG):**
```typescript
await knex.transaction(async (trx) => {
  // ... many operations
  await externalApi.mintNFT(); // External call inside transaction
  // Transaction holds locks while waiting for external API
});
```

**TicketToken pattern:**
```typescript
// Database operations in transaction
const result = await knex.transaction(async (trx) => {
  await trx('tickets').update({ status: 'processing' }).where({ id: ticketId });
  await trx('payments').insert(payment);
  return { ticketId, paymentId: payment.id };
});

// External calls outside transaction
await nftService.mint(result.ticketId);
await knex('tickets').update({ status: 'minted' }).where({ id: result.ticketId });
```

---

### 2.4 N+1 Query Problems

**The problem:** ORM fetches related data in loops instead of batches.

**Example (WRONG):**
```typescript
const events = await knex('events').select('*');
for (const event of events) {
  event.venue = await knex('venues').where({ id: event.venue_id }).first();
  event.tickets = await knex('tickets').where({ event_id: event.id });
}
// 1 + N + N queries
```

**Correct approach:**
```typescript
const events = await knex('events')
  .leftJoin('venues', 'events.venue_id', 'venues.id')
  .select('events.*', 'venues.name as venue_name');

// Or batch load with IN clause
const venueIds = events.map(e => e.venue_id);
const venues = await knex('venues').whereIn('id', venueIds);
const venueMap = new Map(venues.map(v => [v.id, v]));
events.forEach(e => e.venue = venueMap.get(e.venue_id));
```

**Detection:** Enable query logging, look for repeated similar queries.

---

### 2.5 Orphaned Records

**The problem:** Parent deleted but children remain, or external references become stale.

**TicketToken scenarios:**
- Event deleted → tickets remain
- User deleted → transactions reference non-existent user
- Venue deleted → events have invalid venue_id

**Prevention:**
1. Foreign keys with appropriate ON DELETE action
2. Soft deletes instead of hard deletes
3. Periodic orphan detection jobs

**Orphan detection query:**
```sql
SELECT 'tickets' as table_name, COUNT(*) as orphans
FROM tickets t
LEFT JOIN events e ON t.event_id = e.id
WHERE e.id IS NULL
UNION ALL
SELECT 'resales', COUNT(*)
FROM resales r
LEFT JOIN tickets t ON r.ticket_id = t.id
WHERE t.id IS NULL;
```

---

### 2.6 Soft Delete Inconsistencies

**The problem:** Soft-deleted records still referenced by active records.

**Issues with soft deletes:**
- Foreign keys don't enforce soft-delete consistency
- Queries must always include `WHERE deleted_at IS NULL`
- Unique constraints need partial indexes
- Related records may not be soft-deleted together

**If using soft deletes:**

```sql
-- Partial unique index (only active records)
CREATE UNIQUE INDEX idx_tickets_serial_active 
ON tickets (serial_number) 
WHERE deleted_at IS NULL;

-- View for active records
CREATE VIEW active_tickets AS
SELECT * FROM tickets WHERE deleted_at IS NULL;
```

**Knex.js pattern:**
```typescript
// Base query builder that adds soft delete filter
const activeRecords = (table: string) => 
  knex(table).whereNull('deleted_at');

// Usage
const tickets = await activeRecords('tickets').where({ event_id });
```

**Alternative: Archive tables instead of soft delete**
```typescript
await knex.transaction(async (trx) => {
  const ticket = await trx('tickets').where({ id }).first();
  await trx('tickets_archive').insert({ ...ticket, deleted_at: new Date() });
  await trx('tickets').where({ id }).del();
});
```

---

### 2.7 Missing Unique Constraints

**The problem:** Application uniqueness checks have race conditions.

**WRONG:**
```typescript
const exists = await knex('users').where({ email }).first();
if (!exists) {
  await knex('users').insert({ email }); // Race condition!
}
```

**Two concurrent requests can both see `exists = false` and both insert.**

**CORRECT:**
```sql
CREATE UNIQUE INDEX idx_users_email ON users (email);
```

```typescript
try {
  await knex('users').insert({ email });
} catch (err) {
  if (err.code === '23505') { // Unique violation
    throw new DuplicateEmailError();
  }
  throw err;
}
```

**TicketToken unique constraints needed:**
- User email per tenant
- Ticket serial number
- Event slug per tenant
- Seat (event_id, section, row, seat_number) combination
- Idempotency keys

---

## 3. Audit Checklist

### 3.1 Migration Audit Checklist

For each migration file in your Knex migrations:

#### Schema Definition
- [ ] **Foreign keys defined for all relationships**
  - Check: Every `_id` column has corresponding REFERENCES
  - Check: ON DELETE action explicitly specified (not relying on default)
  
- [ ] **Appropriate ON DELETE actions**
  - RESTRICT for critical relationships (payments → users)
  - CASCADE for owned data (event → event_images)
  - SET NULL for optional relationships

- [ ] **Primary keys on all tables**
  - Check: Using UUID or SERIAL
  - Check: Composite keys where appropriate (tenant_id + id)

- [ ] **Unique constraints where needed**
  ```javascript
  // Check for patterns like:
  table.unique(['tenant_id', 'email']);
  table.unique(['event_id', 'section', 'row', 'seat']);
  ```

- [ ] **NOT NULL on required fields**
  - Check: Business-critical fields marked NOT NULL
  - Check: Foreign keys NOT NULL unless optional relationship

- [ ] **CHECK constraints for valid ranges**
  ```javascript
  // Look for:
  table.check('price > 0');
  table.check('quantity >= 0');
  table.check("status IN ('active', 'cancelled')");
  ```

- [ ] **Indexes on frequently queried columns**
  - Foreign key columns (implicit in some DBs, not PostgreSQL)
  - Status columns used in WHERE clauses
  - Timestamp columns used for sorting

#### Multi-Tenant Specific
- [ ] **tenant_id column on all tenant-scoped tables**
- [ ] **tenant_id included in all unique constraints**
- [ ] **tenant_id indexed (usually part of composite index)**
- [ ] **Row Level Security policies defined**

#### Soft Delete Handling
- [ ] **If using soft deletes, partial unique indexes exist**
  ```javascript
  knex.raw(`
    CREATE UNIQUE INDEX idx_users_email_active 
    ON users (tenant_id, email) 
    WHERE deleted_at IS NULL
  `);
  ```

---

### 3.2 Repository/Model Layer Checklist

For each repository or data access file:

#### Transaction Usage
- [ ] **Multi-step operations wrapped in transactions**
  ```typescript
  // CORRECT
  await knex.transaction(async (trx) => {
    await trx('payments').insert(payment);
    await trx('tickets').update({ owner_id: userId });
  });
  ```

- [ ] **Transaction passed through to all operations**
  ```typescript
  // Check that trx is used, not knex
  async function createOrder(data: OrderData, trx: Knex.Transaction) {
    await trx('orders').insert(data); // ✓
    await knex('order_items').insert(items); // ✗ BUG!
  }
  ```

- [ ] **Proper error handling with rollback**
  ```typescript
  // Errors should propagate, causing automatic rollback
  await knex.transaction(async (trx) => {
    await trx('table').insert(data);
    throw new Error('Something failed'); // Transaction rolled back
  });
  ```

- [ ] **No external API calls inside transactions**
  ```typescript
  // WRONG - holds transaction open during API call
  await knex.transaction(async (trx) => {
    await trx('tickets').update(data);
    await stripeApi.charge(); // BAD!
  });
  ```

#### Locking
- [ ] **FOR UPDATE used for critical read-modify-write**
  ```typescript
  await trx('tickets')
    .where({ id: ticketId })
    .forUpdate()
    .first();
  ```

- [ ] **FOR UPDATE SKIP LOCKED for queue-like operations**
  ```typescript
  // Get next available ticket without blocking
  const ticket = await trx('tickets')
    .where({ status: 'available' })
    .forUpdate()
    .skipLocked()
    .first();
  ```

#### Query Patterns
- [ ] **Atomic updates instead of read-modify-write**
  ```typescript
  // CORRECT
  await knex('inventory')
    .where('event_id', eventId)
    .andWhere('available', '>', 0)
    .decrement('available', 1);
  
  // WRONG
  const inv = await knex('inventory').where('event_id', eventId).first();
  await knex('inventory').update({ available: inv.available - 1 });
  ```

- [ ] **Batch operations instead of loops**
  ```typescript
  // CORRECT
  await knex('tickets').whereIn('id', ticketIds).update({ status: 'sold' });
  
  // WRONG
  for (const id of ticketIds) {
    await knex('tickets').where({ id }).update({ status: 'sold' });
  }
  ```

- [ ] **Joins or batch loading for related data**
  ```typescript
  // Check for N+1 patterns:
  const events = await knex('events');
  for (const e of events) {
    e.venue = await knex('venues').where('id', e.venue_id); // N+1!
  }
  ```

#### Multi-Tenant
- [ ] **tenant_id included in all queries**
  ```typescript
  // Every query should filter by tenant
  await knex('tickets')
    .where({ tenant_id: ctx.tenantId, event_id: eventId });
  ```

- [ ] **RLS context set at request start**
  ```typescript
  // In middleware
  await knex.raw(`SET app.current_tenant_id = '${tenantId}'`);
  ```

---

### 3.3 Race Condition Checklist

For critical operations:

#### Ticket Purchase Flow
- [ ] Check inventory availability with lock
- [ ] Decrement inventory atomically
- [ ] Create ticket record in same transaction
- [ ] Handle serialization failures with retry
- [ ] Idempotency key to prevent double-purchase

```typescript
// Audit pattern:
async function purchaseTicket(eventId: string, userId: string, idempotencyKey: string) {
  // Check idempotency first
  const existing = await knex('idempotency_keys').where({ key: idempotencyKey }).first();
  if (existing) return existing.response;
  
  return knex.transaction({ isolationLevel: 'serializable' }, async (trx) => {
    // Lock inventory row
    const inventory = await trx('inventory')
      .where({ event_id: eventId })
      .forUpdate()
      .first();
    
    if (inventory.available < 1) {
      throw new SoldOutError();
    }
    
    // Atomic decrement
    await trx('inventory')
      .where({ event_id: eventId })
      .decrement('available', 1);
    
    // Create ticket
    const [ticket] = await trx('tickets')
      .insert({ event_id: eventId, owner_id: userId })
      .returning('*');
    
    // Store idempotency result
    await trx('idempotency_keys').insert({ 
      key: idempotencyKey, 
      response: { ticketId: ticket.id } 
    });
    
    return ticket;
  });
}
```

#### Resale Flow
- [ ] Lock original ticket before creating listing
- [ ] Verify ownership inside transaction
- [ ] Prevent double-listing (unique constraint on active listings)
- [ ] Calculate royalties with locked ticket price data

#### User Balance Operations
- [ ] Lock user row before balance check
- [ ] Atomic balance update
- [ ] Transaction log entry in same transaction

---

### 3.4 Specific Queries to Run

Run these queries to audit your current database state:

```sql
-- 1. Find tables without primary keys
SELECT table_name 
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
AND NOT EXISTS (
  SELECT 1 FROM information_schema.table_constraints tc
  WHERE tc.table_name = t.table_name
  AND tc.constraint_type = 'PRIMARY KEY'
);

-- 2. Find foreign key columns without indexes
SELECT
  tc.table_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND NOT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE tablename = tc.table_name
  AND indexdef LIKE '%' || kcu.column_name || '%'
);

-- 3. Find orphaned records (template)
SELECT 'tickets without events' as issue, COUNT(*) as count
FROM tickets t LEFT JOIN events e ON t.event_id = e.id
WHERE e.id IS NULL
UNION ALL
SELECT 'resales without tickets', COUNT(*)
FROM resales r LEFT JOIN tickets t ON r.ticket_id = t.id
WHERE t.id IS NULL
UNION ALL
SELECT 'payments without users', COUNT(*)
FROM payments p LEFT JOIN users u ON p.user_id = u.id
WHERE u.id IS NULL;

-- 4. Find tables missing tenant_id (multi-tenant)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
AND table_name NOT IN ('migrations', 'knex_migrations', 'knex_migrations_lock')
AND NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE columns.table_name = tables.table_name
  AND column_name = 'tenant_id'
);

-- 5. Check for tables without RLS enabled
SELECT relname
FROM pg_class
WHERE relkind = 'r'
AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND NOT relrowsecurity;

-- 6. Find duplicate records that should be unique
-- Example: duplicate active tickets per event/seat
SELECT event_id, section, row, seat_number, COUNT(*)
FROM tickets
WHERE deleted_at IS NULL
GROUP BY event_id, section, row, seat_number
HAVING COUNT(*) > 1;

-- 7. Check constraint definitions
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type;
```

---

### 3.5 Knex.js Specific Checks

#### knexfile.js / Configuration
- [ ] **Connection pool appropriately sized**
  ```javascript
  pool: {
    min: 2,
    max: 10, // Adjust based on service count
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000
  }
  ```

- [ ] **Statement timeout configured**
  ```javascript
  pool: {
    afterCreate: (conn, done) => {
      conn.query('SET statement_timeout = 30000', done);
    }
  }
  ```

#### Migration Patterns
- [ ] **Down migrations implemented and tested**
- [ ] **Migrations are idempotent where possible**
- [ ] **Large data migrations use batching**
  ```javascript
  // For large updates
  const batchSize = 1000;
  let affected;
  do {
    affected = await knex.raw(`
      UPDATE tickets SET new_column = computed_value
      WHERE id IN (
        SELECT id FROM tickets 
        WHERE new_column IS NULL 
        LIMIT ${batchSize}
      )
    `);
  } while (affected.rowCount > 0);
  ```

#### Query Builder Usage
- [ ] **Using .transacting(trx) when transaction exists**
- [ ] **Not mixing trx and knex in same operation**
- [ ] **Proper error codes handled (23505 unique, 23503 FK, 40001 serialization)**

---

## Summary: Critical Items for TicketToken

Given your ticketing platform specifics:

### Must Have (P0)
1. Foreign keys on all ticket → event, transaction → user relationships
2. Pessimistic locking (FOR UPDATE) on ticket purchase flow
3. Unique constraint on (event_id, section, row, seat) for reserved seating
4. tenant_id on all tables with RLS policies
5. Idempotency keys for payment/minting operations
6. Serializable isolation for balance/royalty operations

### Should Have (P1)
1. CHECK constraints on prices, quantities, percentages
2. Indexes on all foreign key columns
3. Atomic updates for inventory management
4. Proper transaction boundaries (no external calls inside)
5. N+1 query detection in development

### Nice to Have (P2)
1. Optimistic locking (version columns) for user-facing edits
2. Audit tables for all financial operations
3. Archive tables instead of soft deletes
4. Automated orphan detection jobs

---

## Sources

1. PostgreSQL Official Documentation - Transaction Isolation: https://www.postgresql.org/docs/current/transaction-iso.html
2. PostgreSQL Official Documentation - Explicit Locking: https://www.postgresql.org/docs/current/explicit-locking.html
3. PostgreSQL Official Documentation - Constraints: https://www.postgresql.org/docs/current/ddl-constraints.html
4. Knex.js Transactions: https://knexjs.org/guide/transactions.html
5. AWS Database Blog - Multi-tenant Data Isolation: https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/
6. Crunchy Data - Designing Postgres for Multi-tenancy: https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy
7. 2ndQuadrant - PostgreSQL Read-Modify-Write Anti-patterns: https://www.2ndquadrant.com/en/blog/postgresql-anti-patterns-read-modify-write-cycles/
8. Vlad Mihalcea - Optimistic vs Pessimistic Locking: https://vladmihalcea.com/optimistic-vs-pessimistic-locking/
9. Brandur - Soft Deletion Problems: https://brandur.org/soft-deletion
10. The Nile - Transaction Isolation in Postgres: https://www.thenile.dev/blog/transaction-isolation-postgres
11. Doyensec - Database Race Conditions: https://blog.doyensec.com/2024/07/11/database-race-conditions.html
12. Sentry - N+1 Queries Documentation: https://docs.sentry.io/product/issues/issue-details/performance-issues/n-one-queries/