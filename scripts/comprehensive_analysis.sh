#!/bin/bash

echo "========================================="
echo "TICKETTOKEN PLATFORM COMPREHENSIVE ANALYSIS"
echo "Generated: $(date)"
echo "========================================="

echo -e "\n=== DOCKER COMPOSE MAIN FILE ==="
cat docker-compose.yml

echo -e "\n=== ENVIRONMENT FILES ==="
echo "--- Main .env ---"
cat .env
echo -e "\n--- .env.example ---"
cat .env.example

echo -e "\n=== BACKEND SERVICES STRUCTURE ==="
find backend -type f -name "*.js" -o -name "*.ts" -o -name "*.json" | head -50

echo -e "\n=== SERVICE DOCKERFILES ==="
for dockerfile in $(find . -name "Dockerfile*" -type f); do
    echo -e "\n--- $dockerfile ---"
    cat "$dockerfile"
done

echo -e "\n=== PACKAGE.JSON FILES ==="
for pkg in $(find . -name "package.json" -type f | grep -v node_modules); do
    echo -e "\n--- $pkg ---"
    cat "$pkg"
done

echo -e "\n=== DATABASE SCHEMAS ==="
find database -name "*.sql" -o -name "*.js" -o -name "*.ts" | while read file; do
    echo -e "\n--- $file ---"
    head -50 "$file"
done

echo -e "\n=== DOCKER CONTAINER LOGS (last 20 lines each) ==="
for container in $(docker ps --format "{{.Names}}"); do
    echo -e "\n--- $container ---"
    docker logs "$container" 2>&1 | tail -20
done

echo -e "\n=== DOCKER INSPECT NETWORK ==="
docker network inspect tickettoken-platformclean_tickettoken-network

echo -e "\n=== RABBITMQ QUEUES ==="
docker exec tickettoken-rabbitmq rabbitmqctl list_queues 2>/dev/null || echo "Could not access RabbitMQ"

echo -e "\n=== REDIS KEYS ==="
docker exec tickettoken-redis redis-cli KEYS '*' | head -20

echo -e "\n=== POSTGRES DATABASES ==="
docker exec tickettoken-postgres psql -U postgres -c "\l"

echo -e "\n=== POSTGRES TABLES ==="
docker exec tickettoken-postgres psql -U postgres -d tickettoken -c "\dt" 2>/dev/null || echo "Database might not exist yet"

echo -e "\n=== MONGODB COLLECTIONS ==="
docker exec tickettoken-mongodb mongosh --eval "db.adminCommand('listDatabases')" --quiet

echo -e "\n=== API GATEWAY ROUTES ==="
find . -path "*/api-gateway/*" -name "*.js" -o -name "*.ts" | xargs grep -l "route\|Route\|router" | head -10 | while read file; do
    echo -e "\n--- $file ---"
    grep -A2 -B2 "route\|Route\|router\|app\." "$file" | head -30
done

echo -e "\n=== TEST SCRIPTS OVERVIEW ==="
for script in test-*.sh; do
    echo -e "\n--- $script ---"
    head -20 "$script"
done

echo -e "\n=== INFRASTRUCTURE CONFIG ==="
find infrastructure -type f -name "*.yml" -o -name "*.yaml" -o -name "*.conf" | while read file; do
    echo -e "\n--- $file ---"
    cat "$file"
done

echo -e "\n=== SMART CONTRACTS ==="
find smart-contracts -name "*.sol" -o -name "*.js" -o -name "*.ts" | head -10 | while read file; do
    echo -e "\n--- $file ---"
    head -30 "$file"
done

echo -e "\n=== MONITORING & OPERATIONS ==="
ls -la operations/
ls -la scripts/monitoring/

echo -e "\n=== SERVICE DEPENDENCIES (from package.json files) ==="
find . -name "package.json" -type f | grep -v node_modules | while read pkg; do
    echo -e "\n--- $pkg dependencies ---"
    grep -A20 '"dependencies"' "$pkg" || true
done

echo -e "\n=== DOCKER COMPOSE ENVIRONMENT VARIABLES ==="
docker-compose config

echo -e "\n=== RUNNING PROCESSES IN CONTAINERS ==="
for container in $(docker ps --format "{{.Names}}" | head -5); do
    echo -e "\n--- Processes in $container ---"
    docker exec "$container" ps aux 2>/dev/null | head -10 || echo "Could not get processes"
done

echo -e "\n=== SERVICE PORTS MAPPING ==="
docker ps --format "table {{.Names}}\t{{.Ports}}"

echo -e "\n=== HOST SYSTEM SERVICES (non-Docker) ==="
ps aux | grep -E "node|npm|influx|pgbouncer|redis-sentinel" | grep -v grep | grep -v docker

echo -e "\n=== NGINX/GATEWAY CONFIG ==="
find . -name "nginx.conf" -o -name "*gateway*.conf" | while read file; do
    echo -e "\n--- $file ---"
    cat "$file"
done

echo "========================================="
echo "END OF COMPREHENSIVE ANALYSIS"
echo "========================================="
