/**
 * Internal Validation Routes Integration Tests
 * 
 * Tests internal service-to-service ticket validation endpoint.
 * Uses app.inject() for in-process HTTP testing.
 * FK Chain: tenants → users → venues → events → ticket_types → tickets
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
} from '../setup';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-change-in-production';

describe('Internal Validation Routes Integration Tests', () => {
  let context: TestContext;
  let testEventId: string;
  let testTicketTypeId: string;
  let testTicketId: string;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    
    // Create FK chain: event → ticket_type → ticket
    testEventId = uuidv4();
    testTicketTypeId = uuidv4();
    testTicketId = uuidv4();

    // Create event (use start_date not event_date)
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, event_type, status, start_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Test Event', `test-event-${Date.now()}`, 'single', 'PUBLISHED', new Date()]
    );

    // Create ticket type
    await pool.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [testTicketTypeId, TEST_TENANT_ID, testEventId, 'General Admission', 50.00, 100, 100, new Date(), new Date(Date.now() + 86400000)]
    );

    // Create ticket
    await pool.query(
      `INSERT INTO tickets (id, tenant_id, event_id, ticket_type_id, user_id, ticket_number, qr_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testTicketId, TEST_TENANT_ID, testEventId, testTicketTypeId, TEST_USER_ID, `TKT-${Date.now()}`, `QR-${Date.now()}`, 'active']
    );
  });

  // Helper to generate internal service headers
  function generateInternalHeaders(serviceName: string = 'ticket-service', method: string = 'GET', url: string = '/') {
    const timestamp = Date.now().toString();
    const payload = `${serviceName}:${timestamp}:${method}:${url}`;
    const signature = crypto
      .createHmac('sha256', INTERNAL_SECRET)
      .update(payload)
      .digest('hex');

    return {
      'x-internal-service': serviceName,
      'x-internal-timestamp': timestamp,
      'x-internal-signature': signature
    };
  }

  // Helper to generate temp signature headers (for dev)
  function generateDevHeaders(serviceName: string = 'ticket-service') {
    return {
      'x-internal-service': serviceName,
      'x-internal-timestamp': Date.now().toString(),
      'x-internal-signature': 'temp-signature'
    };
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================
  describe('Authentication', () => {
    it('should return 401 without authentication headers', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${testTicketId}`
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('Missing authentication');
    });

    it('should return 401 with expired timestamp', async () => {
      const expiredTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
      
      const response = await context.app.inject({
        method: 'GET',
        url: `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${testTicketId}`,
        headers: {
          'x-internal-service': 'ticket-service',
          'x-internal-timestamp': expiredTimestamp,
          'x-internal-signature': 'some-signature'
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error).toContain('expired');
    });

    it('should accept temp-signature in non-production', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${testTicketId}`,
        headers: generateDevHeaders()
      });

      // Should not be 401 - either 200 or another valid response
      expect(response.statusCode).not.toBe(401);
    });

    it('should accept valid HMAC signature', async () => {
      const url = `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${testTicketId}`;
      const headers = generateInternalHeaders('ticket-service', 'GET', url);

      const response = await context.app.inject({
        method: 'GET',
        url,
        headers
      });

      expect(response.statusCode).not.toBe(401);
    });
  });

  // ==========================================================================
  // GET /internal/venues/:venueId/validate-ticket/:ticketId
  // ==========================================================================
  describe('GET /internal/venues/:venueId/validate-ticket/:ticketId', () => {
    it('should validate ticket for correct venue', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${testTicketId}`,
        headers: generateDevHeaders()
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(true);
      expect(body.alreadyScanned).toBe(false);
      expect(body.ticket).toBeDefined();
    });

    it('should return valid:false for ticket not belonging to venue', async () => {
      // Create a different venue
      const otherVenueId = uuidv4();
      await pool.query(
        `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [otherVenueId, TEST_TENANT_ID, 'Other Venue', `other-venue-${Date.now()}`, 'other@test.com', '789 Other St', 'Other City', 'OC', 'US', 'theater', 500, TEST_USER_ID, 'ACTIVE']
      );

      const response = await context.app.inject({
        method: 'GET',
        url: `/internal/venues/${otherVenueId}/validate-ticket/${testTicketId}`,
        headers: generateDevHeaders()
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(false);
      expect(body.reason).toContain('not found');
    });

    it('should return valid:false for non-existent ticket', async () => {
      const fakeTicketId = uuidv4();

      const response = await context.app.inject({
        method: 'GET',
        url: `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${fakeTicketId}`,
        headers: generateDevHeaders()
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(false);
    });

    it('should return alreadyScanned:true for previously validated ticket', async () => {
      // Add validation record
      await pool.query(
        `INSERT INTO ticket_validations (id, ticket_id, validator_id, validated_at, validation_method)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), testTicketId, TEST_USER_ID, new Date(), 'qr_scan']
      );

      const response = await context.app.inject({
        method: 'GET',
        url: `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${testTicketId}`,
        headers: generateDevHeaders()
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.valid).toBe(false);
      expect(body.alreadyScanned).toBe(true);
    });

    it('should include ticket details in response', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${testTicketId}`,
        headers: generateDevHeaders()
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.ticket).toBeDefined();
      expect(body.ticket.id).toBe(testTicketId);
      expect(body.ticket.venue_id).toBe(TEST_VENUE_ID);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge Cases', () => {
    it('should handle invalid UUID format gracefully', async () => {
      const response = await context.app.inject({
        method: 'GET',
        url: `/internal/venues/not-a-uuid/validate-ticket/${testTicketId}`,
        headers: generateDevHeaders()
      });

      // Should return error, not crash
      expect([400, 500]).toContain(response.statusCode);
    });

    it('should handle multiple validation checks for same ticket', async () => {
      // First check
      const response1 = await context.app.inject({
        method: 'GET',
        url: `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${testTicketId}`,
        headers: generateDevHeaders()
      });

      // Second check (should be same result since no validation recorded)
      const response2 = await context.app.inject({
        method: 'GET',
        url: `/internal/venues/${TEST_VENUE_ID}/validate-ticket/${testTicketId}`,
        headers: generateDevHeaders()
      });

      const body1 = JSON.parse(response1.payload);
      const body2 = JSON.parse(response2.payload);

      expect(body1.valid).toBe(body2.valid);
      expect(body1.alreadyScanned).toBe(body2.alreadyScanned);
    });
  });
});
