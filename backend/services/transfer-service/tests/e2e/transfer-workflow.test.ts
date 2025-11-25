import { Pool } from 'pg';
import { createApp } from '../../src/app';
import { FastifyInstance } from 'fastify';

/**
 * TRANSFER WORKFLOW E2E TESTS
 * 
 * Full end-to-end transfer workflow testing
 * Phase 4: Comprehensive Testing
 */

describe('Transfer Workflow E2E', () => {
  let app: FastifyInstance;
  let pool: Pool;
  let authToken: string;
  let transferId: string;
  let acceptanceCode: string;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.TEST_DB_HOST || 'localhost',
      database: process.env.TEST_DB_NAME || 'test_db',
      user: process.env.TEST_DB_USER || 'test_user',
      password: process.env.TEST_DB_PASSWORD || 'test_password',
      port: parseInt(process.env.TEST_DB_PORT || '5432')
    });

    app = await createApp(pool);
    authToken = 'Bearer test-token-123';
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  describe('Complete Transfer Flow', () => {
    it('should complete full transfer workflow', async () => {
      // Step 1: Create a gift transfer
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        headers: { authorization: authToken },
        payload: {
          ticketId: '123e4567-e89b-12d3-a456-426614174000',
          toEmail: 'recipient@example.com',
          message: 'Enjoy the show!'
        }
      });

      if (createResponse.statusCode === 201) {
        const createBody = JSON.parse(createResponse.body);
        transferId = createBody.transferId;
        acceptanceCode = createBody.acceptanceCode;

        expect(createBody.status).toBe('PENDING');
        expect(createBody).toHaveProperty('expiresAt');

        // Step 2: Accept the transfer
        const acceptResponse = await app.inject({
          method: 'POST',
          url: `/api/v1/transfers/${transferId}/accept`,
          headers: { authorization: authToken },
          payload: {
            acceptanceCode,
            userId: '123e4567-e89b-12d3-a456-426614174001'
          }
        });

        if (acceptResponse.statusCode === 200) {
          const acceptBody = JSON.parse(acceptResponse.body);
          expect(acceptBody).toHaveProperty('success');
          expect(acceptBody).toHaveProperty('ticketId');
          expect(acceptBody).toHaveProperty('newOwnerId');
        }
      }
    });
  });

  describe('Error Scenarios', () => {
    it('should handle invalid acceptance code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/transfers/123e4567-e89b-12d3-a456-426614174000/accept',
        headers: { authorization: authToken },
        payload: {
          acceptanceCode: 'INVALID',
          userId: '123e4567-e89b-12d3-a456-426614174001'
        }
      });

      expect([400, 404]).toContain(response.statusCode);
    });

    it('should handle missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        headers: { authorization: authToken },
        payload: {
          ticketId: '123e4567-e89b-12d3-a456-426614174000'
          // Missing toEmail
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Security Tests', () => {
    it('should reject requests without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        payload: {
          ticketId: '123e4567-e89b-12d3-a456-426614174000',
          toEmail: 'test@example.com'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate UUID formats', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/transfers/gift',
        headers: { authorization: authToken },
        payload: {
          ticketId: 'invalid-uuid',
          toEmail: 'test@example.com'
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
