#!/bin/bash

# ============================================
# GENERATE SSL CERTIFICATES FOR POSTGRESQL
# ============================================
# This script generates self-signed SSL certificates for PostgreSQL
# For development/testing use only - use proper certificates in production
#
# USAGE:
#   cd database/postgresql/certs
#   chmod +x generate_ssl_certs.sh
#   ./generate_ssl_certs.sh
#
# WHAT THIS DOES:
#   1. Generates a private key
#   2. Creates a certificate signing request (CSR)
#   3. Generates a self-signed certificate
#   4. Sets proper permissions
# ============================================

set -e

echo "=================================================="
echo "Generating SSL Certificates for PostgreSQL"
echo "=================================================="
echo ""

# Certificate details
DAYS=365
COUNTRY="US"
STATE="California"
CITY="San Francisco"
ORG="TicketToken"
OU="Development"
CN="localhost"

echo "Generating certificates with:"
echo "  Country: $COUNTRY"
echo "  State: $STATE"
echo "  City: $CITY"
echo "  Organization: $ORG"
echo "  Common Name: $CN"
echo "  Valid for: $DAYS days"
echo ""

# Generate private key
echo "Step 1/3: Generating private key..."
openssl genrsa -out server.key 2048
chmod 600 server.key
echo "✓ Private key generated: server.key"

# Generate certificate signing request
echo ""
echo "Step 2/3: Generating certificate signing request..."
openssl req -new -key server.key -out server.csr -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORG/OU=$OU/CN=$CN"
echo "✓ CSR generated: server.csr"

# Generate self-signed certificate
echo ""
echo "Step 3/3: Generating self-signed certificate..."
openssl x509 -req -days $DAYS -in server.csr -signkey server.key -out server.crt
chmod 644 server.crt
echo "✓ Certificate generated: server.crt"

# Create root certificate (copy of server cert for development)
cp server.crt root.crt
chmod 644 root.crt
echo "✓ Root certificate created: root.crt"

# Clean up CSR
rm server.csr

echo ""
echo "=================================================="
echo "SSL Certificates Generated Successfully!"
echo "=================================================="
echo ""
echo "Files created:"
echo "  - server.key (private key, 600 permissions)"
echo "  - server.crt (certificate, 644 permissions)"
echo "  - root.crt (root certificate, 644 permissions)"
echo ""
echo "⚠️  IMPORTANT FOR PRODUCTION:"
echo "  1. Replace these self-signed certificates with proper CA-signed certificates"
echo "  2. Store private keys securely (preferably in a secrets manager)"
echo "  3. Set up certificate rotation"
echo " 4. Use environment-specific certificates"
echo ""
echo "Next steps:"
echo "  1. Update docker-compose.yml to mount these certificates"
echo "  2. Update PostgreSQL config to use SSL"
echo "  3. Restart PostgreSQL container"
echo ""
