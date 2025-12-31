# ADR 002: Use PostgreSQL as Primary Database

## Status

Accepted

## Context

We needed a database for storing user data, sessions, and authentication state.

Options considered:
- PostgreSQL
- MySQL
- MongoDB
- CockroachDB

## Decision

We chose **PostgreSQL** for the following reasons:

1. **ACID Compliance**: Strong transactional guarantees
2. **Row-Level Security**: Native RLS for multi-tenancy
3. **JSON Support**: JSONB for flexible metadata storage
4. **Maturity**: Battle-tested, widely used
5. **Extensions**: Rich ecosystem (uuid-ossp, pgcrypto)
6. **Team Expertise**: Team has PostgreSQL experience

## Consequences

### Positive
- Strong data integrity
- RLS simplifies multi-tenant isolation
- Excellent tooling and documentation
- Easy to find developers with experience

### Negative
- Horizontal scaling requires more effort than NoSQL
- Schema migrations needed for changes
- More complex setup than document stores

## References

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
