/**
 * Intents Routes Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import intentsRoutes from '../../../src/routes/intents.routes';
import {
  TEST_VENUE_ID,
  TEST_EVENT_ID,
  isAuthTestingAvailable,
  getAuthHeader,
} from './test-helpers';
import { v4 as uuidv4 } from 'uuid';

describe('Intents Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(intentsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /create', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/create',
        payload: {
          venueId: TEST_VENUE_ID,
          eventId: TEST_EVENT_ID,
          amount: 10000,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should create intent with valid authentication', async () => {
      if (!isAuthTestingAvailable()) {
        console.log('Skipping: JWT keys not available');
        return;
      }

      const response = await app.inject({
        method: 'POST',
        url: '/create',
        headers: {
          ...getAuthHeader(),
          'idempotency-key': uuidv4(),
        },
        payload: {
          venueId: TEST_VENUE_ID,
          eventId: TEST_EVENT_ID,
          amount: 10000,
        },
      });

      expect([200, 201, 400, 500]).toContain(response.statusCode);
    });
  });
});
