# OPERATIONS SCRIPTS PRODUCTION READINESS AUDIT

**Date:** November 18, 2025  
**Auditor:** Platform Operations Team  
**Component:** Operations Scripts (operations/scripts/)  
**Files Audited:** deploy.sh, health.sh, monitor.sh, smoke.sh  
**Status:** 🔴 **CRITICAL SECURITY ISSUES - NOT PRODUCTION-READY**

---

## EXECUTIVE SUMMARY

Your operations scripts are **placeholder stubs** that appear to be early development artifacts. They contain **critical security vulnerabilities** and lack the functionality needed for production operations. Most concerning: **hardcoded passwords in plain text**.

### Critical Reality Check

**🔴 SECURITY CATASTROPHE:**
- **`smoke.sh` contains hardcoded database password** in plain text
- This file is likely in Git history → password is public
- Must rotate database password immediately

**FUNCTIONALITY GAPS:**
- `deploy.sh` - Just echo statements, does nothing
- `health.sh` - Checks only 3 of 20+ services
- `monitor.sh` - Infinite loop, no exit condition
- `smoke.sh` - Only 2 basic checks, missing 18+ services

### Overall Operations Scripts Score: **1/10** 🔴

**Bottom Line:** These scripts are **dangerous to use in production**. The hardcoded password is a security incident waiting to happen. Complete rewrite needed.

---

## 1. DEPLOY.SH - DEPLOYMENT SCRIPT

**Location:** `operations/scripts/deploy.sh`  
**Status:** 🔴 **NON-FUNCTIONAL PLACEHOLDER**  
**Confidence: 10/10** (It literally does nothing)

### Current Code

```bash
#!/bin/bash
echo "Deploying TicketToken Platform..."
echo "1. Checking services..."
echo "2. Running migrations..."
echo "3. Starting services..."
echo "Deployment complete!"
```

### 🔴 Critical Issues

**1. Does Absolutely Nothing**
- Just prints text, no actual deployment logic
- Running this script would give false confidence
- Could lead to thinking deployment succeeded when it didn't

**2. Missing All Required Functionality**
- No environment validation
- No pre-deployment checks
- No migration execution
- No service restarts
- No health verification
- No rollback capability
- No notifications
- No logging

**3. No Error Handling**
```bash
# Missing basic safety:
set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure
```

### What Production Deployment Should Do

```bash
#!/bin/bash
set -euo pipefail

# Configuration
ENVIRONMENT="${1:-staging}"
VERSION="${2:-$(git rev-parse --short HEAD)}"
ROLLBACK="${3:-false}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/deployments/deploy_${TIMESTAMP}.log"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Error handling
trap 'log "ERROR: Deployment failed on line $LINENO"; rollback_deployment; exit 1' ERR

log "Starting deployment to $ENVIRONMENT (version: $VERSION)"

# 1. Pre-deployment validation
log "Step 1/8: Validating environment..."
validate_environment() {
    # Check required environment variables
    required_vars=("DATABASE_URL" "REDIS_URL" "JWT_SECRET")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            log "ERROR: Missing required variable: $var"
            exit 1
        fi
    done
    
    # Check disk space (need at least 10GB)
    available=$(df -BG / | tail -1 | awk '{print $4}' | sed 's/G//')
    if [ "$available" -lt 10 ]; then
        log "ERROR: Insufficient disk space: ${available}GB available"
        exit 1
    fi
    
    log "✓ Environment validation passed"
}
validate_environment

# 2. Backup current state
log "Step 2/8: Creating backup..."
backup_database() {
    pg_dump "$DATABASE_URL" | gzip > "/backups/db_${TIMESTAMP}.sql.gz"
    log "✓ Database backup created"
}
backup_database

# 3. Run database migrations
log "Step 3/8: Running database migrations..."
run_migrations() {
    ./run-all-migrations.sh || {
        log "ERROR: Migration failed"
        exit 1
    }
    log "✓ Migrations completed"
}
run_migrations

# 4. Build and tag Docker images
log "Step 4/8: Building Docker images..."
build_images() {
    docker-compose build || {
        log "ERROR: Docker build failed"
        exit 1
    }
    
    # Tag images with version
    docker tag tickettoken-api-gateway:latest "tickettoken-api-gateway:${VERSION}"
    log "✓ Images built and tagged"
}
build_images

# 5. Stop old services gracefully
log "Step 5/8: Stopping services..."
stop_services() {
    docker-compose down --timeout 30 || {
        log "WARN: Graceful shutdown failed, forcing..."
        docker-compose down --timeout 5
    }
    log "✓ Services stopped"
}
stop_services

# 6. Start new services
log "Step 6/8: Starting services..."
start_services() {
    docker-compose up -d || {
        log "ERROR: Failed to start services"
        exit 1
    }
    log "✓ Services started"
}
start_services

# 7. Wait for services to be healthy
log "Step 7/8: Waiting for services to be healthy..."
wait_for_health() {
    local max_attempts=60
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost:3000/health > /dev/null; then
            log "✓ Services are healthy"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    
    log "ERROR: Services failed health check after ${max_attempts} attempts"
    return 1
}
wait_for_health

# 8. Run smoke tests
log "Step 8/8: Running smoke tests..."
run_smoke_tests() {
    ./operations/scripts/smoke.sh || {
        log "ERROR: Smoke tests failed"
        exit 1
    }
    log "✓ Smoke tests passed"
}
run_smoke_tests

# Success notification
log "✓ Deployment completed successfully"
notify_success() {
    # Send to Slack/Discord/Email
    curl -X POST "$SLACK_WEBHOOK" \
        -d "{\"text\":\"✅ Deployment to $ENVIRONMENT completed successfully (version: $VERSION)\"}"
}
notify_success

# Cleanup old images
docker image prune -af --filter "until=72h" || true

log "Deployment complete. Check logs at $LOG_FILE"
```

