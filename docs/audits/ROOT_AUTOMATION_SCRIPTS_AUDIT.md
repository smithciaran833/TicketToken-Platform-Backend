# ROOT AUTOMATION SCRIPTS PRODUCTION READINESS AUDIT

**Date:** November 18, 2025  
**Auditor:** Platform Operations Team  
**Component:** Root Automation Scripts  
**Scripts Audited:** 5 primary automation scripts  
**Status:** 🔴 **CRITICAL SECURITY ISSUES - NOT PRODUCTION-READY**

---

## EXECUTIVE SUMMARY

Your root automation scripts have **ANOTHER HARDCODED PASSWORD VULNERABILITY** similar to the one found in `operations/scripts/smoke.sh`. Additionally, while some scripts like `docker-startup.sh` are well-structured, **all scripts are development/debugging tools** and lack production-grade features.

### Critical Reality Check

**🔴 SECOND PASSWORD LEAK FOUND:**
- **`run-all-migrations.sh` has hardcoded database password**
- Password: `postgres` (in plain text)
- This is the **production migration script** - extremely dangerous

**FUNCTIONALITY ASSESSMENT:**
- `run-all-migrations.sh` 🔴 CRITICAL - Hardcoded password
- `docker-startup.sh` 🟢 GOOD - Well-structured development tool
- `docker-test.sh` 🟢 GOOD - Integration test script
- `fix-all-db-ports.sh` 🟡 OK - Utility script
- `validate_fixes.sh` 🟢 GOOD - Diagnostic tool

### Overall Root Scripts Score: **3/10** 🔴

**Bottom Line:** The migration script with hardcoded password is a **critical security issue**. Other scripts are decent development tools but lack production features like error recovery, logging, and monitoring integration.

---

## 1. RUN-ALL-MIGRATIONS.SH - MIGRATION ORCHESTRATOR

**Location:** `run-all-migrations.sh`  
**Status:** 🔴 **CRITICAL SECURITY VULNERABILITY**  
**Confidence: 10/10** (Hardcoded password is undeniable)

### Current Code

```bash
#!/bin/bash

export DB_HOST=localhost
export DB_PORT=6432
export DB_NAME=tickettoken_db
export DB_USER=postgres
export DB_PASSWORD=postgres  # 🔴 HARDCODED PASSWORD

SERVICES=(
  "auth-service"
  "venue-service"
  "event-service"
  # ... 17 more services
)

for service in "${SERVICES[@]}"; do
  echo "=========================================="
  echo "Running migrations for: $service"
  echo "=========================================="
  cd ~/Desktop/TicketToken-Platform/backend/services/$service
  npm run migrate 2>&1
  echo ""
done

echo "All migrations complete!"
```

### 🔴🔴🔴 CRITICAL SECURITY ISSUE 🔴🔴🔴

**HARDCODED DATABASE PASSWORD**

```bash
export DB_PASSWORD=postgres
```

**Why This is Catastrophic:**

1. **Password Exposed in Migration Script**
   - Anyone running migrations sees this password
   - Likely committed to Git and in history
   - This script runs in production during deployments
   - Password is exported to environment (visible to all processes)

2. **Weak Password**
   - `postgres` is the default PostgreSQL password
   - One of the first passwords attackers try
   - Combined with `operations/scripts/smoke.sh`, you have **TWO different hardcoded passwords** for the same database

3. **Migration Script Impact**
   - Migrations run during every deployment
   - If this script is compromised, attacker has:
     - Write access to database
     - Ability to modify schema
     - Can inject malicious migrations
     - Can destroy database structure

4. **Immediate Consequences:**
   ```bash
   # Anyone can:
   1. Read this file → Get password
   2. Export DB_PASSWORD=postgres
   3. Connect to database
   4. psql -h localhost -p 6432 -U postgres -d tickettoken_db
   5. DROP DATABASE tickettoken_db;  # Game over
   ```

### Additional Issues

**1. Hardcoded Absolute Path**
```bash
cd ~/Desktop/TicketToken-Platform/backend/services/$service
```
- Breaks if project is in different location
- Assumes `~` is always the same
- Not portable across environments

