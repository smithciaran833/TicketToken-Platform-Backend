# Multi-Tenancy Audit Guide

**TicketToken Security Audit Series**  
*Blockchain Ticketing Platform - Microservices Architecture*

---

## Section 1: Standards & Best Practices

### Tenant Isolation Strategies

Multi-tenant architectures require careful consideration of data isolation. AWS identifies three primary models, each with distinct trade-offs between isolation, cost, and complexity.

**1. Silo Model (Database-per-Tenant)**

Each tenant has a dedicated database instance.

| Aspect | Detail |
|--------|--------|
| Isolation | Strongest - complete physical separation |
| Cost | Highest - dedicated resources per tenant |
| Complexity | High - infrastructure management per tenant |
| Use Case | Enterprise customers, regulated industries, compliance requirements |

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Tenant A   │  │  Tenant B   │  │  Tenant C   │
│  Database   │  │  Database   │  │  Database   │
└─────────────┘  └─────────────┘  └─────────────┘
```

**2. Bridge Model (Schema-per-Tenant)**

Single database instance with separate schema per tenant.

| Aspect | Detail |
|--------|--------|
| Isolation | Strong - logical separation at schema level |
| Cost | Medium - shared instance, separate namespaces |
| Complexity | Medium - schema management per tenant |
| Use Case | Mid-market customers needing stronger isolation |

```
┌─────────────────────────────────────┐
│         Shared Database             │
│  ┌─────────┐ ┌─────────┐ ┌───────┐  │
│  │Schema A │ │Schema B │ │Schema C│ │
│  └─────────┘ └─────────┘ └───────┘  │
└─────────────────────────────────────┘
```

**3. Pool Model (Row-Level Security)**

Shared database and schema with tenant_id column on all tables.

| Aspect | Detail |
|--------|--------|
| Isolation | Logical - enforced via RLS policies |
| Cost | Lowest - maximum resource sharing |
| Complexity | Lower infrastructure, higher application complexity |
| Use Case | High-volume SaaS, SMB customers |

```
┌─────────────────────────────────────┐
│         Shared Database             │
│         Shared Schema               │
│  ┌─────────────────────────────────┐│
│  │ table: users                    ││
│  │ tenant_id | user_id | email     ││
│  │ A         | 1       | a@...     ││
│  │ B         | 2       | b@...     ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**Recommendation for TicketToken:** The Pool Model with PostgreSQL Row-Level Security (RLS) provides the best balance of operational simplicity and security for a high-volume ticketing platform. Consider hybrid approaches where premium enterprise tenants get dedicated schemas.

*Source: AWS Database Blog - Multi-tenant data isolation with PostgreSQL Row Level Security (https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)*

---

### PostgreSQL Row-Level Security (RLS) Implementation

RLS moves tenant isolation enforcement from application code to the database layer, providing defense-in-depth.

**Enable RLS on Tables:**

```sql
-- Enable RLS on a tenant-scoped table
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (important!)
ALTER TABLE tickets FORCE ROW LEVEL SECURITY;
```

**Create RLS Policies Using Session Variables:**

```sql
-- Create policy using current_setting for tenant context
CREATE POLICY tenant_isolation_policy ON tickets
  FOR ALL
  TO app_user
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Key Components:**
- `USING` clause: Filters rows for SELECT, UPDATE, DELETE
- `WITH CHECK` clause: Validates rows for INSERT, UPDATE
- `current_setting()`: Retrieves session variable set by application

**Setting Tenant Context per Transaction:**

```sql
-- Set at beginning of each request/transaction
SET LOCAL app.current_tenant_id = 'uuid-of-tenant';

-- Or use SET for session-level (connection pooling consideration)
SET app.current_tenant_id = 'uuid-of-tenant';
```

**Critical: Database Role Configuration**

```sql
-- Create application role WITHOUT superuser privileges
CREATE ROLE app_user WITH LOGIN PASSWORD 'secure_password';

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- NEVER use superuser roles - they bypass RLS!
-- NEVER grant BYPASSRLS to application roles
```

**Handle NULL Tenant Context:**

```sql
-- Safe policy that denies access when tenant not set
CREATE POLICY tenant_isolation_policy ON tickets
  FOR ALL
  TO app_user
  USING (
    current_setting('app.current_tenant_id', true) IS NOT NULL
    AND tenant_id = current_setting('app.current_tenant_id')::uuid
  );
```

The second parameter `true` in `current_setting()` returns NULL instead of error if not set.

*Source: Crunchy Data - Row Level Security for Tenants in Postgres (https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)*

*Source: The Nile Dev Blog - Shipping multi-tenant SaaS using Postgres Row-Level Security (https://www.thenile.dev/blog/multi-tenant-rls)*

---

### Tenant Context Propagation

Tenant context must flow securely from authentication through all layers of the application.

**JWT Claims for Tenant ID:**

```typescript
// JWT payload structure
interface JWTPayload {
  sub: string;           // User ID
  tenant_id: string;     // Tenant ID (REQUIRED)
  org_id?: string;       // Organization within tenant
  roles: string[];       // User roles within tenant
  iat: number;
  exp: number;
}

// Example token payload
{
  "sub": "user_123",
  "tenant_id": "tenant_abc",
  "roles": ["admin", "ticket_manager"],
  "iat": 1702569600,
  "exp": 1702573200
}
```

**Middleware for Tenant Context Extraction (Fastify):**

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { AsyncLocalStorage } from 'async_hooks';

// Tenant context storage
export const tenantContext = new AsyncLocalStorage<{ tenantId: string }>();

// Middleware to extract and validate tenant
export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Extract tenant from verified JWT (NOT from request body or headers)
  const tenantId = request.user?.tenant_id;
  
  if (!tenantId) {
    return reply.code(401).send({ 
      error: 'Missing tenant context',
      message: 'Authentication token must include tenant_id claim'
    });
  }
  
  // Validate tenant ID format
  if (!isValidUUID(tenantId)) {
    return reply.code(400).send({
      error: 'Invalid tenant ID format'
    });
  }
  
  // Store in AsyncLocalStorage for access throughout request
  tenantContext.enterWith({ tenantId });
  
  // Also attach to request for convenience
  request.tenantId = tenantId;
}

// Helper to get current tenant
export function getCurrentTenantId(): string {
  const ctx = tenantContext.getStore();
  if (!ctx?.tenantId) {
    throw new Error('Tenant context not initialized');
  }
  return ctx.tenantId;
}
```

