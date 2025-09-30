import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('user_id').nullable();
    table.string('action', 100).notNullable();
    table.string('resource_type', 50).nullable();
    table.string('resource_id').nullable();
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.jsonb('metadata').nullable();
    table.enum('status', ['success', 'failure']).notNullable().defaultTo('success');
    table.text('error_message').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index('user_id');
    table.index('action');
    table.index('created_at');
    table.index(['resource_type', 'resource_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}
