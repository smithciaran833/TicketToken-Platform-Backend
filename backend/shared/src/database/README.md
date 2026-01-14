# Shared Database Infrastructure

This module provides standardized database utilities for all TicketToken services, ensuring consistent patterns for multi-tenant isolation, migrations, and Row Level Security (RLS).

## Overview

### What's Included

1. **Shared Migrations** - Database functions used by all services
2. **RLS Context Management** - Runtime tenant isolation utilities
3. **Migration Helpers** - Consistent table creation patterns

## Quick Start

### 1. Run Shared Migrations First

Before running service-specific migrations, ensure shared migrations have run:

```typescript
import { runSharedMigrations } from '@tickettoken/shared';
import knex from 'knex';

const db = knex(config);
await runSharedMigrations(db);
```

### 2. Create Tables with Standard Patterns

```typescript
import { createStandardTable } from '@tickettoken/shared';

export async function up(knex: Knex): Promise<void> {
  await createStandardTable(
    knex,
    'my_new_table',
    (table) => {
      table.string('name', 255).notNullable();
      table.text('description');
      table.uuid('category_id').references('id').inTable('categories');
    },
    {
      multiTenant: true,      // Adds tenant_id and RLS
      timestamps: true,       // Adds created_at, updated_at
      softDelete: true,       // Adds deleted_at
      updatedAtTrigger: true, // Auto-update updated_at
      auditTrigger: false,    // Optional audit logging
    }
  );
}
```

### 3. Set Tenant Context in Middleware

```typescript
import { createTenantContextMiddleware } from '@tickettoken/shared';
import { db } from './database';

// Apply to all routes that need tenant isolation
app.use(createTenantContextMiddleware(db));
```

### 4. Use Tenant Context in Service Layer

```typescript
import { withTenantContext, withContextTransaction } from '@tickettoken/shared';

// Simple context wrapper
async function getOrders(tenantId: string) {
  return withTenantContext(db, tenantId, async () => {
    // All queries here are automatically filtered by tenant
    return db('orders').select('*');
  });
}

// Transaction with full context
async function createOrder(context: DatabaseContext, orderData: OrderData) {
  return withContextTransaction(db, context, async (trx) => {
    const [order] = await trx('orders').insert(orderData).returning('*');
    // All operations in this transaction use the same tenant context
    return order;
  });
}
```

## Shared Migrations

### 000_shared_extensions.ts
Creates PostgreSQL extensions:
- `uuid-ossp` - UUID generation
- `pgcrypto` - Cryptographic functions
- `pg_trgm` - Fuzzy text search

### 001_shared_functions.ts
Creates shared database functions:

| Function | Purpose |
|----------|---------|
| `update_updated_at_column()` | Auto-updates `updated_at` on row changes |
| `set_tenant_context(uuid)` | Sets tenant context for session |
| `set_tenant_context_local(uuid)` | Sets tenant context for transaction |
| `get_tenant_context()` | Gets current tenant context |
| `require_tenant_context()` | Throws if no tenant context set |
| `audit_trigger_function()` | Creates audit log entries |
| `validate_tenant_id()` | Validates tenant_id matches context |
| `mask_email(text)` | Masks email for PII protection |
| `mask_phone(text)` | Masks phone for PII protection |
| `mask_card_number(text)` | Masks card number |
| `mask_tax_id(text)` | Masks SSN/tax ID |

### 002_shared_rls_helpers.ts
Creates RLS helper functions:

| Function | Purpose |
|----------|---------|
| `setup_table_rls(table, column)` | Enable RLS + create policy |
| `teardown_table_rls(table)` | Disable RLS + drop policy |
| `create_tenant_rls_policy(table, column)` | Create tenant isolation policy |
| `create_tenant_rls_policy_with_null(table, column)` | Allow NULL tenant_id |
| `create_read_only_rls_policy(table, column)` | Read all, write own tenant |
| `list_tables_without_rls()` | Find tables missing RLS |
| `list_tables_with_rls()` | List tables with RLS enabled |
| `list_rls_policies()` | List all RLS policies |

## Standardized Tenant Context Setting

**IMPORTANT:** All services MUST use the same setting name for RLS:

```
app.current_tenant_id
```

This is defined in `TENANT_CONTEXT_SETTING` constant and used by all RLS policies.

## Migration Best Practices

### DO:
- ✅ Run shared migrations before service migrations
- ✅ Use `createStandardTable()` for new tables
- ✅ Always include `tenant_id` for multi-tenant tables
- ✅ Enable RLS on all tables with tenant data
- ✅ Use `withTenantContext()` or `withContextTransaction()` in service code

### DON'T:
- ❌ Create `update_updated_at_column()` in service migrations (it's shared)
- ❌ Create `audit_trigger_function()` in service migrations (it's shared)
- ❌ Use different RLS setting names (`app.tenant_id`, `app.current_tenant`, etc.)
- ❌ Query tables without setting tenant context first

## API Reference

### RLS Context Functions

```typescript
// Set tenant context for session
await setTenantContext(db, tenantId);

// Set tenant context for current transaction only
await setTenantContextLocal(trx, tenantId);

// Get current tenant context
const tenantId = await getTenantContext(db);

// Clear tenant context
await clearTenantContext(db);

// Set full context (tenant, user, IP, user agent)
await setFullContext(db, {
  tenantId: '...',
  userId: '...',
  ipAddress: '...',
  userAgent: '...',
});
```

### Migration Helper Functions

```typescript
// Enable RLS on existing table
await enableTableRLS(db, 'my_table', 'tenant_id');

// Disable RLS
await disableTableRLS(db, 'my_table');

// Add triggers
await addUpdatedAtTrigger(db, 'my_table');
await addAuditTrigger(db, 'my_table');

// Create indexes
await createCompositeUniqueIndex(db, 'orders', ['user_id', 'event_id']);
await createJsonbIndex(db, 'users', 'metadata');
await createFullTextSearchIndex(db, 'events', ['name', 'description']);
```

## Troubleshooting

### "permission denied for table"
You forgot to set tenant context. Ensure middleware or `withTenantContext()` is used.

### "Tenant context not set"
The `require_tenant_context()` function was called but context wasn't set.

### RLS not filtering data
Check that:
1. RLS is enabled: `ALTER TABLE x ENABLE ROW LEVEL SECURITY`
2. RLS is forced: `ALTER TABLE x FORCE ROW LEVEL SECURITY`
3. Policy exists with correct setting name
4. Tenant context is set before query

### Checking RLS status
```sql
-- List tables without RLS
SELECT * FROM list_tables_without_rls();

-- List tables with RLS
SELECT * FROM list_tables_with_rls();

-- List all RLS policies
SELECT * FROM list_rls_policies();
```
