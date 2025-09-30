#!/bin/bash
# Set up development environment file

set -euo pipefail

echo "Setting up development environment..."

# Check if .env already exists
if [ -f ".env" ]; then
    echo ".env file already exists. Creating .env.development instead..."
    ENV_FILE=".env.development"
else
    ENV_FILE=".env"
fi

# Create development .env file
cat > "$ENV_FILE" << 'ENV'
# Database Credentials
DB_USER=postgres
DB_PASSWORD=tickettoken_dev_2025
DB_HOST=localhost
DB_PORT=6432
DB_NAME=tickettoken_db

# MongoDB
MONGO_USER=admin
MONGO_PASSWORD=tickettoken_mongo_2025

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# InfluxDB
INFLUX_USER=admin
INFLUX_PASSWORD=tickettoken_influx_2025

# Connection URLs
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
REDIS_URL=redis://${REDIS_HOST}:${REDIS_PORT}
MONGODB_URL=mongodb://${MONGO_USER}:${MONGO_PASSWORD}@localhost:27017/tickettoken

# Application Settings
NODE_ENV=development
APP_PORT=3000
API_PORT=4000

# Security
JWT_SECRET=your_super_secret_jwt_key_change_in_production
ENCRYPTION_KEY=your_32_character_encryption_key_here_change_it

# Blockchain
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=your_wallet_private_key_here
ENV

echo "Created $ENV_FILE with development settings"
echo ""
echo "IMPORTANT: Please update the passwords and secrets before using!"
echo "NEVER commit the .env file to git!"

# Update .gitignore to ensure .env files are not committed
if ! grep -q "^\.env$" .gitignore 2>/dev/null; then
    echo -e "\n# Environment files\n.env\n.env.*" >> .gitignore
    echo "Updated .gitignore to exclude .env files"
fi
