import { Knex } from 'knex';

/**
 * Migration: Create application-specific database role
 * 
 * This migration creates a non-superuser database role for the minting service.
 * Using a dedicated role instead of 'postgres' ensures:
 * 1. Row Level Security (RLS) policies are enforced
 * 2. Principle of least privilege is followed
 * 3. Audit logs show the actual service making changes
 * 
 * IMPORTANT: This migration may need to be run by a DBA with superuser privileges
 * as creating roles requires elevated permissions.
 * 
 * After running this migration:
 * 1. Update .env with DB_USER=minting_app
 * 2. Set the password via secrets manager (not in code)
 * 3. Revoke unnecessary privileges from postgres user
 */
export async function up(knex: Knex): Promise<void> {
  // Check if we're running as superuser
  const currentUserResult = await knex.raw('SELECT current_user');
  const currentUser = currentUserResult.rows[0].current_user;
  
  console.log(`Running as database user: ${currentUser}`);

  // Get database name
  const dbNameResult = await knex.raw('SELECT current_database()');
  const dbName = dbNameResult.rows[0].current_database;

  try {
    // Create application role if it doesn't exist
    await knex.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'minting_app') THEN
          -- Create the role with login capability
          CREATE ROLE minting_app WITH 
            LOGIN 
            NOSUPERUSER 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION
            CONNECTION LIMIT 50
            PASSWORD NULL;  -- Password should be set separately via ALTER ROLE
          
          RAISE NOTICE 'Created role minting_app';
        ELSE
          RAISE NOTICE 'Role minting_app already exists';
        END IF;
      END
      $$;
    `);
    console.log('✅ Role minting_app created (or already exists)');

    // Grant connect permission
    await knex.raw(`GRANT CONNECT ON DATABASE ${dbName} TO minting_app`);
    console.log(`✅ Granted CONNECT on database ${dbName}`);

    // Grant schema usage
    await knex.raw(`GRANT USAGE ON SCHEMA public TO minting_app`);
    console.log('✅ Granted USAGE on schema public');

    // Grant table permissions (SELECT, INSERT, UPDATE, DELETE)
    await knex.raw(`
      GRANT SELECT, INSERT, UPDATE, DELETE 
      ON ALL TABLES IN SCHEMA public 
      TO minting_app
    `);
    console.log('✅ Granted table permissions');

    // Grant sequence permissions (needed for auto-increment columns)
    await knex.raw(`
      GRANT USAGE, SELECT 
      ON ALL SEQUENCES IN SCHEMA public 
      TO minting_app
    `);
    console.log('✅ Granted sequence permissions');

    // Set default privileges for future tables
    await knex.raw(`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO minting_app
    `);
    console.log('✅ Set default privileges for future tables');

    // Set default privileges for future sequences
    await knex.raw(`
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO minting_app
    `);
    console.log('✅ Set default privileges for future sequences');

    // Enable row-level security for the role
    // This ensures RLS policies are enforced when using this role
    await knex.raw(`
      ALTER ROLE minting_app SET row_security = on
    `);
    console.log('✅ Enabled row-level security for minting_app');

    // Set statement timeout to prevent runaway queries
    await knex.raw(`
      ALTER ROLE minting_app SET statement_timeout = '30s'
    `);
    console.log('✅ Set statement timeout to 30 seconds');

    // Set lock timeout to prevent long waits
    await knex.raw(`
      ALTER ROLE minting_app SET lock_timeout = '10s'
    `);
    console.log('✅ Set lock timeout to 10 seconds');

    console.log('');
    console.log('========================================');
    console.log('IMPORTANT: Next steps');
    console.log('========================================');
    console.log('1. Set password for minting_app role:');
    console.log("   ALTER ROLE minting_app WITH PASSWORD 'your-secure-password';");
    console.log('');
    console.log('2. Update your .env or secrets manager:');
    console.log('   DB_USER=minting_app');
    console.log('   DB_PASSWORD=your-secure-password');
    console.log('');
    console.log('3. Test the connection with the new role');
    console.log('========================================');

  } catch (error) {
    // If we don't have permission to create roles, provide instructions
    if ((error as Error).message.includes('permission denied')) {
      console.error('');
      console.error('⚠️  PERMISSION DENIED');
      console.error('This migration requires superuser privileges.');
      console.error('');
      console.error('Option 1: Run as postgres user:');
      console.error('  psql -U postgres -d tickettoken -f create_app_role.sql');
      console.error('');
      console.error('Option 2: Ask your DBA to run:');
      console.error('  CREATE ROLE minting_app WITH LOGIN PASSWORD \'...\';');
      console.error('  GRANT CONNECT ON DATABASE tickettoken TO minting_app;');
      console.error('  GRANT USAGE ON SCHEMA public TO minting_app;');
      console.error('  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO minting_app;');
      console.error('  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO minting_app;');
      console.error('');
    }
    throw error;
  }
}

export async function down(knex: Knex): Promise<void> {
  // Typically don't drop roles in down migration for safety
  // Dropping a role requires revoking all privileges first
  
  console.warn('');
  console.warn('⚠️  Role minting_app NOT dropped');
  console.warn('To manually remove the role:');
  console.warn('');
  console.warn('1. Revoke all privileges:');
  console.warn('   REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM minting_app;');
  console.warn('   REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM minting_app;');
  console.warn('   REVOKE USAGE ON SCHEMA public FROM minting_app;');
  console.warn('   REVOKE CONNECT ON DATABASE tickettoken FROM minting_app;');
  console.warn('');
  console.warn('2. Drop the role:');
  console.warn('   DROP ROLE IF EXISTS minting_app;');
  console.warn('');
}
