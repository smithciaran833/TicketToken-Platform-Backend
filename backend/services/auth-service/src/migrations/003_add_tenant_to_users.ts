import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // First check if tenants table exists, if not create it
  const hasTenantsTable = await knex.schema.hasTable('tenants');
  if (!hasTenantsTable) {
    await knex.schema.createTable('tenants', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name').notNullable();
      table.string('slug').unique().notNullable();
      table.string('status').defaultTo('active');
      table.jsonb('settings').defaultTo('{}');
      table.timestamps(true, true);
    });
    
    // Insert default tenant
    await knex('tenants').insert({
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Default Tenant',
      slug: 'default'
    });
  }

  // Add tenant_id to users table
  await knex.schema.alterTable('users', (table) => {
    table.uuid('tenant_id')
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .notNullable();
    table.index('tenant_id');
    table.index(['tenant_id', 'email']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['tenant_id', 'email']);
    table.dropIndex(['tenant_id']);
    table.dropColumn('tenant_id');
  });
}