**Propagating Tenant to Database:**

```typescript
import { Knex } from 'knex';

// Wrapper that sets tenant context before each query
export async function withTenantContext<T>(
  knex: Knex,
  tenantId: string,
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  return knex.transaction(async (trx) => {
    // Set PostgreSQL session variable
    await trx.raw(`SET LOCAL app.current_tenant_id = ?`, [tenantId]);
    
    // Execute the actual query
    return callback(trx);
  });
}

// Usage
const tickets = await withTenantContext(knex, tenantId, async (trx) => {
  return trx('tickets').where('status', 'active');
  // RLS automatically filters by tenant_id
});
```

*Source: Frontegg - The Rise of JWT Multi Tenant Authentication (https://frontegg.com/guides/how-to-persist-jwt-tokens-for-your-saas-application)*

*Source: DEV Community - Authentication in Multi-Tenant Systems (https://dev.to/marketing_leobit_ef7281cd/authentication-in-multi-tenant-systems-1mnh)*

---

### Tenant-Scoped Queries

Even with RLS enabled, application-level query scoping provides defense-in-depth.

**Knex Query Builder Pattern:**

```typescript
// Base query builder that enforces tenant scope
class TenantScopedQuery {
  constructor(
    private knex: Knex,
    private tenantId: string
  ) {}
  
  // All queries automatically scoped
  table(tableName: string) {
    return this.knex(tableName).where('tenant_id', this.tenantId);
  }
  
  // Insert with automatic tenant_id
  async insert(tableName: string, data: Record<string, any> | Record<string, any>[]) {
    const records = Array.isArray(data) ? data : [data];
    const withTenant = records.map(r => ({
      ...r,
      tenant_id: this.tenantId
    }));
    return this.knex(tableName).insert(withTenant);
  }
  
  // Raw query with tenant parameter
  async raw(sql: string, bindings: any[] = []) {
    // Validate SQL doesn't bypass tenant filter
    if (this.containsDangerousPatterns(sql)) {
      throw new Error('Query pattern not allowed');
    }
    return this.knex.raw(sql, [...bindings, this.tenantId]);
  }
  
  private containsDangerousPatterns(sql: string): boolean {
    const dangerous = [
      /DELETE\s+FROM\s+\w+\s*;/i,  // DELETE without WHERE
      /UPDATE\s+\w+\s+SET.*(?!WHERE)/i,  // UPDATE without WHERE
      /TRUNCATE/i,
      /DROP/i
    ];
    return dangerous.some(pattern => pattern.test(sql));
  }
}

// Factory function
export function createTenantQuery(knex: Knex, request: FastifyRequest) {
  const tenantId = request.tenantId;
  if (!tenantId) {
    throw new Error('Request missing tenant context');
  }
  return new TenantScopedQuery(knex, tenantId);
}
```

**Objection.js Model with Query Builder Hook:**

```typescript
import { Model, QueryBuilder } from 'objection';

class TenantModel extends Model {
  tenant_id!: string;
  
  static get modifiers() {
    return {
      tenantScope(builder: QueryBuilder<TenantModel>, tenantId: string) {
        builder.where('tenant_id', tenantId);
      }
    };
  }
  
  // Automatically apply tenant filter to all queries
  $beforeInsert() {
    // Tenant ID should be set by the service layer
    if (!this.tenant_id) {
      throw new Error('tenant_id is required');
    }
  }
}

// Usage in service
class TicketService {
  async getTickets(tenantId: string) {
    return Ticket.query()
      .modify('tenantScope', tenantId)
      .where('status', 'active');
  }
}
```

*Source: Objection.js - Multitenancy using multiple databases (https://vincit.github.io/objection.js/recipes/multitenancy-using-multiple-databases.html)*

*Source: Knex GitHub Issue - Request scoped query filters for multi-tenant applications (https://github.com/knex/knex/issues/4823)*

---

### Cross-Tenant Data Access Controls

Some operations legitimately require cross-tenant access. These must be carefully controlled.

**System-Level Operations (Bypass RLS):**

```typescript
// Separate database connection for system operations
const systemKnex = knex({
  client: 'pg',
  connection: {
    ...baseConfig,
    user: 'system_admin'  // Has BYPASSRLS for admin operations
  }
});

// Tenant onboarding (needs to create tenant records)
async function createTenant(tenantData: TenantInput) {
  // Use system connection - no RLS applied
  return systemKnex('tenants').insert({
    id: generateUUID(),
    name: tenantData.name,
    status: 'active',
    created_at: new Date()
  });
}

// Analytics across all tenants (admin only)
async function getTenantMetrics(adminUser: AdminUser) {
  // Verify admin permissions
  if (!adminUser.hasPermission('view_all_tenants')) {
    throw new ForbiddenError('Insufficient permissions');
  }
  
  // Audit log the cross-tenant access
  await auditLog.record({
    action: 'cross_tenant_query',
    user: adminUser.id,
    resource: 'tenant_metrics',
    timestamp: new Date()
  });
  
  return systemKnex('tenants')
    .select('id', 'name')
    .count('* as user_count')
    .leftJoin('users', 'tenants.id', 'users.tenant_id')
    .groupBy('tenants.id');
}
```

**Shared/Global Resources:**

```sql
-- Tables without tenant_id (shared across all tenants)
CREATE TABLE countries (
  id SERIAL PRIMARY KEY,
  code VARCHAR(2) NOT NULL,
  name VARCHAR(100) NOT NULL
);

-- No RLS policy needed - accessible to all tenants
-- But mark explicitly as global in documentation

-- Tenant-specific configuration references global data
CREATE TABLE tenant_settings (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  default_country_id INTEGER REFERENCES countries(id),
  -- RLS applies to this table
  ...
);
```

**Cross-Tenant Data Sharing (Explicit):**

```typescript
// Marketplace scenarios where tenants share data
interface DataShareGrant {
  id: string;
  source_tenant_id: string;
  target_tenant_id: string;
  resource_type: 'event' | 'ticket_listing';
  resource_id: string;
  permissions: ('read' | 'purchase')[];
  expires_at: Date;
}

// Check share permissions before cross-tenant access
async function accessSharedResource(
  requestingTenantId: string,
  resourceType: string,
  resourceId: string
) {
  const grant = await knex('data_share_grants')
    .where({
      target_tenant_id: requestingTenantId,
      resource_type: resourceType,
      resource_id: resourceId
    })
    .where('expires_at', '>', new Date())
    .first();
    
  if (!grant) {
    throw new ForbiddenError('No access grant for this resource');
  }
  
  return grant;
}
```

*Source: OWASP Cloud Tenant Isolation (https://owasp.org/www-project-cloud-tenant-isolation/)*

---

### Tenant-Specific Configuration

Each tenant may have different settings, feature flags, and customizations.

**Configuration Schema:**

```sql
CREATE TABLE tenant_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) UNIQUE,
  
  -- Feature flags
  features JSONB NOT NULL DEFAULT '{}',
  
  -- Branding
  branding JSONB NOT NULL DEFAULT '{}',
  
  -- Limits and quotas
  max_events_per_month INTEGER DEFAULT 100,
  max_tickets_per_event INTEGER DEFAULT 10000,
  
  -- Integration settings (encrypted)
  stripe_account_id VARCHAR(255),
  webhook_secret_encrypted BYTEA,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE tenant_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_config_isolation ON tenant_configurations
  FOR ALL TO app_user
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Configuration Service:**

```typescript
interface TenantConfig {
  features: {
    nftMinting: boolean;
    secondaryMarketplace: boolean;
    customBranding: boolean;
  };
  limits: {
    maxEventsPerMonth: number;
    maxTicketsPerEvent: number;
  };
  branding: {
    primaryColor: string;
    logoUrl: string;
  };
}

class TenantConfigService {
  private cache: Map<string, { config: TenantConfig; expiresAt: Date }>;
  
  async getConfig(tenantId: string): Promise<TenantConfig> {
    // Check cache first
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > new Date()) {
      return cached.config;
    }
    
    // Load from database
    const config = await this.loadConfigFromDb(tenantId);
    
    // Cache for 5 minutes
    this.cache.set(tenantId, {
      config,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    
    return config;
  }
  
  async isFeatureEnabled(tenantId: string, feature: keyof TenantConfig['features']): Promise<boolean> {
    const config = await this.getConfig(tenantId);
    return config.features[feature] ?? false;
  }
}
```

*Source: Clerk - How to Design a Multi-Tenant SaaS Architecture (https://clerk.com/blog/how-to-design-multitenant-saas-architecture)*

---

### Tenant Onboarding and Offboarding

Secure tenant lifecycle management is critical for multi-tenant systems.

**Onboarding Flow:**

```typescript
interface TenantOnboardingInput {
  name: string;
  adminEmail: string;
  plan: 'starter' | 'professional' | 'enterprise';
  subdomain?: string;
}

async function onboardTenant(input: TenantOnboardingInput): Promise<Tenant> {
  // Use system connection (bypasses RLS for creation)
  return systemKnex.transaction(async (trx) => {
    // 1. Create tenant record
    const [tenant] = await trx('tenants').insert({
      id: generateUUID(),
      name: input.name,
      subdomain: input.subdomain || generateSubdomain(input.name),
      plan: input.plan,
      status: 'provisioning',
      created_at: new Date()
    }).returning('*');
    
    // 2. Create default configuration
    await trx('tenant_configurations').insert({
      tenant_id: tenant.id,
      features: getDefaultFeatures(input.plan),
      max_events_per_month: getPlanLimit(input.plan, 'events'),
      max_tickets_per_event: getPlanLimit(input.plan, 'tickets')
    });
    
    // 3. Create admin user
    const [adminUser] = await trx('users').insert({
      id: generateUUID(),
      tenant_id: tenant.id,
      email: input.adminEmail,
      role: 'admin',
      status: 'pending_verification'
    }).returning('*');
    
    // 4. Create initial roles and permissions
    await createDefaultRoles(trx, tenant.id);
    
    // 5. Update tenant status
    await trx('tenants')
      .where('id', tenant.id)
      .update({ status: 'active' });
    
    // 6. Audit log
    await trx('audit_logs').insert({
      tenant_id: tenant.id,
      action: 'tenant_created',
      actor_type: 'system',
      details: { plan: input.plan }
    });
    
    return tenant;
  });
}
```

**Offboarding Flow (Data Retention Compliant):**

```typescript
async function offboardTenant(
  tenantId: string, 
  options: { retainDataDays: number; reason: string }
): Promise<void> {
  return systemKnex.transaction(async (trx) => {
    // 1. Verify tenant exists and is active
    const tenant = await trx('tenants')
      .where('id', tenantId)
      .first();
      
    if (!tenant || tenant.status === 'deleted') {
      throw new NotFoundError('Tenant not found');
    }
    
    // 2. Revoke all active sessions
    await trx('sessions')
      .where('tenant_id', tenantId)
      .delete();
    
    // 3. Disable all users
    await trx('users')
      .where('tenant_id', tenantId)
      .update({ status: 'disabled', disabled_at: new Date() });
    
    // 4. Mark tenant for deletion (soft delete)
    await trx('tenants')
      .where('id', tenantId)
      .update({
        status: 'pending_deletion',
        deletion_scheduled_at: new Date(
          Date.now() + options.retainDataDays * 24 * 60 * 60 * 1000
        ),
        deletion_reason: options.reason
      });
    
    // 5. Audit log
    await trx('audit_logs').insert({
      tenant_id: tenantId,
      action: 'tenant_offboarded',
      actor_type: 'system',
      details: { 
        reason: options.reason,
        retention_days: options.retainDataDays 
      }
    });
  });
}

// Scheduled job to permanently delete expired tenants
async function purgeDeletedTenants(): Promise<void> {
  const expiredTenants = await systemKnex('tenants')
    .where('status', 'pending_deletion')
    .where('deletion_scheduled_at', '<', new Date());
    
  for (const tenant of expiredTenants) {
    await permanentlyDeleteTenantData(tenant.id);
  }
}
```

*Source: AWS Guidance for Multi-Tenant Architectures (https://aws.amazon.com/solutions/guidance/multi-tenant-architectures-on-aws/)*

---

## Section 2: Common Vulnerabilities & Mistakes

### Missing tenant_id in Queries

**The Vulnerability:**
The most common multi-tenancy bug is forgetting to filter by tenant_id, exposing data across tenants.

**Vulnerable Code:**

```typescript
// VULNERABLE: No tenant filter
async function getTickets() {
  return knex('tickets').where('status', 'active');
  // Returns ALL tenants' tickets!
}

// VULNERABLE: Tenant filter forgotten in join
async function getTicketsWithEvents() {
  return knex('tickets')
    .where('tickets.tenant_id', tenantId)
    .join('events', 'tickets.event_id', 'events.id');
    // Events table not filtered - could leak cross-tenant event data
}

// VULNERABLE: Subquery without tenant filter
async function getTopSellingEvents() {
  return knex('events')
    .where('tenant_id', tenantId)
    .whereIn('id', knex('tickets').select('event_id').groupBy('event_id'));
    // Subquery returns ALL tenants' ticket data
}
```

**Secure Code:**

```typescript
// SECURE: RLS handles filtering automatically
async function getTickets(tenantId: string) {
  return withTenantContext(knex, tenantId, (trx) => {
    return trx('tickets').where('status', 'active');
    // RLS policy filters by tenant_id automatically
  });
}

// SECURE: Explicit filtering on all tables
async function getTicketsWithEvents(tenantId: string) {
  return knex('tickets')
    .where('tickets.tenant_id', tenantId)
    .join('events', function() {
      this.on('tickets.event_id', '=', 'events.id')
          .andOn('events.tenant_id', '=', knex.raw('?', [tenantId]));
    });
}

// SECURE: Subquery also filtered
async function getTopSellingEvents(tenantId: string) {
  return knex('events')
    .where('tenant_id', tenantId)
    .whereIn('id', 
      knex('tickets')
        .where('tenant_id', tenantId)  // Critical!
        .select('event_id')
        .groupBy('event_id')
    );
}
```

**Prevention: Use RLS as Safety Net**

Even with application-level filtering, RLS provides defense-in-depth. If a developer forgets a filter, RLS prevents data leakage.

*Source: OWASP Top 10 2021 - A01:2021 Broken Access Control (https://owasp.org/Top10/2025/0x00_2025-Introduction/)*

---

### Tenant ID from Request Body Instead of Auth Token

**The Vulnerability:**
Trusting client-provided tenant ID allows attackers to access other tenants' data by simply changing a parameter.

**Vulnerable Code:**

```typescript
// VULNERABLE: Tenant ID from request body
app.post('/api/tickets', async (req, res) => {
  const { tenant_id, event_id, quantity } = req.body;
  
  // Attacker can set tenant_id to any value!
  const tickets = await knex('tickets').insert({
    tenant_id,  // From untrusted input
    event_id,
    quantity
  });
  
  res.json(tickets);
});

// VULNERABLE: Tenant ID from URL parameter
app.get('/api/tenants/:tenantId/tickets', async (req, res) => {
  const { tenantId } = req.params;
  
  // User can access any tenant by changing URL
  const tickets = await knex('tickets')
    .where('tenant_id', tenantId);
    
  res.json(tickets);
});

// VULNERABLE: Tenant ID from header (spoofable)
app.get('/api/tickets', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'];
  
  // Headers are trivially spoofable!
  const tickets = await knex('tickets')
    .where('tenant_id', tenantId);
    
  res.json(tickets);
});
```

**Secure Code:**

```typescript
// SECURE: Tenant ID from verified JWT only
app.post('/api/tickets', async (req, res) => {
  // Extract from verified JWT (set by auth middleware)
  const tenantId = req.user.tenant_id;  // From JWT claims
  
  const { event_id, quantity } = req.body;
  
  const tickets = await knex('tickets').insert({
    tenant_id: tenantId,  // From authenticated token
    event_id,
    quantity
  });
  
  res.json(tickets);
});

// SECURE: Validate URL tenant matches JWT tenant
app.get('/api/tenants/:tenantId/tickets', async (req, res) => {
  const urlTenantId = req.params.tenantId;
  const jwtTenantId = req.user.tenant_id;
  
  // Verify URL matches authenticated tenant
  if (urlTenantId !== jwtTenantId) {
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'You can only access your own tenant data'
    });
  }
  
  const tickets = await knex('tickets')
    .where('tenant_id', jwtTenantId);
    
  res.json(tickets);
});
```

*Source: Dana Epp's Blog - Cross-Tenant Data Leaks: Why API Hackers Should Be On The Lookout (https://danaepp.com/cross-tenant-data-leaks-ctdl-why-api-hackers-should-be-on-the-lookout)*

---

### Cross-Tenant Data Leakage

**The Vulnerability:**
Data from one tenant becomes accessible to another tenant through various vectors.

**Common Leakage Vectors:**

```typescript
// LEAK: Error messages expose cross-tenant data
async function getTicket(ticketId: string, tenantId: string) {
  const ticket = await knex('tickets').where('id', ticketId).first();
  
  if (!ticket) {
    // Attacker can enumerate ticket IDs across tenants
    throw new NotFoundError(`Ticket ${ticketId} not found`);
  }
  
  if (ticket.tenant_id !== tenantId) {
    // This message confirms the ticket EXISTS in another tenant!
    throw new ForbiddenError('Access denied to this ticket');
  }
  
  return ticket;
}

// LEAK: Timing attack reveals existence
async function checkTicketExists(ticketId: string, tenantId: string) {
  const ticket = await knex('tickets').where('id', ticketId).first();
  
  if (ticket && ticket.tenant_id === tenantId) {
    return true;
  }
  return false;  // Same response regardless of existence
  // But timing differs if ticket exists vs doesn't!
}

// LEAK: Logs contain cross-tenant information
async function processPayment(paymentData: PaymentInput) {
  logger.info('Processing payment', {
    amount: paymentData.amount,
    tenant_id: paymentData.tenant_id,
    user_email: paymentData.userEmail  // PII in logs!
  });
}

// LEAK: Cache key collision
const getCachedTicket = async (ticketId: string) => {
  // WRONG: Cache key doesn't include tenant
  const cached = await redis.get(`ticket:${ticketId}`);
  // Returns cached data from ANY tenant!
};
```

**Secure Patterns:**

```typescript
// SECURE: Consistent error messages
async function getTicket(ticketId: string, tenantId: string) {
  // Query filters by BOTH id AND tenant
  const ticket = await knex('tickets')
    .where('id', ticketId)
    .where('tenant_id', tenantId)
    .first();
  
  if (!ticket) {
    // Same error whether ticket doesn't exist or belongs to another tenant
    throw new NotFoundError('Ticket not found');
  }
  
  return ticket;
}

// SECURE: Tenant-scoped cache keys
const getCachedTicket = async (ticketId: string, tenantId: string) => {
  // Cache key includes tenant
  const cacheKey = `tenant:${tenantId}:ticket:${ticketId}`;
  return redis.get(cacheKey);
};

// SECURE: Sanitized logging
async function processPayment(paymentData: PaymentInput, tenantId: string) {
  logger.info('Processing payment', {
    amount: paymentData.amount,
    tenant_id: tenantId,
    // No PII, or use structured logging with redaction
  });
}
```

*Source: Clerk Blog - What are the risks and challenges of multi-tenancy? (https://clerk.com/blog/what-are-the-risks-and-challenges-of-multi-tenancy)*

---

### Shared Resources Without Tenant Isolation

**The Vulnerability:**
Resources shared across tenants (caches, queues, file storage) can leak data if not properly isolated.

**Vulnerable Patterns:**

```typescript
// VULNERABLE: Shared Redis cache without tenant prefix
await redis.set(`user:${userId}`, userData);
// Another tenant with same userId gets wrong data

// VULNERABLE: S3 bucket without tenant path
const key = `uploads/${fileName}`;
await s3.upload({ Bucket: 'uploads', Key: key, Body: file });
// Files from different tenants can overwrite each other

// VULNERABLE: Message queue without tenant routing
await queue.send('notifications', { 
  userId,
  message: 'Your ticket is ready'
});
// Wrong tenant's worker might process this

// VULNERABLE: Elasticsearch index without tenant filter
const results = await es.search({
  index: 'tickets',
  body: { query: { match: { status: 'active' } } }
});
// Returns tickets from ALL tenants
```

**Secure Patterns:**

```typescript
// SECURE: Tenant-prefixed cache keys
const CACHE_PREFIX = (tenantId: string) => `tenant:${tenantId}`;

await redis.set(`${CACHE_PREFIX(tenantId)}:user:${userId}`, userData);

// SECURE: Tenant-scoped S3 paths
const key = `tenants/${tenantId}/uploads/${fileName}`;
await s3.upload({ Bucket: 'uploads', Key: key, Body: file });

// Bonus: S3 bucket policy can enforce tenant isolation
// using IAM conditions on the path prefix

// SECURE: Tenant-routed message queues
await queue.send(`notifications-${tenantId}`, { 
  userId,
  message: 'Your ticket is ready'
});
// Or include tenantId in message and filter in consumer

// SECURE: Elasticsearch with tenant filter
const results = await es.search({
  index: 'tickets',
  body: { 
    query: { 
      bool: {
        must: [
          { match: { status: 'active' } },
          { term: { tenant_id: tenantId } }  // Required filter
        ]
      }
    } 
  }
});
```

*Source: Josys - Multitenancy: How Shared Infrastructure Can Expose Security Vulnerabilities (https://www.josys.com/article/multitenancy-how-shared-infrastructure-can-expose-security-vulnerabilities)*

---

### Missing Tenant Context in Background Jobs

**The Vulnerability:**
Background jobs often run outside the HTTP request context, losing tenant information.

**Vulnerable Pattern:**

```typescript
// VULNERABLE: Job loses tenant context
// API Handler
app.post('/api/reports/generate', async (req, res) => {
  const { reportType } = req.body;
  const tenantId = req.user.tenant_id;
  
  // Queue job but don't pass tenant!
  await queue.add('generate-report', { reportType });
  
  res.json({ status: 'queued' });
});

// Job Processor - NO TENANT CONTEXT!
queue.process('generate-report', async (job) => {
  const { reportType } = job.data;
  
  // Which tenant's data should we use???
  const data = await knex('events').select('*');  // ALL TENANTS!
  
  return generateReport(data);
});
```

**Secure Pattern:**

```typescript
// SECURE: Pass tenant context to job
// API Handler
app.post('/api/reports/generate', async (req, res) => {
  const { reportType } = req.body;
  const tenantId = req.user.tenant_id;
  const userId = req.user.sub;
  
  // Always include tenant context in job payload
  await queue.add('generate-report', { 
    reportType,
    tenantId,      // Critical!
    userId,        // For audit trail
    requestedAt: new Date().toISOString()
  });
  
  res.json({ status: 'queued' });
});

// Job Processor
queue.process('generate-report', async (job) => {
  const { reportType, tenantId, userId } = job.data;
  
  // Validate tenant context exists
  if (!tenantId) {
    throw new Error('Job missing tenant context');
  }
  
  // Set tenant context for database queries
  await withTenantContext(knex, tenantId, async (trx) => {
    // Set PostgreSQL session variable for RLS
    await trx.raw(`SET LOCAL app.current_tenant_id = ?`, [tenantId]);
    
    const data = await trx('events').select('*');
    // RLS filters by tenant automatically
    
    return generateReport(data);
  });
});

// For recurring jobs that run for all tenants
async function processAllTenants(jobFn: (tenantId: string) => Promise<void>) {
  // Use system connection to get all tenants
  const tenants = await systemKnex('tenants')
    .where('status', 'active')
    .select('id');
  
  // Process each tenant with proper isolation
  for (const tenant of tenants) {
    try {
      await withTenantContext(knex, tenant.id, async () => {
        await jobFn(tenant.id);
      });
    } catch (error) {
      logger.error('Job failed for tenant', { 
        tenantId: tenant.id, 
        error: error.message 
      });
    }
  }
}
```

*Source: Tenancy for Laravel - Queues (https://tenancyforlaravel.com/docs/v3/queues/)*

*Source: acts_as_tenant GitHub - Background jobs (https://github.com/ErwinM/acts_as_tenant)*

---

### Tenant ID Not Validated Against Authenticated User

**The Vulnerability:**
User's JWT tenant claim doesn't match the tenant they're trying to access, and validation is missing.

**Vulnerable Pattern:**

```typescript
// VULNERABLE: No validation of tenant access rights
app.get('/api/events', async (req, res) => {
  const tenantId = req.query.tenant_id || req.user.tenant_id;
  
  // User can pass ANY tenant_id as query param!
  const events = await knex('events')
    .where('tenant_id', tenantId);
    
  res.json(events);
});

// VULNERABLE: Admin endpoint without proper tenant validation
app.post('/api/admin/users', async (req, res) => {
  const { email, role, tenant_id } = req.body;
  
  // Even admins should only manage their own tenant!
  await knex('users').insert({
    email,
    role,
    tenant_id  // Could be any tenant
  });
});
```

**Secure Pattern:**

```typescript
// Middleware to enforce tenant context
export function enforceTenantContext(
  req: FastifyRequest, 
  reply: FastifyReply
) {
  const jwtTenantId = req.user?.tenant_id;
  
  // Check various places where tenant might be specified
  const requestedTenantId = 
    req.params.tenantId || 
    req.query.tenant_id || 
    req.body?.tenant_id;
  
  // If tenant is specified in request, it MUST match JWT
  if (requestedTenantId && requestedTenantId !== jwtTenantId) {
    logger.warn('Tenant mismatch attempt', {
      jwtTenant: jwtTenantId,
      requestedTenant: requestedTenantId,
      userId: req.user?.sub,
      path: req.url
    });
    
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Tenant access denied'
    });
  }
  
  // Always use JWT tenant, never trust request input
  req.tenantId = jwtTenantId;
}

// For users who belong to multiple tenants
interface MultiTenantJWT {
  sub: string;
  tenants: string[];  // Array of authorized tenant IDs
  active_tenant: string;  // Currently selected tenant
}

export function enforceMultiTenantContext(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const user = req.user as MultiTenantJWT;
  const requestedTenant = req.headers['x-tenant-id'] as string;
  
  // Use requested tenant if specified and authorized
  const targetTenant = requestedTenant || user.active_tenant;
  
  if (!user.tenants.includes(targetTenant)) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Not authorized for this tenant'
    });
  }
  
  req.tenantId = targetTenant;
}
```

*Source: ASP.NET Core - How to Implement Multitenancy with EF Core (https://antondevtips.com/blog/how-to-implement-multitenancy-in-asp-net-core-with-ef-core)*

---

## Section 3: Audit Checklist

### PostgreSQL RLS Configuration

| # | Check | Status |
|---|-------|--------|
| 1 | RLS enabled on ALL tenant-scoped tables (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) | ☐ |
| 2 | `FORCE ROW LEVEL SECURITY` applied to prevent table owner bypass | ☐ |
| 3 | Application uses non-superuser database role | ☐ |
| 4 | Application role does NOT have `BYPASSRLS` privilege | ☐ |
| 5 | RLS policies use `current_setting('app.current_tenant_id')` | ☐ |
| 6 | Policies handle NULL tenant context safely (deny access) | ☐ |
| 7 | Both `USING` and `WITH CHECK` clauses defined for INSERT/UPDATE | ☐ |
| 8 | Separate database role for migrations/admin operations | ☐ |
| 9 | System operations use dedicated bypass connection | ☐ |
| 10 | Audit logging for cross-tenant system operations | ☐ |

**SQL Verification Commands:**

```sql
-- Check RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Check policies exist
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';

