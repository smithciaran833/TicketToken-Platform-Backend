import fastify, { FastifyInstance } from 'fastify';
import queryRoutes from '../../src/routes/query.routes';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../src/utils/database');
jest.mock('../../src/models/blockchain-transaction.model');
jest.mock('../../src/models/wallet-activity.model');
jest.mock('../../src/models/marketplace-event.model');
jest.mock('../../src/utils/logger');

describe('Query Routes Integration Tests', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-key';
    
    // Create a valid JWT token
    token = jwt.sign(
      { userId: 'test-user-123', serviceId: 'test-service' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  beforeEach(async () => {
    app = fastify();
    await app.register(queryRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('should return 401 for requests without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sync/status'
      });

      expect(response.statusCode).toBe(401);
      const payload = JSON.parse(response.payload);
      expect(payload).toHaveProperty('error');
    });

    it('should return 401 for requests with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sync/status',
        headers: {
          authorization: 'Bearer invalid-token'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('should accept requests with valid token', async () => {
      const db = require('../../src/utils/database').default;
      (db.query as jest.Mock).mockResolvedValue({
        rows: [{
          last_processed_slot: 1000,
          last_processed_signature: 'sig',
          indexer_version: '1.0.0',
          is_running: true,
          started_at: new Date(),
          updated_at: new Date()
        }]
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sync/status',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid signature format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/transactions/short',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid wallet address format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/wallets/x/activity',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject pagination limit exceeding max', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/wallets/valid-address-12345678901234567890/activity?limit=1000',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept valid signature format', async () => {
      const db = require('../../src/utils/database').default;
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      const validSignature = '1'.repeat(88);
      
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/transactions/${validSignature}`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      // 404 means validation passed but signature not found
      expect([404, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/sync/status', () => {
    it('should return indexer sync status', async () => {
      const db = require('../../src/utils/database').default;
      const mockState = {
        last_processed_slot: 12345,
        last_processed_signature: 'test-sig',
        indexer_version: '1.0.0',
        is_running: true,
        started_at: new Date('2025-01-01'),
        updated_at: new Date('2025-01-02')
      };

      (db.query as jest.Mock).mockResolvedValue({ rows: [mockState] });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sync/status',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.lastProcessedSlot).toBe(12345);
      expect(payload.indexerVersion).toBe('1.0.0');
      expect(payload.isRunning).toBe(true);
    });

    it('should return 404 if indexer state not found', async () => {
      const db = require('../../src/utils/database').default;
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sync/status',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/wallets/:address/activity', () => {
    it('should return wallet activity with pagination', async () => {
      const WalletActivity = require('../../src/models/wallet-activity.model').WalletActivity;
      
      const mockActivities = [
        {
          walletAddress: 'test-address',
          activityType: 'transfer',
          assetId: 'token-1',
          timestamp: new Date()
        }
      ];

      WalletActivity.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockActivities)
            })
          })
        })
      });

      WalletActivity.countDocuments = jest.fn().mockResolvedValue(1);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/wallets/test-address-12345678901234567890/activity',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload).toHaveProperty('activities');
      expect(payload).toHaveProperty('pagination');
    });
  });

  describe('Error Handling', () => {
    it('should return 500 on database errors', async () => {
      const db = require('../../src/utils/database').default;
      (db.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sync/status',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(response.statusCode).toBe(500);
    });
  });
});
