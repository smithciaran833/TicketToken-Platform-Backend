import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🔄 Adding price locking support to event_capacity...');
  
  await knex.schema.alterTable('event_capacity', (table) => {
    table.jsonb('locked_price_data').nullable()
      .comment('Stores locked pricing at reservation time: {pricing_id, locked_price, locked_at, fees}');
  });

  console.log('✅ Migration 002 complete - Price locking added');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('event_capacity', (table) => {
    table.dropColumn('locked_price_data');
  });
}