-- Verify application role doesn't have bypass
SELECT rolname, rolsuper, rolbypassrls 
FROM pg_roles 
WHERE rolname = 'app_user';
```

---

### Knex Query Patterns

| # | Check | Status |
|---|-------|--------|
| 1 | All queries run within tenant context transaction | ☐ |
| 2 | `SET LOCAL app.current_tenant_id` called at transaction start | ☐ |
| 3 | No direct `knex()` calls - all through tenant-scoped wrapper | ☐ |
| 4 | JOIN queries filter both tables by tenant_id | ☐ |
| 5 | Subqueries include tenant_id filter | ☐ |
| 6 | INSERT statements include tenant_id (even with RLS) | ☐ |
| 7 | Raw SQL queries include tenant parameter | ☐ |
| 8 | Migrations run with separate admin connection | ☐ |
| 9 | No hardcoded tenant IDs in queries | ☐ |
| 10 | Query builder wrapper prevents dangerous patterns (TRUNCATE, DROP) | ☐ |

**Code Search Patterns:**

```bash
# Find queries that might be missing tenant_id
grep -rn "knex(" --include="*.ts" | grep -v "tenant_id"

# Find direct database access (should go through wrapper)
grep -rn "\.from\(" --include="*.ts" | head -20

# Find raw queries
grep -rn "\.raw\(" --include="*.ts"

