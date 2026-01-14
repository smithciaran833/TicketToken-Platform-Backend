# ADR 004: Migration Naming Convention

## Status
Accepted

## Date
2024-12-28

## Context
Database migrations need a consistent naming convention for:
- Ordering (which migrations run first)
- Identification (what each migration does)
- Conflict prevention (multiple developers creating migrations)

## Decision

### Current Approach: Sequential Numbering
We use sequential numbering with descriptive names:
```
001_baseline_orders.ts
002_add_refund_policies.ts
003_add_tax_tables.ts
```

### Alternative Considered: Timestamp Prefix
Some teams use timestamp prefixes:
```
20241228143022_baseline_orders.ts
20241228150000_add_refund_policies.ts
```

### Why We Chose Sequential

**Pros of Sequential:**
- Easier to read and understand order
- Simpler mental model
- Works well for small-medium teams
- Clear conflict detection (two 004_ files)

**Cons of Sequential:**
- Can cause conflicts if two developers create same number
- Requires coordination on numbering

**Pros of Timestamp:**
- No conflicts (each timestamp unique)
- Works better for large distributed teams
- Automatic ordering by creation time

**Cons of Timestamp:**
- Harder to read
- Can lead to many migrations if not squashed regularly

### Mitigation for Sequential Conflicts
1. Check existing migrations before creating new ones
2. Use PR process to catch conflicts
3. If conflict occurs, renumber before merge

## Migration Naming Rules

1. **Format:** `NNN_descriptive_name.ts`
   - NNN = three-digit sequence number (001, 002, etc.)
   - descriptive_name = snake_case description

2. **Description Guidelines:**
   - Start with action verb: `add_`, `remove_`, `update_`, `create_`
   - Be specific: `add_dispute_tracking` not `update_orders`
   - Keep under 50 characters

3. **Examples:**
```
   001_baseline_orders.ts
   002_add_refund_policies.ts
   003_add_tax_tables.ts
   004_add_dispute_tracking.ts
   005_add_payout_fields.ts
```

## Future Consideration

If the team grows significantly (>10 developers working on migrations frequently), consider switching to timestamp prefixes. This would require:
1. Updating Knex configuration
2. Creating a migration to bridge naming conventions
3. Updating documentation

## References
- [Knex Migration CLI](https://knexjs.org/guide/migrations.html)
- [Rails Active Record Migrations](https://guides.rubyonrails.org/active_record_migrations.html)
