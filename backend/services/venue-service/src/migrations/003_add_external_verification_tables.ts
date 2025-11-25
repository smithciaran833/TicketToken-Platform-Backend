import { Knex } from 'knex';

/**
 * Migration: Add external verification and notification tables
 * Created for Phase 4 - External Integrations
 */
export async function up(knex: Knex): Promise<void> {
  // External verifications table
  await knex.schema.createTable('external_verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.string('provider').notNullable(); // stripe_identity, plaid, tax_verification, business_verification
    table.string('verification_type').notNullable(); // identity, bank_account, tax_id, business_info
    table.string('external_id').notNullable(); // External service verification ID
    table.string('status').notNullable().defaultTo('pending'); // pending, verified, failed, requires_manual_review
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('completed_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index(['venue_id']);
    table.index(['provider', 'status']);
    table.index(['external_id']);
    table.index(['created_at']);
  });

  // Manual review queue table
  await knex.schema.createTable('manual_review_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id'). notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('verification_id').references('id').inTable('external_verifications').onDelete('SET NULL');
    table.string('review_type').notNullable(); // identity, tax_id, bank_account, business_info
    table.string('priority').notNullable().defaultTo('medium'); // immediate, high, medium, low
    table.string('status').notNullable().defaultTo('pending'); // pending, in_review, completed, rejected
    table.uuid('assigned_to').references('id').inTable('users').onDelete('SET NULL');
    table.jsonb('metadata').defaultTo('{}');
    table.text('notes');
    table.timestamp('reviewed_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index(['venue_id']);
    table.index(['status', 'priority']);
    table.index(['assigned_to']);
    table.index(['created_at']);
  });

  // Notifications table
  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('type').notNullable(); // compliance_review_required, verification_complete, etc.
    table.string('priority').notNullable().defaultTo('medium'); // high, medium, low
    table.string('title').notNullable();
    table.text('message').notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.boolean('read').notNullable().defaultTo(false);
    table.timestamp('read_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    // Indexes
    table.index(['venue_id', 'read']);
    table.index(['user_id', 'read']);
    table.index(['type']);
    table.index(['created_at']);
  });

  // Email queue table
  await knex.schema.createTable('email_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('to_email').notNullable();
    table.string('subject').notNullable();
    table.string('template').notNullable();
    table.jsonb('data').notNullable().defaultTo('{}');
    table.string('priority').notNullable().defaultTo('medium'); // high, medium, low
    table.string('status').notNullable().defaultTo('pending'); // pending, sent, failed
    table.integer('attempts').notNullable().defaultTo(0);
    table.text('error_message');
    table.timestamp('sent_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index(['status', 'priority']);
    table.index(['created_at']);
  });

  // Venue compliance reviews table  
  await knex.schema.createTable('venue_compliance_reviews', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.timestamp('scheduled_date').notNullable();
    table.string('status').notNullable().defaultTo('scheduled'); // scheduled, in_progress, completed, cancelled
    table.uuid('reviewer_id').references('id').inTable('users').onDelete('SET NULL');
    table.jsonb('findings').defaultTo('{}');
    table.text('notes');
    table.timestamp('completed_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index(['venue_id']);
    table.index(['status', 'scheduled_date']);
    table.index(['reviewer_id']);
  });

  // Add venue_compliance table if it doesn't exist
  const hasComplianceTable = await knex.schema.hasTable('venue_compliance');
  if (!hasComplianceTable) {
    await knex.schema.createTable('venue_compliance', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE').unique();
      table.jsonb('settings').notNullable().defaultTo('{}');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['venue_id']);
    });
  }

  // Add venue_compliance_reports table if it doesn't exist
  const hasReportsTable = await knex.schema.hasTable('venue_compliance_reports');
  if (!hasReportsTable) {
    await knex.schema.createTable('venue_compliance_reports', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
      table.jsonb('report').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.index(['venue_id', 'created_at']);
    });
  }

  // Add venue_staff table if it doesn't exist (needed for notifications)
  const hasStaffTable = await knex.schema.hasTable('venue_staff');
  if (!hasStaffTable) {
    await knex.schema.createTable('venue_staff', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('email').notNullable();
      table.string('role').notNullable(); // owner, admin, manager, staff
      table.jsonb('permissions').defaultTo('[]');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['venue_id', 'user_id']);
      table.index(['venue_id']);
      table.index(['user_id']);
      table.index(['role']);
    });
  }

  // Add venue_documents table improvements if it exists
  const hasDocumentsTable = await knex.schema.hasTable('venue_documents');
  if (hasDocumentsTable) {
    const hasStatusColumn = await knex.schema.hasColumn('venue_documents', 'status');
    if (!hasStatusColumn) {
      await knex.schema.alterTable('venue_documents', (table) => {
        table.string('status').defaultTo('pending'); // pending, approved, rejected, pending_manual_review
        table.timestamp('submitted_at');
        table.jsonb('metadata').defaultTo('{}');
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order of creation
  await knex.schema.dropTableIfExists('email_queue');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('manual_review_queue');
  await knex.schema.dropTableIfExists('venue_compliance_reviews');
  await knex.schema.dropTableIfExists('venue_compliance_reports');
  await knex.schema.dropTableIfExists('venue_compliance');
  await knex.schema.dropTableIfExists('external_verifications');
  await knex.schema.dropTableIfExists('venue_staff');

  // Remove columns from venue_documents if they exist
  const hasDocumentsTable = await knex.schema.hasTable('venue_documents');
  if (hasDocumentsTable) {
    await knex.schema.alterTable('venue_documents', (table) => {
      table.dropColumn('status');
      table.dropColumn('submitted_at');
      table.dropColumn('metadata');
    });
  }
}