### Required Production Features

**1. Environment Validation**
- Check all required environment variables exist
- Validate database connectivity
- Check disk space
- Verify Docker daemon running
- Confirm all services are present

**2. Pre-Deployment Backup**
- Database snapshot
- Current Docker images
- Configuration files
- Ability to rollback

**3. Migration Management**
```bash
# Track migration state
# Run only new migrations
# Verify migration success
# Rollback capability
```

**4. Zero-Downtime Deployment**
```bash
# Blue/green deployment:
# 1. Spin up new services (green)
# 2. Wait for health checks
# 3. Switch traffic from old (blue) to new (green)
# 4. Keep old running for 5 minutes (quick rollback)
# 5. Shut down old
```

**5. Health Verification**
- Wait for all services to pass health checks
- Verify database connectivity
- Check Redis connection
- Test API endpoints

**6. Smoke Tests**
- Run critical path tests
- Verify authentication works
- Test payment processing
- Check read/write operations

**7. Rollback Capability**
```bash
rollback_deployment() {
    log "CRITICAL: Rolling back deployment"
    
    # Restore previous Docker images
    docker-compose down
    docker tag "tickettoken-api-gateway:${PREVIOUS_VERSION}" \
               "tickettoken-api-gateway:latest"
    docker-compose up -d
    
    # Restore database if needed
    if [ -f "/backups/db_${TIMESTAMP}.sql.gz" ]; then
        gunzip < "/backups/db_${TIMESTAMP}.sql.gz" | psql "$DATABASE_URL"
    fi
    
    # Notify team
    curl -X POST "$SLACK_WEBHOOK" \
        -d '{"text":"⚠️ ROLLBACK: Deployment to '"$ENVIRONMENT"' was rolled back"}'
}
```

**8. Notifications**
- Slack/Discord/Email on start
- Progress updates for long operations
- Success notification
- Failure alerts with details
- Rollback notifications

**9. Logging & Audit Trail**
- Log all actions with timestamps
- Save logs to persistent storage
- Include deployment metadata (version, user, time)
- Track deployment history

**10. Deployment Locks**
```bash
# Prevent concurrent deployments
LOCK_FILE="/tmp/deployment.lock"
if [ -f "$LOCK_FILE" ]; then
    log "ERROR: Another deployment is in progress"
    exit 1
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT
```

### Recommendations

1. **URGENT**: Replace with functional deployment script (40 hours)
2. Implement rollback mechanism (8 hours)
3. Add health check verification (4 hours)
4. Set up deployment notifications (4 hours)
5. Create deployment runbook (8 hours)
6. Test deployment on staging (16 hours)

**Total Effort:** 80 hours (~2 weeks)

---

## 2. HEALTH.SH - HEALTH CHECK SCRIPT

**Location:** `operations/scripts/health.sh`  
**Status:** 🟡 **BASIC BUT INCOMPLETE**  
**Confidence: 8/10**

### Current Code

```bash
#!/bin/bash
echo "Health Check"
echo "============"
nc -zv localhost 5432 2>&1 | grep succeeded && echo "✓ PostgreSQL" || echo "✗ PostgreSQL"
nc -zv localhost 6379 2>&1 | grep succeeded && echo "✓ Redis" || echo "✗ Redis"
nc -zv localhost 3000 2>&1 | grep succeeded && echo "✓ API Gateway" || echo "✗ API Gateway"
```

