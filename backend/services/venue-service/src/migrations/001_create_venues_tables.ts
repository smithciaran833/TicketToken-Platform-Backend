import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Venues table
  await knex.schema.createTable('venues', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('slug').unique().notNullable();
    table.string('type').notNullable(); // comedy_club, theater, etc
    table.jsonb('address').notNullable();
    table.string('city').notNullable();
    table.string('state').notNullable();
    table.string('zip_code');
    table.string('country').defaultTo('US');
    table.string('phone');
    table.string('email');
    table.string('website');
    table.integer('capacity');
    table.text('description');
    table.jsonb('operating_hours');
    table.jsonb('amenities');
    table.string('status').defaultTo('active'); // active, inactive, suspended
    table.boolean('is_public').defaultTo(true);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    table.timestamp('deleted_at');
    
    table.index(['city', 'state']);
    table.index('slug');
    table.index('status');
  });

  // Venue staff table
  await knex.schema.createTable('venue_staff', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('user_id').notNullable();
    table.string('role').notNullable(); // owner, manager, staff, scanner
    table.jsonb('permissions').defaultTo('[]');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.unique(['venue_id', 'user_id']);
    table.index('user_id');
  });

  // Venue layouts table
  await knex.schema.createTable('venue_layouts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.string('name').notNullable();
    table.jsonb('sections').notNullable(); // Array of sections with seats
    table.integer('total_capacity').notNullable();
    table.boolean('is_default').defaultTo(false);
    table.timestamps(true, true);
    
    table.index('venue_id');
  });

  // Venue integrations table
  await knex.schema.createTable('venue_integrations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.string('type').notNullable(); // square, toast, quickbooks, etc
    table.string('status').defaultTo('active');
    table.jsonb('config').defaultTo('{}');
    table.text('encrypted_credentials');
    table.timestamp('last_sync');
    table.timestamps(true, true);
    
    table.unique(['venue_id', 'type']);
  });

  // Venue settings table
  await knex.schema.createTable('venue_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.jsonb('ticket_settings').defaultTo('{}');
    table.jsonb('payment_settings').defaultTo('{}');
    table.jsonb('notification_settings').defaultTo('{}');
    table.jsonb('compliance_settings').defaultTo('{}');
    table.timestamps(true, true);
    
    table.unique('venue_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('venue_settings');
  await knex.schema.dropTableIfExists('venue_integrations');
  await knex.schema.dropTableIfExists('venue_layouts');
  await knex.schema.dropTableIfExists('venue_staff');
  await knex.schema.dropTableIfExists('venues');
}
