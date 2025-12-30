# Data Retention Policy

## Retention Periods

| Data Type | Retention | Legal Basis |
|-----------|-----------|-------------|
| User accounts | Until deletion requested | Contract performance |
| Audit logs | 7 years | Legal requirement |
| Sessions | 30 days after end | Legitimate interest |
| Password reset tokens | 1 hour | Security |
| MFA setup tokens | 10 minutes | Security |
| Invalidated tokens | 7 days | Security |

## Automated Cleanup
`cleanup_expired_data()` function runs daily:
- Deletes expired sessions (>30 days)
- Deletes old audit logs (>7 years)
- Anonymizes soft-deleted users (>30 days)

## Data Subject Rights
- **Export:** GET /auth/gdpr/export
- **Delete:** DELETE /auth/gdpr/delete
- **Consent:** GET/PUT /auth/consent

## Annual Review
- Review retention periods annually
- Update based on regulatory changes
- Document changes in CHANGELOG.md