### What Works

✅ Uses `netcat` for port checking (correct tool)  
✅ Has basic output formatting  
✅ Checks critical infrastructure (PostgreSQL, Redis)  
✅ Checks API Gateway  

### 🔴 Critical Issues

**1. Only Checks 3 of 20+ Services**

Missing health checks for:
- auth-service (:3001)
- venue-service (:3002)
- event-service (:3003)
- ticket-service (:3004)
- order-service (:3005)
- payment-service (:3006)
- notification-service (:3007)
- queue-service (:3011)
- scanning-service (:3008)
- analytics-service (:3009)
- blockchain-service (:3010)
- file-service (:3012)
- compliance-service (:3013)
- integration-service (:3014)
- marketplace-service (:3015)
- monitoring-service (:3016)
- minting-service (:3017)
- transfer-service (:3018)
- search-service (:3019)
- MongoDB (:27017)
- Elasticsearch (:9200)
- RabbitMQ (:5672)

**2. Port Check ≠ Health Check**

```bash
# Current: Just checks if port is open
nc -zv localhost 3000

# Problem: Port could be open but service crashed
# Example: Node process hung, port open, but not responding
```

**3. No Exit Code**

```bash
# Current script always exits with 0 (success)
# Even if all services are down!

# Should exit with non-zero if any service is unhealthy
```

**4. No JSON Output for Automation**

Can't parse output programmatically for monitoring systems.

**5. No Timeout Handling**

`netcat` could hang indefinitely if network issues.

### Production-Grade Health Check Script

```bash
#!/bin/bash
set -euo pipefail

# Configuration
TIMEOUT=5
FAIL_COUNT=0
OUTPUT_FORMAT="${1:-text}"  # text or json

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Results array for JSON output
declare -a results

# Health check function
check_service() {
    local name="$1"
    local host="${2:-localhost}"
    local port="$3"
    local endpoint="${4:-/health}"
    local method="${5:-port}"  # port or http
    
    local status="unknown"
    local response_time=0
    local message=""
    
    case "$method" in
        "port")
            # Port-based check
            if timeout $TIMEOUT nc -z "$host" "$port" 2>/dev/null; then
                status="healthy"
                message="Port $port is open"
            else
                status="unhealthy"
                message="Port $port is closed or unreachable"
                FAIL_COUNT=$((FAIL_COUNT + 1))
            fi
            ;;
        "http")
            # HTTP endpoint check with response time
            start_time=$(date +%s%N)
            if http_code=$(timeout $TIMEOUT curl -sf -o /dev/null -w "%{http_code}" \
                "http://$host:$port$endpoint" 2>/dev/null); then
                end_time=$(date +%s%N)
                response_time=$(( (end_time - start_time) / 1000000 ))
                
                if [ "$http_code" = "200" ]; then
                    status="healthy"
                    message="HTTP 200 OK (${response_time}ms)"
                else
                    status="unhealthy"
                    message="HTTP $http_code (${response_time}ms)"
                    FAIL_COUNT=$((FAIL_COUNT + 1))
                fi
            else
                status="unhealthy"
                message="Connection failed or timeout"
                FAIL_COUNT=$((FAIL_COUNT + 1))
            fi
            ;;
    esac
    
    # Store result
    results+=("{\"service\":\"$name\",\"status\":\"$status\",\"message\":\"$message\",\"response_time\":$response_time}")
    
    # Print result (text format)
    if [ "$OUTPUT_FORMAT" = "text" ]; then
        if [ "$status" = "healthy" ]; then
            echo -e "${GREEN}✓${NC} $name: $message"
        else
            echo -e "${RED}✗${NC} $name: $message"
        fi
    fi
}

echo "TicketToken Platform Health Check"
echo "=================================="
echo ""

# Infrastructure
echo "Infrastructure Services:"
check_service "PostgreSQL" "localhost" "5432" "" "port"
check_service "Redis" "localhost" "6379" "" "port"
check_service "MongoDB" "localhost" "27017" "" "port"
check_service "RabbitMQ" "localhost" "5672" "" "port"
check_service "Elasticsearch" "localhost" "9200" "/_cluster/health" "http"

echo ""
echo "Application Services:"
# Core Services
check_service "API Gateway" "localhost" "3000" "/health" "http"
check_service "Auth Service" "localhost" "3001" "/health" "http"
check_service "Venue Service" "localhost" "3002" "/health" "http"
check_service "Event Service" "localhost" "3003" "/health" "http"
check_service "Ticket Service" "localhost" "3004" "/health" "http"
check_service "Order Service" "localhost" "3005" "/health" "http"
check_service "Payment Service" "localhost" "3006" "/health" "http"
check_service "Notification Service" "localhost" "3007" "/health" "http"
check_service "Scanning Service" "localhost" "3008" "/health" "http"
check_service "Analytics Service" "localhost" "3009" "/health" "http"
check_service "Blockchain Service" "localhost" "3010" "/health" "http"
check_service "Queue Service" "localhost" "3011" "/health" "http"
check_service "File Service" "localhost" "3012" "/health" "http"
check_service "Compliance Service" "localhost" "3013" "/health" "http"
check_service "Integration Service" "localhost" "3014" "/health" "http"
check_service "Marketplace Service" "localhost" "3015" "/health" "http"
check_service "Monitoring Service" "localhost" "3016" "/health" "http"
check_service "Minting Service" "localhost" "3017" "/health" "http"
check_service "Transfer Service" "localhost" "3018" "/health" "http"
check_service "Search Service" "localhost" "3019" "/health" "http"

echo ""
echo "=================================="

# Summary
if [ "$OUTPUT_FORMAT" = "text" ]; then
    total_services=${#results[@]}
    healthy_services=$((total_services - FAIL_COUNT))
    
    if [ $FAIL_COUNT -eq 0 ]; then
        echo -e "${GREEN}✓ All services healthy ($total_services/$total_services)${NC}"
    else
        echo -e "${RED}✗ $FAIL_COUNT services unhealthy ($healthy_services/$total_services healthy)${NC}"
    fi
elif [ "$OUTPUT_FORMAT" = "json" ]; then
    # Output JSON for monitoring systems
    echo "{"
    echo "  \"timestamp\": \"$(date -Iseconds)\","
    echo "  \"total_services\": ${#results[@]},"
    echo "  \"unhealthy_count\": $FAIL_COUNT,"
    echo "  \"services\": ["
    first=true
    for result in "${results[@]}"; do
        if [ "$first" = true ]; then
            first=false
        else
            echo ","
        fi
        echo "    $result"
    done
    echo ""
    echo "  ]"
    echo "}"
fi

# Exit with error if any service is unhealthy
exit $((FAIL_COUNT > 0 ? 1 : 0))
```

