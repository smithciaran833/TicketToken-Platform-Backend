/**
 * Pact Consumer Contract Tests for Venue Service
 * 
 * AUDIT FIX (Test-1): Consumer-driven contract tests ensure event-service
 * and venue-service agree on the API contract. These tests run from the
 * consumer (event-service) perspective.
 * 
 * Provider verification should be run on the venue-service side using:
 *   npx pact-verifier --provider-base-url=http://localhost:3002 \
 *     --pact-urls=./pacts/event-service-venue-service.json
 * 
 * @see https://docs.pact.io/
 */

import { Pact, Matchers } from '@pact-foundation/pact';
import path from 'path';
import fetch from 'node-fetch';

const { like, eachLike, uuid, iso8601DateTimeWithMillis } = Matchers;

// Test constants
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000001';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';

// Pact provider configuration
const provider = new Pact({
  consumer: 'event-service',
  provider: 'venue-service',
  port: 9999, // Mock server port
  log: path.resolve(process.cwd(), 'logs', 'pact.log'),
  dir: path.resolve(process.cwd(), 'pacts'),
  logLevel: 'warn',
  spec: 2, // Pact specification version
});

describe('Venue Service Contract Tests (Consumer)', () => {
  // Setup Pact mock server
  beforeAll(async () => {
    await provider.setup();
  });

  // Verify and write pact file
  afterAll(async () => {
    await provider.verify();
    await provider.finalize();
  });

  // Clear interactions between tests
  afterEach(async () => {
    await provider.removeInteractions();
  });

  describe('GET /api/v1/venues/:id', () => {
    it('should return venue details when venue exists', async () => {
      // Define the expected interaction
      await provider.addInteraction({
        state: 'a venue exists with id ' + TEST_VENUE_ID,
        uponReceiving: 'a request for venue details',
        withRequest: {
          method: 'GET',
          path: `/api/v1/venues/${TEST_VENUE_ID}`,
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': TEST_TENANT_ID,
            'X-Service-ID': like('event-service'),
          },
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: {
            id: uuid(TEST_VENUE_ID),
            tenant_id: uuid(TEST_TENANT_ID),
            name: like('Madison Square Garden'),
            slug: like('madison-square-garden'),
            email: like('contact@venue.com'),
            address_line1: like('4 Pennsylvania Plaza'),
            city: like('New York'),
            state_province: like('NY'),
            country_code: like('US'),
            venue_type: like('arena'),
            max_capacity: like(20000),
            timezone: like('America/New_York'),
            status: like('ACTIVE'),
            created_at: iso8601DateTimeWithMillis(),
            updated_at: iso8601DateTimeWithMillis(),
          },
        },
      });

      // Execute the request against the mock server
      const response = await fetch(`http://localhost:9999/api/v1/venues/${TEST_VENUE_ID}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': TEST_TENANT_ID,
          'X-Service-ID': 'event-service',
        },
      });

      const venue = await response.json();

      // Assertions
      expect(response.status).toBe(200);
      expect(venue.id).toBe(TEST_VENUE_ID);
      expect(venue.tenant_id).toBe(TEST_TENANT_ID);
      expect(venue.name).toBeDefined();
      expect(venue.max_capacity).toBeGreaterThan(0);
    });

    it('should return 404 when venue does not exist', async () => {
      const nonExistentVenueId = '00000000-0000-0000-0000-000000000999';

      await provider.addInteraction({
        state: 'no venue exists with id ' + nonExistentVenueId,
        uponReceiving: 'a request for a non-existent venue',
        withRequest: {
          method: 'GET',
          path: `/api/v1/venues/${nonExistentVenueId}`,
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': TEST_TENANT_ID,
            'X-Service-ID': like('event-service'),
          },
        },
        willRespondWith: {
          status: 404,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: {
            type: like('https://api.tickettoken.com/errors/not-found'),
            title: like('Not Found'),
            status: 404,
            detail: like('Venue not found'),
            instance: like('/api/v1/venues/' + nonExistentVenueId),
          },
        },
      });

      const response = await fetch(`http://localhost:9999/api/v1/venues/${nonExistentVenueId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': TEST_TENANT_ID,
          'X-Service-ID': 'event-service',
        },
      });

      expect(response.status).toBe(404);
    });

    it('should return 403 when tenant has no access to venue', async () => {
      const wrongTenantId = '00000000-0000-0000-0000-000000000888';

      await provider.addInteraction({
        state: 'venue exists but tenant has no access',
        uponReceiving: 'a request for venue from unauthorized tenant',
        withRequest: {
          method: 'GET',
          path: `/api/v1/venues/${TEST_VENUE_ID}`,
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': wrongTenantId,
            'X-Service-ID': like('event-service'),
          },
        },
        willRespondWith: {
          status: 403,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: {
            type: like('https://api.tickettoken.com/errors/forbidden'),
            title: like('Forbidden'),
            status: 403,
            detail: like('No access to this venue'),
          },
        },
      });

      const response = await fetch(`http://localhost:9999/api/v1/venues/${TEST_VENUE_ID}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': wrongTenantId,
          'X-Service-ID': 'event-service',
        },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/venues/:id/availability', () => {
    it('should return venue availability for a date range', async () => {
      const startDate = '2025-06-01T00:00:00.000Z';
      const endDate = '2025-06-30T23:59:59.999Z';

      await provider.addInteraction({
        state: 'a venue exists with availability data',
        uponReceiving: 'a request for venue availability',
        withRequest: {
          method: 'GET',
          path: `/api/v1/venues/${TEST_VENUE_ID}/availability`,
          query: {
            start_date: startDate,
            end_date: endDate,
          },
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': TEST_TENANT_ID,
            'X-Service-ID': like('event-service'),
          },
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: {
            venue_id: uuid(TEST_VENUE_ID),
            start_date: like(startDate),
            end_date: like(endDate),
            available_slots: eachLike({
              date: like('2025-06-15'),
              time_slots: eachLike({
                start_time: like('18:00'),
                end_time: like('23:00'),
                available: like(true),
              }),
            }),
            blocked_dates: eachLike({
              date: like('2025-06-20'),
              reason: like('maintenance'),
            }),
          },
        },
      });

      const response = await fetch(
        `http://localhost:9999/api/v1/venues/${TEST_VENUE_ID}/availability?start_date=${startDate}&end_date=${endDate}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': TEST_TENANT_ID,
            'X-Service-ID': 'event-service',
          },
        }
      );

      const availability = await response.json();

      expect(response.status).toBe(200);
      expect(availability.venue_id).toBe(TEST_VENUE_ID);
      expect(availability.available_slots).toBeDefined();
      expect(Array.isArray(availability.available_slots)).toBe(true);
    });

    it('should return empty availability when no slots available', async () => {
      const startDate = '2025-12-25T00:00:00.000Z';
      const endDate = '2025-12-25T23:59:59.999Z';

      await provider.addInteraction({
        state: 'venue is fully booked for the requested date',
        uponReceiving: 'a request for availability on a fully booked date',
        withRequest: {
          method: 'GET',
          path: `/api/v1/venues/${TEST_VENUE_ID}/availability`,
          query: {
            start_date: startDate,
            end_date: endDate,
          },
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': TEST_TENANT_ID,
            'X-Service-ID': like('event-service'),
          },
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: {
            venue_id: uuid(TEST_VENUE_ID),
            start_date: like(startDate),
            end_date: like(endDate),
            available_slots: [],
            blocked_dates: eachLike({
              date: like('2025-12-25'),
              reason: like('holiday'),
            }),
          },
        },
      });

      const response = await fetch(
        `http://localhost:9999/api/v1/venues/${TEST_VENUE_ID}/availability?start_date=${startDate}&end_date=${endDate}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': TEST_TENANT_ID,
            'X-Service-ID': 'event-service',
          },
        }
      );

      const availability = await response.json();

      expect(response.status).toBe(200);
      expect(availability.available_slots).toHaveLength(0);
    });
  });
});

/**
 * Provider Verification (Run on venue-service side)
 * 
 * To verify these contracts on the provider (venue-service):
 * 
 * 1. Publish pacts to a broker:
 *    npx pact-broker publish ./pacts \
 *      --consumer-app-version=1.0.0 \
 *      --broker-base-url=$PACT_BROKER_URL \
 *      --broker-token=$PACT_BROKER_TOKEN
 * 
 * 2. Or verify locally on venue-service:
 *    npx @pact-foundation/pact-node verify \
 *      --provider-base-url=http://localhost:3002 \
 *      --pact-urls=../event-service/pacts/event-service-venue-service.json \
 *      --provider-states-setup-url=http://localhost:3002/test/setup
 * 
 * 3. Provider states need to be implemented in venue-service test setup
 */
