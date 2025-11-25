# INFORMATION REQUIREMENTS MAP
## Research Roadmap for Production Readiness Implementation

**Document Purpose:** Map all information needed from the codebase to successfully execute each phase of the Production Readiness Remediation Plan without making assumptions about column names, API contracts, or configurations.

**Last Updated:** November 19, 2025  
**Status:** Research Planning Phase

---

## PHASE 0: FOUNDATIONAL RESEARCH (DO FIRST)
**Timeline:** Complete before any implementation begins  
**Effort:** 16-24 hours  
**Priority:** 🔴 CRITICAL - Nothing else works without this

### 0.1 Database Schema Extraction
**What We Need:**
- [ ] Complete list of all existing tables (157 tables documented)
- [ ] Exact column names, types, and constraints for each table
- [ ] All foreign key relationships
- [ ] All indexes (existing and missing)
- [ ] All CHECK constraints
- [ ] All RLS policies (where they exist)
- [ ] All audit triggers (where they exist)
- [ ] Naming conventions actually used (snake_case, camelCase, etc.)

**Where to Find:**
- `database/postgresql/migrations/**/*.sql` - All migration files
- `database/MIGRATION_INVENTORY.md` - Overview of migrations
- Search for `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, `CREATE POLICY`

**Output Document:** `docs/reference/DATABASE_SCHEMA_REFERENCE.md`

**Critical Questions to Answer:**
1. What naming convention is used for amounts? (`total_amount` vs `totalAmount` vs `total`)
2. What naming convention is used for timestamps? (`created_at` vs `createdAt` vs `created`)
3. What status enums exist across different tables?
4. Which tables have RLS enabled vs not enabled?
5. Which tables have audit triggers vs not?

---

### 0.2 Environment Variables & Secrets Audit
**What We Need:**
- [ ] Every environment variable used by every service
- [ ] Which variables are secrets (passwords, API keys, tokens)
- [ ] Which secrets are currently exposed in docker-compose.yml
- [ ] Default values for non-secret variables
- [ ] Required vs optional variables
- [ ] Variable naming conventions

**Where to Find:**
- `backend/services/*/src/config/*.ts` - Configuration files
- `backend/services/*/.env.example` - Example env files
- `docker-compose.yml` - Current configuration (may have secrets)
- Search for `process.env.`, `process.env[`, `import { config }`

**Output Document:** `docs/reference/ENVIRONMENT_VARIABLES_REFERENCE.md`

**Critical Questions to Answer:**
1. Are secrets actually in docker-compose.yml? (Line numbers if yes)
2. What Stripe keys are in use? (test vs production)
3. What database credentials are exposed?
4. What JWT secrets are exposed?
5. Which services need which environment variables?

---

### 0.3 Service Architecture Mapping
**What We Need:**
- [ ] List of all 20 services
- [ ] Which services talk to which services
- [ ] HTTP endpoints each service exposes
- [ ] Database tables each service owns
- [ ] External APIs each service calls (Stripe, etc.)
- [ ] Message queues/events each service produces/consumes
- [ ] Service boot order dependencies

**Where to Find:**
- `backend/services/*/src/index.ts` - Service entry points
- `backend/services/*/src/routes/*.ts` - Route definitions
- `backend/services/*/src/services/*.service.ts` - Service logic with external calls
- `backend/services/*/package.json` - Dependencies
- `docker-compose.yml` - Service orchestration

**Output Document:** `docs/reference/SERVICE_ARCHITECTURE_MAP.md`

**Critical Questions to Answer:**
1. Does order-service exist at all? (Code or just database gap?)
2. Which services are absolutely critical for MVP?
3. What's the dependency chain? (Auth → Payment → Order, etc.)
4. Which services can be deployed independently?
5. Which services share database tables?

---

### 0.4 API Contracts Documentation
**What We Need:**
- [ ] Request/response schemas for all inter-service communication
- [ ] Field names used in JSON payloads
- [ ] TypeScript interfaces for API contracts
- [ ] Validation schemas (Zod, Joi, etc.)
- [ ] Error response formats
- [ ] Status code conventions

**Where to Find:**
- `backend/services/*/src/types/*.ts` - TypeScript types
- `backend/services/*/src/validators/*.ts` - Validation schemas
- `backend/services/*/src/controllers/*.ts` - Request handlers
- Search for `interface`, `type`, `z.object`, `Joi.object`

**Output Document:** `docs/reference/API_CONTRACTS_REFERENCE.md`

**Critical Questions to Answer:**
1. What field names does payment-service expect? (`total_amount` vs `totalAmount`)
2. What field names does ticket-service expect?
3. Are there inconsistencies between services?
4. What's the standard error response format?
5. How are multi-tenant requests handled? (tenant_id in header vs body?)

---

### 0.5 Naming Conventions Analysis
**What We Need:**
- [ ] Database column naming patterns
- [ ] API field naming patterns (JSON)
- [ ] Status enum values across services
- [ ] Timestamp field naming
- [ ] Amount/currency field naming
- [ ] ID field naming patterns
- [ ] Boolean field naming (is_active vs active)

**Where to Find:**
- Extract from 0.1 (database) and 0.4 (API)
- Look for patterns and inconsistencies

**Output Document:** `docs/reference/NAMING_CONVENTIONS_STANDARD.md`

**Critical Questions to Answer:**
1. Should new order tables use `total_amount` or `totalAmount`?
2. Should we use `created_at` or `createdAt`?
3. What status values should orders table use?
4. How should we name foreign keys? (`user_id` vs `userId`)
5. When there are inconsistencies, what should be the standard?

---

## PHASE 1: EMERGENCY SECURITY RESEARCH
**Depends On:** Phase 0 Complete  
**Timeline:** Parallel to Phase 0 completion  
**Effort:** 8-12 hours

### 1.1 Secrets Location Audit
**What We Need:**
- [ ] Complete inventory of where secrets are stored
- [ ] Git history check for committed secrets
- [ ] All secrets that need rotation
- [ ] Secret generation methods (how to create new ones)
- [ ] Services that will break when secrets rotate

**Where to Find:**
- `docker-compose.yml` - Check for hardcoded secrets
- `.env.example` files - Templates (should NOT have real secrets)
- `.env` files - May be in .gitignore (good) or committed (bad)
- Git history: `git log -S "sk_" --all` (search for Stripe keys)
- Git history: `git log -S "password" --all` (search for passwords)

**Output Document:** `docs/security/SECRETS_INVENTORY_AND_ROTATION.md`

**Critical Questions to Answer:**
1. Are secrets in Git history? (If yes, assume compromised)
2. Which secrets are Stripe test vs production?
3. Which secrets are used by multiple services?
4. What's the blast radius of rotating each secret?
5. Are any secrets hardcoded in application code?

---

### 1.2 Database Security Scripts Audit
**What We Need:**
- [ ] List all security SQL scripts
- [ ] What each script does
- [ ] Which scripts have been run
- [ ] Which scripts still need to be run
- [ ] Dependencies between scripts
- [ ] Rollback plan for each script

**Where to Find:**
- `database/postgresql/apply_security_enhancements.sql`
- `database/postgresql/enable_rls.sql`
- `database/postgresql/validate_security_complete.sql`
- `database/postgresql/add_missing_rls_policies.sql`
- All files in `database/postgresql/` directory

**Output Document:** `docs/security/DATABASE_SECURITY_STATUS.md`

**Critical Questions to Answer:**
1. Which security features are planned vs implemented?
2. Can we safely run these scripts on development?
3. What's the correct order to run them?
4. How do we validate they worked?
5. How do we rollback if something breaks?

---

### 1.3 MongoDB/Redis/Elasticsearch Security Status
**What We Need:**
- [ ] MongoDB authentication status (enabled/disabled)
- [ ] MongoDB users and roles
- [ ] Redis password status
- [ ] Redis dangerous commands status
- [ ] Elasticsearch security status
- [ ] InfluxDB authentication status
- [ ] Current connection strings

**Where to Find:**
- `docker-compose.yml` - Database configurations
- `backend/services/*/src/config/database.ts` - Connection configs
- `backend/services/*/src/config/redis.ts` - Redis configs
- Configuration files in `database/mongodb/`, `database/redis/`, etc.

**Output Document:** `docs/security/NON_POSTGRES_DATABASE_SECURITY.md`

**Critical Questions to Answer:**
1. Is MongoDB authentication actually enabled?
2. Does Redis require a password?
3. Can anyone connect to Elasticsearch?
4. Which databases are wide open?
5. What's the priority order to secure them?

---

## PHASE 2: DATABASE FOUNDATION RESEARCH
**Depends On:** Phase 0 Complete  
**Timeline:** After Phase 0, parallel to Phase 1 implementation  
**Effort:** 12-16 hours

### 2.1 Order Service Requirements
**What We Need:**
- [ ] Does order-service code exist? (Backend application)
- [ ] What order fields do payment-service expect?
- [ ] What order fields does ticket-service expect?
- [ ] What order workflow is needed? (create → pay → fulfill)
- [ ] What order status values are needed?
- [ ] How do orders relate to events, tickets, users?
- [ ] What discount logic exists or is needed?

**Where to Find:**
- `backend/services/order-service/` - Check if exists
- `backend/services/payment-service/src/services/` - Check for order references
- `backend/services/ticket-service/src/services/` - Check for order references
- Search codebase for "order", "Order", "purchase", "Purchase"

**Output Document:** `docs/requirements/ORDER_SERVICE_REQUIREMENTS.md`

**Critical Questions to Answer:**
1. Does order-service exist as code or is it completely missing?
2. What schema do other services expect orders to have?
3. What's the minimum viable order table structure?
4. What foreign keys are required?
5. What triggers/procedures do we need?

---

### 2.2 Index Performance Analysis
**What We Need:**
- [ ] All existing indexes
- [ ] Common query patterns from application code
- [ ] Slow queries (if we can measure)
- [ ] Tables over 1000 rows (need indexes first)
- [ ] Missing indexes on foreign keys
- [ ] Redundant indexes

**Where to Find:**
- `database/postgresql/migrations/**/*.sql` - Existing indexes
- `backend/services/*/src/services/*.service.ts` - Query patterns
- `backend/services/*/src/models/*.model.ts` - ORM queries
- Search for `WHERE`, `JOIN`, `ORDER BY`

**Output Document:** `docs/performance/INDEX_OPTIMIZATION_PLAN.md`

**Critical Questions to Answer:**
1. Which tables have no indexes at all?
2. Which foreign keys are missing indexes?
3. What are the 10 most common queries?
4. Which queries would benefit from composite indexes?
5. Are there any full table scans happening?

---

### 2.3 Connection Pooling Status
**What We Need:**
- [ ] Is PgBouncer actually running?
- [ ] Current PostgreSQL max_connections setting
- [ ] Number of services connecting to database
- [ ] Estimated connections per service
- [ ] Current connection pool configuration
- [ ] Connection pool metrics (if available)

**Where to Find:**
- `docker-compose.yml` - Check for pgbouncer service
- `infrastructure/pgbouncer/` - PgBouncer configs
- `backend/services/*/src/config/database.ts` - Connection pool settings
- Check if services connect to postgres directly or through pgbouncer

**Output Document:** `docs/infrastructure/CONNECTION_POOLING_STATUS.md`

**Critical Questions to Answer:**
1. Does PgBouncer exist in the infrastructure?
2. Are services using it or bypassing it?
3. What's the current connection pool configuration?
4. Have we hit connection limits before?
5. What pool sizes are appropriate per service?

---

### 2.4 Backup Infrastructure Status
**What We Need:**
- [ ] Are backups running at all?
- [ ] Backup schedule (if exists)
- [ ] Backup storage location
- [ ] Backup encryption status
- [ ] Backup testing/restore history
- [ ] Backup retention policy
- [ ] Scripts and automation

**Where to Find:**
- `database/scripts/` - Backup scripts
- `operations/scripts/` - Operational scripts
- Cron jobs or scheduled tasks
- AWS S3 bucket contents (if using S3 for backups)

**Output Document:** `docs/operations/BACKUP_STATUS_AND_GAPS.md`

**Critical Questions to Answer:**
1. Are backups actually running?
2. When was the last successful backup?
3. Has anyone tried to restore a backup?
4. Where are backups stored? (local vs cloud)
5. Are backups encrypted?

---

## PHASE 3: KUBERNETES RESEARCH
**Depends On:** Phase 0 Complete  
**Timeline:** Parallel to Phase 2 implementation  
**Effort:** 12-16 hours

### 3.1 Existing Kubernetes Manifests Audit
**What We Need:**
- [ ] Which services have K8s manifests
- [ ] What's in the existing manifests (queue-service)
- [ ] What patterns can we reuse
- [ ] What's missing from existing manifests
- [ ] Current resource requests/limits
- [ ] Current health check definitions

**Where to Find:**
- `backend/services/queue-service/k8s/` - Existing K8s config
- Search for `*.yaml` files in service directories
- `infrastructure/` directory

**Output Document:** `docs/kubernetes/EXISTING_K8S_INVENTORY.md`

**Critical Questions to Answer:**
1. What does queue-service K8s manifest look like?
2. Can we use it as a template?
3. What's good about it? What's missing?
4. Are there deployment, service, ingress files?
5. Are there HPA and PDB files?

---

### 3.2 Service Resource Requirements
**What We Need:**
- [ ] Memory usage per service (current if measurable)
- [ ] CPU usage per service (current if measurable)
- [ ] Expected request rate per service
- [ ] Replica count needs per service
- [ ] Stateful vs stateless services
- [ ] Service dependencies and startup order

**Where to Find:**
- `docker-compose.yml` - Current resource limits
- Running services (if available) - metrics
- `backend/services/*/package.json` - Node.js version, dependencies size

**Output Document:** `docs/kubernetes/SERVICE_RESOURCE_REQUIREMENTS.md`

**Critical Questions to Answer:**
1. What resources do services currently use?
2. Which services are memory-heavy vs CPU-heavy?
3. Which services need multiple replicas?
4. Which services must start before others?
5. Which services are stateful (need persistent volumes)?

---

### 3.3 Network Architecture
**What We Need:**
- [ ] Which services talk to which services
- [ ] External service dependencies (Stripe, etc.)
- [ ] Database connections per service
- [ ] Redis connections per service
- [ ] Required ports per service
- [ ] Health check endpoints per service

**Where to Find:**
- From Phase 0.3 (Service Architecture)
- `backend/services/*/src/routes/health.routes.ts` - Health endpoints
- `docker-compose.yml` - Port mappings

**Output Document:** `docs/kubernetes/NETWORK_POLICY_REQUIREMENTS.md`

**Critical Questions to Answer:**
1. What's the minimum network access each service needs?
2. Which services should be externally accessible?
3. Which services are internal only?
4. What egress rules are needed? (external APIs)
5. What ingress rules are needed? (incoming traffic)

---

### 3.4 SSL/TLS Certificate Requirements
**What We Need:**
- [ ] Domain names in use (or will use)
- [ ] Existing SSL certificates
- [ ] Certificate expiration dates
- [ ] Certificate issuers (Let's Encrypt, etc.)
- [ ] Subdomains needed (api., admin., etc.)

**Where to Find:**
- `infrastructure/` directory
- `database/postgresql/certs/` - Database certs
- Current domain configuration

**Output Document:** `docs/kubernetes/SSL_TLS_REQUIREMENTS.md`

**Critical Questions to Answer:**
1. What domains will we use? (api.tickettoken.com, etc.)
2. Do we have certificates already?
3. Should we use Let's Encrypt or purchased certs?
4. What's the certificate renewal process?
5. Do we need wildcard certificates?

---

## PHASE 4: CI/CD RESEARCH
**Depends On:** Phase 0, 3.1 Complete  
**Timeline:** Parallel to Phase 3 implementation  
**Effort:** 8-12 hours

### 4.1 Existing CI/CD Analysis
**What We Need:**
- [ ] GitHub Actions workflows (if any exist)
- [ ] Build scripts in package.json
- [ ] Docker build configurations
- [ ] Test scripts and coverage
- [ ] Deployment scripts (if any)

**Where to Find:**
- `.github/workflows/` - GitHub Actions
- `backend/services/*/package.json` - npm scripts
- `backend/services/*/Dockerfile` - Docker builds
- `backend/services/*/jest.config.js` - Test config

**Output Document:** `docs/cicd/EXISTING_CICD_INVENTORY.md`

**Critical Questions to Answer:**
1. Do any CI/CD workflows exist?
2. Are tests running automatically?
3. Are images being built anywhere?
4. What's the current deployment process?
5. Is it completely manual?

---

### 4.2 Test Infrastructure Status
**What We Need:**
- [ ] Test coverage per service
- [ ] What tests exist (unit, integration, e2e)  
- [ ] Test infrastructure requirements
- [ ] Test data requirements
- [ ] Test environment needs

**Where to Find:**
- `backend/services/*/tests/` - Test files
- `backend/services/*/package.json` - Test scripts
- `backend/services/*/jest.config.js` - Test configuration

**Output Document:** `docs/testing/TEST_INFRASTRUCTURE_STATUS.md`

**Critical Questions to Answer:**
1. What's the overall test coverage?
2. Which services have good tests?
3. Which services have no tests?
4. Can tests run in CI environment?
5. How long do tests take to run?

---

### 4.3 Docker Image Build Requirements
**What We Need:**
- [ ] All Dockerfiles
- [ ] Base images used
- [ ] Multi-stage builds usage
- [ ] Image size optimization
- [ ] Build time per service
- [ ] Dependencies between images

**Where to Find:**
- `backend/services/*/Dockerfile`
- Docker build history if available

**Output Document:** `docs/cicd/DOCKER_BUILD_REQUIREMENTS.md`

**Critical Questions to Answer:**
1. Are Dockerfiles optimized?
2. What base images are used?
3. Are there multi-stage builds?
4. What's the average build time?
5. Are there build caching opportunities?

---

## PHASE 5: OBSERVABILITY RESEARCH
**Depends On:** Phase 0 Complete  
**Timeline:** Parallel to Phase 4 implementation  
**Effort:** 8-12 hours

### 5.1 Existing Metrics and Logging
**What We Need:**
- [ ] What metrics are currently collected
- [ ] Logging format and levels
- [ ] Existing monitoring infrastructure
- [ ] Alert rules (if any)
- [ ] Dashboard configuration (if any)

**Where to Find:**
- `backend/services/*/src/routes/metrics.routes.ts` - Metrics endpoints
- `backend/services/*/src/middleware` - Logging middleware
- `infrastructure/monitoring/` - Monitoring configs

**Output Document:** `docs/observability/CURRENT_OBSERVABILITY_STATE.md`

**Critical Questions to Answer:**
1. Are services exposing /metrics endpoints?
2. What metrics are being collected?
3. Is logging structured (JSON) or unstructured?
4. Is there any APM/monitoring currently?
5. What dashboards exist (if any)?

---

### 5.2 Critical Metrics Identification
**What We Need:**
- [ ] Key business metrics per service
- [ ] Technical metrics needed
- [ ] Error rates and types
- [ ] Performance baselines
- [ ] SLI/SLO definitions

**Where to Find:**
- Application code - identify key operations
- Business requirements
- Existing monitoring if any

**Output Document:** `docs/observability/CRITICAL_METRICS_DEFINITION.md`

**Critical Questions to Answer:**
1. What are the top 5 metrics per service?
2. What's considered "healthy" performance?
3. What metrics indicate problems?
4. What business metrics matter? (orders/hour, revenue, etc.)
5. What are acceptable error rates?

---

## PHASE 6: INFRASTRUCTURE AS CODE RESEARCH
**Depends On:** Phase 0, 3 Complete  
**Timeline:** Parallel to Phase 5 implementation  
**Effort:** 6-8 hours

### 6.1 Current Infrastructure Inventory
**What We Need:**
- [ ] AWS resources in use
- [ ] Database instances and configurations
- [ ] Network configuration (VPC, subnets)
- [ ] Security groups and IAM roles
- [ ] S3 buckets and policies
- [ ] Load balancers and DNS

**Where to Find:**
- AWS Console (if accessible)
- `infrastructure/` directory
- `docker-compose.yml` - Development setup

**Output Document:** `docs/infrastructure/CURRENT_INFRASTRUCTURE_INVENTORY.md`

**Critical Questions to Answer:**
1. What AWS resources are currently in use?
2. Is anything already managed by Terraform?
3. What's the network architecture?
4. What IAM roles exist?
5. What's manually configured vs automated?

---

### 6.2 Performance Optimization Opportunities
**What We Need:**
- [ ] Slow queries identified
- [ ] Large tables identified
- [ ] Caching opportunities
- [ ] Database configuration optimization
- [ ] CDN usage opportunities

**Where to Find:**
- Database query logs (if available)
- Application profiling (if available)
- Architecture analysis from Phase 0

**Output Document:** `docs/performance/OPTIMIZATION_OPPORTUNITIES.md`

**Critical Questions to Answer:**
1. What are the slowest queries?
2. Which tables need partitioning?
3. Where can we add caching?
4. What database settings need tuning?
5. What static assets should use CDN?

---

## DOCUMENTATION OUTPUT STRUCTURE

All research will produce documents in this structure:

```
docs/
├── reference/           # Phase 0 - Foundational
│   ├── DATABASE_SCHEMA_REFERENCE.md
│   ├── ENVIRONMENT_VARIABLES_REFERENCE.md
│   ├── SERVICE_ARCHITECTURE_MAP.md
│   ├── API_CONTRACTS_REFERENCE.md
│   └── NAMING_CONVENTIONS_STANDARD.md
├── security/            # Phase 1 - Security
│   ├── SECRETS_INVENTORY_AND_ROTATION.md
│   ├── DATABASE_SECURITY_STATUS.md
│   └── NON_POSTGRES_DATABASE_SECURITY.md
├── requirements/        # Phase 2 - Database
│   └── ORDER_SERVICE_REQUIREMENTS.md
├── performance/         # Phase 2, 6 - Performance
│   ├── INDEX_OPTIMIZATION_PLAN.md
│   └── OPTIMIZATION_OPPORTUNITIES.md
├── infrastructure/      # Phase 2, 3, 6 - Infrastructure
│   ├── CONNECTION_POOLING_STATUS.md
│   ├── CURRENT_INFRASTRUCTURE_INVENTORY.md
│   └── SSL_TLS_REQUIREMENTS.md
├── operations/          # Phase 2 - Operations
│   └── BACKUP_STATUS_AND_GAPS.md
├── kubernetes/          # Phase 3 - K8s
│   ├── EXISTING_K8S_INVENTORY.md
│   ├── SERVICE_RESOURCE_REQUIREMENTS.md
│   └── NETWORK_POLICY_REQUIREMENTS.md
├── cicd/                # Phase 4 - CI/CD
│   ├── EXISTING_CICD_INVENTORY.md
│   └── DOCKER_BUILD_REQUIREMENTS.md
├── testing/             # Phase 4 - Testing
│   └── TEST_INFRASTRUCTURE_STATUS.md
└── observability/       # Phase 5 - Observability
    ├── CURRENT_OBSERVABILITY_STATE.md
    └── CRITICAL_METRICS_DEFINITION.md
```

---

## RESEARCH EXECUTION PRIORITY

### Priority 1: IMMEDIATE (Do This Week)
1. **Phase 0.2** - Environment Variables & Secrets Audit (SECURITY RISK)
2. **Phase 1.1** - Secrets Location Audit (SECURITY RISK)
3. **Phase 0.1** - Database Schema Extraction (BLOCKS EVERYTHING)
4. **Phase 0.5** - Naming Conventions Analysis (PREVENTS ERRORS)

### Priority 2: CRITICAL (Next Week)
5. **Phase 1.2** - Database Security Scripts Audit
6. **Phase 0.3** - Service Architecture Mapping
7. **Phase 0.4** - API Contracts Documentation
8. **Phase 2.1** - Order Service Requirements
9. **Phase 1.3** - MongoDB/Redis/Elasticsearch Security Status

### Priority 3: HIGH (Week 3)
10. **Phase 2.2** - Index Performance Analysis
11. **Phase 2.3** - Connection Pooling Status
12. **Phase 2.4** - Backup Infrastructure Status
13. **Phase 3.1** - Existing Kubernetes Manifests Audit

### Priority 4: MEDIUM (Week 4)
14. **Phase 3.2** - Service Resource Requirements
15. **Phase 3.3** - Network Architecture
16. **Phase 4.1** - Existing CI/CD Analysis
17. **Phase 5.1** - Existing Metrics and Logging

### Priority 5: LOWER (As Time Permits)
18. **Phase 3.4** - SSL/TLS Requirements
19. **Phase 4.2** - Test Infrastructure Status
20. **Phase 4.3** - Docker Build Requirements
21. **Phase 5.2** - Critical Metrics Identification
22. **Phase 6.1** - Current Infrastructure Inventory
23. **Phase 6.2** - Performance Optimization Opportunities

---

## RESEARCH METHODOLOGY

For each research task:

1. **Gather Raw Data**
   - Search codebase
   - Read configuration files
   - Extract actual examples

2. **Analyze Patterns**
   - Identify consistency vs inconsistency
   - Note exceptions and edge cases
   - Document current state honestly

3. **Document Findings**
   - Use concrete examples
   - Include file paths and line numbers
   - Show actual code snippets
   - List gaps and unknowns

4. **Create Reference**
   - Organize for easy lookup
   - Include copy-pasteable examples
   - Cross-reference related docs

5. **Validate Accuracy**
   - Double-check column names
   - Verify file paths
   - Test any assumptions

---

## SUCCESS CRITERIA

Research is complete when:
- [ ] All Priority 1 & 2 documents created
- [ ] Phase 1 implementation can begin with confidence
- [ ] No assumptions about column names or API contracts
- [ ] Clear picture of what exists vs what's missing
- [ ] Team can reference docs instead of guessing

---

**REMEMBER:** The goal is to extract TRUTH from the codebase, not make assumptions. When in doubt, search more, document what you find, and flag unknowns.

---

**Next Steps:**
1. Review this map with the team
2. Begin Priority 1 research
3. Update this map as we learn more
4. Use completed documents during implementation