### Production Features Needed

**1. HTTP Health Endpoints**
- Check actual HTTP /health endpoints
- Measure response time
- Verify service is responding correctly

**2. Detailed Service Checks**
```bash
# Database: Run actual query
psql -c "SELECT 1" > /dev/null

# Redis: Run PING command
redis-cli PING | grep PONG

# RabbitMQ: Check queue management API
curl -u guest:guest http://localhost:15672/api/overview
```

**3. Dependency Checks**
```bash
# Check if service can reach its dependencies
# e.g., auth-service should be able to reach postgres and redis
```

**4. JSON Output for Monitoring**
```json
{
  "timestamp": "2025-11-18T15:55:00Z",
  "total_services": 25,
  "unhealthy_count": 2,
  "services": [
    {
      "service": "API Gateway",
      "status": "healthy",
      "response_time": 45,
      "message": "HTTP 200 OK"
    },
    {
      "service": "Payment Service",
      "status": "unhealthy",
      "response_time": 5000,
      "message": "Connection timeout"
    }
  ]
}
```

**5. Exit Codes**
```bash
# 0 = All healthy
# 1 = Some unhealthy
# 2 = Critical failure (postgres/redis down)
```

**6. Integration with Monitoring**
```bash
# Send results to Prometheus/Grafana
# Alert on failures
# Track response times over time
```

### Recommendations

1. Add all 20+ services to health check (4 hours)
2. Switch from port checks to HTTP health endpoints (4 hours)
3. Add response time measurement (2 hours)
4. Implement JSON output format (2 hours)
5. Add proper exit codes (1 hour)
6. Integrate with monitoring system (4 hours)

**Total Effort:** 17 hours (~2 days)

---

## 3. MONITOR.SH - MONITORING SCRIPT

**Location:** `operations/scripts/monitor.sh`  
**Status:** 🟡 **FUNCTIONAL BUT LIMITED**  
**Confidence: 7/10**

### Current Code

```bash
#!/bin/bash
while true; do
  clear
  echo "Platform Monitor - $(date)"
  echo "========================"
  ps aux | grep node | wc -l | xargs echo "Node processes:"
  free -h | grep Mem | awk "{print \"Memory: \" \$3 \"/\" \$2}"
  df -h / | tail -1 | awk "{print \"Disk: \" \$3 \"/\" \$2}"
  sleep 5
done
```