**2. No Error Handling**
```bash
# If a migration fails, script continues
# No way to know which migrations succeeded/failed
# No rollback mechanism
```

**3. Silent Failures**
```bash
npm run migrate 2>&1
# Redirects stderr to stdout but doesn't check exit code
# Failed migrations look like successful ones
```

**4. No Migration State Tracking**
```bash
# No record of:
# - Which migrations ran
# - When they ran
# - Who ran them
# - What the outcome was
```

**5. No Dry Run Option**
```bash
# No way to see what migrations would run
# No preview of changes
# No validation before execution
```

**6. Direct Execution Risk**
```bash
# Runs migrations directly in each service
# No central control
# No guarantees about order
# No dependency management between services
```

### Production Migration Script

```bash
#!/bin/bash
set -euo pipefail

# Configuration from environment or .env file
if [ -f .env ]; then
    source .env
fi

# Required variables (should come from environment)
: "${DB_HOST:?Environment variable DB_HOST must be set}"
: "${DB_PORT:?Environment variable DB_PORT must be set}"
: "${DB_NAME:?Environment variable DB_NAME must be set}"
: "${DB_USER:?Environment variable DB_USER must be set}"
: "${DB_PASSWORD:?Environment variable DB_PASSWORD must be set}"

# Script configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES_DIR="$PROJECT_ROOT/backend/services"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="$PROJECT_ROOT/logs/migrations"
LOG_FILE="$LOG_DIR/migration_${TIMESTAMP}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Create log directory
mkdir -p "$LOG_DIR"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Services to migrate (in dependency order)
SERVICES=(
  "auth-service"
  "venue-service"
  "event-service"
  "ticket-service"
  "order-service"
  "payment-service"
  "notification-service"
  "analytics-service"
  "queue-service"
  "scanning-service"
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

# Tracking
SUCCESS_COUNT=0
FAILURE_COUNT=0
declare -a FAILED_SERVICES

# Dry run mode
DRY_RUN="${DRY_RUN:-false}"

log "═══════════════════════════════════════════════════════"
log "TICKETTOKEN MIGRATION ORCHESTRATOR"
log "═══════════════════════════════════════════════════════"
log "Environment: ${ENVIRONMENT:-development}"
log "Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
log "Dry Run: $DRY_RUN"
log "Log File: $LOG_FILE"
log ""

# Verify database connectivity
log "Verifying database connection..."
if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    log "ERROR: Cannot connect to database"
    exit 1
fi
log "✓ Database connection verified"
log ""

# Create backup before migrations
if [ "$DRY_RUN" != "true" ]; then
    log "Creating database backup..."
    BACKUP_FILE="$LOG_DIR/backup_${TIMESTAMP}.sql.gz"
    if PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"; then
        log "✓ Backup created: $BACKUP_FILE"
    else
        log "ERROR: Backup failed"
        exit 1
    fi
    log ""
fi

# Function to run migrations for a service
run_service_migrations() {
    local service="$1"
    local service_path="$SERVICES_DIR/$service"
    
    if [ ! -d "$service_path" ]; then
        log "WARN: Service directory not found: $service"
        return 1
    fi
    
    cd "$service_path"
    
    # Check if service has migrations
    if [ ! -f "package.json" ]; then
        log "WARN: No package.json found for $service"
        return 1
    fi
    
    if ! grep -q '"migrate"' package.json; then
        log "INFO: No migrate script for $service (skipping)"
        return 0
    fi
    
    log "Running migrations for: $service"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "  [DRY RUN] Would run: npm run migrate"
        return 0
    fi
    
    # Run migrations with timeout
    if timeout 300 npm run migrate >> "$LOG_FILE" 2>&1; then
        log "  ✓ Success: $service"
        return 0
    else
        log "  ✗ Failed: $service"
        return 1
    fi
}

# Run migrations for each service
log "Starting migrations..."
log "─────────────────────────────────────────────────────────"

for service in "${SERVICES[@]}"; do
    if run_service_migrations "$service"; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
        FAILED_SERVICES+=("$service")
    fi
    log ""
done

# Summary
log "═══════════════════════════════════════════════════════"
log "MIGRATION SUMMARY"
log "═══════════════════════════════════════════════════════"
log "Total services: ${#SERVICES[@]}"
log "Successful: $SUCCESS_COUNT"
log "Failed: $FAILURE_COUNT"

if [ $FAILURE_COUNT -gt 0 ]; then
    log ""
    log -e "${RED}Failed services:${NC}"
    for failed in "${FAILED_SERVICES[@]}"; do
        log "  - $failed"
    done
    log ""
    log "Check the log file for details: $LOG_FILE"
    
    # Optionally restore backup
    if [ "$DRY_RUN" != "true" ] && [ -f "$BACKUP_FILE" ]; then
        log ""
        log "To rollback, run:"
        log "  gunzip < $BACKUP_FILE | psql -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME"
    fi
    
    exit 1
else
    log -e "${GREEN}✓ All migrations completed successfully${NC}"
    exit 0
fi
```

