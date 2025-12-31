# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: security@tickettoken.com

Include the following information:

- Type of vulnerability (e.g., SQL injection, XSS, authentication bypass)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

## Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution Target**: Within 30 days (depending on severity)

## Security Measures

### Authentication
- JWT tokens with RS256 signing
- Refresh token rotation
- MFA support (TOTP)
- Account lockout after failed attempts
- Secure password hashing (bcrypt)

### Authorization
- Role-based access control (RBAC)
- Venue-specific permissions
- Multi-tenant isolation with RLS

### Data Protection
- All data encrypted in transit (TLS 1.2+)
- Sensitive data encrypted at rest
- PII handled per GDPR requirements
- Audit logging for security events

### Infrastructure
- Rate limiting on all endpoints
- CORS configuration
- CSRF protection
- Security headers (HSTS, CSP, etc.)
- Input validation and sanitization

## Security Contacts

- Security Team: security@tickettoken.com
- On-Call: Available via PagerDuty for critical issues