### What Works

✅ Runs continuously  
✅ Shows timestamp  
✅ Monitors system resources  
✅ Updates every 5 seconds  

### Issues

**1. No Exit Condition**
```bash
# Runs forever with no way to exit except CTRL+C
# No graceful shutdown
# No cleanup
```

**2. Limited Metrics**
- Only counts Node processes (not useful)
- Memory: Just used/total (no percentage)
- Disk: Only root partition
- Missing: CPU, network, service status

**3. grep node Counts Wrong**
```bash
ps aux | grep node | wc -l
# This counts:
# - All node processes
# - The grep command itself (false positive)
# - May count unrelated processes with "node" in name
```

**4. No Alerting**
```bash
# No alerts when:
# - Memory > 90%
# - Disk > 90%
# - CPU > 90%
# - Services down
```

**5. No Historical Data**
```bash
# Just shows current state
# Can't see trends
# Can't detect spikes
```

### Production Monitoring Script

```bash
#!/bin/bash
set -euo pipefail

# Configuration
ALERT_THRESHOLD_CPU=80
ALERT_THRESHOLD_MEM=85
ALERT_THRESHOLD_DISK=90
REFRESH_INTERVAL=5
LOG_FILE="/var/log/platform-monitor.log"
ALERT_SENT=0

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Cleanup on exit
cleanup() {
    clear
    echo "Monitor stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Alert function
send_alert() {
    local severity="$1"
    local message="$2"
    
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ALERT: $message" >> "$LOG_FILE"
    
    # Send to Slack/PagerDuty (only once per issue)
    if [ $ALERT_SENT -eq 0 ]; then
        curl -X POST "$SLACK_WEBHOOK" \
            -d "{\"text\":\"⚠️ $severity: $message\"}" 2>/dev/null || true
        ALERT_SENT=1
    fi
}

# Get metrics
get_cpu_usage() {
    top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1
}

get_memory_usage() {
    free | grep Mem | awk '{printf "%.1f", ($3/$2) * 100}'
}

get_disk_usage() {
    df -h / | tail -1 | awk '{print $5}' | sed 's/%//'
}

count_services() {
    # Count actual Docker containers
    docker ps --filter "name=tickettoken" | grep -v CONTAINER | wc -l
}

get_service_status() {
    local service="$1"
    if docker ps --filter "name=$service" | grep -q "$service"; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        send_alert "CRITICAL" "Service $service is down"
    fi
}

# Main monitoring loop
while true; do
    clear
    echo "═══════════════════════════════════════════════════════"
    echo "  TicketToken Platform Monitor - $(date +'%Y-%m-%d %H:%M:%S')"
    echo "═══════════════════════════════════════════════════════"
    echo ""
    
    # System Resources
    echo "SYSTEM RESOURCES:"
    echo "───────────────────────────────────────────────────────"
    
    # CPU
    cpu=$(get_cpu_usage)
    cpu_int=${cpu%.*}
    if [ "$cpu_int" -gt $ALERT_THRESHOLD_CPU ]; then
        echo -e "CPU Usage:    ${RED}${cpu}%${NC} ⚠️  HIGH"
        send_alert "WARNING" "High CPU usage: ${cpu}%"
    else
        echo -e "CPU Usage:    ${GREEN}${cpu}%${NC}"
    fi
    
    # Memory
    mem=$(get_memory_usage)
    mem_int=${mem%.*}
    if [ "$mem_int" -gt $ALERT_THRESHOLD_MEM ]; then
        echo -e "Memory Usage: ${RED}${mem}%${NC} ⚠️  HIGH"
        send_alert "WARNING" "High memory usage: ${mem}%"
    else
        echo -e "Memory Usage: ${GREEN}${mem}%${NC}"
    fi
    
    # Disk
    disk=$(get_disk_usage)
    if [ "$disk" -gt $ALERT_THRESHOLD_DISK ]; then
        echo -e "Disk Usage:   ${RED}${disk}%${NC} ⚠️  HIGH"
        send_alert "CRITICAL" "High disk usage: ${disk}%"
    else
        echo -e "Disk Usage:   ${GREEN}${disk}%${NC}"
    fi
    
    echo ""
    echo "SERVICE STATUS:"
    echo "───────────────────────────────────────────────────────"
    
    # Count running services
    service_count=$(count_services)
    expected_count=20
    
    if [ $service_count -eq $expected_count ]; then
        echo -e "Running Services: ${GREEN}${service_count}/${expected_count}${NC}"
    else
        echo -e "Running Services: ${RED}${service_count}/${expected_count}${NC} ⚠️"
        send_alert "CRITICAL" "Only $service_count/$expected_count services running"
    fi
    
    echo ""
    
    # Critical services
    echo "Critical Services:"
    printf "  PostgreSQL:   " && get_service_status "postgres"
    printf "  Redis:        " && get_service_status "redis"
    printf "  API Gateway:  " && get_service_status "api-gateway"
    printf "  Auth Service: " && get_service_status "auth-service"
    printf "  Payment:      " && get_service_status "payment-service"
    
    echo ""
    echo "DATABASE CONNECTIONS:"
    echo "───────────────────────────────────────────────────────"
    
    # PostgreSQL connections
    pg_connections=$(docker exec postgres psql -U postgres -t -c \
        "SELECT count(*) FROM pg_stat_activity WHERE datname IS NOT NULL;" 2>/dev/null || echo "N/A")
    echo "PostgreSQL Connections: $pg_connections"
    
    # Redis connections
    redis_connections=$(docker exec redis redis-cli CLIENT LIST 2>/dev/null | wc -l || echo "N/A")
    echo "Redis Connections: $redis_connections"
    
    echo ""
    echo "───────────────────────────────────────────────────────"
    echo "Press Ctrl+C to stop monitoring"
    echo "Refreshing in ${REFRESH_INTERVAL}s..."
    
    # Reset alert flag if issues resolved
    ALERT_SENT=0
    
    sleep $REFRESH_INTERVAL
done
```

