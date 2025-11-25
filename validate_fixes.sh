#!/bin/bash

echo "═══════════════════════════════════════════════════════════"
echo "🔍 TICKETTOKEN DATABASE FIXES VALIDATION"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✅ Found:${NC} $1"
        return 0
    else
        echo -e "${RED}❌ Missing:${NC} $1"
        return 1
    fi
}

# Function to check if directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✅ Directory exists:${NC} $1"
        return 0
    else
        echo -e "${RED}❌ Directory missing:${NC} $1"
        return 1
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 FIX 1: Order Service Integration Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "backend/services/ticket-service/src/clients/OrderServiceClient.ts"
check_file "backend/services/ticket-service/src/sagas/PurchaseSaga.ts"
check_file "backend/services/ticket-service/src/utils/CircuitBreaker.js"
check_file "backend/services/ticket-service/src/controllers/purchaseController.ts"

echo ""
echo "🔍 Checking for USE_ORDER_SERVICE flag..."
if grep -q "USE_ORDER_SERVICE" backend/services/ticket-service/.env 2>/dev/null; then
    echo -e "${GREEN}✅ Found USE_ORDER_SERVICE in .env${NC}"
    grep "USE_ORDER_SERVICE" backend/services/ticket-service/.env
else
    echo -e "${YELLOW}⚠️  USE_ORDER_SERVICE not found in .env${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 FIX 2: Real-time Search CDC Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "backend/shared/src/publishers/searchSyncPublisher.ts"
check_file "backend/services/venue-service/src/services/eventPublisher.ts"
check_file "backend/services/event-service/src/services/event.service.ts"
check_file "backend/services/marketplace-service/src/services/listing.service.ts"

echo ""
echo "🔍 Checking for publishSearchSync usage..."
echo -e "${BLUE}In venue-service:${NC}"
grep -n "publishSearchSync" backend/services/venue-service/src/services/eventPublisher.ts 2>/dev/null | head -3 || echo "Not found"

echo -e "${BLUE}In event-service:${NC}"
grep -n "publishSearchSync" backend/services/event-service/src/services/event.service.ts 2>/dev/null | head -3 || echo "Not found"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 FIX 3: Session Cleanup - Deleted MongoDB Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -d "database/mongodb/collections/sessions" ]; then
    echo -e "${BLUE}Contents of sessions directory:${NC}"
    ls -la database/mongodb/collections/sessions/ 2>/dev/null || echo "Directory exists but is empty or inaccessible"
else
    echo -e "${GREEN}✅ Sessions directory removed${NC}"
fi

# Check if the files that should be deleted are gone
DELETED_FILES=(
    "database/mongodb/collections/sessions/api_sessions.js"
    "database/mongodb/collections/sessions/user_sessions.js"
    "database/mongodb/collections/sessions/device_sessions.js"
    "database/mongodb/collections/sessions/websocket_sessions.js"
)

for file in "${DELETED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${RED}❌ Still exists (should be deleted):${NC} $file"
    else
        echo -e "${GREEN}✅ Deleted:${NC} $file"
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 FIX 4: InfluxDB Integration Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "backend/services/analytics-service/src/services/influxdb.service.ts"

echo ""
echo "🔍 Checking for METRICS_BACKEND flag..."
if grep -q "METRICS_BACKEND" backend/services/analytics-service/.env 2>/dev/null; then
    echo -e "${GREEN}✅ Found METRICS_BACKEND in .env${NC}"
    grep "METRICS_BACKEND" backend/services/analytics-service/.env
else
    echo -e "${YELLOW}⚠️  METRICS_BACKEND not found in .env${NC}"
fi

echo ""
echo "🔍 Checking InfluxDB configuration..."
if grep -q "INFLUXDB" backend/services/analytics-service/.env 2>/dev/null; then
    echo -e "${GREEN}✅ Found InfluxDB config${NC}"
    grep "INFLUXDB" backend/services/analytics-service/.env
else
    echo -e "${YELLOW}⚠️  InfluxDB config not found${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 FIX 5: MongoDB Collections Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${BLUE}Analytics Collections:${NC}"
if check_dir "database/mongodb/collections/analytics"; then
    ls -1 database/mongodb/collections/analytics/ 2>/dev/null | nl
fi

