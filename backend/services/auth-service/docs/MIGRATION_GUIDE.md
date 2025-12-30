# Database Migration Guide

## Best Practices

### 1. Always Set lock_timeout
```typescript
await knex.raw('SET lock_timeout = \'5s\'');
```
This prevents migrations from waiting indefinitely for locks on busy tables.

### 2. Use CONCURRENTLY for Indexes
```typescript
// ❌ WRONG - blocks all writes
await knex.raw('CREATE INDEX idx_name ON users(email)');

// ✅ CORRECT - allows concurrent writes
await knex.raw('CREATE INDEX CONCURRENTLY idx_name ON users(email)');
```

**Note:** CONCURRENTLY cannot run inside a transaction. Configure knex:
```typescript
// In migration file
export const config = { transaction: false };
```

### 3. Safe Column Addition

#### Adding a nullable column (safe)
```typescript
await knex.raw('ALTER TABLE users ADD COLUMN new_col TEXT');
```

#### Adding a NOT NULL column (3 steps)
```typescript
// Step 1: Add nullable
await knex.raw('ALTER TABLE users ADD COLUMN status TEXT');

// Step 2: Backfill (batch for large tables)
await knex.raw(`
  UPDATE users SET status = 'active' 
  WHERE status IS NULL AND id IN (
    SELECT id FROM users WHERE status IS NULL LIMIT 10000
  )
`);

// Step 3: Add constraint
await knex.raw('ALTER TABLE users ALTER COLUMN status SET NOT NULL');
```

### 4. Safe Column Removal (2 phases)
Phase 1 (deploy first):
- Remove all code references to the column
- Deploy application

Phase 2 (after deploy):
```typescript
await knex.raw('ALTER TABLE users DROP COLUMN old_column');
```

### 5. Naming Convention
Use timestamp prefix for predictable ordering:
```
20251230143000_add_user_status.ts
YYYYMMDDHHMMSS_description.ts
```

### 6. One Change Per Migration
❌ Don't combine unrelated changes
✅ One logical change per file

### 7. Test Rollbacks
Always test `down()` migration:
```bash
npx knex migrate:rollback
npx knex migrate:latest
```

## Production Checklist

- [ ] lock_timeout set
- [ ] Indexes use CONCURRENTLY 
- [ ] NOT NULL columns added safely
- [ ] Tested on production-like data volume
- [ ] down() migration tested
- [ ] Reviewed by second engineer
- [ ] Approved in CI/CD pipeline

## Emergency Rollback
```bash
# Rollback last migration
npx knex migrate:rollback

# Rollback to specific version
npx knex migrate:rollback --to 001_auth_baseline.ts
```
