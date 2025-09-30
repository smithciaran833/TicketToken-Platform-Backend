#!/bin/bash
# Setup WAL archiving for Point-in-Time Recovery

set -euo pipefail

WAL_ARCHIVE_DIR="/var/lib/postgresql/wal_archive"

echo "Setting up WAL archiving..."

# Create archive directory
sudo mkdir -p "$WAL_ARCHIVE_DIR"
sudo chown postgres:postgres "$WAL_ARCHIVE_DIR"

# Update postgresql.conf
cat >> postgresql/postgresql.conf << 'CONF'

# WAL Archiving Configuration
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/wal_archive/%f && cp %p /var/lib/postgresql/wal_archive/%f'
archive_timeout = 300
max_wal_senders = 3
wal_keep_size = 1GB
CONF

echo "WAL archiving configuration added to postgresql.conf"
echo "Restart PostgreSQL to apply changes: docker-compose restart postgres"
