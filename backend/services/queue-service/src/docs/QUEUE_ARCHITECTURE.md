# Queue Architecture Decision

## Overview

The queue-service uses **pg-boss** (PostgreSQL-backed job queue) instead of **Bull** (Redis-backed) for specific architectural reasons. This document explains the decision and its rationale.

## Decision #4 Queue Standards (Platform-Wide)

Per `STANDARDIZATION_DECISIONS.md`, the platform queue standards are:

- **RabbitMQ**: Inter-service messaging (pub/sub events across services)
- **Bull**: Internal background jobs (within a single service)

## queue-service Exception: pg-boss

The queue-service is an **exception** to the Bull standard and uses **pg-boss** instead.

### Rationale

1. **PostgreSQL Transactional Guarantees**
   - pg-boss jobs are stored in PostgreSQL with ACID compliance
   - Jobs can participate in database transactions
   - If a business transaction fails, the associated job is automatically rolled back
   - No "job-orphan" problem where a job exists but its triggering data doesn't

2. **Three-Tier Durability Architecture**
   ```
   Tier 1 (Money):        PostgreSQL WAL + sync commits
   Tier 2 (Communication): PostgreSQL with relaxed durability
   Tier 3 (Background):   PostgreSQL with eventual consistency
   ```

3. **Payment-Critical Jobs**
   - Payment processing, refunds, and financial reconciliation
   - These jobs MUST have durability guarantees
   - Redis (Bull) uses RDB/AOF persistence which can lose data
   - PostgreSQL provides point-in-time recovery

4. **No Additional Infrastructure**
   - Uses existing PostgreSQL cluster
   - No separate Redis instance needed for queue-service
   - Simpler operational model for this specific service

### Why Not Migrate to Bull?

| Factor | pg-boss | Bull |
|--------|---------|------|
| Durability | ACID, full PITR | RDB/AOF, potential data loss |
| Transaction support | Native PostgreSQL | Not transactional |
| Recovery | PostgreSQL backup/restore | Redis persistence |
| Operational overhead | Uses existing PG | Requires dedicated Redis |
| Speed | ~1000 jobs/sec | ~10000 jobs/sec |
| Use case fit | Financial jobs | High-throughput non-critical |

### Performance Consideration

pg-boss is ~10x slower than Bull for throughput, but:
- queue-service handles financial operations (thousands, not millions per day)
- Durability > throughput for money operations
- The performance difference is irrelevant at our scale

## queue-service Queue Types

```typescript
// src/queues/definitions/
MoneyQueue:        // Tier 1 - Payments, refunds, settlements
CommunicationQueue: // Tier 2 - Emails, notifications, webhooks
BackgroundQueue:   // Tier 3 - Cleanup, analytics, maintenance
```

## Integration with Platform Events

queue-service still follows the RabbitMQ standard for **inter-service events**:

```
[Other Services] --RabbitMQ--> [queue-service] --pg-boss--> [Workers]
```

- Receives events via RabbitMQ consumer
- Processes jobs internally via pg-boss
- Publishes completion events back to RabbitMQ

## Conclusion

The queue-service's use of pg-boss is a **deliberate exception** to the Bull standard, not technical debt. It provides necessary durability guarantees for financial operations that Redis-backed Bull cannot match.

**Decision Status**: APPROVED - Keep pg-boss for queue-service

**Date**: January 2025
**Owner**: Platform Architecture Team