# Find joins without tenant filter
grep -rn "\.join\(" --include="*.ts"

# Find subqueries
grep -rn "\.whereIn\(" --include="*.ts"
grep -rn "\.whereExists\(" --include="*.ts"
```

---

### JWT Claims & Middleware

| # | Check | Status |
|---|-------|--------|
| 1 | JWT contains `tenant_id` claim | ☐ |
| 2 | Tenant ID extracted from verified JWT only (not request body/headers) | ☐ |
| 3 | JWT signature verified before extracting claims | ☐ |
| 4 | Middleware sets tenant context before route handlers | ☐ |
| 5 | Missing tenant in JWT returns 401 | ☐ |
| 6 | Tenant ID format validated (UUID format check) | ☐ |
| 7 | URL tenant parameter validated against JWT tenant | ☐ |
| 8 | Request body tenant fields ignored (use JWT only) | ☐ |
| 9 | Multi-tenant users have tenant array in JWT | ☐ |
| 10 | Active tenant header validated against authorized tenants | ☐ |

**Middleware Verification:**

```typescript
// Test: Verify middleware rejects missing tenant
const response = await request(app)
  .get('/api/tickets')
  .set('Authorization', `Bearer ${tokenWithoutTenant}`);
expect(response.status).toBe(401);

// Test: Verify URL tenant mismatch is rejected
const response = await request(app)
  .get('/api/tenants/other-tenant-id/tickets')
  .set('Authorization', `Bearer ${tokenForTenantA}`);
