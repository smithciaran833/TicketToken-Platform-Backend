# Security Policy

## File Service Security Documentation

**Last Updated:** January 4, 2026  
**Security Contact:** security@tickettoken.com  
**Service:** file-service  
**Classification:** Internal / Confidential

---

## Table of Contents

1. [Security Overview](#security-overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [Data Protection](#data-protection)
4. [Input Validation](#input-validation)
5. [Network Security](#network-security)
6. [Vulnerability Reporting](#vulnerability-reporting)
7. [Incident Response](#incident-response)
8. [Compliance](#compliance)

---

## Security Overview

The File Service handles sensitive file operations including uploads, downloads, and media processing for the TicketToken Platform. Security is implemented through multiple layers:

### Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (WAF)                        │
│  • Rate limiting  • DDoS protection  • IP filtering         │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Authentication Layer                      │
│  • JWT validation (RS256/384/512)                           │
│  • Issuer/Audience verification                             │
│  • Token expiry validation                                  │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Authorization Layer                       │
│  • Multi-tenant context                                     │
│  • Role-based access control                                │
│  • Resource ownership validation                            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Input Validation Layer                    │
│  • JSON Schema validation on all routes                     │
│  • File type validation (magic bytes)                       │
│  • Size limits                                              │
│  • XSS/Injection prevention                                 │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
│  • Row-Level Security (FORCE RLS)                           │
│  • Encrypted at rest (AES-256)                              │
│  • Encrypted in transit (TLS 1.3)                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Authentication & Authorization

### JWT Configuration

```typescript
// Supported algorithms (asymmetric only)
algorithms: ['RS256', 'RS384', 'RS512']

// Required claims validation
issuer: 'https://auth.tickettoken.com'
audience: 'https://api.tickettoken.com'
```

### Token Requirements

| Claim | Required | Description |
|-------|----------|-------------|
| `sub` | Yes | User ID |
| `iss` | Yes | Token issuer |
| `aud` | Yes | Token audience |
| `exp` | Yes | Expiration time |
| `iat` | Yes | Issued at time |
| `tenant_id` | Yes | Tenant identifier |
| `roles` | Yes | User roles array |

### Multi-Tenancy

All requests must include tenant context:
- Extracted from JWT `tenant_id` claim
- Set via `SET LOCAL app.tenant_id` for RLS
- Enforced at database level with FORCE ROW LEVEL SECURITY

### Protected Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `/api/v1/files/*` | ✅ JWT | File operations |
| `/api/v1/images/*` | ✅ JWT | Image processing |
| `/api/v1/videos/*` | ✅ JWT | Video processing |
| `/api/v1/admin/*` | ✅ JWT + Admin | Admin operations |
| `/health/*` | ❌ None | Health checks |
| `/metrics` | ✅ Internal | Prometheus metrics |

---

## Data Protection

### Encryption

| State | Method | Algorithm |
|-------|--------|-----------|
| At Rest (S3) | Server-side | AES-256 |
| At Rest (DB) | Transparent | AES-256 |
| In Transit | TLS | TLS 1.3 |
| Sensitive Fields | Column-level | AES-GCM |

### S3 Security

```yaml
Bucket Policy:
  - Block public access: true
  - Object ownership: BucketOwnerEnforced
  - Versioning: enabled
  - Lifecycle: 90-day transition to Glacier
  
Object Metadata:
  - x-amz-server-side-encryption: AES256
  - x-amz-acl: private
  - Tenant isolation via path prefix: /{tenant_id}/
```

### PII Handling

The following fields are redacted from logs:
- `password`, `token`, `authorization`
- `ssn`, `socialSecurityNumber`
- `creditCard`, `cardNumber`, `cvv`
- `email`, `phone`, `address`
- `apiKey`, `secret`, `privateKey`

---

## Input Validation

### File Upload Validation

```typescript
// Maximum file sizes
images: 10MB
documents: 50MB
videos: 500MB

// Allowed MIME types
images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
documents: ['application/pdf', 'application/msword', ...]
videos: ['video/mp4', 'video/webm', 'video/quicktime']

// Magic byte validation
Required for all uploads
```

### Request Validation

All routes have Fastify JSON Schema validation:
- Body schemas with strict types
- Query parameter validation
- Path parameter validation (UUID format)
- Response schemas for serialization

### XSS Prevention

- SVG watermark text sanitization
- HTML entity encoding
- XML entity encoding
- URL validation (no javascript:, data:, etc.)

### SQL Injection Prevention

- Parameterized queries only
- No string concatenation
- Input sanitization as defense-in-depth

---

## Network Security

### Rate Limiting

| Operation | Limit | Window |
|-----------|-------|--------|
| Upload | 20/min | Per tenant |
| Download | 200/min | Per tenant |
| Image processing | 30/min | Per tenant |
| Admin operations | 50/min | Per tenant |

### Circuit Breakers

| Service | Failure Threshold | Recovery |
|---------|-------------------|----------|
| S3 | 5 failures | 60s |
| ClamAV | 3 failures | 30s |
| PostgreSQL | 5 failures | 30s |
| Redis | 3 failures | 30s |

### Timeouts

| Operation | Timeout |
|-----------|---------|
| S3 operations | 30s |
| Database queries | 10s |
| Image processing | 45s |
| Video transcoding | 300s |
| ClamAV scan | 30s |

---

## Vulnerability Reporting

### Responsible Disclosure

If you discover a security vulnerability, please:

1. **DO NOT** create a public GitHub issue
2. Email security@tickettoken.com with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Your suggested fix (optional)

### Response Timeline

| Action | Timeframe |
|--------|-----------|
| Acknowledgment | 24 hours |
| Initial assessment | 72 hours |
| Fix development | 7-30 days |
| Public disclosure | 90 days |

### Bug Bounty

We offer a bug bounty program for qualifying vulnerabilities:
- Critical: $5,000 - $10,000
- High: $1,000 - $5,000
- Medium: $250 - $1,000
- Low: $50 - $250

---

## Incident Response

### Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| P1 - Critical | Active exploitation, data breach | 15 minutes |
| P2 - High | Vulnerability exploitable remotely | 4 hours |
| P3 - Medium | Limited impact vulnerability | 24 hours |
| P4 - Low | Minimal security impact | 7 days |

### Response Procedures

#### P1 - Critical Incident

1. **Immediate** (0-15 min)
   - Page on-call security engineer
   - Begin incident call
   - Assess blast radius

2. **Containment** (15-60 min)
   - Isolate affected systems
   - Rotate compromised credentials
   - Enable enhanced logging

3. **Investigation** (1-24 hours)
   - Forensic data collection
   - Root cause analysis
   - Impact assessment

4. **Recovery** (24-72 hours)
   - Deploy fixes
   - Restore services
   - Verify integrity

5. **Post-Incident** (1-2 weeks)
   - Incident report
   - Lessons learned
   - Process improvements

### Security Contacts

| Role | Contact |
|------|---------|
| Security Team | security@tickettoken.com |
| On-Call | PagerDuty: file-service-security |
| CISO | ciso@tickettoken.com |
| Legal | legal@tickettoken.com |

---

## Compliance

### Standards

| Standard | Status |
|----------|--------|
| SOC 2 Type II | ✅ Compliant |
| PCI DSS | ✅ Compliant (if processing payments) |
| GDPR | ✅ Compliant |
| CCPA | ✅ Compliant |
| HIPAA | ⚠️ Not applicable |

### Data Retention

| Data Type | Retention Period |
|-----------|-----------------|
| User files | Until deletion + 30 days |
| Upload logs | 90 days |
| Access logs | 1 year |
| Security logs | 7 years |
| Audit logs | 7 years |

### Right to Erasure (GDPR)

Users can request deletion of:
- All uploaded files
- File metadata
- Processing history
- Access logs (after retention period)

Process:
1. Request via `/api/v1/gdpr/erasure`
2. Verification within 72 hours
3. Execution within 30 days
4. Confirmation email sent

---

## Security Checklist

### Development

- [ ] No secrets in code
- [ ] Input validation on all endpoints
- [ ] Parameterized database queries
- [ ] Rate limiting configured
- [ ] Circuit breakers active
- [ ] PII redaction in logs
- [ ] Error messages don't leak internals

### Deployment

- [ ] TLS certificates valid
- [ ] Database SSL enabled
- [ ] S3 bucket policies configured
- [ ] IAM roles minimal
- [ ] Secrets in secrets manager
- [ ] Container image scanned

### Monitoring

- [ ] Security event logging
- [ ] Alert rules configured
- [ ] Anomaly detection enabled
- [ ] Access logs enabled
- [ ] Error rate monitoring

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-04 | 1.0.0 | Initial security documentation |

---

## Contact

For security-related inquiries: security@tickettoken.com
