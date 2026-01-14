# ADR 001: Database Selection

## Status
Accepted

## Context
The order-service needs a reliable, scalable database to store order data, transactions, refunds, and related entities. The database must support:
- ACID transactions for financial data integrity
- Multi-tenancy with row-level security
- High read/write throughput for order processing
- Complex queries for reporting and analytics
- Strong consistency for payment operations

## Decision
We chose **PostgreSQL** as the primary database for the order-service.

### Reasons:
1. **ACID Compliance**: PostgreSQL provides full ACID compliance, critical for financial transactions
2. **Row-Level Security (RLS)**: Native support for tenant isolation at the database level
3. **JSON Support**: JSONB columns for flexible metadata storage
4. **Connection Pooling**: Compatible with PgBouncer for connection management
5. **Ecosystem**: Excellent tooling, Knex.js support, and mature ecosystem
6. **Performance**: Proven performance at scale with proper indexing

## Alternatives Considered

### MySQL
- Pros: Familiar, good performance
- Cons: Weaker RLS support, less mature JSONB handling

### MongoDB
- Pros: Flexible schema, horizontal scaling
- Cons: No ACID transactions across documents (at time of decision), not ideal for financial data

### CockroachDB
- Pros: Distributed, PostgreSQL compatible
- Cons: Added complexity, not needed at current scale

## Consequences

### Positive
- Strong data integrity guarantees
- Built-in tenant isolation via RLS policies
- Familiar SQL interface for developers
- Robust migration support with Knex.js

### Negative
- Requires proper connection pool management (solved with PgBouncer)
- Must configure SSL/TLS for production security
- Need to manage indexes carefully for performance

## Implementation Notes
- Use PgBouncer for connection pooling
- Enable RLS on all tenant-scoped tables
- Configure SSL/TLS for production environments
- Set statement_timeout and query_timeout for safety

## References
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [PgBouncer Configuration](https://www.pgbouncer.org/config.html)
