# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously at TicketToken. If you discover a security vulnerability, please follow our responsible disclosure process:

### DO NOT:
- Create a public GitHub issue
- Disclose the vulnerability publicly before we've had time to address it
- Exploit the vulnerability beyond what's necessary to demonstrate it

### DO:
1. **Email us:** security@tickettoken.io
2. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested remediation (if any)
3. **Encrypt sensitive details** using our PGP key (available on request)

### Response Timeline:
- **Initial Response:** Within 24 hours
- **Status Update:** Within 72 hours
- **Fix Timeline:** Critical issues within 7 days, others within 30 days
- **Public Disclosure:** Coordinated with reporter after fix is deployed

## Security Measures

### Authentication & Authorization
- JWT-based authentication with token expiration
- Role-based access control (RBAC)
- Multi-tenant isolation at all layers
- API key authentication for service-to-service communication

### Data Protection
- All data encrypted in transit (TLS 1.3)
- Sensitive data encrypted at rest
- PII redacted from logs
- Row-level security (RLS) in PostgreSQL

### Input Validation
- Strict schema validation on all inputs
- UUID format validation for identifiers
- Rate limiting per user, tenant, and operation
- Request size limits

### Infrastructure Security
- Non-root container execution
- Read-only file system where possible
- Network segmentation
- Secret management via environment variables or vault

## Security Best Practices for Contributors

### Code
```typescript
// DO: Validate inputs
const venueId = validateUuid(request.params.venueId);

// DON'T: Use raw input
const venueId = request.params.venueId; // Bad!

// DO: Use parameterized queries
await db('venues').where('id', venueId).first();

// DON'T: Concatenate SQL
await db.raw(`SELECT * FROM venues WHERE id = '${venueId}'`); // SQL Injection!

// DO: Check tenant isolation
await db('venues').where({ id: venueId, tenant_id: tenantId }).first();

// DON'T: Forget tenant checks
await db('venues').where('id', venueId).first(); // Cross-tenant leak!
```

### Logging
```typescript
// DO: Redact sensitive data
logger.info({ userId, action: 'login' }, 'User logged in');

// DON'T: Log sensitive data
logger.info({ password, token }, 'Auth details'); // Never!
```

### Error Handling
```typescript
// DO: Return generic errors to clients
throw new NotFoundError('Resource not found');

// DON'T: Leak internal details
throw new Error(`Venue ${venueId} not found in tenant ${tenantId}`);
```

## Security Headers

All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy: default-src 'self'`

## Dependency Management

- Dependencies reviewed before addition
- Weekly automated vulnerability scans (Dependabot/Snyk)
- Critical vulnerabilities addressed within 24 hours
- Regular dependency updates

## Incident Response

1. **Detection:** Automated monitoring and alerting
2. **Containment:** Immediate isolation of affected systems
3. **Investigation:** Root cause analysis
4. **Remediation:** Fix and verify
5. **Communication:** Notify affected parties
6. **Post-mortem:** Document lessons learned

## Security Contacts

- **Security Team:** security@tickettoken.io
- **Bug Bounty:** bugbounty@tickettoken.io
- **PGP Key:** Available on request

## Acknowledgments

We thank the following researchers for responsibly disclosing vulnerabilities:
- (List will be maintained as reports are received)

---

Last updated: December 2024
