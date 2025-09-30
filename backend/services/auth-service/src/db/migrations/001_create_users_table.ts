import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('phone', 20);
    table.boolean('email_verified').defaultTo(false);
    table.boolean('phone_verified').defaultTo(false);
    table.enum('kyc_status', ['pending', 'verified', 'rejected']).defaultTo('pending');
    table.integer('kyc_level').defaultTo(0);
    table.boolean('mfa_enabled').defaultTo(false);
    table.string('mfa_secret', 255);
    table.jsonb('backup_codes').defaultTo('[]');
    table.timestamps(true, true);
    table.timestamp('last_login_at');
    table.string('last_login_ip', 45);
    table.integer('failed_login_attempts').defaultTo(0);
    table.timestamp('locked_until');
    table.string('password_reset_token', 255);
    table.timestamp('password_reset_expires');
    table.string('email_verification_token', 255);
    table.timestamp('email_verification_expires');
    
    // Soft delete columns
    table.timestamp('deleted_at');
    table.uuid('deleted_by');
    table.string('deletion_reason', 255);
    
    // Optimistic locking
    table.integer('version').defaultTo(0);
    
    // Indexes
    table.index('email');
    table.index('deleted_at');
    table.index(['email', 'deleted_at']);
    table.index('last_login_at');
    table.index('password_reset_token');
    table.index('email_verification_token');
  });

  // Create user_venue_roles table
  await knex.schema.createTable('user_venue_roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    table.uuid('venue_id').notNullable();
    table.enum('role', ['venue-owner', 'venue-manager', 'box-office', 'door-staff']).notNullable();
    table.uuid('granted_by').notNullable().references('users.id');
    table.timestamp('granted_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    // Indexes
    table.unique(['user_id', 'venue_id', 'role']);
    table.index('user_id');
    table.index('venue_id');
    table.index(['venue_id', 'role']);
    table.index('expires_at');
  });

  // Create user_sessions table
  await knex.schema.createTable('user_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    table.string('session_token', 255).notNullable().unique();
    table.string('ip_address', 45).notNullable();
    table.text('user_agent');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.timestamp('revoked_at');
    
    // Indexes
    table.index('session_token');
    table.index('user_id');
    table.index('expires_at');
  });

  // Create login_attempts table
  await knex.schema.createTable('login_attempts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable();
    table.string('ip_address', 45).notNullable();
    table.boolean('success').notNullable();
    table.timestamp('attempted_at').notNullable().defaultTo(knex.fn.now());
    table.string('failure_reason', 100);
    
    // Indexes
    table.index(['email', 'attempted_at']);
    table.index(['ip_address', 'attempted_at']);
    table.index(['email', 'ip_address', 'attempted_at']);
  });

  // Create updated_at trigger function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Apply trigger to tables
  const tables = ['users', 'user_venue_roles'];
  for (const tableName of tables) {
    await knex.raw(`
      CREATE TRIGGER update_${tableName}_updated_at 
      BEFORE UPDATE ON ${tableName} 
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS update_users_updated_at ON users');
  await knex.raw('DROP TRIGGER IF EXISTS update_user_venue_roles_updated_at ON user_venue_roles');
  
  // Drop function
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');
  
  // Drop tables
  await knex.schema.dropTableIfExists('login_attempts');
  await knex.schema.dropTableIfExists('user_sessions');
  await knex.schema.dropTableIfExists('user_venue_roles');
  await knex.schema.dropTableIfExists('users');
}
