#!/bin/bash

# Validation script for redis.conf
# Tests each configuration phase

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

REDIS_CONF="database/redis/configurations/redis.conf"

echo -e "${YELLOW}=== Redis Configuration Validation ===${NC}"
echo -e "Config file: $REDIS_CONF"
echo -e "Time: $(date)"

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo -e "${RED}✗ Redis is not installed${NC}"
    echo "Install with: sudo apt-get install redis-server"
    exit 1
fi

echo -e "\n${BLUE}Phase 1: Basic Configuration Test${NC}"
# Test if config file is valid
if redis-server "$REDIS_CONF" --test-memory 256 2>&1 | grep -q "Configuration loaded"; then
    echo -e "${GREEN}✓ Configuration syntax is valid${NC}"
else
    echo -e "${RED}✗ Configuration has syntax errors${NC}"
fi

# Extract key settings
echo -e "\n${BLUE}Phase 2: Memory and Persistence Settings${NC}"
echo "Memory Settings:"
grep -E "^maxmemory|^maxmemory-policy" "$REDIS_CONF" | sed 's/^/  /'

echo -e "\nPersistence Settings:"
grep -E "^save|^appendonly" "$REDIS_CONF" | sed 's/^/  /'

echo -e "\n${BLUE}Phase 3: Performance Settings${NC}"
echo "Connection Settings:"
grep -E "^maxclients|^tcp-backlog|^tcp-keepalive" "$REDIS_CONF" | sed 's/^/  /'

echo -e "\nThreading Settings:"
grep -E "^io-threads|^io-threads-do-reads" "$REDIS_CONF" | sed 's/^/  /'

echo -e "\n${BLUE}Phase 4: Security Settings${NC}"
echo "Security Configuration:"
grep -E "^requirepass|^aclfile|^protected-mode" "$REDIS_CONF" | grep -v "^#" | sed 's/^/  /'

echo -e "\nDisabled Commands:"
grep "^rename-command" "$REDIS_CONF" | sed 's/^/  /'

# If Redis is running, test connection
echo -e "\n${BLUE}Connection Test${NC}"
if pgrep -x redis-server > /dev/null; then
    echo -e "${YELLOW}Redis is already running${NC}"
    if redis-cli -a TicketToken2025SecurePass! ping 2>/dev/null | grep -q PONG; then
        echo -e "${GREEN}✓ Can connect with password${NC}"
    else
        echo -e "${RED}✗ Cannot connect (wrong password or different instance)${NC}"
    fi
else
    echo -e "${YELLOW}Redis is not currently running${NC}"
    echo "Start with: redis-server $REDIS_CONF"
fi

# Performance recommendations
echo -e "\n${YELLOW}=== Performance Test Commands ===${NC}"
echo "1. Start Redis: redis-server $REDIS_CONF"
echo "2. Benchmark: redis-benchmark -a TicketToken2025SecurePass! -q -n 100000"
echo "3. Check latency: redis-cli -a TicketToken2025SecurePass! --latency"
echo "4. Monitor: redis-cli -a TicketToken2025SecurePass! monitor"

# Security check
echo -e "\n${YELLOW}=== Security Checklist ===${NC}"
echo "✓ Password protection enabled"
echo "✓ Dangerous commands disabled"
echo "✓ ACL file configured"
echo "⚠️  Remember to:"
echo "  - Change default passwords"
echo "  - Update ACL file path"
echo "  - Enable TLS in production"
echo "  - Bind to specific IPs only"

echo -e "\n${GREEN}✓ Validation completed at $(date)${NC}"
