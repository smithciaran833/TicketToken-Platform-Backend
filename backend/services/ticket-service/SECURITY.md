# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability within the Ticket Service, please send an email to security@tickettoken.io. All security vulnerabilities will be promptly addressed.

**Please do not publicly disclose the issue until it has been addressed by the team.**

### What to Include

- Type of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Security Measures

### Authentication & Authorization

1. **JWT Authentication**: All API endpoints (except health checks) require valid JWT tokens
2. **Service-to-Service Auth**: Internal service calls use HMAC-signed JWTs with per-service secrets
3. **Role-Based Access Control (RBAC)**: Endpoint permissions based on user roles
4. **Tenant Isolation**: Multi-tenant architecture with Row-Level Security (RLS)

### Data Protection

1. **Encryption at Rest**: Database encryption using PostgreSQL TDE
2. **Encryption in Transit**: TLS 1.3 for all external connections
3. **Secret Management**: Secrets stored in environment variables (production: AWS Secrets Manager)
4. **QR Code Encryption**: AES-256 encryption with rotating keys

### Input Validation

1. **Schema Validation**: All inputs validated using Zod schemas
2. **SQL Injection Prevention**: Parameterized queries via Knex.js
3. **XSS Prevention**: Output encoding and Content-Type headers
4. **Prototype Pollution**: Strict mode with `additionalProperties: false`

### Rate Limiting

1. **Per-User Limits**: 100 requests/minute for standard users
2. **Per-Tenant Limits**: Aggregate limits across tenant
3. **Endpoint-Specific**: Stricter limits on sensitive endpoints (purchase, transfer)
4. **Redis-Backed**: Distributed rate limiting across instances

### Blockchain Security

1. **Multi-Signature Wallets**: High-value operations require multi-sig
2. **Spending Limits**: Per-user and per-tenant spending limits
3. **Transaction Monitoring**: All blockchain operations logged and audited
4. **RPC Security**: Circuit breaker and failover for RPC endpoints

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.2.x   | :white_check_mark: |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :x:                |

## Security Checklist for Development

- [ ] All inputs validated
- [ ] No secrets in code
- [ ] Error messages don't leak information
- [ ] Rate limiting applied
- [ ] Authentication required
- [ ] Authorization checked
- [ ] Audit logging enabled
- [ ] SQL injection prevented
- [ ] TLS configured

## Security Headers

The service sets the following security headers via Fastify Helmet:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

## Dependency Security

- Dependencies scanned weekly using `npm audit`
- Security updates applied within 48 hours of disclosure
- Lock files committed to prevent supply chain attacks
- Minimal dependency footprint

## Incident Response

1. **Detection**: Automated monitoring and alerting
2. **Containment**: Service isolation procedures
3. **Investigation**: Log analysis and forensics
4. **Recovery**: Rollback procedures documented
5. **Post-Mortem**: Security incident review

## Compliance

- SOC 2 Type II (in progress)
- PCI DSS Level 2 (in progress)
- GDPR compliant data handling

## Contact

- Security Team: security@tickettoken.io
- Emergency: On-call via PagerDuty
- Bug Bounty: Coming soon
