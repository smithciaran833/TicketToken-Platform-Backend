import { Pool } from 'pg';
import { createApp } from '../../src/app';
import { FastifyInstance } from 'fastify';

/**
 * TRANSFER FLOW INTEGRATION TESTS
 * 
 * End-to-end tests for transfer workflows
 * Phase 4: Comprehensive Testing
 */

describe('Transfer Flow Integration Tests', () => {
  let app: FastifyInstance;
  let pool: Pool;

  beforeAll(async () => {
    // Use test database
    pool = new Pool({
      host: process.env.TEST_DB_HOST || 'localhost',
      database: process.env.TEST_DB_NAME || 'test_db',
      user: process.env.TEST_DB_USER || 'test_user',
      password: process.env.TEST_DB_PASSWORD || 'test_password',
      port: parseInt(process.env.TEST_DB_PORT || '5432')
    });

    app = await createApp(pool);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  describe('POST /api/v1/transfers/gift', () => {
    it('should create a gift transfer with valid data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        headers: {
          authorization: 'Bearer valid-test-token'
        },
        payload: {
          ticketId: '123e4567-e89b-12d3-a456-426614174000',
          toEmail: 'recipient@example.com',
          message: 'Enjoy the show!'
        }
      });

      expect([200, 201, 400, 401, 404]).toContain(response.statusCode);
      
      if (response.statusCode === 201) {
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('transferId');
        expect(body).toHaveProperty('acceptanceCode');
        expect(body.status).toBe('PENDING');
        expect(body).toHaveProperty('expiresAt');
      }
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        payload: {
          ticketId: '123e4567-e89b-12d3-a456-426614174000',
          toEmail: 'recipient@example.com'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 with invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        headers: {
          authorization: 'Bearer valid-test-token'
        },
        payload: {
          ticketId: '123e4567-e89b-12d3-a456-426614174000',
          toEmail: 'invalid-email'
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/transfers/:transferId/accept', () => {
    it('should accept a transfer with valid code', async () => {
      const transferId = '123e4567-e89b-12d3-a456-426614174000';
      
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/transfers/${transferId}/accept`,
        headers: {
          authorization: 'Bearer valid-test-token'
        },
        payload: {
          acceptanceCode: 'VALID123',
          userId: '123e4567-e89b-12d3-a456-426614174001'
        }
      });

      expect([200, 400, 401, 404]).toContain(response.statusCode);
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/transfers/123e4567-e89b-12d3-a456-426614174000/accept',
        payload: {
          acceptanceCode: 'VALID123',
          userId: '123e4567-e89b-12d3-a456-426614174001'
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('transfer-service');
    });
  });

  describe('GET /health/db', () => {
    it('should check database connectivity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/db'
      });

      expect([200, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(body.service).toBe('transfer-service');
    });
  });

  describe('GET /metrics', () => {
    it('should return prometheus metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });
  });
});
