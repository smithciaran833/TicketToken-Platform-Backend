/**
 * Migration Helper Utilities
 * 
 * Provides helper functions for database migrations to ensure consistency
 * across all services. Use these utilities when creating new migrations.
 */

import { Knex } from 'knex';

// Standard tenant context setting name
export const TENANT_CONTEXT_SETTING = 'app.current_tenant_id';

/**
 * Options for creating a table with standard columns
 */
export interface StandardTableOptions {
  /** Include tenant_id column and RLS */
  multiTenant?: boolean;
  /** Include created_at and updated_at columns */
  timestamps?: boolean;
  /** Include deleted_at for soft deletes */
  softDelete?: boolean;
  /** Include updated_at trigger */
  updatedAtTrigger?: boolean;
  /** Include audit trigger */
  auditTrigger?: boolean;
  /** Additional columns to add after standard columns */
  additionalColumns?: (table: Knex.CreateTableBuilder) => void;
}

const DEFAULT_OPTIONS: StandardTableOptions = {
  multiTenant: true,
  timestamps: true,
  softDelete: false,
  updatedAtTrigger: true,
  auditTrigger: false,
};

/**
 * Creates a table with standard columns and configurations.
 * Includes UUID primary key, tenant_id, timestamps, and optional features.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table to create
 * @param columnsBuilder - Function to add custom columns
 * @param options - Configuration options
 */
export async function createStandardTable(
  knex: Knex,
  tableName: string,
  columnsBuilder: (table: Knex.CreateTableBuilder) => void,
  options: StandardTableOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  await knex.schema.createTable(tableName, (table) => {
    // UUID primary key
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));

    // Multi-tenant support
    if (opts.multiTenant) {
      table.uuid('tenant_id').notNullable();
      table.index('tenant_id', `idx_${tableName}_tenant_id`);
    }

    // Custom columns
    columnsBuilder(table);

    // Additional columns (if any)
    if (opts.additionalColumns) {
      opts.additionalColumns(table);
    }

    // Timestamps
    if (opts.timestamps) {
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    }

    // Soft delete
    if (opts.softDelete) {
      table.timestamp('deleted_at', { useTz: true });
      table.index('deleted_at', `idx_${tableName}_deleted_at`);
    }
  });

  // Add updated_at trigger
  if (opts.timestamps && opts.updatedAtTrigger) {
    await addUpdatedAtTrigger(knex, tableName);
  }

  // Add audit trigger
  if (opts.auditTrigger) {
    await addAuditTrigger(knex, tableName);
  }

  // Enable RLS for multi-tenant tables
  if (opts.multiTenant) {
    await enableTableRLS(knex, tableName);
  }
}

/**
 * Adds the updated_at trigger to a table.
 * Requires the update_updated_at_column() function to exist.
 * Idempotent: drops existing trigger first if it exists.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 */
export async function addUpdatedAtTrigger(knex: Knex, tableName: string): Promise<void> {
  const triggerName = `trigger_update_${tableName}_timestamp`;
  
  // Drop existing trigger first (idempotent)
  await knex.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}`);
  
  await knex.raw(`
    CREATE TRIGGER ${triggerName}
    BEFORE UPDATE ON ${tableName}
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);
}

/**
 * Removes the updated_at trigger from a table.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 */
export async function removeUpdatedAtTrigger(knex: Knex, tableName: string): Promise<void> {
  const triggerName = `trigger_update_${tableName}_timestamp`;
  await knex.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}`);
}

/**
 * Adds the audit trigger to a table.
 * Requires the audit_trigger_function() to exist.
 * Idempotent: drops existing trigger first if it exists.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 */
export async function addAuditTrigger(knex: Knex, tableName: string): Promise<void> {
  const triggerName = `audit_${tableName}_changes`;
  
  // Drop existing trigger first (idempotent)
  await knex.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}`);
  
  await knex.raw(`
    CREATE TRIGGER ${triggerName}
    AFTER INSERT OR UPDATE OR DELETE ON ${tableName}
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function()
  `);
}

