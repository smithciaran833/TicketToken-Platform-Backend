#!/bin/bash

echo "🔧 Setting up comprehensive auth service tests..."
echo ""

# Install required dependencies if missing
echo "Checking dependencies..."
DEPS_TO_INSTALL=()

if ! npm list pg >/dev/null 2>&1; then
    DEPS_TO_INSTALL+=("pg")
fi

if ! npm list @types/pg >/dev/null 2>&1; then
    DEPS_TO_INSTALL+=("@types/pg")
fi

if ! npm list bcrypt >/dev/null 2>&1; then
    DEPS_TO_INSTALL+=("bcrypt")
fi

if [ ${#DEPS_TO_INSTALL[@]} -gt 0 ]; then
    echo "Installing: ${DEPS_TO_INSTALL[*]}"
    npm install --save-dev ${DEPS_TO_INSTALL[@]}
    echo "✓ Dependencies installed"
else
    echo "✓ All dependencies present"
fi
echo ""

# Update tests/setup.ts
echo "Updating tests/setup.ts..."
cat > tests/setup.ts << 'SETUP'
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'tickettoken_db';
process.env.DB_USER = process.env.DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret-min-32-chars-long';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-min-32-chars-long';
jest.setTimeout(10000);
global.console.log = jest.fn();
SETUP
echo "✓ tests/setup.ts updated"
echo ""

echo "✅ Setup complete!"
echo ""
echo "Next: ./run-tests.sh"
