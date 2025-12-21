/**
 * OnboardingService Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_VENUE_ID,
  db,
  pool
} from './setup';
import { OnboardingService } from '../../src/services/onboarding.service';
import { VenueService } from '../../src/services/venue.service';
import { CacheService } from '../../src/services/cache.service';
import { EventPublisher } from '../../src/services/eventPublisher';
import { v4 as uuidv4 } from 'uuid';

describe('OnboardingService', () => {
  let context: TestContext;
  let onboardingService: OnboardingService;
  let venueService: VenueService;
  let cacheService: CacheService;
  let eventPublisher: EventPublisher;

  beforeAll(async () => {
    context = await setupTestApp();
    
    // Create dependencies
    cacheService = new CacheService(context.redis);
    eventPublisher = new EventPublisher();
    
    venueService = new VenueService({
      db: context.db,
      redis: context.redis,
      cacheService,
      eventPublisher,
      logger: context.app.log
    });
    onboardingService = new OnboardingService({
      venueService,
      db: context.db,
      logger: context.app.log
    });
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    // Clean related tables
    await pool.query('DELETE FROM venue_layouts WHERE venue_id = $1', [TEST_VENUE_ID]);
    await pool.query('DELETE FROM venue_integrations WHERE venue_id = $1', [TEST_VENUE_ID]);
    await pool.query('DELETE FROM venue_staff WHERE venue_id = $1 AND user_id != $2', [TEST_VENUE_ID, TEST_USER_ID]);
  });

  // ==========================================================================
  // getOnboardingStatus
  // ==========================================================================
  describe('getOnboardingStatus', () => {
    it('should return onboarding status for venue', async () => {
      const result = await onboardingService.getOnboardingStatus(TEST_VENUE_ID);

      expect(result).toBeDefined();
      expect(result.venueId).toBe(TEST_VENUE_ID);
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(100);
      expect(result.completedSteps).toBeDefined();
      expect(result.totalSteps).toBe(5);
      expect(result.steps).toHaveLength(5);
      expect(result.status).toMatch(/^(completed|in_progress)$/);
    });

    it('should return correct step structure', async () => {
      const result = await onboardingService.getOnboardingStatus(TEST_VENUE_ID);

      const stepIds = result.steps.map((s: any) => s.id);
      expect(stepIds).toContain('basic_info');
      expect(stepIds).toContain('address');
      expect(stepIds).toContain('layout');
      expect(stepIds).toContain('payment');
      expect(stepIds).toContain('staff');

      // Check step properties
      const basicInfo = result.steps.find((s: any) => s.id === 'basic_info');
      expect(basicInfo).toMatchObject({
        id: 'basic_info',
        name: expect.any(String),
        description: expect.any(String),
        completed: expect.any(Boolean),
        required: true
      });
    });

    it('should mark basic_info as completed for seeded venue', async () => {
      const result = await onboardingService.getOnboardingStatus(TEST_VENUE_ID);

      const basicInfo = result.steps.find((s: any) => s.id === 'basic_info');
      expect(basicInfo.completed).toBe(true);
    });

    it('should mark address as completed for seeded venue', async () => {
      // Ensure venue has postal_code
      await pool.query(
        'UPDATE venues SET postal_code = $1 WHERE id = $2',
        ['10001', TEST_VENUE_ID]
      );

      const result = await onboardingService.getOnboardingStatus(TEST_VENUE_ID);

      const address = result.steps.find((s: any) => s.id === 'address');
      expect(address.completed).toBe(true);
    });

    it('should calculate progress correctly', async () => {
      // Ensure basic_info and address are complete
      await pool.query(
        'UPDATE venues SET postal_code = $1 WHERE id = $2',
        ['10001', TEST_VENUE_ID]
      );

      const result = await onboardingService.getOnboardingStatus(TEST_VENUE_ID);

      // At least basic_info and address should be complete
      expect(result.completedSteps).toBeGreaterThanOrEqual(2);
      expect(result.progress).toBe(Math.round((result.completedSteps / result.totalSteps) * 100));
    });
  });

  // ==========================================================================
  // completeStep - basic_info
  // ==========================================================================
  describe('completeStep - basic_info', () => {
    it('should update basic info', async () => {
      await onboardingService.completeStep(TEST_VENUE_ID, 'basic_info', {
        name: 'Updated Venue Name',
        venue_type: 'stadium',
        max_capacity: 50000
      });

      const venue = await pool.query('SELECT * FROM venues WHERE id = $1', [TEST_VENUE_ID]);
      expect(venue.rows[0].name).toBe('Updated Venue Name');
      expect(venue.rows[0].venue_type).toBe('stadium');
      expect(venue.rows[0].max_capacity).toBe(50000);
    });
  });

  // ==========================================================================
  // completeStep - address
  // ==========================================================================
  describe('completeStep - address', () => {
    it('should update address with street/state/zipCode format', async () => {
      await onboardingService.completeStep(TEST_VENUE_ID, 'address', {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'US'
      });

      const venue = await pool.query('SELECT * FROM venues WHERE id = $1', [TEST_VENUE_ID]);
      expect(venue.rows[0].address_line1).toBe('123 Main St');
      expect(venue.rows[0].city).toBe('New York');
      expect(venue.rows[0].state_province).toBe('NY');
      expect(venue.rows[0].postal_code).toBe('10001');
      expect(venue.rows[0].country_code).toBe('US');
    });

    it('should update address with address_line1/state_province/postal_code format', async () => {
      await onboardingService.completeStep(TEST_VENUE_ID, 'address', {
        address_line1: '456 Broadway',
        address_line2: 'Suite 100',
        city: 'Los Angeles',
        state_province: 'CA',
        postal_code: '90001',
        country_code: 'US'
      });

      const venue = await pool.query('SELECT * FROM venues WHERE id = $1', [TEST_VENUE_ID]);
      expect(venue.rows[0].address_line1).toBe('456 Broadway');
      expect(venue.rows[0].address_line2).toBe('Suite 100');
      expect(venue.rows[0].city).toBe('Los Angeles');
      expect(venue.rows[0].state_province).toBe('CA');
      expect(venue.rows[0].postal_code).toBe('90001');
    });
  });

  // ==========================================================================
  // completeStep - layout
  // ==========================================================================
  describe('completeStep - layout', () => {
    it('should create venue layout', async () => {
      await onboardingService.completeStep(TEST_VENUE_ID, 'layout', {
        name: 'Main Floor',
        type: 'general_admission',
        sections: [{ name: 'GA', capacity: 500 }],
        capacity: 500
      });

      const layouts = await pool.query(
        'SELECT * FROM venue_layouts WHERE venue_id = $1',
        [TEST_VENUE_ID]
      );
      expect(layouts.rows.length).toBe(1);
      expect(layouts.rows[0].name).toBe('Main Floor');
      expect(layouts.rows[0].type).toBe('general_admission');
      expect(layouts.rows[0].capacity).toBe(500);
      expect(layouts.rows[0].is_default).toBe(true);
    });

    it('should mark layout step as completed after creation', async () => {
      await onboardingService.completeStep(TEST_VENUE_ID, 'layout', {
        name: 'Theater Layout',
        type: 'seated',
        sections: [
          { name: 'Orchestra', capacity: 200 },
          { name: 'Balcony', capacity: 100 }
        ],
        capacity: 300
      });

      const status = await onboardingService.getOnboardingStatus(TEST_VENUE_ID);
      const layoutStep = status.steps.find((s: any) => s.id === 'layout');
      expect(layoutStep.completed).toBe(true);
    });
  });

  // ==========================================================================
  // completeStep - payment
  // ==========================================================================
  describe('completeStep - payment', () => {
    it('should create payment integration', async () => {
      await onboardingService.completeStep(TEST_VENUE_ID, 'payment', {
        type: 'stripe',
        config: { account_id: 'acct_test123' }
      });

      const integrations = await pool.query(
        'SELECT * FROM venue_integrations WHERE venue_id = $1 AND integration_type = $2',
        [TEST_VENUE_ID, 'stripe']
      );
      expect(integrations.rows.length).toBe(1);
      expect(integrations.rows[0].is_active).toBe(true);
    });

    it('should mark payment step as completed after integration', async () => {
      await onboardingService.completeStep(TEST_VENUE_ID, 'payment', {
        type: 'square',
        config: { location_id: 'loc_test' }
      });

      const status = await onboardingService.getOnboardingStatus(TEST_VENUE_ID);
      const paymentStep = status.steps.find((s: any) => s.id === 'payment');
      expect(paymentStep.completed).toBe(true);
    });
  });

  // ==========================================================================
  // completeStep - staff
  // ==========================================================================
  describe('completeStep - staff', () => {
    it('should add staff member', async () => {
      // Create a new user to add as staff
      const newUserId = uuidv4();
      await pool.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newUserId, TEST_TENANT_ID, 'staff@test.com', 'hash', 'Staff', 'Member']
      );

      await onboardingService.completeStep(TEST_VENUE_ID, 'staff', {
        userId: newUserId,
        role: 'manager',
        permissions: ['manage_events', 'view_analytics']
      });

      const staff = await pool.query(
        'SELECT * FROM venue_staff WHERE venue_id = $1 AND user_id = $2',
        [TEST_VENUE_ID, newUserId]
      );
      expect(staff.rows.length).toBe(1);
      expect(staff.rows[0].role).toBe('manager');
    });

    it('should mark staff step completed when more than 1 active staff', async () => {
      // Add second staff member
      const newUserId = uuidv4();
      await pool.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newUserId, TEST_TENANT_ID, 'staff2@test.com', 'hash', 'Staff', 'Two']
      );

      await onboardingService.completeStep(TEST_VENUE_ID, 'staff', {
        userId: newUserId,
        role: 'staff'
      });

      const status = await onboardingService.getOnboardingStatus(TEST_VENUE_ID);
      const staffStep = status.steps.find((s: any) => s.id === 'staff');
      expect(staffStep.completed).toBe(true);
    });
  });

  // ==========================================================================
  // completeStep - unknown step
  // ==========================================================================
  describe('completeStep - error handling', () => {
    it('should throw error for unknown step', async () => {
      await expect(
        onboardingService.completeStep(TEST_VENUE_ID, 'unknown_step', {})
      ).rejects.toThrow('Unknown onboarding step: unknown_step');
    });
  });

  // ==========================================================================
  // Full onboarding flow
  // ==========================================================================
  describe('full onboarding flow', () => {
    it('should complete all steps and reach 100% progress', async () => {
      // Step 1: Basic info (already complete from seeding)
      
      // Step 2: Address
      await onboardingService.completeStep(TEST_VENUE_ID, 'address', {
        street: '789 Event Blvd',
        city: 'Chicago',
        state: 'IL',
        zipCode: '60601'
      });

      // Step 3: Layout
      await onboardingService.completeStep(TEST_VENUE_ID, 'layout', {
        name: 'Default Layout',
        type: 'mixed',
        sections: [{ name: 'Main', capacity: 1000 }],
        capacity: 1000
      });

      // Step 4: Payment
      await onboardingService.completeStep(TEST_VENUE_ID, 'payment', {
        type: 'stripe',
        config: {}
      });

      // Step 5: Staff (need 2+ active staff)
      const staffUserId = uuidv4();
      await pool.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [staffUserId, TEST_TENANT_ID, 'full-flow-staff@test.com', 'hash', 'Full', 'Flow']
      );
      await onboardingService.completeStep(TEST_VENUE_ID, 'staff', {
        userId: staffUserId,
        role: 'staff'
      });

      // Check final status
      const status = await onboardingService.getOnboardingStatus(TEST_VENUE_ID);
      expect(status.progress).toBe(100);
      expect(status.status).toBe('completed');
      expect(status.completedSteps).toBe(5);
    });
  });
});
