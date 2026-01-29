/**
 * COMPONENT TEST: WebhookCleanup
 *
 * Tests webhook cleanup cron job
 */

import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock data
let mockDeletedCount = 0;
let mockFailedWebhooks: any[] = [];

// Mock pool
const mockPoolQuery = jest.fn();

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { WebhookCleanup } from '../../../src/cron/webhook-cleanup';

describe('WebhookCleanup Component Tests', () => {
  let cleanup: WebhookCleanup;
  let mockPool: Pool;

  beforeEach(() => {
    mockDeletedCount = 0;
    mockFailedWebhooks = [];
    mockPoolQuery.mockReset();

    // Setup pool query behavior
    mockPoolQuery.mockImplementation(async (query: string, params?: any[]) => {
      // DELETE old processed webhooks
      if (query.includes('DELETE FROM webhook_inbox')) {
        return { rowCount: mockDeletedCount };
      }

      // SELECT failed webhooks
      if (query.includes('SELECT') && query.includes('webhook_inbox')) {
        return { rows: mockFailedWebhooks };
      }

      return { rows: [] };
    });

    mockPool = { query: mockPoolQuery } as unknown as Pool;
    cleanup = new WebhookCleanup(mockPool);
  });

  // ===========================================================================
  // DELETE OLD WEBHOOKS
  // ===========================================================================
  describe('delete old processed webhooks', () => {
    it('should delete webhooks older than 30 days', async () => {
      mockDeletedCount = 150;

      await cleanup.run();

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM webhook_inbox')
      );
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'processed'")
      );
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('30 days')
      );
    });

    it('should handle zero deletions', async () => {
      mockDeletedCount = 0;

      await expect(cleanup.run()).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // IDENTIFY FAILED WEBHOOKS
  // ===========================================================================
  describe('identify failed webhooks', () => {
    it('should find failed webhooks with max retries', async () => {
      mockFailedWebhooks = [
        { id: uuidv4(), webhook_id: 'wh_1', retry_count: 5, status: 'failed' },
        { id: uuidv4(), webhook_id: 'wh_2', retry_count: 6, status: 'failed' },
      ];

      await cleanup.run();

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('retry_count >= 5')
      );
    });

    it('should handle no failed webhooks', async () => {
      mockFailedWebhooks = [];

      await expect(cleanup.run()).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // QUERY STRUCTURE
  // ===========================================================================
  describe('query structure', () => {
    it('should use explicit field list for security', async () => {
      await cleanup.run();

      // Should not use SELECT *
      const selectCalls = mockPoolQuery.mock.calls.filter(
        call => call[0].includes('SELECT') && call[0].includes('webhook_inbox')
      );
      
      for (const call of selectCalls) {
        expect(call[0]).not.toContain('SELECT *');
      }
    });

    it('should filter by 7 days for failed webhooks', async () => {
      await cleanup.run();

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('7 days')
      );
    });
  });
});
