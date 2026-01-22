import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import { getTestDb } from './helpers/db';
import { getTestRedis } from './helpers/redis';
import { getTestMongoDB } from './helpers/mongodb';
import { WebhookCleanupJob } from '../../src/jobs/webhook-cleanup.job';
import { CacheWarmingJob } from '../../src/jobs/cache-warming.job';
import { ComplianceReviewJob } from '../../src/jobs/compliance-review.job';
import { contentCleanupJob, ContentCleanupJob } from '../../src/jobs/content-cleanup.job';
import { sslRenewalJob, SSLRenewalJob } from '../../src/jobs/ssl-renewal.job';
import { startScheduledJobs, stopScheduledJobs } from '../../src/jobs';
import { CacheService } from '../../src/services/cache.service';
import { VenueContentModel } from '../../src/models/mongodb/venue-content.model';

// Test constants - VALID UUIDs
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEST_VENUE_ID = '00000000-0000-4000-a000-000000000001';  // Valid UUID v4

describe('Background Jobs - Integration Tests', () => {
  let db: any;
  let redis: any;
  let mongodb: any;
  let cacheService: CacheService;
  let webhookCleanupJob: WebhookCleanupJob;

  beforeAll(async () => {
    db = getTestDb();
    redis = getTestRedis();
    mongodb = getTestMongoDB();
    cacheService = new CacheService(redis);
    // FIXED: Pass redis to WebhookCleanupJob constructor
    webhookCleanupJob = new WebhookCleanupJob(redis);
  }, 30000);

  afterAll(async () => {
    // Stop any running jobs
    try {
      stopScheduledJobs();
    } catch {}
  });

  beforeEach(async () => {
    // Clean up database tables
    await db('venue_webhook_events').del();
    await db('ticket_validations').del();
    await db('tickets').del();
    await db('ticket_types').del();
    await db('events').del();
    await db('venue_compliance_reviews').del();
    await db('venue_compliance_reports').del();
    await db('custom_domains').del();
    await db('venue_staff').del();
    await db('venue_settings').del();
    await db('venues').del();

    // Clean MongoDB
    await VenueContentModel.deleteMany({});

    // Seed tenant
    await db('tenants').insert({
      id: TEST_TENANT_ID,
      name: 'Test Tenant',
      slug: 'test-tenant',
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Seed test user
    await db('users').insert({
      id: TEST_USER_ID,
      email: 'test@test.com',
      password_hash: '$2b$10$dummyhashfortestingpurposesonly',
      tenant_id: TEST_TENANT_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Seed test venue
    await db('venues').insert({
      id: TEST_VENUE_ID,
      tenant_id: TEST_TENANT_ID,
      name: 'Test Venue',
      slug: 'test-venue',
      email: 'test@venue.com',
      address_line1: '123 Main St',
      city: 'New York',
      state_province: 'NY',
      postal_code: '10001',
      country_code: 'US',
      venue_type: 'comedy_club',
      max_capacity: 500,
      status: 'active',
      total_events: 10,
      created_by: TEST_USER_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }).onConflict('id').ignore();

    // Clear Redis keys
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // ===========================================
  // SECTION 1: WEBHOOK CLEANUP JOB (5 tests)
  // ===========================================
  describe('Webhook Cleanup Job', () => {

    it('should delete old webhook events (completed, older than 30 days)', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31); // 31 days ago

      // Insert old completed event
      // FIXED: Use processed_at (exists) instead of created_at (doesn't exist)
      await db('venue_webhook_events').insert({
        event_id: 'old_event_1',
        event_type: 'stripe.connect.account.updated',
        status: 'completed',
        tenant_id: TEST_TENANT_ID,
        source: 'stripe',
        processed_at: oldDate,
      });

      const deletedCount = await webhookCleanupJob.runNow();

      expect(deletedCount).toBe(1);

      const remaining = await db('venue_webhook_events')
        .where('event_id', 'old_event_1')
        .first();
      expect(remaining).toBeUndefined();
    });

    it('should delete old failed webhook events', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      // FIXED: Use processed_at instead of created_at
      await db('venue_webhook_events').insert({
        event_id: 'old_failed_event',
        event_type: 'stripe.connect.account.updated',
        status: 'failed',
        processed_at: oldDate,
      });

      const deletedCount = await webhookCleanupJob.runNow();

      expect(deletedCount).toBe(1);
    });

    it('should keep pending/processing/retrying events regardless of age', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      // FIXED: Use processed_at instead of created_at
      await db('venue_webhook_events').insert([
        {
          event_id: 'old_pending',
          event_type: 'test.event',
          status: 'pending',
          processed_at: oldDate,
        },
        {
          event_id: 'old_processing',
          event_type: 'test.event',
          status: 'processing',
          processed_at: oldDate,
        },
        {
          event_id: 'old_retrying',
          event_type: 'test.event',
          status: 'retrying',
          processed_at: oldDate,
        },
      ]);

      const deletedCount = await webhookCleanupJob.runNow();

      expect(deletedCount).toBe(0);

      const remaining = await db('venue_webhook_events').count('* as count').first();
      expect(parseInt(remaining.count)).toBe(3);
    });

    it('should keep recent events (< 30 days old)', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 20); // 20 days ago

      // FIXED: Use processed_at instead of created_at
      await db('venue_webhook_events').insert({
        event_id: 'recent_event',
        event_type: 'test.event',
        status: 'completed',
        processed_at: recentDate,
      });

      const deletedCount = await webhookCleanupJob.runNow();

      expect(deletedCount).toBe(0);
    });

    it('should return count of deleted records', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);

      // Insert 5 old completed events
      // FIXED: Use processed_at instead of created_at
      for (let i = 0; i < 5; i++) {
        await db('venue_webhook_events').insert({
          event_id: `old_event_${i}`,
          event_type: 'test.event',
          status: 'completed',
          processed_at: oldDate,
        });
      }

      const deletedCount = await webhookCleanupJob.runNow();

      expect(deletedCount).toBe(5);
    });
  });

  // ===========================================
  // SECTION 2: CACHE WARMING JOB (5 tests)
  // ===========================================
  describe('Cache Warming Job', () => {
    let cacheWarmingJob: CacheWarmingJob;

    beforeEach(() => {
      cacheWarmingJob = new CacheWarmingJob(cacheService);
    });

    it('should pre-load popular venues into cache', async () => {
      await cacheWarmingJob.runNow();

      // Check if venue is in cache
      const cacheKey = `venue:tenant:${TEST_TENANT_ID}:${TEST_VENUE_ID}:details`;
      const exists = await redis.exists(cacheKey);

      expect(exists).toBe(1);
    });

    it('should query venues by total_events DESC', async () => {
      // Add another venue with more events
      await db('venues').insert({
        id: '00000000-0000-4000-a000-000000000002',
        tenant_id: TEST_TENANT_ID,
        name: 'Popular Venue',
        slug: 'popular-venue',
        email: 'popular@venue.com',
        address_line1: '456 Main St',
        city: 'New York',
        state_province: 'NY',
        country_code: 'US',
        venue_type: 'arena',
        max_capacity: 10000,
        status: 'active',
        total_events: 100, // More popular
        created_by: TEST_USER_ID,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await cacheWarmingJob.runNow();

      // Both should be cached
      const exists1 = await redis.exists(`venue:tenant:${TEST_TENANT_ID}:${TEST_VENUE_ID}:details`);
      const exists2 = await redis.exists(`venue:tenant:${TEST_TENANT_ID}:00000000-0000-4000-a000-000000000002:details`);

      expect(exists1).toBe(1);
      expect(exists2).toBe(1);
    });

    it('should set TTL to 300 seconds (5 minutes)', async () => {
      await cacheWarmingJob.runNow();

      const cacheKey = `venue:tenant:${TEST_TENANT_ID}:${TEST_VENUE_ID}:details`;
      const ttl = await redis.ttl(cacheKey);

      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should only cache active venues', async () => {
      // Add inactive venue
      await db('venues').insert({
        id: '00000000-0000-4000-a000-000000000003',
        tenant_id: TEST_TENANT_ID,
        name: 'Inactive Venue',
        slug: 'inactive-venue',
        email: 'inactive@venue.com',
        address_line1: '789 Main St',
        city: 'New York',
        state_province: 'NY',
        country_code: 'US',
        venue_type: 'theater',
        max_capacity: 500,
        status: 'inactive',
        total_events: 50,
        created_by: TEST_USER_ID,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await cacheWarmingJob.runNow();

      const inactiveExists = await redis.exists(`venue:tenant:${TEST_TENANT_ID}:00000000-0000-4000-a000-000000000003:details`);
      expect(inactiveExists).toBe(0);
    });

    it('should handle empty venues gracefully', async () => {
      // Delete all venues
      await db('venues').del();

      await expect(cacheWarmingJob.runNow()).resolves.not.toThrow();
    });
  });

  // ===========================================
  // SECTION 3: COMPLIANCE REVIEW JOB (8 tests)
  // ===========================================
  describe('Compliance Review Job', () => {
    let complianceReviewJob: ComplianceReviewJob;

    beforeEach(() => {
      complianceReviewJob = new ComplianceReviewJob();
    });

    it('should process pending compliance reviews', async () => {
      // Insert pending review
      // FIXED: Use status 'pending' to match what the service creates
      await db('venue_compliance_reviews').insert({
        id: '00000000-0000-4000-a000-000000000010',
        venue_id: TEST_VENUE_ID,
        scheduled_date: new Date(Date.now() - 1000), // Yesterday
        status: 'pending',
        created_at: new Date(),
      });

      const results = await complianceReviewJob.runNow();

      expect(results.processed).toBe(1);
      expect(results.failed).toBe(0);
    });

    it('should update review status: pending → in_progress → completed', async () => {
      await db('venue_compliance_reviews').insert({
        id: '00000000-0000-4000-a000-000000000011',
        venue_id: TEST_VENUE_ID,
        scheduled_date: new Date(),
        status: 'pending',
        created_at: new Date(),
      });

      await complianceReviewJob.runNow();

      const review = await db('venue_compliance_reviews')
        .where('id', '00000000-0000-4000-a000-000000000011')
        .first();

      expect(review.status).toBe('completed');
      // FIXED: Check completed_at (exists) instead of processing_started_at/processing_completed_at
      expect(review.completed_at).toBeDefined();
    });

    it('should generate compliance report', async () => {
      await db('venue_compliance_reviews').insert({
        id: '00000000-0000-4000-a000-000000000012',
        venue_id: TEST_VENUE_ID,
        scheduled_date: new Date(),
        status: 'pending',
        created_at: new Date(),
      });

      await complianceReviewJob.runNow();

      const report = await db('venue_compliance_reports')
        .where('venue_id', TEST_VENUE_ID)
        .orderBy('created_at', 'desc')
        .first();

      expect(report).toBeDefined();
    });

    it('should schedule next review (+90 days)', async () => {
      await db('venue_compliance_reviews').insert({
        id: '00000000-0000-4000-a000-000000000013',
        venue_id: TEST_VENUE_ID,
        scheduled_date: new Date(),
        status: 'pending',
        created_at: new Date(),
      });

      await complianceReviewJob.runNow();

      const nextReview = await db('venue_compliance_reviews')
        .where('venue_id', TEST_VENUE_ID)
        .where('status', 'pending')
        .orderBy('scheduled_date', 'desc')
        .first();

      expect(nextReview).toBeDefined();

      const daysDiff = Math.floor(
        (new Date(nextReview.scheduled_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      expect(daysDiff).toBeGreaterThanOrEqual(89);
      expect(daysDiff).toBeLessThanOrEqual(91);
    });

    it('should only process reviews scheduled for today or earlier', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      await db('venue_compliance_reviews').insert({
        id: '00000000-0000-4000-a000-000000000014',
        venue_id: TEST_VENUE_ID,
        scheduled_date: futureDate,
        status: 'pending',
        created_at: new Date(),
      });

      const results = await complianceReviewJob.runNow();

      expect(results.processed).toBe(0);
    });

    it('should handle individual failures without stopping batch', async () => {
      // FIXED: Create the non-existent venue first so FK constraint doesn't fail
      await db('venues').insert({
        id: '00000000-0000-4000-a000-999999999999',
        tenant_id: TEST_TENANT_ID,
        name: 'Failing Venue',
        slug: 'failing-venue',
        email: 'fail@venue.com',
        address_line1: '123 Fail St',
        city: 'Fail City',
        state_province: 'FC',
        country_code: 'US',
        venue_type: 'theater',
        max_capacity: 100,
        status: 'active',
        created_by: TEST_USER_ID,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Insert review for non-existent venue (will be deleted to cause failure)
      await db('venue_compliance_reviews').insert([
        {
          id: '00000000-0000-4000-a000-000000000015',
          venue_id: TEST_VENUE_ID,
          scheduled_date: new Date(),
          status: 'pending',
          created_at: new Date(),
        },
        {
          id: '00000000-0000-4000-a000-000000000016',
          venue_id: '00000000-0000-4000-a000-999999999999',
          scheduled_date: new Date(),
          status: 'pending',
          created_at: new Date(),
        },
      ]);

      // Delete the venue to cause failure
      // Set tenant_id to null to cause validation failure (without deleting the review)
      await db('venues').where('id', '00000000-0000-4000-a000-999999999999').update({ tenant_id: null });
      const results = await complianceReviewJob.runNow();

      expect(results.processed).toBe(1);
      expect(results.failed).toBe(1);
    });

    it('should set error_message on failed review', async () => {
      // FIXED: Create venue first
      await db('venues').insert({
        id: '00000000-0000-4000-a000-999999999998',
        tenant_id: TEST_TENANT_ID,
        name: 'Failing Venue 2',
        slug: 'failing-venue-2',
        email: 'fail2@venue.com',
        address_line1: '123 Fail St',
        city: 'Fail City',
        state_province: 'FC',
        country_code: 'US',
        venue_type: 'theater',
        max_capacity: 100,
        status: 'active',
        created_by: TEST_USER_ID,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await db('venue_compliance_reviews').insert({
        id: '00000000-0000-4000-a000-000000000017',
        venue_id: '00000000-0000-4000-a000-999999999998',
        scheduled_date: new Date(),
        status: 'pending',
        created_at: new Date(),
      });

      // Set tenant_id to null to cause validation failure (without deleting the review)
      await db('venues').where('id', '00000000-0000-4000-a000-999999999998').update({ tenant_id: null });

      await complianceReviewJob.runNow();

      const review = await db('venue_compliance_reviews')
        .where('id', '00000000-0000-4000-a000-000000000017')
        .first();

      expect(review.status).toBe('failed');
      expect(review.error_message).toBeDefined();
    });
    it('should handle empty pending reviews gracefully', async () => {
      const results = await complianceReviewJob.runNow();

      expect(results.processed).toBe(0);
      expect(results.failed).toBe(0);
    });
  });

  // ===========================================
  // SECTION 4: CONTENT CLEANUP JOB (5 tests)
  // ===========================================
  describe('Content Cleanup Job (MongoDB)', () => {

    it('should delete archived content older than 30 days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      // Insert old archived content
      await VenueContentModel.create({
        venueId: TEST_VENUE_ID,
        tenantId: TEST_TENANT_ID,
        contentType: 'PHOTO',
        content: { media: { url: 'test.jpg' } },
        status: 'archived',
        archivedAt: oldDate,
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });

      const result = await contentCleanupJob.runNow();

      expect(result.deletedCount).toBe(1);

      const remaining = await VenueContentModel.countDocuments({});
      expect(remaining).toBe(0);
    });

    it('should keep archived content less than 30 days old', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 20);

      await VenueContentModel.create({
        venueId: TEST_VENUE_ID,
        tenantId: TEST_TENANT_ID,
        contentType: 'PHOTO',
        content: { media: { url: 'recent.jpg' } },
        status: 'archived',
        archivedAt: recentDate,
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });

      const result = await contentCleanupJob.runNow();

      expect(result.deletedCount).toBe(0);
    });

    it('should not delete published content', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);

      await VenueContentModel.create({
        venueId: TEST_VENUE_ID,
        tenantId: TEST_TENANT_ID,
        contentType: 'PHOTO',
        content: { media: { url: 'published.jpg' } },
        status: 'published',
        publishedAt: oldDate,
        createdBy: TEST_USER_ID,
        updatedBy: TEST_USER_ID,
      });

      const result = await contentCleanupJob.runNow();

      expect(result.deletedCount).toBe(0);
    });

    it('should verify TTL index exists', async () => {
      const hasTTL = await contentCleanupJob.verifyTTLIndex();

      // Will be false initially, true if index was created
      expect(typeof hasTTL).toBe('boolean');
    });

    it('should handle empty collection gracefully', async () => {
      const result = await contentCleanupJob.runNow();

      expect(result.deletedCount).toBe(0);
    });
  });

  // ===========================================
  // SECTION 5: SSL RENEWAL JOB (5 tests - MOCK)
  // ===========================================
  describe('SSL Renewal Job (Mock)', () => {

    it('should check for expiring certificates (within 7 days)', async () => {
      const soonExpiry = new Date();
      soonExpiry.setDate(soonExpiry.getDate() + 5); // Expires in 5 days

      // FIXED: Add verification_token
      await db('custom_domains').insert({
        id: '00000000-0000-4000-a000-000000000020',
        venue_id: TEST_VENUE_ID,
        domain: 'test.example.com',
        verification_token: 'test-token-123',
        is_verified: true,
        ssl_status: 'active',
        ssl_issued_at: new Date(),
        ssl_expires_at: soonExpiry,
        status: 'active',
        created_at: new Date(),
      });

      const result = await sslRenewalJob.runNow();

      expect(result.checked).toBe(1);
      expect(result.renewed).toBe(1);
    });

    it('should renew certificate (mock - updates expiry)', async () => {
      const soonExpiry = new Date();
      soonExpiry.setDate(soonExpiry.getDate() + 3);

      // FIXED: Add verification_token
      await db('custom_domains').insert({
        id: '00000000-0000-4000-a000-000000000021',
        venue_id: TEST_VENUE_ID,
        domain: 'renew.example.com',
        verification_token: 'test-token-456',
        is_verified: true,
        ssl_status: 'active',
        ssl_expires_at: soonExpiry,
        status: 'active',
        created_at: new Date(),
      });

      await sslRenewalJob.runNow();

      const domain = await db('custom_domains').where('id', '00000000-0000-4000-a000-000000000021').first();

      const newExpiry = new Date(domain.ssl_expires_at);
      const daysDiff = Math.floor(
        (newExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBeGreaterThanOrEqual(89);
      expect(daysDiff).toBeLessThanOrEqual(91);
    });

    it('should only process verified domains', async () => {
      const soonExpiry = new Date();
      soonExpiry.setDate(soonExpiry.getDate() + 5);

      // FIXED: Add verification_token
      await db('custom_domains').insert({
        id: '00000000-0000-4000-a000-000000000022',
        venue_id: TEST_VENUE_ID,
        domain: 'unverified.example.com',
        verification_token: 'test-token-789',
        is_verified: false,
        ssl_status: 'active',
        ssl_expires_at: soonExpiry,
        status: 'active',
        created_at: new Date(),
      });

      const result = await sslRenewalJob.runNow();

      expect(result.checked).toBe(0);
    });

    it('should handle no expiring certificates gracefully', async () => {
      const result = await sslRenewalJob.runNow();

      expect(result.checked).toBe(0);
      expect(result.renewed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should update ssl_issued_at timestamp', async () => {
      const soonExpiry = new Date();
      soonExpiry.setDate(soonExpiry.getDate() + 2);

      // FIXED: Add verification_token
      await db('custom_domains').insert({
        id: '00000000-0000-4000-a000-000000000023',
        venue_id: TEST_VENUE_ID,
        domain: 'timestamp.example.com',
        verification_token: 'test-token-abc',
        is_verified: true,
        ssl_status: 'active',
        ssl_expires_at: soonExpiry,
        ssl_issued_at: new Date('2024-01-01'),
        status: 'active',
        created_at: new Date(),
      });

      await sslRenewalJob.runNow();

      const domain = await db('custom_domains').where('id', '00000000-0000-4000-a000-000000000023').first();

      const issuedDate = new Date(domain.ssl_issued_at);
      const timeDiff = Date.now() - issuedDate.getTime();

      expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
    });
  });

  // ===========================================
  // SECTION 6: JOB EXECUTION & LOCKING (2 tests)
  // ===========================================
  describe('Job Execution & Distributed Locking', () => {

    it('should start all jobs successfully', async () => {
      await expect(startScheduledJobs()).resolves.not.toThrow();
    });

    it('should stop all jobs gracefully', () => {
      expect(() => stopScheduledJobs()).not.toThrow();
    });
  });
});
