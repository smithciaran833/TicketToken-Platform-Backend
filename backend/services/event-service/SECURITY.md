# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in the event-service, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email security@tickettoken.com with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

### Response Timeline

- **Initial Response**: Within 24 hours
- **Status Update**: Within 72 hours
- **Resolution Target**: Within 30 days (depending on severity)

## Security Measures

### Authentication & Authorization

- **JWT Validation**: RS256 algorithm with public key verification
- **Service-to-Service Auth**: HMAC-signed tokens with short expiry (5 minutes)
- **Token Scopes**: Fine-grained permissions per service (TM6)
- **Token Revocation**: Emergency revocation support (TM8)
- **API Keys**: SHA-256 hashed storage for external integrations

### Data Protection

- **Row Level Security (RLS)**: Database-level tenant isolation
- **Tenant Context**: SET LOCAL ensures queries are tenant-scoped
- **PII Redaction**: Sensitive fields redacted from logs
- **TLS**: All database and external connections use TLS 1.2+

### Input Validation

- **Schema Validation**: All inputs validated with JSON Schema
- **additionalProperties: false**: Prevents prototype pollution
- **Unicode Normalization**: NFC normalization prevents Unicode attacks
- **URL Validation**: SSRF prevention with allowlist
- **SQL Injection**: Parameterized queries via Knex

### Rate Limiting

- **Per-Tenant**: Rate limits scoped to tenant ID
- **Per-User**: Additional limits per user ID
- **Endpoint-Specific**: Stricter limits on mutations
- **Service Exemptions**: Trusted services bypass rate limits

### Error Handling

- **RFC 7807**: Consistent error format
- **No Information Leakage**: Internal errors sanitized in production
- **Error Metrics**: All errors tracked for monitoring

### Secrets Management

- **Environment Variables**: All secrets from environment
- **No Hardcoded Secrets**: Enforced by code review
- **Secret Rotation**: Supports dual-secret rotation window

## Security Checklist for Contributors

- [ ] No secrets in code or logs
- [ ] All inputs validated and sanitized
- [ ] SQL queries use parameterized statements
- [ ] Tenant context set for all database operations
- [ ] Error messages don't leak internal details
- [ ] New endpoints have appropriate authentication
- [ ] Rate limits applied to new endpoints

## Dependencies

We regularly scan dependencies for vulnerabilities using:
- `npm audit` in CI/CD pipeline
- Dependabot alerts

## Contact

- Security Team: security@tickettoken.com
- Emergency: security-emergency@tickettoken.com
