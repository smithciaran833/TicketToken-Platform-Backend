# ADR-002: PostgreSQL with RLS for Multi-tenancy

## Status
Accepted

## Context
The auth-service requires:
- ACID transactions for user operations
- Multi-tenant data isolation
- Complex queries for user search and filtering
- Strong data integrity constraints

## Decision
Use PostgreSQL with Row-Level Security (RLS) for multi-tenant data isolation.

## Consequences

### Positive
- Database-enforced tenant isolation (defense in depth)
- No risk of forgetting tenant filters in queries
- Works transparently with existing queries
- Excellent performance with proper indexing
- Strong ecosystem and tooling (pg, Knex)

### Negative
- Requires setting session variables for each connection
- RLS policies must be carefully designed and tested
- Slight performance overhead for RLS checks
- More complex debugging when RLS blocks access

### Neutral
- Requires PostgreSQL (not portable to other databases)
- Connection pooling requires careful handling of session variables