### Production Features Needed

**1. Comprehensive Metrics**
- CPU per service
- Memory per service
- Network I/O
- Disk I/O
- Database connection pools
- Queue depths
- Response times

**2. Alerting**
```bash
# Alert when thresholds exceeded:
# - CPU > 80%
# - Memory > 85%
# - Disk > 90%
# - Service down
# - High error rate
# - Database connections maxed
```

**3. Historical Tracking**
```bash
# Log metrics to time-series database
# Send to Prometheus/InfluxDB
# Generate graphs
# Detect trends
```

**4. Service-Specific Metrics**
```bash
# Per-service monitoring:
# - Request rate
# - Error rate
# - Response time P50/P95/P99
# - Active connections
# - Queue depth
```

**5. Graceful Shutdown**
```bash
# Proper signal handling
# Save state before exit
# Clean up resources
```

### Recommendations

1. Add comprehensive service monitoring (8 hours)
2. Implement alerting system (8 hours)
3. Add per-service metrics (8 hours)
4. Integrate with Prometheus/Grafana (16 hours)
5. Add historical data logging (4 hours)
6. Create monitoring dashboard (8 hours)

**Total Effort:** 52 hours (~1.5 weeks)

---

## 4. SMOKE.SH - SMOKE TEST SCRIPT

**Location:** `operations/scripts/smoke.sh`  
**Status:** 🔴 **CRITICAL SECURITY ISSUE**  
**Confidence: 10/10** (Security issue is undeniable)

### Current Code

```bash
#!/bin/bash
echo "Running Smoke Tests..."
curl -s http://localhost:3000/health > /dev/null && echo "✓ API Health" || echo "✗ API Health"
PGPASSWORD=TicketToken2024Secure! psql -U postgres -d tickettoken -c "SELECT 1" > /dev/null 2>&1 && echo "✓ Database" || echo "✗ Database"
```

### 🔴🔴🔴 CRITICAL SECURITY ISSUE 🔴🔴🔴

**HARDCODED DATABASE PASSWORD IN PLAIN TEXT**

```bash
PGPASSWORD=TicketToken2024Secure!
```

**Why This is Catastrophic:**

1. **Password Exposed in Script**
   - Anyone with file access can see it
   - Likely committed to Git → in Git history forever
   - Could be public if repo is/was public

2. **Consequences:**
   - Full database access for attackers
   - Can read/modify/delete all customer data
   - Violates PCI DSS, SOC 2, GDPR
   - Could result in:
     - Data breach
     - Ransomware attack
     - Regulatory fines ($millions)
     - Loss of customer trust
     - Business shutdown

3. **How Password Gets Exposed:**
   ```bash
   # Anyone can read this file
   cat operations/scripts/smoke.sh
   # Password is visible: TicketToken2024Secure!
   
   # If in Git history (likely):
   git log --all --full-history -- operations/scripts/smoke.sh
   # Password is permanently in Git history
   
   # If repo was ever public:
   # Password is indexed by search engines
   # Available on GitHub archive sites
   # Cannot be removed
   ```

