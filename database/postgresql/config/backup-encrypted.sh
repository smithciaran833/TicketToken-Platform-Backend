#!/bin/bash
# Encrypted Database Backup Script

set -e

# Configuration
DB_NAME="tickettoken_db"
DB_USER="postgres"
BACKUP_DIR="/var/backups/postgresql"
S3_BUCKET="tickettoken-backups"
KMS_KEY_ID="${KMS_KEY_ID:-arn:aws:kms:us-east-1:123456789:key/your-key-id}"

# Create backup filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
ENCRYPTED_FILE="${BACKUP_FILE}.enc"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Dump and compress database
echo "Creating database backup..."
pg_dump -h localhost -U "${DB_USER}" -d "${DB_NAME}" | gzip > "${BACKUP_FILE}"

# Encrypt the backup
echo "Encrypting backup..."
openssl enc -aes-256-cbc -salt -in "${BACKUP_FILE}" -out "${ENCRYPTED_FILE}" -pass env:BACKUP_ENCRYPTION_KEY

# Upload to S3
echo "Uploading to S3..."
aws s3 cp "${ENCRYPTED_FILE}" "s3://${S3_BUCKET}/daily/" \
    --sse aws:kms \
    --sse-kms-key-id "${KMS_KEY_ID}"

# Verify upload
aws s3 ls "s3://${S3_BUCKET}/daily/$(basename ${ENCRYPTED_FILE})"

# Clean up local files
echo "Cleaning up local files..."
shred -vfz "${BACKUP_FILE}"
rm -f "${ENCRYPTED_FILE}"

echo "Backup completed successfully"