### Immediate Actions Required

**1. URGENT - Security Fix (TODAY)**
```bash
# 1. Remove hardcoded password from script immediately
# 2. Use environment variable instead:
export DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD environment variable required}"

# 3. Rotate the 'postgres' password if it's actually being used
ALTER USER postgres WITH PASSWORD 'NewSecureRandomPassword!';

# 4. Update all systems with new password
# 5. Check Git history for exposure
git log --all --full-history -- run-all-migrations.sh
```

**2. HIGH PRIORITY - Script Improvements**
- Add error handling (4h)
- Add backup/restore capability (4h)
- Add dry-run mode (2h)
- Add migration state tracking (4h)
- Remove hardcoded paths (1h)

**Total Effort:** 15 hours (~2 days)

---

## 2. DOCKER-STARTUP.SH - DEVELOPMENT ENVIRONMENT SETUP

**Location:** `docker-startup.sh`  
**Status:** 🟢 **GOOD FOR DEVELOPMENT**  
**Confidence: 8/10**

### Current Code Analysis

```bash
#!/bin/bash
set -e  # ✅ Exit on error

# Good practices:
- Nice colored output
- Checks for .env file
- Cleans up old containers
- Waits for services to be healthy
- Provides helpful output
```

### What Works ✅

1. **Good Error Handling**
   ```bash
   set -e  # Exit on error
   ```

2. **Environment File Management**
   ```bash
   if [ ! -f .env ]; then
     cp .env.example .env
   fi
   ```

3. **Service Health Checks**
   ```bash
   check_health() {
     curl -f -s "$url" > /dev/null
   }
   ```

4. **Colored, User-Friendly Output**
   - Clear progress indicators
   - Helpful error messages
   - Service URLs displayed

5. **Infrastructure-First Approach**
   - Starts infrastructure (postgres, redis, etc.) first
   - Waits for postgres to be ready
   - Then starts application services

### Issues (Minor)

**1. Limited Service Coverage**
```bash
# Only starts 3 services:
docker-compose up -d auth-service venue-service event-service

# Missing 17 other services
# Should allow configuring which services to start
```

**2. No Migration Runner**
```bash
echo "Note: You may need to run migrations manually for each service"
# Should offer to run migrations automatically
```

**3. Hardcoded Wait Times**
```bash
sleep 10  # Fixed 10 second wait
# Should poll and wait dynamically
```

**4. Limited Health Checks**
```bash
# Only checks 3 services
# Should check all infrastructure and services
```

### Recommendations for Improvement

1. **Add service selection** (2h)
   ```bash
   SERVICES_TO_START="${SERVICES_TO_START:-auth-service venue-service event-service}"
   ```

2. **Add migration option** (2h)
   ```bash
   if [ "$RUN_MIGRATIONS" = "true" ]; then
     ./run-all-migrations.sh
   fi
   ```

3. **Better health checking** (4h)
   - Check all started services
   - Dynamic waiting with timeout
   - Detailed failure information

