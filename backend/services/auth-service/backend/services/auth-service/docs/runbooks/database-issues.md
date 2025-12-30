# Database Issues Runbook

## Symptoms
- Health check failing for database
- Increased latency on auth operations
- Connection timeout errors in logs

## Diagnosis

### 1. Check Connection Pool
```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'tickettoken_db';

-- Connection state breakdown
SELECT state, count(*) FROM pg_stat_activity 
WHERE datname = 'tickettoken_db' 
GROUP BY state;

-- Long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds'
AND state = 'active';
```

### 2. Check for Locks
```sql
-- Blocked queries
SELECT blocked_locks.pid AS blocked_pid,
       blocking_locks.pid AS blocking_pid,
       blocked_activity.query AS blocked_query
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
WHERE NOT blocked_locks.granted;
```

### 3. Check Replication (if applicable)
```sql
SELECT * FROM pg_stat_replication;
```

## Resolution

### Kill Long-Running Queries
```sql
-- Cancel query (graceful)
SELECT pg_cancel_backend(<pid>);

-- Terminate connection (force)
SELECT pg_terminate_backend(<pid>);
```

### Connection Pool Exhaustion
1. Check for connection leaks in application
2. Increase pool size temporarily (requires restart)
3. Check `idle_in_transaction_session_timeout` is set

### Failover to Replica
Only if primary is unrecoverable:
1. Promote replica in cloud console
2. Update DATABASE_URL secret
3. Rolling restart auth-service

## Escalation
- Database issues affecting multiple services: Page Platform Team
- Data corruption suspected: Page L3 + DBA
