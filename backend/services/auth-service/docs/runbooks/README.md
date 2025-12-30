# Auth-Service Runbooks

Operational runbooks for incident response and common tasks.

## Runbooks Index

| Runbook | Description |
|---------|-------------|
| [High Error Rate](./high-error-rate.md) | Response to elevated 5xx errors |
| [Database Issues](./database-issues.md) | Database connectivity/performance |
| [Redis Issues](./redis-issues.md) | Redis connectivity/performance |
| [Auth Failures](./auth-failures.md) | Mass authentication failures |
| [Rate Limiting](./rate-limiting.md) | Rate limit tuning and incidents |
| [Token Issues](./token-issues.md) | JWT/token related issues |

## Escalation Path

1. **L1 On-Call**: Initial triage, follow runbooks
2. **L2 Engineering**: Complex issues, code-level debugging
3. **L3 Platform Team**: Infrastructure, database, cross-service issues