expect(response.status).toBe(403);

// Test: Verify request body tenant is ignored
const response = await request(app)
  .post('/api/tickets')
  .set('Authorization', `Bearer ${tokenForTenantA}`)
  .send({ tenant_id: 'malicious-tenant-id', event_id: '123' });
// Created ticket should have tenant_id from JWT, not body
```

---

### Background Jobs

| # | Check | Status |
|---|-------|--------|
| 1 | All job payloads include `tenant_id` | ☐ |
| 2 | Job processor validates tenant_id presence | ☐ |
| 3 | Database context set before job execution | ☐ |
| 4 | Failed job doesn't leak tenant data in error messages | ☐ |
| 5 | Job retries maintain original tenant context | ☐ |
| 6 | Recurring jobs iterate tenants with proper isolation | ☐ |
| 7 | Job logs include tenant_id for debugging | ☐ |
| 8 | Queue names or routing include tenant for isolation | ☐ |
| 9 | Dead letter queue processing respects tenant context | ☐ |
| 10 | Job scheduling tied to tenant configuration (not global) | ☐ |

**Job Processor Template:**

```typescript
// Template for tenant-aware job processor
async function processJob<T extends { tenantId: string }>(
  job: Job<T>,
  processor: (data: T, tenantId: string) => Promise<void>
) {
  const { tenantId, ...rest } = job.data;
  
  // [CHECK 2] Validate tenant presence
  if (!tenantId) {
    throw new JobError('Job missing tenant context', { jobId: job.id });
  }
  
  // [CHECK 7] Include tenant in logs
  const logger = createLogger({ tenantId, jobId: job.id });
  
  try {
    // [CHECK 3] Set database context
    await withTenantContext(knex, tenantId, async () => {
      await processor(job.data, tenantId);
    });
  } catch (error) {
    // [CHECK 4] Sanitize error - don't leak cross-tenant info
    logger.error('Job failed', { 
      error: error.message,
      // Don't log full error.stack in production
    });
    throw error;
  }
}
```

---

### Shared Resources (Redis, S3, Elasticsearch)

| # | Check | Status |
|---|-------|--------|
| 1 | Redis keys prefixed with `tenant:{tenantId}:` | ☐ |
| 2 | S3 objects stored under `tenants/{tenantId}/` path | ☐ |
| 3 | Elasticsearch queries include `tenant_id` filter | ☐ |
| 4 | Cache invalidation scoped to tenant | ☐ |
| 5 | Presigned URLs include tenant path validation | ☐ |
| 6 | Message queue topics/routing include tenant | ☐ |
| 7 | Rate limiting applied per-tenant | ☐ |
| 8 | Resource quotas tracked per-tenant | ☐ |
| 9 | No global caches that could leak tenant data | ☐ |
| 10 | Elasticsearch indices separated by tenant (or filtered) | ☐ |

**Code Search for Shared Resource Issues:**

```bash
# Redis without tenant prefix
grep -rn "redis\." --include="*.ts" | grep -v "tenant"

