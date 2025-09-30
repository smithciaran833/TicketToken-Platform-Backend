#!/bin/bash

# Helper script to set up a 6-node Redis cluster
# For demonstration/testing purposes

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}=== Redis Cluster Setup Helper ===${NC}"
echo "This script demonstrates how to set up a 6-node Redis cluster"

# Function to create node config
create_node_config() {
    local port=$1
    cat > redis-${port}.conf << CONFIG
port ${port}
cluster-enabled yes
cluster-config-file nodes-${port}.conf
cluster-node-timeout 15000
cluster-replica-validity-factor 10
cluster-migration-barrier 1
cluster-require-full-coverage yes
bind 127.0.0.1
protected-mode no
dir ./${port}/
daemonize yes
pidfile redis-${port}.pid
logfile redis-${port}.log
maxmemory 512mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
appendonly yes
CONFIG
    mkdir -p ${port}
    echo -e "${GREEN}✓ Created config for node ${port}${NC}"
}

# Show what would be done
echo -e "\n${BLUE}To create a production cluster:${NC}"
echo "1. Create 6 node configurations (ports 7000-7005)"
echo "2. Start all 6 Redis instances"
echo "3. Use redis-cli to create the cluster"
echo ""
echo "Example commands:"
echo ""
echo "# Create configs"
for port in {7000..7005}; do
    echo "create_node_config $port"
done
echo ""
echo "# Start nodes"
for port in {7000..7005}; do
    echo "redis-server redis-${port}.conf"
done
echo ""
echo "# Create cluster (3 masters, 3 replicas)"
echo "redis-cli --cluster create \\"
echo "  127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002 \\"
echo "  127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 \\"
echo "  --cluster-replicas 1"
echo ""
echo "# Check cluster"
echo "redis-cli -p 7000 cluster info"
echo "redis-cli -p 7000 cluster nodes"

echo -e "\n${YELLOW}Note: This is a demonstration script.${NC}"
echo "For production, adjust paths, memory, and security settings."
