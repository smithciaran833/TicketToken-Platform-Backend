# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: security@tickettoken.com

Include:
- Type of issue (e.g., buffer overflow, SQL injection, XSS)
- Full paths of source file(s) related to the issue
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue

## Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution Target**: Within 30 days for critical issues

## Security Measures

### Authentication
- Passwords hashed with bcrypt (cost factor 10)
- JWT tokens with RS256 signing
- Refresh token rotation with reuse detection
- Account lockout after 5 failed attempts
- MFA support (TOTP)

### Data Protection
- All data encrypted in transit (TLS 1.2+)
- Sensitive data encrypted at rest
- PII masking in logs
- GDPR compliance (export, delete, consent)

### Rate Limiting
- Global: 1000 requests/minute
- Login: 5 attempts/15 minutes
- OTP: 5 attempts/5 minutes
- Registration: 3/hour

### Infrastructure
- Row-Level Security (RLS) for multi-tenancy
- Statement timeouts (30s)
- Transaction timeouts (60s)
- Circuit breakers for external services

## Security Headers

The service sets the following security headers:
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

## Audit Logging

All security-relevant events are logged:
- Login attempts (success/failure)
- Password changes
- MFA enable/disable
- Session creation/revocation
- Permission changes
- Data exports

## Dependencies

- Dependencies scanned for vulnerabilities in CI
- Automated PRs for security updates via Dependabot
- Regular security audits
