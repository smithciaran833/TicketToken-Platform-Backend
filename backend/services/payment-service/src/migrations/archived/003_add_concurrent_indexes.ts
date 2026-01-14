/**
 * Migration: Add Concurrent Indexes
 * 
 * CRITICAL FIX:
 * - Uses CREATE INDEX CONCURRENTLY to avoid blocking writes
 * - Adds missing indexes for performance
 * - Must be run OUTSIDE of transaction (Knex config required)
 * 
 * NOTE: This migration requires special handling:
 * - Set lock_timeout before running
 * - Run with disableTransactions: true in knex config
 */

import { Knex } from 'knex';

// Indexes to create concurrently
const INDEXES = [
  // Payment transactions - primary lookup indexes
  { table: 'payment_transactions', columns: ['tenant_id'], name: 'idx_payment_transactions_tenant_id_concurrent' },
  { table: 'payment_transactions', columns: ['user_id'], name: 'idx_payment_transactions_user_id_concurrent' },
  { table: 'payment_transactions', columns: ['order_id'], name: 'idx_payment_transactions_order_id_concurrent' },
  { table: 'payment_transactions', columns: ['stripe_payment_intent_id'], name: 'idx_payment_transactions_stripe_intent_concurrent' },
  { table: 'payment_transactions', columns: ['status', 'created_at'], name: 'idx_payment_transactions_status_created_concurrent' },
  
  // Payment intents
  { table: 'payment_intents', columns: ['tenant_id'], name: 'idx_payment_intents_tenant_id_concurrent' },
  { table: 'payment_intents', columns: ['order_id'], name: 'idx_payment_intents_order_id_concurrent' },
  { table: 'payment_intents', columns: ['stripe_intent_id'], name: 'idx_payment_intents_stripe_intent_concurrent' },
  { table: 'payment_intents', columns: ['status'], name: 'idx_payment_intents_status_concurrent' },
  
  // Payment refunds
  { table: 'payment_refunds', columns: ['tenant_id'], name: 'idx_payment_refunds_tenant_id_concurrent' },
  { table: 'payment_refunds', columns: ['transaction_id'], name: 'idx_payment_refunds_transaction_id_concurrent' },
  { table: 'payment_refunds', columns: ['status'], name: 'idx_payment_refunds_status_concurrent' },
  
  // Royalty distributions
  { table: 'royalty_distributions', columns: ['tenant_id'], name: 'idx_royalty_distributions_tenant_id_concurrent' },
  { table: 'royalty_distributions', columns: ['transaction_id'], name: 'idx_royalty_distributions_transaction_concurrent' },
  { table: 'royalty_distributions', columns: ['status'], name: 'idx_royalty_distributions_status_concurrent' },
  { table: 'royalty_distributions', columns: ['recipient_id', 'status'], name: 'idx_royalty_distributions_recipient_status_concurrent' },
  
  // Webhook inbox
  { table: 'webhook_inbox', columns: ['tenant_id'], name: 'idx_webhook_inbox_tenant_id_concurrent' },
  { table: 'webhook_inbox', columns: ['status', 'created_at'], name: 'idx_webhook_inbox_status_created_concurrent' },
  { table: 'webhook_inbox', columns: ['provider', 'event_id'], name: 'idx_webhook_inbox_provider_event_concurrent' },
  
  // Fraud checks
  { table: 'fraud_checks', columns: ['user_id', 'timestamp'], name: 'idx_fraud_checks_user_timestamp_concurrent' },
  { table: 'fraud_checks', columns: ['device_fingerprint'], name: 'idx_fraud_checks_device_fingerprint_concurrent' },
  
  // Group payments
  { table: 'group_payments', columns: ['organizer_id'], name: 'idx_group_payments_organizer_concurrent' },
  { table: 'group_payments', columns: ['event_id'], name: 'idx_group_payments_event_concurrent' },
  { table: 'group_payments', columns: ['status'], name: 'idx_group_payments_status_concurrent' },
  
  // Payment escrows
  { table: 'payment_escrows', columns: ['listing_id'], name: 'idx_payment_escrows_listing_concurrent' },
  { table: 'payment_escrows', columns: ['buyer_id'], name: 'idx_payment_escrows_buyer_concurrent' },
  { table: 'payment_escrows', columns: ['seller_id'], name: 'idx_payment_escrows_seller_concurrent' },
  { table: 'payment_escrows', columns: ['status'], name: 'idx_payment_escrows_status_concurrent' },
];

export async function up(knex: Knex): Promise<void> {
  console.log('📊 Creating concurrent indexes for payment-service...');
  console.log('   ⚠️  This migration must be run OUTSIDE of transaction');
  
  // Set lock_timeout to prevent long waits
  await knex.raw(`SET lock_timeout = '5s'`);
  
  for (const idx of INDEXES) {
    const tableExists = await knex.schema.hasTable(idx.table);
    if (!tableExists) {
      console.log(`   ⚠️  Table ${idx.table} does not exist, skipping ${idx.name}...`);
      continue;
    }

    try {
      // Check if index already exists
      const indexExists = await knex.raw(`
        SELECT 1 FROM pg_indexes 
        WHERE tablename = ? AND indexname = ?
      `, [idx.table, idx.name]);
      
      if (indexExists.rows.length > 0) {
        console.log(`   ℹ️  Index ${idx.name} already exists, skipping...`);
        continue;
      }

      // Create index concurrently
      const columnsStr = idx.columns.join(', ');
      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${idx.name}
        ON ${idx.table} (${columnsStr})
      `);
      console.log(`   ✅ Created ${idx.name} on ${idx.table}(${columnsStr})`);
      
    } catch (err: any) {
      // CONCURRENTLY index creation can fail if there's a timeout
      // Log but don't fail the migration - index can be created later
      console.error(`   ❌ Failed to create ${idx.name}: ${err.message}`);
      
      // If it's a lock timeout, the index might be in an invalid state
      // Try to drop and recreate it
      if (err.message.includes('lock timeout') || err.message.includes('canceling')) {
        try {
          await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${idx.name}`);
          console.log(`   🔄 Dropped invalid index ${idx.name}, can retry later`);
        } catch (dropErr: any) {
          console.error(`   ❌ Failed to drop invalid index: ${dropErr.message}`);
        }
      }
    }
  }

  // Reset lock_timeout
  await knex.raw(`SET lock_timeout = '0'`);
  
  console.log('✅ Concurrent indexes migration completed!');
  console.log('   Note: Some indexes may have been skipped due to timeouts.');
  console.log('   Run this migration again during low traffic to complete.');
}

export async function down(knex: Knex): Promise<void> {
  console.log('📊 Dropping concurrent indexes...');
  
  for (const idx of INDEXES) {
    try {
      await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${idx.name}`);
      console.log(`   ✅ Dropped ${idx.name}`);
    } catch (err: any) {
      console.error(`   ❌ Failed to drop ${idx.name}: ${err.message}`);
    }
  }
  
  console.log('✅ Index rollback completed!');
}

// Export config for Knex to disable transaction wrapping
export const config = {
  transaction: false,
};