# S3 paths without tenant
grep -rn "\.putObject\|\.upload" --include="*.ts" | grep -v "tenantId\|tenant_id"

# Elasticsearch without tenant filter
grep -rn "\.search\(" --include="*.ts"
```

---

### API Endpoints

| # | Check | Status |
|---|-------|--------|
| 1 | All authenticated routes use tenant middleware | ☐ |
| 2 | Error responses don't reveal cross-tenant data | ☐ |
| 3 | Pagination doesn't allow cross-tenant enumeration | ☐ |
| 4 | Search endpoints filter by tenant | ☐ |
| 5 | Bulk operations validate all items belong to tenant | ☐ |
| 6 | File downloads verify tenant ownership | ☐ |
| 7 | Webhooks validate tenant context | ☐ |
| 8 | GraphQL resolvers filter by tenant | ☐ |
| 9 | API rate limits applied per-tenant | ☐ |
| 10 | Admin endpoints have additional authorization | ☐ |

**API Security Test Cases:**

```typescript
describe('Multi-tenant API Security', () => {
  it('should not allow access to other tenant data via ID', async () => {
    // Create ticket in tenant A
    const ticket = await createTicket(tenantAToken);
    
    // Try to access from tenant B
    const response = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${tenantBToken}`);
    
    expect(response.status).toBe(404); // Not 403!
  });
  
  it('should not leak tenant info in error messages', async () => {
    const response = await request(app)
      .get('/api/tickets/nonexistent-id')
      .set('Authorization', `Bearer ${tenantAToken}`);
    
    expect(response.body.error).not.toContain('tenant');
    expect(response.body.error).not.toContain('other');
  });
  
  it('should filter search results by tenant', async () => {
    // Create tickets in both tenants
    await createTicket(tenantAToken, { title: 'Concert A' });
    await createTicket(tenantBToken, { title: 'Concert B' });
    
    // Search from tenant A
    const response = await request(app)
      .get('/api/tickets/search?q=Concert')
      .set('Authorization', `Bearer ${tenantAToken}`);
    
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0].title).toBe('Concert A');
  });
});
```

---

### Data Export & Reporting

| # | Check | Status |
|---|-------|--------|
| 1 | Export functions filter by tenant | ☐ |
| 2 | Report generation scoped to tenant | ☐ |
| 3 | Analytics queries include tenant filter | ☐ |
| 4 | Audit logs filtered by tenant for users | ☐ |
| 5 | Backup/restore operations tenant-aware | ☐ |
| 6 | Data deletion (GDPR) scoped to tenant | ☐ |
| 7 | Cross-tenant reports require admin auth | ☐ |
| 8 | Export files include tenant in filename | ☐ |

---

## Priority Matrix for TicketToken

### P0 - Critical (Implement Immediately)

1. **PostgreSQL RLS on all tenant tables** with proper policies
2. **Non-superuser database role** for application (no BYPASSRLS)
3. **JWT-based tenant extraction** (never from request body)
4. **Tenant context validation** middleware on all routes
5. **Background job tenant propagation** with validation

### P1 - High (Implement Within Sprint)

1. **Knex query wrapper** that enforces tenant context
2. **Tenant-scoped cache keys** for Redis
3. **Error message sanitization** (no cross-tenant info leakage)
4. **Join query tenant filtering** audit
5. **Audit logging** for all data access

### P2 - Medium (Implement Within Quarter)

1. **Elasticsearch tenant filtering** review
2. **S3 tenant path enforcement** with IAM policies
3. **Multi-tenant user support** (users in multiple tenants)
4. **Tenant configuration service** with caching
5. **Comprehensive integration tests** for tenant isolation

### P3 - Low (Backlog)

1. **Tenant onboarding automation**
2. **Tenant offboarding with data retention**
3. **Cross-tenant data sharing framework** (marketplace)
4. **Per-tenant rate limiting** configuration
5. **Tenant-level metrics and monitoring**

---

## Sources

1. AWS Database Blog - Multi-tenant data isolation with PostgreSQL Row Level Security  
   https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/

2. AWS Solutions - Guidance for Multi-Tenant Architectures on AWS  
   https://aws.amazon.com/solutions/guidance/multi-tenant-architectures-on-aws/

3. Crunchy Data - Row Level Security for Tenants in Postgres  
   https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres

4. The Nile Dev Blog - Shipping multi-tenant SaaS using Postgres Row-Level Security  
   https://www.thenile.dev/blog/multi-tenant-rls

5. Clerk Blog - How to Design a Multi-Tenant SaaS Architecture  
   https://clerk.com/blog/how-to-design-multitenant-saas-architecture

6. Clerk Blog - What are the risks and challenges of multi-tenancy?  
   https://clerk.com/blog/what-are-the-risks-and-challenges-of-multi-tenancy

7. OWASP - Cloud Tenant Isolation Project  
   https://owasp.org/www-project-cloud-tenant-isolation/

8. OWASP Top 10 2025 - Introduction (Broken Access Control #1)  
   https://owasp.org/Top10/2025/0x00_2025-Introduction/

9. Dana Epp's Blog - Cross-Tenant Data Leaks (CTDL)  
   https://danaepp.com/cross-tenant-data-leaks-ctdl-why-api-hackers-should-be-on-the-lookout

10. Frontegg - The Rise of JWT Multi Tenant Authentication  
    https://frontegg.com/guides/how-to-persist-jwt-tokens-for-your-saas-application

11. DEV Community - Authentication in Multi-Tenant Systems  
    https://dev.to/marketing_leobit_ef7281cd/authentication-in-multi-tenant-systems-1mnh

12. Logto Blog - Multi-tenancy implementation with PostgreSQL  
    https://blog.logto.io/implement-multi-tenancy

13. simplyblock - Row-Level Security for Multi-Tenant Applications  
    https://www.simplyblock.io/blog/underated-postgres-multi-tenancy-with-row-level-security/

14. Objection.js - Multitenancy using multiple databases  
    https://vincit.github.io/objection.js/recipes/multitenancy-using-multiple-databases.html

15. Knex GitHub - Request scoped query filters for multi-tenant applications  
    https://github.com/knex/knex/issues/4823

16. Tenancy for Laravel - Queues Documentation  
    https://tenancyforlaravel.com/docs/v3/queues/

17. acts_as_tenant GitHub - Multi-tenancy for Rails  
    https://github.com/ErwinM/acts_as_tenant

18. Rigby Blog - Implement Multi-Tenancy in Medusa with PostgreSQL RLS  
    https://www.rigbyjs.com/blog/multi-tenancy-in-medusa

19. Anton Dev Tips - How to Implement Multitenancy in ASP.NET Core with EF Core  
    https://antondevtips.com/blog/how-to-implement-multitenancy-in-asp-net-core-with-ef-core

20. DZone - Multi-Tenant Data Isolation and Row Level Security  
    https://dzone.com/articles/multi-tenant-data-isolation-row-level-security

21. Microsoft Learn - Row level security for Azure Cosmos DB for PostgreSQL  
    https://learn.microsoft.com/en-us/azure/cosmos-db/postgresql/concepts-row-level-security

22. Josys - Multitenancy: How Shared Infrastructure Can Expose Security Vulnerabilities  
    https://www.josys.com/article/multitenancy-how-shared-infrastructure-can-expose-security-vulnerabilities