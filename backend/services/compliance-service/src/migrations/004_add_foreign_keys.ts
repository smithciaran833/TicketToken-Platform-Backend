import { Knex } from 'knex';

/**
 * Migration: Add internal foreign key constraints for referential integrity
 * 
 * CRITICAL: This migration adds foreign keys to enforce data consistency
 * within the compliance-service and prevent orphaned records.
 * 
 * Data Integrity Impact: HIGH - Ensures all internal references are valid
 * 
 * NOTE: Cross-service foreign keys are NOT included as they violate
 * microservice architectural principles. Cross-service referential integrity
 * should be handled at the application level.
 */

export async function up(knex: Knex): Promise<void> {
  console.log('Adding internal foreign key constraints...');
  
  // ==========================================
  // INTERNAL FOREIGN KEY CONSTRAINTS
  // ==========================================
  
  // Tax records -> venue_verifications
  await knex.schema.alterTable('tax_records', (t) => {
    t.foreign('venue_id')
      .references('venue_id')
      .inTable('venue_verifications')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
  console.log('✅ Added FK: tax_records -> venue_verifications');
  
  // OFAC checks -> venue_verifications
  await knex.schema.alterTable('ofac_checks', (t) => {
    t.foreign('venue_id')
      .references('venue_id')
      .inTable('venue_verifications')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
  console.log('✅ Added FK: ofac_checks -> venue_verifications');
  
  // Risk assessments -> venue_verifications
  await knex.schema.alterTable('risk_assessments', (t) => {
    t.foreign('venue_id')
      .references('venue_id')
      .inTable('venue_verifications')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
  console.log('✅ Added FK: risk_assessments -> venue_verifications');
  
  // Risk flags -> risk_assessments (FIX: reference 'id' not 'risk_assessment_id')
  await knex.schema.alterTable('risk_flags', (t) => {
    t.foreign('risk_assessment_id')
      .references('id')
      .inTable('risk_assessments')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
  console.log('✅ Added FK: risk_flags -> risk_assessments');
  
  // Compliance documents -> venue_verifications
  await knex.schema.alterTable('compliance_documents', (t) => {
    t.foreign('venue_id')
      .references('venue_id')
      .inTable('venue_verifications')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
  console.log('✅ Added FK: compliance_documents -> venue_verifications');
  
  // Bank verifications -> venue_verifications
  await knex.schema.alterTable('bank_verifications', (t) => {
    t.foreign('venue_id')
      .references('venue_id')
      .inTable('venue_verifications')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
  console.log('✅ Added FK: bank_verifications -> venue_verifications');
  
  // Payout methods -> venue_verifications
  await knex.schema.alterTable('payout_methods', (t) => {
    t.foreign('venue_id')
      .references('venue_id')
      .inTable('venue_verifications')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
  console.log('✅ Added FK: payout_methods -> venue_verifications');
  
  // Form 1099 records -> venue_verifications
  await knex.schema.alterTable('form_1099_records', (t) => {
    t.foreign('venue_id')
      .references('venue_id')
      .inTable('venue_verifications')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
  console.log('✅ Added FK: form_1099_records -> venue_verifications');
  
  // Customer preferences -> customer_profiles
  await knex.schema.alterTable('customer_preferences', (t) => {
    t.foreign('customer_id')
      .references('customer_id')
      .inTable('customer_profiles')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
  console.log('✅ Added FK: customer_preferences -> customer_profiles');
  
  // Customer analytics -> customer_profiles
  await knex.schema.alterTable('customer_analytics', (t) => {
    t.foreign('customer_id')
      .references('customer_id')
      .inTable('customer_profiles')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
  console.log('✅ Added FK: customer_analytics -> customer_profiles');
  
  // GDPR deletion requests -> customer_profiles
  await knex.schema.alterTable('gdpr_deletion_requests', (t) => {
    t.foreign('customer_id')
      .references('customer_id')
      .inTable('customer_profiles')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });
  console.log('✅ Added FK: gdpr_deletion_requests -> customer_profiles');
  
  console.log('');
  console.log('✅ All internal foreign key constraints added successfully');
  console.log('📊 Summary:');
  console.log('   - Internal FKs: 11');
  console.log('   - Total: 11 FK constraints');
  console.log('');
  console.log('⚠️  Note: Cross-service foreign keys omitted per microservice architecture');
  console.log('⚠️  Cross-service referential integrity handled at application level');
  console.log('⚠️  Orphaned records must be cleaned before this migration');
}

export async function down(knex: Knex): Promise<void> {
  console.log('Removing internal foreign key constraints...');
  
  // Drop all foreign keys in reverse order
  
  await knex.schema.alterTable('gdpr_deletion_requests', (t) => {
    t.dropForeign(['customer_id']);
  });
  console.log('✅ Dropped FK: gdpr_deletion_requests -> customer_profiles');
  
  await knex.schema.alterTable('customer_analytics', (t) => {
    t.dropForeign(['customer_id']);
  });
  console.log('✅ Dropped FK: customer_analytics -> customer_profiles');
  
  await knex.schema.alterTable('customer_preferences', (t) => {
    t.dropForeign(['customer_id']);
  });
  console.log('✅ Dropped FK: customer_preferences -> customer_profiles');
  
  await knex.schema.alterTable('form_1099_records', (t) => {
    t.dropForeign(['venue_id']);
  });
  console.log('✅ Dropped FK: form_1099_records -> venue_verifications');
  
  await knex.schema.alterTable('payout_methods', (t) => {
    t.dropForeign(['venue_id']);
  });
  console.log('✅ Dropped FK: payout_methods -> venue_verifications');
  
  await knex.schema.alterTable('bank_verifications', (t) => {
    t.dropForeign(['venue_id']);
  });
  console.log('✅ Dropped FK: bank_verifications -> venue_verifications');
  
  await knex.schema.alterTable('compliance_documents', (t) => {
    t.dropForeign(['venue_id']);
  });
  console.log('✅ Dropped FK: compliance_documents -> venue_verifications');
  
  await knex.schema.alterTable('risk_flags', (t) => {
    t.dropForeign(['risk_assessment_id']);
  });
  console.log('✅ Dropped FK: risk_flags -> risk_assessments');
  
  await knex.schema.alterTable('risk_assessments', (t) => {
    t.dropForeign(['venue_id']);
  });
  console.log('✅ Dropped FK: risk_assessments -> venue_verifications');
  
  await knex.schema.alterTable('ofac_checks', (t) => {
    t.dropForeign(['venue_id']);
  });
  console.log('✅ Dropped FK: ofac_checks -> venue_verifications');
  
  await knex.schema.alterTable('tax_records', (t) => {
    t.dropForeign(['venue_id']);
  });
  console.log('✅ Dropped FK: tax_records -> venue_verifications');
  
  console.log('✅ All internal foreign key constraints removed');
}