4. **Immediate Actions Required:**
   ```bash
   # 1. ROTATE DATABASE PASSWORD IMMEDIATELY
   ALTER USER postgres WITH PASSWORD 'NewSecureRandomPassword123!@#';
   
   # 2. Update all services with new password
   # 3. Remove password from script
   # 4. Use environment variable instead
   # 5. Check Git history for exposure
   # 6. Audit database access logs
   ```

### Additional Issues with smoke.sh

**1. Only 2 Tests**
```bash
# Only tests:
1. API Gateway health endpoint
2. Database connectivity

# Missing tests for:
- Authentication (can users log in?)
- Payment processing (can process payments?)
- Ticket creation (can create tickets?)
- File upload (can upload files?)
- NFT minting (can mint NFTs?)
- Email sending (notifications work?)
- All other 18 services
```

**2. No Exit Code**
```bash
# Always exits with 0 (success)
# Even if both tests fail!
# Deployment would proceed despite failures
```

**3. Silent Failures**
```bash
# Output silenced with > /dev/null
# Can't see WHY test failed
# Makes debugging impossible
```

### Production Smoke Test Script

```bash
#!/bin/bash
set -euo pipefail

# Configuration
TEST_URL="${TEST_URL:-http://localhost:3000}"
FAIL_COUNT=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

run_test() {
    local name="$1"
    local test_func="$2"
    
    echo -n "Testing $name... "
    if $test_func; then
        echo -e "${GREEN}✓ PASS${NC}"
    else
        echo -e "${RED}✗ FAIL${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

# Test functions
test_api_health() {
    curl -sf "$TEST_URL/health" > /dev/null
}

test_database_connectivity() {
    # Use .pgpass file or environment variable
    # NEVER hardcode password
    if [ -z "${PGPASSWORD:-}" ]; then
        export PGPASSWORD=$(cat ~/.pgpass | grep postgres | cut -d: -f5)
    fi
    psql -h localhost -U postgres -d tickettoken -c "SELECT 1" > /dev/null 2>&1
}

test_redis_connectivity() {
    redis-cli PING | grep -q PONG
}

test_authentication() {
    # Test login endpoint
    response=$(curl -sf -X POST "$TEST_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"test123"}' \
        -w "%{http_code}" -o /dev/null)
    [ "$response" = "200" ] || [ "$response" = "401" ]
}

test_payment_endpoint() {
    # Test payment service is responding
    curl -sf "$TEST_URL/api/payments/health" > /dev/null
}

test_file_upload() {
    # Test file service is responding
    curl -sf "$TEST_URL/api/files/health" > /dev/null
}

test_ticket_service() {
    # Test ticket creation endpoint is responding
    curl -sf "$TEST_URL/api/tickets/health" > /dev/null
}

test_notification_service() {
    # Test notification service is up
    curl -sf "http://localhost:3007/health" > /dev/null
}

test_queue_processing() {
    # Check if queue service is healthy
    curl -sf "http://localhost:3011/health" > /dev/null
}

test_blockchain_service() {
    # Check blockchain service
    curl -sf "http://localhost:3010/health" > /dev/null
}

# Run all tests
log "Starting smoke tests for $TEST_URL"
echo "================================================"

run_test "API Gateway Health" test_api_health
run_test "Database Connectivity" test_database_connectivity
run_test "Redis Connectivity" test_redis_connectivity
run_test "Authentication Service" test_authentication
run_test "Payment Service" test_payment_endpoint
run_test "File Service" test_file_upload
run_test "Ticket Service" test_ticket_service
run_test "Notification Service" test_notification_service
run_test "Queue Service" test_queue_processing
run_test "Blockchain Service" test_blockchain_service

echo "================================================"

# Summary
if [ $FAIL_COUNT -eq 0 ]; then
    log "${GREEN}✓ All smoke tests passed${NC}"
    exit 0
else
    log "${RED}✗ $FAIL_COUNT smoke tests failed${NC}"
    exit 1
fi
```

### How to Store Database Password Securely

**Option 1: .pgpass File** (Secure)
```bash
# ~/.pgpass
# Format: hostname:port:database:username:password
localhost:5432:tickettoken:postgres:TicketToken2024Secure!

# Set permissions (MUST be 0600)
chmod 0600 ~/.pgpass

# psql will automatically use it
psql -h localhost -U postgres -d tickettoken -c "SELECT 1"
```

**Option 2: Environment Variable**
```bash
# In .env file (NOT in Git)
POSTGRES_PASSWORD=TicketToken2024Secure!

# Load in script
source .env
psql -h localhost -U postgres -d tickettoken -c "SELECT 1"
```