4. **Add cleanup option** (1h)
   ```bash
   --clean  # Remove volumes and rebuild
   --fresh  # Complete fresh start
   ```

**Total Effort:** 9 hours (~1 day)

**Overall Assessment:** ✅ Good development tool, just needs minor enhancements

---

## 3. DOCKER-TEST.SH - INTEGRATION TEST SUITE

**Location:** `docker-test.sh`  
**Status:** 🟢 **GOOD INTEGRATION TESTS**  
**Confidence: 8/10**

### Current Code Analysis

```bash
#!/bin/bash
set -e

# Tests cross-service communication:
# 1. Register user (auth-service)
# 2. Create venue (venue-service)
# 3. Create event (event-service)
```

### What Works ✅

1. **Proper Exit on Error**
   ```bash
   set -e
   ```

2. **Real Integration Tests**
   - Tests actual API endpoints
   - Verifies cross-service communication
   - Uses authentication tokens

3. **Good JSON Parsing**
   ```bash
   TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.tokens.accessToken')
   ```

4. **Clear Pass/Fail Indicators**
   - Green checkmarks for success
   - Red X for failures
   - Exits with error code on failure

5. **Tests Service Dependencies**
   - Auth → Venue → Event
   - Verifies data flows correctly

### Issues (Minor)

**1. Limited Test Coverage**
```bash
# Only tests 3 services
# Missing tests for:
# - Payment processing
# - Order creation
# - Ticket minting
# - File uploads
# - etc.
```

**2. Hardcoded Test Data**
```bash
# Uses fixed email, passwords, etc.
# Could conflict if run multiple times
# Should use unique identifiers
```

**3. No Cleanup**
```bash
# Leaves test data in database
# Should clean up after tests
```

**4. No Retry Logic**
```bash
# If service is slow to start, tests fail
# Should wait/retry
```

### Recommendations

1. **Expand Test Coverage** (16h)
   - Add tests for all critical flows
   - Payment, orders, tickets, files
   - Error scenarios

2. **Add Test Cleanup** (2h)
   ```bash
   cleanup() {
     # Delete test users, venues, events
   }
   trap cleanup EXIT
   ```

3. **Add Unique Test Data** (2h)
   ```bash
   TEST_ID=$(date +%s)
   EMAIL="test-$TEST_ID@example.com"
   ```

4. **Add Retry/Wait Logic** (4h)
   ```bash
   wait_for_service() {
     local max_attempts=30
     # Poll until service is ready
   }
   ```

**Total Effort:** 24 hours (~3 days)

**Overall Assessment:** ✅ Good foundation, needs expansion

---

## 4. FIX-ALL-DB-PORTS.SH - DATABASE PORT UPDATER

**Location:** `fix-all-db-ports.sh`  
**Status:** 🟡 **UTILITY SCRIPT - OK**  
**Confidence: 7/10**

### Current Code Analysis

```bash
#!/bin/bash

# Updates database port from 5432 to 6432 in all services
find ~/Desktop/TicketToken-Platform/backend/services -path "*/src/config/index.ts" -type f | while read file; do
  sed -i "s/DB_PORT || '5432'/DB_PORT || '6432'/g" "$file"
done
```

### What Works ✅

1. **Solves Specific Problem**
   - Updates PgBouncer port (6432) across all services
   - Consistent approach

2. **Covers Multiple File Types**
   - config/index.ts
   - knexfile.ts
   - config/database.ts

### Issues

**1. Hardcoded Path**
```bash
~/Desktop/TicketToken-Platform
# Not portable
```

**2. No Backup**
```bash
# Makes changes without backup
# If something goes wrong, manual recovery needed
```

**3. Dangerous sed -i**
```bash
# Modifies files in place
# No confirmation
# No preview
```

**4. Silent Execution**
```bash
# No output on success
# Can't tell if it worked
```

**5. Not Idempotent**
```bash
# Running twice could cause issues
# Should check if already updated
```

### Production Version

