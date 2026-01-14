# Security Policy

**AUDIT FIX: DOC-M3 - Security documentation**

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅ Active |
| 0.x     | ❌ End of life |

## Reporting a Vulnerability

### Private Disclosure

**DO NOT** report security vulnerabilities through public GitHub issues.

Please report security vulnerabilities via email to: **security@tickettoken.com**

Include the following information:
- Type of issue (e.g., buffer overflow, SQL injection, XSS)
- Full paths of source file(s) related to the issue
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue and potential attack vectors

### Response Timeline

| Phase | Timeline |
|-------|----------|
| Initial Response | 24 hours |
| Triage & Assessment | 72 hours |
| Fix Development | 7-14 days (varies by severity) |
| Public Disclosure | 90 days after fix |

### Bug Bounty

We participate in a responsible disclosure program. Valid security reports may be eligible for:

| Severity | Bounty Range |
|----------|--------------|
| Critical | $1,000 - $5,000 |
| High | $500 - $1,000 |
| Medium | $100 - $500 |
| Low | $50 - $100 |

---

## Security Architecture

### Authentication

- **JWT Authentication**: RS256 algorithm (asymmetric)
- **Token Expiration**: Access tokens expire in 15 minutes
- **Refresh Tokens**: Rotate on use, stored securely
- **MFA**: Required for compliance-sensitive operations

### Authorization

- **Role-Based Access Control (RBAC)**: User, Admin, Compliance Officer roles
- **Broken Object Level Authorization (BOLA)**: Protected with user access verification
- **Broken Function Level Authorization (BFLA)**: Role checks on all sensitive routes

### Data Protection

- **Encryption at Rest**: AES-256 for sensitive data
- **Encryption in Transit**: TLS 1.3 required
- **PII Handling**: Automated redaction in logs
- **Database**: Row-Level Security (RLS) enforced

### Network Security

- **Rate Limiting**: Redis-backed with IP and user-based limits
- **CORS**: Strict origin whitelist
- **HSTS**: Enabled with preload
- **Internal Networks**: Metrics endpoint restricted to private IPs

---

## Security Headers

All responses include:

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
```

---

## Compliance

### GDPR

- Data export (Article 15)
- Data deletion (Article 17)
- Identity verification required
- Audit logging of all access

### SOC 2

- Access controls
- Encryption standards
- Audit trails
- Incident response

### PCI-DSS (where applicable)

- No storage of cardholder data
- Integration with PCI-compliant payment processors
- Network segmentation

---

## Secret Management

### Production Secrets

- **AWS Secrets Manager** or **HashiCorp Vault** for secrets
- No hardcoded credentials
- Automatic rotation for database passwords
- Environment-specific secrets

### Development

- Use `.env.example` as template
- Never commit `.env` files
- Pre-commit hooks scan for secrets (gitleaks)

---

## Incident Response

### Classification

| Severity | Description | Response Time |
|----------|-------------|---------------|
| P1 - Critical | Data breach, system compromise | Immediate |
| P2 - High | Authentication bypass, privilege escalation | 1 hour |
| P3 - Medium | Information disclosure, DoS | 4 hours |
| P4 - Low | Minor issues, no immediate impact | 24 hours |

### Response Process

1. **Detection**: Automated alerts, user reports, or audit
2. **Containment**: Isolate affected systems
3. **Eradication**: Remove threat, patch vulnerability
4. **Recovery**: Restore services, verify integrity
5. **Lessons Learned**: Post-incident review, update procedures

### Contact

- **Security Team**: security@tickettoken.com
- **On-Call**: +1-XXX-XXX-XXXX (24/7)
- **Slack**: #security-incidents

---

## Security Testing

### Automated

- **SAST**: Static analysis in CI pipeline
- **DAST**: Dynamic testing in staging
- **Dependency Scanning**: npm audit, Snyk
- **Container Scanning**: Trivy

### Manual

- **Penetration Testing**: Annual third-party assessment
- **Code Review**: Security-focused review for sensitive changes
- **Red Team**: Bi-annual exercises

---

## Secure Development Guidelines

### Input Validation

```typescript
// ✅ Good: Use Zod schemas with strict mode
const schema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().max(255)
}).strict();

// ❌ Bad: No validation
const data = request.body as any;
```

### SQL Injection Prevention

```typescript
// ✅ Good: Use parameterized queries
await db('users').where({ id: userId }).first();

// ❌ Bad: String concatenation
await db.raw(`SELECT * FROM users WHERE id = '${userId}'`);
```

### Logging

```typescript
// ✅ Good: Redact sensitive data
logger.info({ userId, action: 'login' }, 'User authenticated');

// ❌ Bad: Log sensitive data
logger.info({ password, ssn }, 'User data');
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-03 | Initial security policy |

---

## Acknowledgments

We thank the security researchers who have responsibly disclosed vulnerabilities:

- (List will be maintained as reports are received)
