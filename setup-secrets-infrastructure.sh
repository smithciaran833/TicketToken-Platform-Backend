#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "🔐 Setting up Secrets Infrastructure"
echo "======================================"
echo ""

# List of all services
SERVICES=(
  "api-gateway"
  "auth-service"
  "venue-service"
  "event-service"
  "ticket-service"
  "order-service"
  "payment-service"
  "notification-service"
  "queue-service"
  "scanning-service"
  "analytics-service"
  "blockchain-service"
  "blockchain-indexer"
  "file-service"
  "compliance-service"
  "integration-service"
  "marketplace-service"
  "monitoring-service"
  "minting-service"
  "transfer-service"
  "search-service"
)

SERVICES_DIR="backend/services"

# Counter for success/failures
SUCCESS=0
FAILED=0

for SERVICE in "${SERVICES[@]}"; do
  SERVICE_PATH="$SERVICES_DIR/$SERVICE"
  
  echo "----------------------------------------"
  echo "📦 Processing: $SERVICE"
  echo "----------------------------------------"
  
  # Check if service exists
  if [ ! -d "$SERVICE_PATH" ]; then
    echo -e "${RED}❌ Service directory not found: $SERVICE_PATH${NC}"
    ((FAILED++))
    continue
  fi
  
  cd "$SERVICE_PATH"
  
  # Step 1: Install dotenv
  echo "  → Installing dotenv..."
  if npm install dotenv --save 2>/dev/null; then
    echo -e "  ${GREEN}✓ dotenv installed${NC}"
  else
    echo -e "  ${RED}✗ Failed to install dotenv${NC}"
    cd - > /dev/null
    ((FAILED++))
    continue
  fi
  
  # Step 2: Create config directory if it doesn't exist
  mkdir -p src/config
  
  # Step 3: Create secrets.ts file
  echo "  → Creating secrets loader..."
  cat > src/config/secrets.ts << 'SECRETS_EOF'
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { secretsManager } from '../../../../shared/utils/secrets-manager';
import { SECRETS_CONFIG } from '../../../../shared/config/secrets.config';

export async function loadSecrets() {
  const serviceName = process.env.SERVICE_NAME || 'unknown-service';
  console.log(`[${serviceName}] Loading secrets...`);
  
  try {
    // Common secrets needed by most services
    const commonSecrets = [
      SECRETS_CONFIG.POSTGRES_PASSWORD,
      SECRETS_CONFIG.POSTGRES_USER,
      SECRETS_CONFIG.POSTGRES_DB,
      SECRETS_CONFIG.REDIS_PASSWORD,
    ];
    
    const secrets = await secretsManager.getSecrets(commonSecrets);
    
    console.log(`[${serviceName}] ✅ Secrets loaded successfully`);
    
    return secrets;
  } catch (error: any) {
    console.error(`[${serviceName}] ❌ Failed to load secrets:`, error.message);
    throw new Error('Cannot start service without required secrets');
  }
}
SECRETS_EOF
  
  if [ -f "src/config/secrets.ts" ]; then
    echo -e "  ${GREEN}✓ secrets.ts created${NC}"
  else
    echo -e "  ${RED}✗ Failed to create secrets.ts${NC}"
    cd - > /dev/null
    ((FAILED++))
    continue
  fi
  
  echo -e "${GREEN}✅ $SERVICE setup complete${NC}"
  ((SUCCESS++))
  
  # Go back to root
  cd - > /dev/null
done

echo ""
echo "======================================"
echo "📊 Summary"
echo "======================================"
echo -e "${GREEN}✅ Successful: $SUCCESS${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 All services configured successfully!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Wait for AWS account verification"
  echo "2. Run: aws configure"
  echo "3. Create secrets in AWS"
  echo "4. Update each service's index.ts to call loadSecrets()"
else
  echo -e "${YELLOW}⚠️  Some services failed. Check the output above.${NC}"
fi