```bash
#!/bin/bash
set -euo pipefail

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES_DIR="$PROJECT_ROOT/backend/services"
OLD_PORT="${1:-5432}"
NEW_PORT="${2:-6432}"
DRY_RUN="${DRY_RUN:-false}"

echo "Database Port Updater"
echo "===================="
echo "Old Port: $OLD_PORT"
echo "New Port: $NEW_PORT"
echo "Dry Run: $DRY_RUN"
echo ""

# Find and update files
FILES_CHANGED=0

while IFS= read -r -d '' file; do
    if grep -q "DB_PORT.*'$OLD_PORT'" "$file" || grep -q "DB_PORT.*\"$OLD_PORT\"" "$file"; then
        echo "Found: $file"
        
        if [ "$DRY_RUN" != "true" ]; then
            # Create backup
            cp "$file" "$file.bak"
            
            # Update file
            sed -i "s/DB_PORT || '$OLD_PORT'/DB_PORT || '$NEW_PORT'/g" "$file"
            sed -i "s/DB_PORT || \"$OLD_PORT\"/DB_PORT || \"$NEW_PORT\"/g" "$file"
            
            echo "  ✓ Updated (backup: $file.bak)"
        else
            echo "  [DRY RUN] Would update this file"
        fi
        
        FILES_CHANGED=$((FILES_CHANGED + 1))
    fi
done < <(find "$SERVICES_DIR" -type f \( -path "*/src/config/*.ts" -o -name "knexfile.ts" \) -print0)

echo ""
echo "Summary: $FILES_CHANGED files changed"

if [ "$DRY_RUN" = "true" ]; then
    echo ""
    echo "Run without DRY_RUN=true to apply changes"
fi
```

### Recommendations

1. **Add safety features** (2h)
   - Backup before changes
   - Dry-run mode
   - Confirmation prompt

2. **Better reporting** (1h)
   - Show what changed
   - List affected files
   - Summary statistics

**Total Effort:** 3 hours

**Overall Assessment:** 🟡 OK utility script, could be safer

---

## 5. VALIDATE_FIXES.SH - DIAGNOSTIC TOOL

**Location:** `validate_fixes.sh`  
**Status:** 🟢 **GOOD DIAGNOSTIC TOOL**  
**Confidence: 8/10**

### Current Code Analysis

This is a comprehensive diagnostic script that validates various fixes and checks system state. It's well-structured with:

- Colored output
- Multiple validation sections
- File existence checks
- MongoDB investigation
- Docker status
- Build output verification

### What Works ✅

1. **Comprehensive Checks**
   - File existence
   - Configuration verification
   - Service status
   - Database investigation

2. **Well-Organized Output**
   - Sections with clear headers
   - Color-coded results
   - Helpful summaries

3. **Non-Destructive**
   - Only reads/checks
   - Doesn't modify anything
   - Safe to run anytime

4. **Helpful for Debugging**
   - Shows MongoDB collections
   - Checks Docker status
   - Verifies build outputs
   - Searches for usage patterns

### What Could Be Better

**1. Could Add Health Checks**
```bash
# Check if services are actually running
# Verify database connectivity
# Test API endpoints
```

**2. Could Add Performance Metrics**
```bash
# Check response times
# Memory usage
# Connection pools
```

**3. Could Generate Report File**
```bash
# Save output to timestamped report
# For historical tracking
```

### Recommendations

1. **Add health verification** (4h)
2. **Add performance checks** (4h)
3. **Generate report file** (2h)
4. **Add fix suggestions** (4h)

**Total Effort:** 14 hours (~2 days)

**Overall Assessment:** ✅ Great diagnostic tool

---

## SUMMARY & REMEDIATION PLAN

### Critical Issues

| Script | Issue | Severity | Impact | Effort |
|--------|-------|----------|--------|--------|
| run-all-migrations.sh | **Hardcoded password** | 🔴 CRITICAL | Data breach | 1h |
| run-all-migrations.sh | No error handling | 🔴 CRITICAL | Failed migrations | 8h |
| run-all-migrations.sh | Hardcoded paths | 🟡 HIGH | Not portable | 1h |
| docker-startup.sh | Limited services | 🟢 LOW | Dev only | 2h |
| docker-test.sh | Limited coverage | 🟢 LOW | Dev only | 16h |
| fix-all-db-ports.sh | No backups | 🟡 MEDIUM | Data loss risk | 2h |

