# Database Backup Encryption Procedures

## Overview
All database backups MUST be encrypted before storage or transmission.

## Encryption Standards
- Algorithm: AES-256-GCM
- Key Management: AWS KMS / HashiCorp Vault
- Key Rotation: Every 90 days

## Backup Procedures

### 1. Automated Daily Backups
- Script location: /opt/tickettoken/scripts/backup-encrypted.sh
- Schedule: Daily at 2 AM UTC via cron
- Retention: 30 days for daily, 1 year for monthly

### 2. Backup Process
1. Create PostgreSQL dump with pg_dump
2. Compress with gzip
3. Encrypt using AWS KMS
4. Upload to S3 with server-side encryption
5. Verify upload integrity
6. Securely delete local copies

### 3. Point-in-Time Recovery
- WAL archiving enabled
- Continuous archiving to encrypted S3 bucket
- 30-day retention policy

## Compliance Requirements
- SOC 2: Encryption at rest and in transit
- PCI DSS: Cryptographic key management
- GDPR: Data protection by design

## Recovery Procedures
1. Retrieve encrypted backup from S3
2. Decrypt using KMS
3. Verify checksum
4. Restore to recovery instance
5. Validate data integrity
6. Switch traffic to recovered instance

## Key Rotation Schedule
- Database encryption keys: 90 days
- Backup encryption keys: 90 days  
- TLS certificates: Annual
- SSH keys: 180 days

## Monitoring
- Failed backup alerts: PagerDuty
- Encryption failures: Security team
- Storage usage: CloudWatch alarms

## Testing Schedule
- Weekly: Automated restore tests in staging
- Monthly: Backup integrity verification
- Quarterly: Full disaster recovery drill