**Option 3: AWS Secrets Manager**
```bash
# Retrieve password from AWS
PGPASSWORD=$(aws secretsmanager get-secret-value \
    --secret-id tickettoken/postgres/password \
    --query SecretString \
    --output text)

# Use in script
psql -h localhost -U postgres -d tickettoken -c "SELECT 1"
```

### Recommendations

1. **CRITICAL - IMMEDIATE**: 
   - Rotate database password (1 hour)
   - Remove password from script (15 minutes)
   - Audit database access logs (2 hours)
   - Check Git history for exposure (1 hour)

2. **HIGH PRIORITY**:
   - Rewrite smoke test script (8 hours)
   - Add comprehensive test coverage (16 hours)
   - Implement proper secret management (8 hours)
   - Add exit codes (1 hour)

**Total Effort:** 37 hours (~1 week)

---

## SUMMARY & REMEDIATION PLAN

### Critical Issues

| Script | Issue | Severity | Impact | Effort |
|--------|-------|----------|--------|--------|
| smoke.sh | **Hardcoded DB password** | 🔴 CRITICAL | Data breach | 4h |
| deploy.sh | Non-functional | 🔴 CRITICAL | Failed deployments | 80h |
| health.sh | Missing 17+ services | 🟡 HIGH | Incomplete monitoring | 17h |
| monitor.sh | Limited metrics | 🟡 HIGH | Poor visibility | 52h |

### Overall Assessment

**Security Score: 1/10** 🔴  
**Functionality Score: 2/10** 🔴  
**Production Readiness: NOT READY** 🔴

### Immediate Actions (This Week)

**Day 1 - SECURITY EMERGENCY:**
1. Rotate database password (1h)
2. Remove password from smoke.sh (15min)
3. Implement .pgpass or AWS Secrets Manager (2h)
4. Audit database access logs (2h)
5. Check if repo was ever public (1h)

**Day 2-3 - Deploy Script:**
6. Create functional deployment script (16h)

**Day 4-5 - Monitoring:**
7. Enhance health check script (8h)
8. Update smoke test script (8h)

### Long-term Roadmap

**Week 2-3: Complete Script Implementation**
- Full deployment automation (64h)
- Comprehensive monitoring (44h)
- Complete smoke tests (29h)

**Week 4: Testing & Documentation**
- Test all scripts in staging (16h)
- Create runbooks (16h)
- Train team (8h)

**Total Effort:** ~230 hours (6 weeks)

### Required Infrastructure

**Before Scripts Can Work:**
1. ✅ Docker/Docker Compose installed
2. ❌ Secrets management system (AWS Secrets Manager/Vault)
3. ❌ Monitoring infrastructure (Prometheus/Grafana)
4. ❌ Notification system (Slack/PagerDuty webhooks)
5. ❌ Log aggregation system
6. ❌ Backup storage (S3 buckets)

### Production Readiness Checklist

**Operations Scripts:**
- [ ] deploy.sh - Functional deployment script
- [ ] health.sh - All services monitored
- [ ] monitor.sh - Comprehensive metrics
- [ ] smoke.sh - No hardcoded secrets
- [ ] smoke.sh - Comprehensive tests
- [ ] All scripts - Error handling
- [ ] All scripts - Logging
- [ ] All scripts - Documentation
- [ ] All scripts - Tested in staging

**Security:**
- [ ] Database password rotated
- [ ] No hardcoded secrets
- [ ] Proper secret management
- [ ] Access logging enabled
- [ ] Security audit completed

**Infrastructure:**
- [ ] Secrets manager configured
- [ ] Monitoring system ready
- [ ] Notification channels set up
- [ ] Backup system operational
- [ ] Disaster recovery tested

---

## CONCLUSION

Your operations scripts are **early development placeholders** that are **dangerous to use in production**. The most critical issue is the **hardcoded database password in smoke.sh**, which must be addressed immediately.

**Immediate Priority: Fix Security Issue**
1. Rotate database password TODAY
2. Remove password from script
3. Implement proper secret management
4. Audit for unauthorized access

**After Security Fix:**
1. Rewrite deploy.sh (currently does nothing)
2. Enhance health.sh (missing 17+ services)
3. Improve monitor.sh (limited metrics)
4. Complete smoke.sh (only 2 tests)

**Timeline:**
- Critical security fix: 1 day
- Functional scripts: 4-6 weeks
- Production-ready with testing: 6-8 weeks

The good news: You understand what operations scripts should do (evident from the placeholders). The work is straightforward - just needs implementation and security best practices.

**DO NOT DEPLOY TO PRODUCTION WITH THESE SCRIPTS.**