### Overall Assessment

**Security Score: 2/10** 🔴  
**Functionality Score: 6/10** 🟡  
**Production Readiness: NOT READY** 🔴

### Immediate Actions (This Week)

**Day 1 - SECURITY EMERGENCY:**
1. Remove hardcoded password from `run-all-migrations.sh` (30min)
2. Update script to use environment variables (1h)
3. Rotate database password if `postgres` is actually in use (1h)
4. Check Git history for exposure (30min)
5. Audit all other scripts for hardcoded secrets (2h)

**Day 2-3 - Migration Script Hardening:**
6. Add error handling to migration script (4h)
7. Add backup/restore functionality (4h)
8. Add dry-run mode (2h)
9. Add migration state tracking (4h)

**Day 4-5 - Improve Development Tools:**
10. Enhance docker-startup.sh (8h)
11. Improve docker-test.sh coverage (8h)

### Long-term Roadmap

**Week 2: Production Features**
- Add comprehensive logging (8h)
- Add monitoring integration (8h)
- Add notification system (4h)
- Create deployment runbooks (8h)

**Week 3: Testing & Documentation**
- Test all scripts in staging (16h)
- Write documentation (12h)
- Create video tutorials (8h)

**Total Effort:** ~120 hours (3 weeks)

### Security Checklist

**Immediate (TODAY):**
- [ ] Remove hardcoded password from run-all-migrations.sh
- [ ] Use environment variables for all secrets
- [ ] Rotate database password
- [ ] Check Git history for exposed secrets
- [ ] Audit all scripts for hardcoded credentials

**This Week:**
- [ ] Add error handling to critical scripts
- [ ] Add backup mechanisms
- [ ] Implement dry-run modes
- [ ] Add proper logging

**Production Requirements:**
- [ ] All scripts use environment variables
- [ ] Comprehensive error handling
- [ ] Backup and rollback capabilities
- [ ] Audit logging
- [ ] Monitoring integration
- [ ] Documentation complete
- [ ] Tested in staging

---

## COMPARISON WITH OPERATIONS SCRIPTS

You now have **TWO files with hardcoded database passwords:**

1. **`operations/scripts/smoke.sh`**: Password = `TicketToken2024Secure!`
2. **`run-all-migrations.sh`**: Password = `postgres`

### Which Password is Actually Used?

This confusion is itself a **security problem**:
- Are you using multiple passwords?
- Are they for different databases?
- Which one is production?
- How many more passwords are hardcoded?

### Required Action

**Conduct Full Security Audit:**
```bash
# Search for all hardcoded passwords
grep -r "PASSWORD.*=" . --include="*.sh" --include="*.js" --include="*.ts"
grep -r "PGPASSWORD" . --include="*.sh"
grep -r "password.*:" . --include="*.yml" --include="*.yaml"
```

---

## CONCLUSION

Your root automation scripts suffer from **critical security vulnerabilities** and lack production-grade features, but the dev tools (docker-startup.sh, docker-test.sh, validate_fixes.sh) are actually well-written and useful.

**Priority Order:**

1. **CRITICAL (TODAY)**: Fix hardcoded passwords in `run-all-migrations.sh`
2. **HIGH (This Week)**: Add error handling and backup capabilities
3. **MEDIUM (Next Week)**: Enhance development tools
4. **LOW (Next Month)**: Add monitoring and advanced features

**The Good News:**
- docker-startup.sh is well-structured
- docker-test.sh provides good integration testing
- validate_fixes.sh is a useful diagnostic tool

**The Bad News:**
- **Another hardcoded password found** (2nd one!)
- Migration script lacks error handling
- No production-ready features

**DO NOT USE run-all-migrations.sh IN PRODUCTION** until hardcoded password is removed and proper error handling is added.
