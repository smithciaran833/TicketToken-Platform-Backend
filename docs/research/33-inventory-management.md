# Ticket Inventory Management
## Production Audit Guide for TicketToken

**Version:** 1.0  
**Date:** December 2025  
**Purpose:** Ensure accurate, reliable ticket inventory management preventing overselling and race conditions in high-demand scenarios

---

## Table of Contents
1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Implementation Patterns](#4-implementation-patterns)
5. [Sources](#5-sources)

---

## 1. Standards & Best Practices

### 1.1 Preventing Overselling

Overselling occurs when more tickets are sold than physically exist—a critical failure for any ticketing platform. Prevention requires multiple layers of defense.

**Source:** https://dzone.com/articles/distributed-locking-and-race-condition-prevention

#### The Overselling Problem

When two users attempt to purchase the last ticket simultaneously without proper synchronization:

1. User A checks inventory → 1 ticket available
2. User B checks inventory → 1 ticket available
3. User A proceeds to purchase → success
4. User B proceeds to purchase → success (OVERSOLD!)

> "If two users try to purchase the last item in stock simultaneously, without proper synchronization, both transactions might proceed, resulting in overselling."

**Source:** https://dzone.com/articles/distributed-locking-and-race-condition-prevention

#### Multi-Layer Defense Strategy

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **1. Database Constraints** | CHECK constraint: `quantity >= 0` | Hard floor, last line of defense |
| **2. Atomic Operations** | `UPDATE SET quantity = quantity - 1 WHERE quantity >= 1` | Single-statement atomicity |
| **3. Row-Level Locking** | `SELECT FOR UPDATE` | Serialize concurrent access |
| **4. Application Locks** | Redis distributed locks | Cross-service coordination |
| **5. Virtual Queue** | Waiting room system | Traffic shaping, bot prevention |

**Source:** https://www.zigpoll.com/content/can-you-explain-how-the-backend-ensures-realtime-inventory-updates-across-our-website-and-app-as-orders-are-placed-during-high-traffic-periods

#### Database CHECK Constraint (PostgreSQL)

```sql
-- Last line of defense: database-level constraint
ALTER TABLE tickets 
ADD CONSTRAINT check_quantity_non_negative 
CHECK (quantity >= 0);

-- Constraint prevents this from ever succeeding:
UPDATE tickets SET quantity = quantity - 1 WHERE quantity = 0;
-- ERROR: new row for relation "tickets" violates check constraint
```

**Source:** https://learn.microsoft.com/en-us/sql/relational-databases/tables/unique-constraints-and-check-constraints

#### Atomic Decrement Pattern

```sql
-- SAFE: Atomic check-and-decrement in single statement
UPDATE ticket_inventory 
SET quantity = quantity - 1,
    updated_at = NOW()
WHERE event_id = $1 
  AND ticket_type_id = $2
  AND quantity >= 1
RETURNING quantity;

-- Check rows affected: 0 = no inventory, 1 = success
```

> "The 'safety' of a relative update query comes from performing the check and update in a single atomic operation."

**Source:** https://blog.pjam.me/posts/atomic-operations-in-sql/

### 1.2 Inventory Reservation Patterns

The reservation pattern provides a time-bounded hold on inventory, allowing users time to complete checkout without permanently blocking tickets.

**Source:** https://codeopinion.com/avoiding-distributed-transactions-with-the-reservation-pattern/

#### Three-State Ticket Model

```
┌─────────────┐     User selects     ┌─────────────┐     Payment      ┌─────────────┐
│  AVAILABLE  │ ──────────────────▶  │  RESERVED   │ ──────────────▶  │   BOOKED    │
└─────────────┘                      └─────────────┘                  └─────────────┘
       ▲                                    │
       │                                    │ Timeout expires
       │                                    │ or user abandons
       └────────────────────────────────────┘
```

> "A better solution is to lock the ticket by adding a status field and expiration time on the ticket table. The ticket can then be in 1 of 3 states: available, reserved, booked."

**Source:** https://www.hellointerview.com/learn/system-design/problem-breakdowns/ticketmaster

#### Reservation Schema

```sql
CREATE TABLE ticket_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id),
    user_id UUID NOT NULL REFERENCES users(id),
    session_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'reserved',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    
    CONSTRAINT check_status CHECK (status IN ('reserved', 'completed', 'expired', 'cancelled')),
    CONSTRAINT unique_active_reservation UNIQUE (ticket_id, status) 
        WHERE status = 'reserved'
);

CREATE INDEX idx_reservations_expires ON ticket_reservations(expires_at) 
    WHERE status = 'reserved';
CREATE INDEX idx_reservations_ticket ON ticket_reservations(ticket_id);
```

#### Reservation Pattern Implementation

The reservation pattern has three key aspects: **Reserve**, **Confirm**, and **Expire**.

**Source:** https://codeopinion.com/avoiding-distributed-transactions-with-the-reservation-pattern/

```javascript
class TicketReservationService {
  // RESERVE: Create time-bounded hold
  async reserveTicket(ticketId, userId, sessionId) {
    const expiresAt = new Date(Date.now() + RESERVATION_TIMEOUT_MS);
    
    return await db.transaction(async (trx) => {
      // Check ticket is available (with lock)
      const ticket = await trx('tickets')
        .where({ id: ticketId, status: 'available' })
        .forUpdate()
        .first();
      
      if (!ticket) {
        throw new Error('Ticket not available');
      }
      
      // Update ticket status
      await trx('tickets')
        .where({ id: ticketId })
        .update({ status: 'reserved', updated_at: new Date() });
      
      // Create reservation record
      const [reservation] = await trx('ticket_reservations')
        .insert({
          ticket_id: ticketId,
          user_id: userId,
          session_id: sessionId,
          status: 'reserved',
          expires_at: expiresAt
        })
        .returning('*');
      
      return reservation;
    });
  }
  
  // CONFIRM: Complete the purchase
  async confirmReservation(reservationId, userId) {
    return await db.transaction(async (trx) => {
      const reservation = await trx('ticket_reservations')
        .where({ id: reservationId, user_id: userId, status: 'reserved' })
        .forUpdate()
        .first();
      
      if (!reservation) {
        throw new Error('Reservation not found or expired');
      }
      
      // Check not expired
      if (new Date() > reservation.expires_at) {
        throw new Error('Reservation has expired');
      }
      
      // Update reservation
      await trx('ticket_reservations')
        .where({ id: reservationId })
        .update({ status: 'completed', completed_at: new Date() });
      
      // Update ticket
      await trx('tickets')
        .where({ id: reservation.ticket_id })
        .update({ status: 'sold', owner_id: userId });
      
      return { success: true };
    });
  }
  
  // EXPIRE: Release abandoned reservations
  async releaseExpiredReservations() {
    const now = new Date();
    
    return await db.transaction(async (trx) => {
      // Find expired reservations
      const expired = await trx('ticket_reservations')
        .where('status', 'reserved')
        .where('expires_at', '<', now)
        .select('id', 'ticket_id');
      
      if (expired.length === 0) return { released: 0 };
      
      const ticketIds = expired.map(r => r.ticket_id);
      const reservationIds = expired.map(r => r.id);
      
      // Release tickets back to available
      await trx('tickets')
        .whereIn('id', ticketIds)
        .update({ status: 'available', updated_at: now });
      
      // Mark reservations as expired
      await trx('ticket_reservations')
        .whereIn('id', reservationIds)
        .update({ status: 'expired' });
      
      return { released: expired.length };
    });
  }
}
```

### 1.3 Hold Timeouts

Hold timeout duration is a critical business decision balancing user experience against inventory lock-up.

**Source:** https://help.tickettailor.com/en/articles/6382935-can-i-pick-my-basket-hold-time

#### Industry Standards for Hold Times

| Platform/Context | Hold Duration | Notes |
|------------------|---------------|-------|
| **Ticketmaster** | 10-15 minutes | High-demand events |
| **Airline Booking** | 15-30 minutes | Complex multi-leg bookings |
| **GetYourGuide** | 1 hour | OTA reservations |
| **Expedia** | 30 minutes | Configurable per partner |
| **Ticket Tailor (Aggressive)** | 8 minutes total | 2 min selection + 4 min details + 2 min payment |
| **Ticket Tailor (Relaxed)** | 7-30 minutes | Lower-demand events |

**Sources:** 
- https://help.tickettailor.com/en/articles/6382935-can-i-pick-my-basket-hold-time
- https://bokun.dev/implementing-inventory-service-plugin/rGmzgGe66zjtEQ8FUvS8dd/step-6-reservation-and-booking/mskv6FZYULNxTHGwwxp4qs

#### Dynamic Timeout Strategy

```javascript
function calculateHoldTimeout(event, demandLevel) {
  const baseTimeout = {
    low: 30 * 60 * 1000,      // 30 minutes
    medium: 15 * 60 * 1000,   // 15 minutes
    high: 10 * 60 * 1000,     // 10 minutes
    extreme: 5 * 60 * 1000    // 5 minutes (flash sales)
  };
  
  // Adjust based on remaining inventory
  const inventoryRatio = event.remainingTickets / event.totalTickets;
  let timeout = baseTimeout[demandLevel];
  
  if (inventoryRatio < 0.1) {
    // Last 10% of tickets: reduce timeout by 50%
    timeout = timeout * 0.5;
  } else if (inventoryRatio < 0.25) {
    // Last 25%: reduce by 25%
    timeout = timeout * 0.75;
  }
  
  // Minimum 3 minutes for UX
  return Math.max(timeout, 3 * 60 * 1000);
}
```

### 1.4 Distributed Locking

For distributed systems where multiple service instances handle inventory, Redis-based distributed locks provide coordination.

**Source:** https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/

#### Redis Distributed Lock Properties

> "Safety property: Mutual exclusion. At any given moment, only one client can hold a lock. Liveness property A: Deadlock free. Eventually it is always possible to acquire a lock, even if the client that locked the resource crashes. Liveness property B: Fault tolerance. As long as the majority of Redis nodes are up, clients are able to acquire and release locks."

**Source:** https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/

#### Simple Redis Lock (Single Instance)

```javascript
const Redis = require('ioredis');
const redis = new Redis();

class DistributedLock {
  constructor(lockKey, ttlMs = 10000) {
    this.lockKey = `lock:${lockKey}`;
    this.ttlMs = ttlMs;
    this.lockValue = null;
  }
  
  async acquire() {
    // Generate unique value to identify this lock holder
    this.lockValue = `${process.pid}:${Date.now()}:${Math.random()}`;
    
    // SET key value NX PX milliseconds
    const result = await redis.set(
      this.lockKey,
      this.lockValue,
      'PX', this.ttlMs,
      'NX'
    );
    
    return result === 'OK';
  }
  
  async release() {
    // Only release if we own the lock (Lua script for atomicity)
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    return await redis.eval(script, 1, this.lockKey, this.lockValue);
  }
  
  async extend(additionalMs) {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    
    return await redis.eval(script, 1, this.lockKey, this.lockValue, additionalMs);
  }
}
```

**Source:** https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/

#### Lock Best Practices

> "Avoid long-held locks: Minimize the duration for which a lock is held to reduce contention and improve system performance. Use timeouts and leases: Implement timeouts and leases to ensure that locks are released even if the process holding the lock fails. Monitor and handle failures: Monitor the lock status and handle failures gracefully to avoid deadlocks and ensure system resilience."

**Source:** https://dzone.com/articles/distributed-locking-and-race-condition-prevention

#### When to Use Which Lock Type

| Scenario | Recommended Lock | Rationale |
|----------|-----------------|-----------|
| Single database | Database row lock (`SELECT FOR UPDATE`) | Simpler, no external dependency |
| Multiple databases/services | Redis distributed lock | Cross-service coordination |
| High-contention hot tickets | Redisson with fair queuing | Prevents starvation |
| Critical financial operations | Database + Redis (belt and suspenders) | Defense in depth |

**Source:** https://programmer.help/blogs/redis-or-zookeeper-for-distributed-locks.html

### 1.5 High-Concurrency Inventory Operations

High-demand ticket sales can see thousands of concurrent purchase attempts. Special patterns are needed.

**Source:** https://blog.ticketmaster.com/how-ticketmaster-queue-works/

#### Virtual Waiting Room / Queue System

Ticketmaster and similar platforms use virtual waiting rooms to manage extreme demand:

> "Our Smart Queue virtual waiting room and line powers all high-demand sales and is the most effective way to maximize sales and revenue. Smart Queue keeps bots out, prioritizing fans for tickets."

**Source:** https://business.ticketmaster.com/smart-queue/

**How it works:**
1. Waiting room opens 15-30 minutes before sale
2. Users join waiting room (not a purchase queue yet)
3. When sale starts, users are randomly assigned queue positions
4. Users are admitted to purchase page at controlled rate
5. Rate limiting prevents checkout errors and maximizes sell-through

**Source:** https://queue-it.com/blog/virtual-waiting-room/

#### Optimistic vs Pessimistic Locking for Tickets

**Pessimistic Locking (Recommended for High-Value Tickets)**

```sql
BEGIN;
-- Lock the specific ticket row
SELECT * FROM tickets 
WHERE id = $1 AND status = 'available'
FOR UPDATE NOWAIT;  -- Fail immediately if locked

-- If we get here, we have exclusive access
UPDATE tickets SET status = 'reserved', reserved_by = $2, reserved_at = NOW()
WHERE id = $1;
COMMIT;
```

> "Pessimistic locking is suitable when the cost of retrying a transaction is very high or when contention is so large that many transactions would end up rolling back if optimistic locking were used."

**Source:** https://vladmihalcea.com/optimistic-vs-pessimistic-locking/

**Optimistic Locking (For Lower Contention)**

```sql
-- Read with version
SELECT id, status, version FROM tickets WHERE id = $1;

-- Update only if version unchanged
UPDATE tickets 
SET status = 'reserved', 
    reserved_by = $2, 
    version = version + 1
WHERE id = $1 
  AND version = $original_version
  AND status = 'available';

-- Check rows affected: 0 = conflict, 1 = success
```

**Source:** https://leapcell.io/blog/implementing-concurrent-control-with-orm-a-deep-dive-into-pessimistic-and-optimistic-locking

#### Concurrency Pattern Comparison

| Pattern | Pros | Cons | Best For |
|---------|------|------|----------|
| **Pessimistic (FOR UPDATE)** | Guarantees success if acquired | Lock contention, potential deadlocks | High-value single tickets |
| **Optimistic (Version)** | No blocking, high throughput | Retry storms under contention | General admission batches |
| **Redis Lock + DB** | Distributed coordination | Additional infrastructure | Multi-service architectures |
| **Queue-based** | Eliminates contention entirely | Added latency | Extreme high-demand sales |

**Source:** https://learning-notes.mistermicheels.com/data/sql/optimistic-pessimistic-locking-sql/

### 1.6 Release of Abandoned Reservations

Tickets held in abandoned carts must be released back to inventory. Multiple mechanisms ensure no tickets are permanently lost.

**Source:** https://github.com/magento/devdocs/blob/master/src/guides/v2.3/inventory/reservations.md

#### Cleanup Mechanisms

**1. Scheduled Cron Job (Primary)**

> "The inventory_cleanup_reservations cron job executes SQL queries to clear the reservation database table. By default, it runs daily at midnight, but you can configure the times and frequency."

**Source:** https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/basics/selection-reservations

```javascript
// Cron job: Run every 30 seconds for near-real-time cleanup
const cron = require('node-cron');

cron.schedule('*/30 * * * * *', async () => {
  try {
    const result = await reservationService.releaseExpiredReservations();
    if (result.released > 0) {
      logger.info(`Released ${result.released} expired reservations`);
      metrics.increment('reservations.expired.released', result.released);
    }
  } catch (error) {
    logger.error('Failed to release expired reservations', error);
    alertOpsTeam('Reservation cleanup failed', error);
  }
});
```

**2. Event-Driven Cleanup**

> "Instead of passively listening for messages it might miss, this worker proactively asks the database a simple question every 30 seconds: 'Are there any reservations that should have expired?'"

**Source:** https://dev.to/thebigwealth89/from-race-conditions-to-resilience-building-a-bulletproof-reservation-system-hai

**3. Lazy Evaluation (Query-Time Check)**

Rather than relying solely on cron jobs, check expiration at query time:

```sql
-- Tickets available = explicitly available OR reserved but expired
SELECT * FROM tickets 
WHERE event_id = $1
AND (
  status = 'available'
  OR (status = 'reserved' AND reserved_until < NOW())
);
```

> "We can recognize the status of any given ticket is the combination of two attributes: whether it's available OR whether it's been reserved but the reservation has expired."

**Source:** https://www.hellointerview.com/learn/system-design/problem-breakdowns/ticketmaster

**4. Cleanup Worker with State Machine**

```javascript
class ReservationCleanupWorker {
  async processExpiredReservations() {
    const batchSize = 100;
    
    while (true) {
      const expired = await db('ticket_reservations')
        .where('status', 'reserved')
        .where('expires_at', '<', new Date())
        .limit(batchSize)
        .select('id', 'ticket_id');
      
      if (expired.length === 0) break;
      
      for (const reservation of expired) {
        await this.releaseReservation(reservation);
      }
      
      // Small delay between batches to prevent DB pressure
      await sleep(100);
    }
  }
  
  async releaseReservation(reservation) {
    await db.transaction(async (trx) => {
      // Mark reservation expired
      await trx('ticket_reservations')
        .where('id', reservation.id)
        .where('status', 'reserved') // Double-check status
        .update({ status: 'expired' });
      
      // Release ticket (only if still in reserved state)
      const updated = await trx('tickets')
        .where('id', reservation.ticket_id)
        .where('status', 'reserved')
        .update({ 
          status: 'available',
          reserved_by: null,
          reserved_until: null 
        });
      
      if (updated > 0) {
        // Publish event for real-time inventory updates
        await publishEvent('ticket.released', {
          ticketId: reservation.ticket_id,
          reason: 'reservation_expired'
        });
      }
    });
  }
}
```

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Race Conditions Causing Overselling

The most critical vulnerability in ticket inventory systems.

**Source:** https://dzone.com/articles/distributed-locking-and-race-condition-prevention

#### Classic Check-Then-Act Race Condition

```javascript
// ❌ WRONG: Race condition between check and update
async function purchaseTicket(ticketId, userId) {
  // Step 1: Check availability
  const ticket = await db('tickets').where({ id: ticketId }).first();
  
  if (ticket.status !== 'available') {
    throw new Error('Ticket not available');
  }
  
  // GAP: Another request can check the same ticket here!
  
  // Step 2: Update ticket
  await db('tickets')
    .where({ id: ticketId })
    .update({ status: 'sold', owner_id: userId });
  
  return { success: true };
}
```

**Why it fails:** The check (Step 1) and update (Step 2) are not atomic. Multiple requests can pass the check before any update occurs.

#### Correct Atomic Pattern

```javascript
// ✅ CORRECT: Atomic check-and-update
async function purchaseTicket(ticketId, userId) {
  const result = await db('tickets')
    .where({ id: ticketId, status: 'available' })
    .update({ 
      status: 'sold', 
      owner_id: userId,
      sold_at: new Date()
    });
  
  if (result === 0) {
    throw new Error('Ticket not available');
  }
  
  return { success: true };
}
```

### 2.2 Reservations Never Released

Reservations that are never cleaned up permanently reduce available inventory—a silent but severe bug.

**Source:** https://github.com/magento/inventory/issues/2311

#### Common Causes

| Cause | Scenario | Prevention |
|-------|----------|------------|
| **Missing cleanup job** | No cron configured | Always configure cleanup on deployment |
| **Crashed checkout** | User's session dies mid-purchase | Reservation has expiry; cleanup job handles |
| **Payment timeout** | Payment gateway never responds | Set max payment wait; expire reservation |
| **Bug in completion flow** | Reservation not marked completed | Comprehensive testing; audit trail |
| **Database transaction rollback** | Ticket marked sold but reservation not completed | Use single transaction for both |

#### Detection Query

```sql
-- Find reservations that should have been released
SELECT 
  tr.id,
  tr.ticket_id,
  tr.user_id,
  tr.status,
  tr.expires_at,
  NOW() - tr.expires_at AS overdue_by,
  t.status AS ticket_status
FROM ticket_reservations tr
JOIN tickets t ON tr.ticket_id = t.id
WHERE tr.status = 'reserved'
  AND tr.expires_at < NOW() - INTERVAL '1 hour'
ORDER BY tr.expires_at;

-- Alert if any results: reservations stuck for >1 hour past expiry
```

#### Orphaned Reservation Cleanup

```sql
-- Find orphaned reservations (reservation exists but ticket is already sold)
SELECT tr.* 
FROM ticket_reservations tr
JOIN tickets t ON tr.ticket_id = t.id
WHERE tr.status = 'reserved'
  AND t.status = 'sold'
  AND t.owner_id != tr.user_id;

-- These indicate a bug: ticket sold to someone else while reserved
-- Fix: Mark reservation as 'cancelled' and investigate
```

### 2.3 No Timeout on Holds

Infinite or excessively long holds can lock up significant inventory.

**Source:** https://www.hellointerview.com/learn/system-design/problem-breakdowns/ticketmaster

#### Impact of No Timeout

```
Event: 10,000 tickets
Abandoned carts: 2,000 tickets held indefinitely
Actual sellable: 8,000 tickets

Result: 20% of inventory locked up forever
```

#### Timeout Enforcement

```sql
-- Table constraint: reservations MUST have expires_at
ALTER TABLE ticket_reservations 
ADD CONSTRAINT check_expires_at_required 
CHECK (expires_at IS NOT NULL);

-- Application-level: maximum timeout
ALTER TABLE ticket_reservations
ADD CONSTRAINT check_max_timeout
CHECK (expires_at <= created_at + INTERVAL '30 minutes');
```

### 2.4 Lock Contention Under Load

Excessive locking can create bottlenecks and even deadlocks.

**Source:** https://learning-notes.mistermicheels.com/data/sql/optimistic-pessimistic-locking-sql/

#### Symptoms of Lock Contention

- Database connection pool exhaustion
- Increasing query latency during high traffic
- Transaction timeout errors
- Deadlock exceptions

#### Deadlock Example

```
Transaction A: Lock ticket 1, then try to lock ticket 2
Transaction B: Lock ticket 2, then try to lock ticket 1

Result: DEADLOCK - both transactions wait forever
```

> "One way to prevent this is to use a deterministic ordering when multiple rows are updated in the transactions."

**Source:** https://blog.pjam.me/posts/atomic-operations-in-sql/

#### Prevention Strategies

```javascript
// ✅ CORRECT: Lock in deterministic order
async function purchaseMultipleTickets(ticketIds, userId) {
  // Always sort ticket IDs to ensure consistent lock order
  const sortedIds = [...ticketIds].sort();
  
  return await db.transaction(async (trx) => {
    // Lock in sorted order
    const tickets = await trx('tickets')
      .whereIn('id', sortedIds)
      .where('status', 'available')
      .orderBy('id')  // Ensure order matches WHERE IN
      .forUpdate();
    
    if (tickets.length !== sortedIds.length) {
      throw new Error('Some tickets not available');
    }
    
    // Update all tickets
    await trx('tickets')
      .whereIn('id', sortedIds)
      .update({ status: 'sold', owner_id: userId });
    
    return { success: true };
  });
}
```

#### Lock Timeout Configuration

```sql
-- PostgreSQL: Set lock timeout to fail fast
SET lock_timeout = '5s';

-- In application: Fail fast, let user retry
BEGIN;
SET LOCAL lock_timeout = '3s';
SELECT * FROM tickets WHERE id = $1 FOR UPDATE;
-- If lock not acquired in 3s, transaction fails
COMMIT;
```

### 2.5 Inventory Count Drift

Over time, the recorded inventory count can drift from actual availability due to edge cases and bugs.

**Source:** https://www.prediko.io/blog/inventory-discrepancy

#### Causes of Inventory Drift

| Cause | Example | Detection |
|-------|---------|-----------|
| **Partial refunds** | Refund issued but ticket not released | Compare refund count vs available ticket increase |
| **Manual adjustments** | Support adds tickets without audit trail | Audit log gaps |
| **Sync failures** | Blockchain ownership doesn't match DB | Cross-system reconciliation |
| **Double-counting** | Ticket counted in multiple categories | Sum of parts != total |
| **Unprocessed events** | Webhook missed or failed | Event replay and comparison |

**Source:** https://www.extensiv.com/blog/inventory-discrepancy

#### Reconciliation Queries

```sql
-- Check 1: Sum of ticket statuses should equal total tickets
SELECT 
  event_id,
  COUNT(*) FILTER (WHERE status = 'available') AS available,
  COUNT(*) FILTER (WHERE status = 'reserved') AS reserved,
  COUNT(*) FILTER (WHERE status = 'sold') AS sold,
  COUNT(*) AS total,
  e.total_tickets AS expected_total
FROM tickets t
JOIN events e ON t.event_id = e.id
GROUP BY event_id, e.total_tickets
HAVING COUNT(*) != e.total_tickets;

-- Check 2: Reserved tickets should have valid, non-expired reservations
SELECT t.* 
FROM tickets t
LEFT JOIN ticket_reservations tr 
  ON t.id = tr.ticket_id AND tr.status = 'reserved'
WHERE t.status = 'reserved'
  AND (tr.id IS NULL OR tr.expires_at < NOW());

-- Check 3: Sold tickets should have owner
SELECT * FROM tickets
WHERE status = 'sold' AND owner_id IS NULL;
```

#### Drift Alert Threshold

```javascript
async function checkInventoryDrift() {
  const events = await db('events')
    .select('id', 'name', 'total_tickets');
  
  for (const event of events) {
    const counts = await db('tickets')
      .where('event_id', event.id)
      .select(
        db.raw('COUNT(*) as total'),
        db.raw("COUNT(*) FILTER (WHERE status = 'available') as available"),
        db.raw("COUNT(*) FILTER (WHERE status = 'reserved') as reserved"),
        db.raw("COUNT(*) FILTER (WHERE status = 'sold') as sold")
      )
      .first();
    
    const drift = event.total_tickets - counts.total;
    
    if (drift !== 0) {
      await alertOpsTeam('Inventory Drift Detected', {
        eventId: event.id,
        eventName: event.name,
        expected: event.total_tickets,
        actual: counts.total,
        drift: drift,
        breakdown: counts
      });
    }
    
    // Also check for impossible states
    if (counts.available + counts.reserved + counts.sold !== counts.total) {
      await alertOpsTeam('Inventory State Inconsistency', {
        eventId: event.id,
        counts: counts,
        message: 'Sum of statuses does not equal total'
      });
    }
  }
}
```

---

## 3. Audit Checklist

### 3.1 Locking Mechanism Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Primary locking mechanism documented | | |
| □ Database row-level locking used (`SELECT FOR UPDATE`) | | |
| □ Distributed locks used for cross-service operations | | |
| □ Lock timeout configured (not infinite) | | |
| □ Lock acquisition has retry with backoff | | |
| □ Locks acquired in deterministic order (prevents deadlocks) | | |
| □ Lock release in finally/cleanup block | | |
| □ Dead lock detection/alerting configured | | |
| □ Lock contention metrics captured | | |
| □ Load tested with concurrent users | | |

### 3.2 Reservation Timeout Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Reservation timeout is enforced (has `expires_at`) | | |
| □ Timeout duration is appropriate for event type | | |
| □ `expires_at` column has NOT NULL constraint | | |
| □ Maximum timeout enforced (no infinite holds) | | |
| □ Timeout displayed to user (countdown timer) | | |
| □ User can extend reservation (if allowed) | | |
| □ Extension has maximum limit | | |
| □ Abandoned reservations are released | | |
| □ Cleanup job runs frequently enough | | |
| □ Cleanup job failure alerts configured | | |

### 3.3 Overselling Prevention Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Database CHECK constraint: `quantity >= 0` | | |
| □ Atomic decrement used (`SET qty = qty - 1 WHERE qty >= 1`) | | |
| □ No check-then-act race conditions in code | | |
| □ Transaction isolation level appropriate | | |
| □ Optimistic or pessimistic locking implemented | | |
| □ Double-purchase prevention (idempotency) | | |
| □ Concurrent purchase load tested | | |
| □ Oversell detection alerts configured | | |
| □ Manual inventory adjustment requires approval | | |
| □ Audit trail for all inventory changes | | |

### 3.4 Cleanup & Release Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Cron job for expired reservation cleanup exists | | |
| □ Cron job runs at least every minute | | |
| □ Cron job has monitoring/alerting | | |
| □ Lazy evaluation checks expiry at query time | | |
| □ Orphaned reservation detection query exists | | |
| □ Stuck reservation alert threshold configured | | |
| □ Manual release procedure documented | | |
| □ Cleanup affects all relevant tables (tickets + reservations) | | |
| □ Released tickets are immediately available | | |
| □ Release events published for real-time updates | | |

### 3.5 Concurrency & Scalability Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Virtual queue/waiting room for high-demand sales | | |
| □ Rate limiting on purchase endpoints | | |
| □ Connection pool sized for peak load | | |
| □ Database query timeout configured | | |
| □ Horizontal scaling tested | | |
| □ Hot ticket handling (Redis caching) | | |
| □ Optimistic locking for batch inventory | | |
| □ Pessimistic locking for single high-value tickets | | |
| □ Bot detection/prevention implemented | | |
| □ CAPTCHA or proof-of-work for purchases | | |

### 3.6 Reconciliation & Audit Trail Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Daily inventory reconciliation job exists | | |
| □ Sum of statuses = total tickets check | | |
| □ Database vs blockchain ownership reconciliation | | |
| □ Inventory drift detection alerts | | |
| □ All inventory changes logged with user/timestamp | | |
| □ Manual adjustment requires reason code | | |
| □ Audit trail retained for compliance period | | |
| □ Discrepancy investigation procedure documented | | |
| □ Reconciliation report accessible to ops | | |
| □ Historical inventory snapshots retained | | |

### 3.7 Database Schema Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ `tickets` table has `status` enum/check constraint | | |
| □ `tickets` table has `version` for optimistic locking | | |
| □ `ticket_reservations` table exists | | |
| □ `expires_at` column on reservations (NOT NULL) | | |
| □ Unique constraint: one active reservation per ticket | | |
| □ Foreign key: reservation → ticket | | |
| □ Index on `expires_at` for cleanup queries | | |
| □ Index on `status` for inventory queries | | |
| □ `inventory_audit_log` table exists | | |
| □ Trigger/application logging for inventory changes | | |

### 3.8 Failure Handling Assessment

| Check | Status | Notes |
|-------|--------|-------|
| □ Payment failure releases reservation | | |
| □ Application crash releases reservation (via timeout) | | |
| □ Database connection failure handling | | |
| □ Redis connection failure fallback | | |
| □ Partial transaction rollback handled | | |
| □ Retry logic with exponential backoff | | |
| □ Circuit breaker for external dependencies | | |
| □ Graceful degradation under load | | |
| □ Error rates monitored and alerted | | |
| □ Runbook for common failure scenarios | | |

---

## 4. Implementation Patterns

### 4.1 Complete Ticket Purchase Flow

```javascript
class TicketPurchaseService {
  constructor(db, redis, paymentGateway) {
    this.db = db;
    this.redis = redis;
    this.paymentGateway = paymentGateway;
    this.RESERVATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Reserve tickets for checkout
   */
  async reserveTickets(ticketIds, userId, sessionId) {
    const idempotencyKey = `reserve:${sessionId}:${ticketIds.sort().join(',')}`;
    
    // Check idempotency
    const existing = await this.redis.get(idempotencyKey);
    if (existing) {
      return JSON.parse(existing);
    }
    
    const sortedIds = [...ticketIds].sort(); // Prevent deadlocks
    const expiresAt = new Date(Date.now() + this.RESERVATION_TIMEOUT_MS);
    
    return await this.db.transaction(async (trx) => {
      // Lock tickets in sorted order
      const tickets = await trx('tickets')
        .whereIn('id', sortedIds)
        .where(function() {
          this.where('status', 'available')
              .orWhere(function() {
                this.where('status', 'reserved')
                    .where('reserved_until', '<', new Date());
              });
        })
        .orderBy('id')
        .forUpdate();
      
      if (tickets.length !== sortedIds.length) {
        const availableIds = tickets.map(t => t.id);
        const unavailable = sortedIds.filter(id => !availableIds.includes(id));
        throw new TicketUnavailableError(unavailable);
      }
      
      // Update tickets to reserved
      await trx('tickets')
        .whereIn('id', sortedIds)
        .update({
          status: 'reserved',
          reserved_by: userId,
          reserved_until: expiresAt,
          updated_at: new Date()
        });
      
      // Create reservation records
      const reservations = await trx('ticket_reservations')
        .insert(sortedIds.map(ticketId => ({
          ticket_id: ticketId,
          user_id: userId,
          session_id: sessionId,
          status: 'reserved',
          expires_at: expiresAt
        })))
        .returning('*');
      
      // Log to audit trail
      await trx('inventory_audit_log').insert({
        action: 'RESERVE',
        user_id: userId,
        ticket_ids: JSON.stringify(sortedIds),
        details: JSON.stringify({ session_id: sessionId, expires_at: expiresAt })
      });
      
      const result = {
        reservationIds: reservations.map(r => r.id),
        ticketIds: sortedIds,
        expiresAt: expiresAt.toISOString()
      };
      
      // Store idempotency result (TTL = reservation timeout)
      await this.redis.setex(
        idempotencyKey,
        Math.ceil(this.RESERVATION_TIMEOUT_MS / 1000),
        JSON.stringify(result)
      );
      
      return result;
    });
  }

  /**
   * Complete purchase after payment
   */
  async completePurchase(reservationIds, userId, paymentDetails) {
    const idempotencyKey = `purchase:${reservationIds.sort().join(',')}`;
    
    // Check idempotency
    const existing = await this.redis.get(idempotencyKey);
    if (existing) {
      return JSON.parse(existing);
    }
    
    return await this.db.transaction(async (trx) => {
      // Fetch and lock reservations
      const reservations = await trx('ticket_reservations')
        .whereIn('id', reservationIds)
        .where('user_id', userId)
        .where('status', 'reserved')
        .forUpdate();
      
      if (reservations.length !== reservationIds.length) {
        throw new ReservationExpiredError();
      }
      
      // Check not expired
      const now = new Date();
      const expired = reservations.filter(r => new Date(r.expires_at) < now);
      if (expired.length > 0) {
        throw new ReservationExpiredError(expired.map(r => r.id));
      }
      
      const ticketIds = reservations.map(r => r.ticket_id);
      
      // Process payment
      const paymentResult = await this.paymentGateway.charge({
        amount: paymentDetails.amount,
        userId: userId,
        ticketIds: ticketIds,
        idempotencyKey: `payment:${idempotencyKey}`
      });
      
      if (!paymentResult.success) {
        throw new PaymentFailedError(paymentResult.error);
      }
      
      // Update reservations to completed
      await trx('ticket_reservations')
        .whereIn('id', reservationIds)
        .update({
          status: 'completed',
          completed_at: now,
          payment_id: paymentResult.paymentId
        });
      
      // Update tickets to sold
      await trx('tickets')
        .whereIn('id', ticketIds)
        .update({
          status: 'sold',
          owner_id: userId,
          sold_at: now,
          reserved_by: null,
          reserved_until: null
        });
      
      // Create order record
      const [order] = await trx('orders')
        .insert({
          user_id: userId,
          ticket_ids: JSON.stringify(ticketIds),
          payment_id: paymentResult.paymentId,
          total_amount: paymentDetails.amount,
          status: 'completed'
        })
        .returning('*');
      
      // Audit trail
      await trx('inventory_audit_log').insert({
        action: 'SELL',
        user_id: userId,
        ticket_ids: JSON.stringify(ticketIds),
        details: JSON.stringify({
          order_id: order.id,
          payment_id: paymentResult.paymentId
        })
      });
      
      const result = {
        orderId: order.id,
        ticketIds: ticketIds,
        status: 'completed'
      };
      
      // Store idempotency result (24 hour TTL)
      await this.redis.setex(idempotencyKey, 86400, JSON.stringify(result));
      
      return result;
    });
  }
}
```

### 4.2 Reservation Cleanup Worker

```javascript
class ReservationCleanupWorker {
  constructor(db, redis) {
    this.db = db;
    this.redis = redis;
    this.BATCH_SIZE = 100;
    this.LOCK_KEY = 'cleanup:reservation:lock';
  }

  async run() {
    // Acquire distributed lock to prevent multiple workers
    const lockAcquired = await this.redis.set(
      this.LOCK_KEY,
      process.pid,
      'NX', 'EX', 60 // 60 second lock
    );
    
    if (!lockAcquired) {
      console.log('Another cleanup worker is running');
      return;
    }
    
    try {
      let totalReleased = 0;
      
      while (true) {
        const released = await this.releaseBatch();
        totalReleased += released;
        
        if (released < this.BATCH_SIZE) {
          break; // No more expired reservations
        }
        
        // Extend lock if processing takes long
        await this.redis.expire(this.LOCK_KEY, 60);
        
        // Small delay between batches
        await sleep(50);
      }
      
      if (totalReleased > 0) {
        console.log(`Released ${totalReleased} expired reservations`);
        metrics.increment('reservations.cleanup.released', totalReleased);
      }
      
      return { released: totalReleased };
    } finally {
      await this.redis.del(this.LOCK_KEY);
    }
  }

  async releaseBatch() {
    const now = new Date();
    
    return await this.db.transaction(async (trx) => {
      // Find expired reservations
      const expired = await trx('ticket_reservations')
        .where('status', 'reserved')
        .where('expires_at', '<', now)
        .limit(this.BATCH_SIZE)
        .forUpdate()
        .skipLocked() // Don't wait for locked rows
        .select('id', 'ticket_id', 'user_id');
      
      if (expired.length === 0) {
        return 0;
      }
      
      const reservationIds = expired.map(r => r.id);
      const ticketIds = expired.map(r => r.ticket_id);
      
      // Update reservations to expired
      await trx('ticket_reservations')
        .whereIn('id', reservationIds)
        .update({ status: 'expired' });
      
      // Release tickets back to available
      const releasedCount = await trx('tickets')
        .whereIn('id', ticketIds)
        .where('status', 'reserved')
        .update({
          status: 'available',
          reserved_by: null,
          reserved_until: null,
          updated_at: now
        });
      
      // Audit trail
      await trx('inventory_audit_log').insert({
        action: 'EXPIRE_RESERVATION',
        ticket_ids: JSON.stringify(ticketIds),
        details: JSON.stringify({
          reservation_ids: reservationIds,
          expired_at: now.toISOString()
        })
      });
      
      // Publish events for real-time updates
      for (const ticketId of ticketIds) {
        await this.publishTicketReleased(ticketId);
      }
      
      return releasedCount;
    });
  }

  async publishTicketReleased(ticketId) {
    await this.redis.publish('ticket:released', JSON.stringify({
      ticketId: ticketId,
      timestamp: Date.now()
    }));
  }
}
```

### 4.3 Inventory Reconciliation Job

```javascript
class InventoryReconciliationJob {
  constructor(db) {
    this.db = db;
  }

  async run() {
    const discrepancies = [];
    
    // Check 1: Total tickets match expected
    const totalCheck = await this.checkTotalTickets();
    if (totalCheck.length > 0) {
      discrepancies.push(...totalCheck);
    }
    
    // Check 2: Status counts sum correctly
    const statusCheck = await this.checkStatusCounts();
    if (statusCheck.length > 0) {
      discrepancies.push(...statusCheck);
    }
    
    // Check 3: Reserved tickets have valid reservations
    const reservationCheck = await this.checkReservationIntegrity();
    if (reservationCheck.length > 0) {
      discrepancies.push(...reservationCheck);
    }
    
    // Check 4: Sold tickets have owners
    const ownerCheck = await this.checkSoldTicketsHaveOwners();
    if (ownerCheck.length > 0) {
      discrepancies.push(...ownerCheck);
    }
    
    // Store reconciliation results
    await this.db('reconciliation_results').insert({
      run_at: new Date(),
      discrepancy_count: discrepancies.length,
      discrepancies: JSON.stringify(discrepancies),
      status: discrepancies.length === 0 ? 'clean' : 'discrepancies_found'
    });
    
    // Alert if discrepancies found
    if (discrepancies.length > 0) {
      await alertOpsTeam('Inventory Reconciliation Discrepancies', {
        count: discrepancies.length,
        discrepancies: discrepancies
      });
    }
    
    return {
      status: discrepancies.length === 0 ? 'clean' : 'discrepancies_found',
      discrepancies: discrepancies
    };
  }

  async checkTotalTickets() {
    const results = await this.db.raw(`
      SELECT 
        e.id AS event_id,
        e.name AS event_name,
        e.total_tickets AS expected,
        COUNT(t.id) AS actual,
        e.total_tickets - COUNT(t.id) AS difference
      FROM events e
      LEFT JOIN tickets t ON e.id = t.event_id
      GROUP BY e.id, e.name, e.total_tickets
      HAVING COUNT(t.id) != e.total_tickets
    `);
    
    return results.rows.map(r => ({
      type: 'TOTAL_MISMATCH',
      eventId: r.event_id,
      eventName: r.event_name,
      expected: r.expected,
      actual: r.actual,
      difference: r.difference
    }));
  }

  async checkStatusCounts() {
    const results = await this.db.raw(`
      SELECT 
        event_id,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'available') AS available,
        COUNT(*) FILTER (WHERE status = 'reserved') AS reserved,
        COUNT(*) FILTER (WHERE status = 'sold') AS sold,
        COUNT(*) FILTER (WHERE status NOT IN ('available', 'reserved', 'sold')) AS unknown
      FROM tickets
      GROUP BY event_id
      HAVING COUNT(*) FILTER (WHERE status NOT IN ('available', 'reserved', 'sold')) > 0
         OR (COUNT(*) FILTER (WHERE status = 'available') +
             COUNT(*) FILTER (WHERE status = 'reserved') +
             COUNT(*) FILTER (WHERE status = 'sold')) != COUNT(*)
    `);
    
    return results.rows.map(r => ({
      type: 'STATUS_COUNT_MISMATCH',
      eventId: r.event_id,
      total: r.total,
      available: r.available,
      reserved: r.reserved,
      sold: r.sold,
      unknown: r.unknown
    }));
  }

  async checkReservationIntegrity() {
    const results = await this.db.raw(`
      SELECT t.id AS ticket_id, t.event_id, t.status, t.reserved_until
      FROM tickets t
      LEFT JOIN ticket_reservations tr 
        ON t.id = tr.ticket_id AND tr.status = 'reserved'
      WHERE t.status = 'reserved'
        AND (tr.id IS NULL OR tr.expires_at < NOW() - INTERVAL '5 minutes')
    `);
    
    return results.rows.map(r => ({
      type: 'ORPHANED_RESERVATION',
      ticketId: r.ticket_id,
      eventId: r.event_id,
      reservedUntil: r.reserved_until
    }));
  }

  async checkSoldTicketsHaveOwners() {
    const results = await this.db.raw(`
      SELECT id AS ticket_id, event_id
      FROM tickets
      WHERE status = 'sold' AND owner_id IS NULL
    `);
    
    return results.rows.map(r => ({
      type: 'SOLD_WITHOUT_OWNER',
      ticketId: r.ticket_id,
      eventId: r.event_id
    }));
  }
}
```

---

## 5. Sources

### Race Conditions & Distributed Systems
1. Distributed Locking and Race Condition Prevention - DZone
   https://dzone.com/articles/distributed-locking-and-race-condition-prevention

2. How the Backend Ensures Real-Time Inventory Updates - Zigpoll
   https://www.zigpoll.com/content/can-you-explain-how-the-backend-ensures-realtime-inventory-updates-across-our-website-and-app-as-orders-are-placed-during-high-traffic-periods

### Distributed Locking
3. Distributed Locks with Redis - Redis Documentation
   https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/

4. Redis Lock - Redis Glossary
   https://redis.io/glossary/redis-lock/

5. How to do distributed locking - Martin Kleppmann
   https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html

6. Implementation Principles and Best Practices of Distributed Lock - Alibaba Cloud
   https://www.alibabacloud.com/blog/implementation-principles-and-best-practices-of-distributed-lock_600811

7. The Twelve Redis Locking Patterns - Medium
   https://medium.com/@navidbarsalari/the-twelve-redis-locking-patterns-every-distributed-systems-engineer-should-know-06f16dfe7375

8. Redis or Zookeeper for distributed locks?
   https://programmer.help/blogs/redis-or-zookeeper-for-distributed-locks.html

### Reservation Pattern
9. Avoiding Distributed Transactions with the Reservation Pattern - CodeOpinion
   https://codeopinion.com/avoiding-distributed-transactions-with-the-reservation-pattern/

10. Design a Ticket Booking Site Like Ticketmaster - Hello Interview
    https://www.hellointerview.com/learn/system-design/problem-breakdowns/ticketmaster

11. Avoid Race Conditions with Reservation Pattern - Medium
    https://medium.com/@mmdGhanbari/avoid-race-conditions-with-reservation-pattern-bc4846602417

12. Managing Inventory Reservation in SAGA Pattern - DEV Community
    https://dev.to/jackynote/managing-inventory-reservation-in-saga-pattern-for-e-commerce-systems-2d14

### Hold Timeouts
13. Can I pick my basket hold time? - Ticket Tailor Help
    https://help.tickettailor.com/en/articles/6382935-can-i-pick-my-basket-hold-time

14. Reservation and Booking - Bókun Developer Docs
    https://bokun.dev/implementing-inventory-service-plugin/rGmzgGe66zjtEQ8FUvS8dd/step-6-reservation-and-booking/mskv6FZYULNxTHGwwxp4qs

### Database Locking
15. Implementing Concurrent Control with ORM - Leapcell
    https://leapcell.io/blog/implementing-concurrent-control-with-orm-a-deep-dive-into-pessimistic-and-optimistic-locking

16. Optimistic vs. Pessimistic Locking - Vlad Mihalcea
    https://vladmihalcea.com/optimistic-vs-pessimistic-locking/

17. Optimistic and Pessimistic Locking in SQL - Learning Notes
    https://learning-notes.mistermicheels.com/data/sql/optimistic-pessimistic-locking-sql/

18. Database Locking Techniques with Ent
    https://entgo.io/blog/2021/07/22/database-locking-techniques-with-ent/

19. A Guide to Optimistic Locking - System Design School
    https://systemdesignschool.io/blog/optimistic-locking

### Atomic Operations
20. Atomic Increment/Decrement Operations in SQL - Occasionally Consistent
    https://blog.pjam.me/posts/atomic-operations-in-sql/

21. Ensuring Atomicity in T-SQL Stored Procedures
    https://tech-champion.com/data-science/ensuring-atomicity-in-t-sql-stored-procedures-a-comprehensive-guide/

22. Unique Constraints and Check Constraints - Microsoft SQL Server
    https://learn.microsoft.com/en-us/sql/relational-databases/tables/unique-constraints-and-check-constraints

### Reservation Cleanup
23. Improve reservations clean up cron job - Magento GitHub Issue
    https://github.com/magento/inventory/issues/2311

24. Source algorithms and reservations - Adobe Commerce
    https://experienceleague.adobe.com/en/docs/commerce-admin/inventory/basics/selection-reservations

25. Reservations - Magento DevDocs
    https://github.com/magento/devdocs/blob/master/src/guides/v2.3/inventory/reservations.md

26. From Race Conditions to Resilience - DEV Community
    https://dev.to/thebigwealth89/from-race-conditions-to-resilience-building-a-bulletproof-reservation-system-hai

### Inventory Reconciliation
27. What Is Inventory Discrepancy? - Prediko
    https://www.prediko.io/blog/inventory-discrepancy

28. The Inventory Reconciliation Process - Aligni
    https://www.aligni.com/aligni-knowledge-center/the-inventory-reconciliation-process/

29. Inventory Discrepancy & How to Prevent It - Extensiv
    https://www.extensiv.com/blog/inventory-discrepancy

30. Inventory Discrepancy: What It Means & How to Avoid It - ShipBob
    https://www.shipbob.com/blog/inventory-discrepancy/

31. Inventory Reconciliation: Your Guide to Stock Count Success
    https://invwhs.com/inventory-reconciliation-your-guide-to-stock-count-success/

### Virtual Queue Systems
32. What is the queue and how do I join? - Ticketmaster Help
    https://help.ticketmaster.com/hc/en-us/articles/9781366115985-What-is-the-queue-and-how-do-I-join

33. How the Ticketmaster Queue Works - Ticketmaster Blog
    https://blog.ticketmaster.com/how-ticketmaster-queue-works/

34. Smart Queue - Ticketmaster Business
    https://business.ticketmaster.com/smart-queue/

35. Virtual Waiting Rooms: Everything You Need to Know - Queue-it
    https://queue-it.com/blog/virtual-waiting-room/

### Inventory Management
36. 20 Inventory Management Challenges and Solutions - NetSuite
    https://www.netsuite.com/portal/resource/articles/inventory-management/inventory-management-challenges.shtml

37. Distributed Inventory Management - StoreFeeder
    https://storefeeder.com/blogs/distributed-inventory-management-explained

---

## Summary

Ticket inventory management requires defense in depth:

1. **Database-Level Protection**
   - CHECK constraints (`quantity >= 0`)
   - Atomic updates (`SET qty = qty - 1 WHERE qty >= 1`)
   - Row-level locking (`SELECT FOR UPDATE`)

2. **Application-Level Protection**
   - Reservation pattern with mandatory expiry
   - Distributed locks for cross-service coordination
   - Idempotency keys to prevent double-purchases

3. **Operational Protection**
   - Cleanup workers for expired reservations
   - Daily reconciliation jobs
   - Real-time monitoring and alerting

4. **Traffic Management**
   - Virtual waiting room for high-demand sales
   - Rate limiting on purchase endpoints
   - Bot detection and prevention

The most critical rule: **Never use check-then-act patterns for inventory.** Always use atomic operations or proper locking to prevent the race conditions that cause overselling.