/**
 * Removes the audit trigger from a table.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 */
export async function removeAuditTrigger(knex: Knex, tableName: string): Promise<void> {
  const triggerName = `audit_${tableName}_changes`;
  await knex.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}`);
}

/**
 * Enables Row Level Security on a table with tenant isolation.
 * Idempotent: drops existing policy first if it exists.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 * @param tenantColumn - Name of the tenant ID column (default: 'tenant_id')
 */
export async function enableTableRLS(
  knex: Knex,
  tableName: string,
  tenantColumn: string = 'tenant_id'
): Promise<void> {
  const policyName = `${tableName}_tenant_isolation`;
  
  // Drop existing policy first (idempotent)
  await knex.raw(`DROP POLICY IF EXISTS ${policyName} ON ${tableName}`);
  
  // Enable RLS (safe to run multiple times)
  await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
  await knex.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);

  // Create tenant isolation policy
  await knex.raw(`
    CREATE POLICY ${policyName} ON ${tableName}
    FOR ALL
    USING (${tenantColumn} = current_setting('${TENANT_CONTEXT_SETTING}', true)::UUID)
    WITH CHECK (${tenantColumn} = current_setting('${TENANT_CONTEXT_SETTING}', true)::UUID)
  `);
}

/**
 * Disables Row Level Security on a table.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 */
export async function disableTableRLS(knex: Knex, tableName: string): Promise<void> {
  const policyName = `${tableName}_tenant_isolation`;
  
  await knex.raw(`DROP POLICY IF EXISTS ${policyName} ON ${tableName}`);
  await knex.raw(`ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY`);
}

/**
 * Creates a foreign key reference to another table.
 * Helper for consistent FK naming.
 * 
 * @param table - Knex table builder
 * @param columnName - Name of the FK column
 * @param referencedTable - Table being referenced
 * @param referencedColumn - Column being referenced (default: 'id')
 * @param onDelete - ON DELETE action (default: 'RESTRICT')
 */
export function addForeignKey(
  table: Knex.CreateTableBuilder,
  columnName: string,
  referencedTable: string,
  referencedColumn: string = 'id',
  onDelete: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION' = 'RESTRICT'
): Knex.ReferencingColumnBuilder {
  return table
    .uuid(columnName)
    .references(referencedColumn)
    .inTable(referencedTable)
    .onDelete(onDelete);
}

/**
 * Creates a nullable foreign key reference.
 * 
 * @param table - Knex table builder
 * @param columnName - Name of the FK column
 * @param referencedTable - Table being referenced
 * @param referencedColumn - Column being referenced (default: 'id')
 */
export function addNullableForeignKey(
  table: Knex.CreateTableBuilder,
  columnName: string,
  referencedTable: string,
  referencedColumn: string = 'id'
): Knex.ReferencingColumnBuilder {
  return table
    .uuid(columnName)
    .nullable()
    .references(referencedColumn)
    .inTable(referencedTable)
    .onDelete('SET NULL');
}

/**
 * Creates a composite unique index.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 * @param columns - Columns to include in the unique index
 * @param indexName - Optional custom index name
 */
export async function createCompositeUniqueIndex(
  knex: Knex,
  tableName: string,
  columns: string[],
  indexName?: string
): Promise<void> {
  const name = indexName || `idx_${tableName}_${columns.join('_')}_unique`;
  const columnList = columns.join(', ');
  
  await knex.raw(`CREATE UNIQUE INDEX ${name} ON ${tableName}(${columnList})`);
}

/**
 * Creates a partial unique index (unique only for non-deleted rows).
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 * @param columns - Columns to include in the unique index
 * @param indexName - Optional custom index name
 */
export async function createSoftDeleteUniqueIndex(
  knex: Knex,
  tableName: string,
  columns: string[],
  indexName?: string
): Promise<void> {
  const name = indexName || `idx_${tableName}_${columns.join('_')}_active`;
  const columnList = columns.join(', ');
  
  await knex.raw(`CREATE UNIQUE INDEX ${name} ON ${tableName}(${columnList}) WHERE deleted_at IS NULL`);
}

/**
 * Creates a GIN index for JSONB columns.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 * @param columnName - Name of the JSONB column
 * @param indexName - Optional custom index name
 */
export async function createJsonbIndex(
  knex: Knex,
  tableName: string,
  columnName: string,
  indexName?: string
): Promise<void> {
  const name = indexName || `idx_${tableName}_${columnName}_gin`;
  
  await knex.raw(`CREATE INDEX ${name} ON ${tableName} USING gin(${columnName})`);
}

/**
 * Creates a full-text search index.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 * @param columns - Text columns to include in the search
 * @param indexName - Optional custom index name
 * @param language - Text search language (default: 'english')
 */
export async function createFullTextSearchIndex(
  knex: Knex,
  tableName: string,
  columns: string[],
  indexName?: string,
  language: string = 'english'
): Promise<void> {
  const name = indexName || `idx_${tableName}_search`;
  const tsvectorExpression = columns
    .map(col => `COALESCE(${col}, '')`)
    .join(" || ' ' || ");
  
  await knex.raw(`
    CREATE INDEX ${name} ON ${tableName} 
    USING gin(to_tsvector('${language}', ${tsvectorExpression}))
  `);
}

/**
 * Safely drops a table with all its dependencies.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 */
export async function dropTableSafely(knex: Knex, tableName: string): Promise<void> {
  // Remove triggers first
  await removeUpdatedAtTrigger(knex, tableName);
  await removeAuditTrigger(knex, tableName);
  
  // Drop RLS if enabled
  try {
    await disableTableRLS(knex, tableName);
  } catch {
    // Table might not have RLS, ignore
  }
  
  // Drop the table
  await knex.schema.dropTableIfExists(tableName);
}

/**
 * Checks if a table exists in the database.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 * @returns true if the table exists
 */
export async function tableExists(knex: Knex, tableName: string): Promise<boolean> {
  return knex.schema.hasTable(tableName);
}

/**
 * Checks if a column exists in a table.
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 * @param columnName - Name of the column
 * @returns true if the column exists
 */
export async function columnExists(knex: Knex, tableName: string, columnName: string): Promise<boolean> {
  return knex.schema.hasColumn(tableName, columnName);
}

/**
 * Safely adds a column to a table (no-op if column exists).
 * 
 * @param knex - Knex instance
 * @param tableName - Name of the table
 * @param columnName - Name of the column
 * @param columnBuilder - Function to define the column
 */
export async function addColumnIfNotExists(
  knex: Knex,
  tableName: string,
  columnName: string,
  columnBuilder: (table: Knex.AlterTableBuilder) => void
): Promise<void> {
  const exists = await columnExists(knex, tableName, columnName);
  if (!exists) {
    await knex.schema.alterTable(tableName, columnBuilder);
  }
}

/**
 * Runs shared migrations in order.
 * Call this before service-specific migrations.
 * 
 * @param knex - Knex instance
 */
export async function runSharedMigrations(knex: Knex): Promise<void> {
  const { up: extensions } = await import('../migrations/000_shared_extensions');
  const { up: functions } = await import('../migrations/001_shared_functions');
  const { up: rlsHelpers } = await import('../migrations/002_shared_rls_helpers');

  console.log('[Migration] Running shared migrations...');
  
  await extensions(knex);
  await functions(knex);
  await rlsHelpers(knex);
  
  console.log('[Migration] Shared migrations completed');
}

/**
 * Reverts shared migrations in reverse order.
 * 
 * @param knex - Knex instance
 */
export async function revertSharedMigrations(knex: Knex): Promise<void> {
  const { down: rlsHelpers } = await import('../migrations/002_shared_rls_helpers');
  const { down: functions } = await import('../migrations/001_shared_functions');
  const { down: extensions } = await import('../migrations/000_shared_extensions');

  console.log('[Migration] Reverting shared migrations...');
  
  await rlsHelpers(knex);
  await functions(knex);
  await extensions(knex);
  
  console.log('[Migration] Shared migrations reverted');
}