echo ""
echo -e "${BLUE}Content Collections:${NC}"
if check_dir "database/mongodb/collections/content"; then
    ls -1 database/mongodb/collections/content/ 2>/dev/null | nl
fi

echo ""
echo -e "${BLUE}Logs Collections:${NC}"
if check_dir "database/mongodb/collections/logs"; then
    ls -1 database/mongodb/collections/logs/ 2>/dev/null | nl
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🐳 DOCKER SERVICES STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v docker-compose &> /dev/null; then
    echo "Checking running containers..."
    docker-compose ps | grep -E "(influxdb|rabbitmq|redis|mongodb|postgres)" || echo "No matching containers running"
else
    echo -e "${YELLOW}⚠️  docker-compose not found${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 MONGODB INVESTIGATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "🔍 Counting MongoDB collection schema files..."
echo ""

if [ -d "database/mongodb/collections" ]; then
    TOTAL_COLLECTIONS=$(find database/mongodb/collections -type f -name "*.js" | wc -l)
    echo -e "${BLUE}Total MongoDB collection schemas:${NC} $TOTAL_COLLECTIONS"
    
    echo ""
    echo -e "${BLUE}Breakdown by category:${NC}"
    
    for dir in database/mongodb/collections/*/; do
        if [ -d "$dir" ]; then
            category=$(basename "$dir")
            count=$(find "$dir" -type f -name "*.js" | wc -l)
            echo "  📁 $category: $count files"
        fi
    done
    
    echo ""
    echo -e "${BLUE}Full file listing:${NC}"
    find database/mongodb/collections -type f -name "*.js" | sort
    
else
    echo -e "${RED}❌ MongoDB collections directory not found${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 SEARCHING FOR MONGODB USAGE IN SERVICES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Searching for MongoDB connections and usage..."
echo ""

if [ -d "backend/services" ]; then
    echo -e "${BLUE}Services with MongoDB dependencies:${NC}"
    grep -r "mongoose\|mongodb" backend/services/*/package.json 2>/dev/null | cut -d: -f1 | sort -u | while read file; do
        service=$(echo $file | cut -d/ -f3)
        echo "  📦 $service"
    done
    
    echo ""
    echo -e "${BLUE}MongoDB connection strings in code:${NC}"
    grep -r "mongodb://" backend/services --include="*.ts" --include="*.js" 2>/dev/null | head -10 || echo "  None found"
    
    echo ""
    echo -e "${BLUE}Mongoose model imports:${NC}"
    grep -r "mongoose.model\|mongoose.Schema" backend/services --include="*.ts" --include="*.js" 2>/dev/null | wc -l | xargs echo "  Found in files:"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 BUILD STATUS CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "🔍 Checking if services compile..."
echo ""

# Check shared package
if [ -f "backend/shared/package.json" ]; then
    echo -e "${BLUE}Shared package:${NC}"
    if [ -d "backend/shared/dist" ]; then
        echo -e "${GREEN}  ✅ Build output exists${NC}"
        ls -lh backend/shared/dist/*.js 2>/dev/null | head -5 || echo "  No .js files found"
    else
        echo -e "${YELLOW}  ⚠️  No dist/ folder (needs build)${NC}"
    fi
fi

echo ""

# Check analytics service
if [ -f "backend/services/analytics-service/package.json" ]; then
    echo -e "${BLUE}Analytics service:${NC}"
    if [ -d "backend/services/analytics-service/dist" ]; then
        echo -e "${GREEN}  ✅ Build output exists${NC}"
    else
        echo -e "${YELLOW}  ⚠️  No dist/ folder (needs build)${NC}"
    fi
fi

echo ""

# Check ticket service
if [ -f "backend/services/ticket-service/package.json" ]; then
    echo -e "${BLUE}Ticket service:${NC}"
    if [ -d "backend/services/ticket-service/dist" ]; then
        echo -e "${GREEN}  ✅ Build output exists${NC}"
    else
        echo -e "${YELLOW}  ⚠️  No dist/ folder (needs build)${NC}"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 SUMMARY REPORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Validation complete! Review the output above."
echo ""
echo "Next steps:"
echo "  1. Review MongoDB collections status"
echo "  2. Check which services are actually using MongoDB"
echo "  3. Discuss your MongoDB problem"
echo ""
echo "═══════════════════════════════════════════════════════════"

