// Mock services and database BEFORE imports
const mockSyncNow = jest.fn();

jest.mock('../../../src/services/integration.service', () => ({
  integrationService: {
    syncNow: mockSyncNow,
  },
}));

// Mock database
const mockFirst = jest.fn();
const mockSelect = jest.fn();
const mockWhere = jest.fn();
const mockGroupBy = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockOffset = jest.fn();
const mockCount = jest.fn();
const mockUpdate = jest.fn();

const mockDb = jest.fn(() => ({
  where: mockWhere,
  first: mockFirst,
  select: mockSelect,
  groupBy: mockGroupBy,
  orderBy: mockOrderBy,
  limit: mockLimit,
  offset: mockOffset,
  count: mockCount,
  update: mockUpdate,
}));

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

import { SyncController } from '../../../src/controllers/sync.controller';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('SyncController', () => {
  let controller: SyncController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockCode: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new SyncController();

    mockSend = jest.fn().mockReturnThis();
    mockCode = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      code: mockCode,
    };

    mockRequest = {
      params: {},
      query: {},
      body: {},
    };

    // Setup default chainable mock returns
    mockWhere.mockReturnThis();
    mockSelect.mockReturnThis();
    mockGroupBy.mockReturnThis();
    mockOrderBy.mockReturnThis();
    mockLimit.mockReturnThis();
    mockOffset.mockReturnThis();
    mockCount.mockReturnThis();
    mockUpdate.mockResolvedValue(1);
  });

  describe('triggerSync', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { syncType: 'full' };

      await controller.triggerSync(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should trigger sync with venueId only', async () => {
      const result = {
        success: true,
        syncId: 'sync-123',
        startedAt: new Date(),
      };

      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      mockSyncNow.mockResolvedValue(result);

      await controller.triggerSync(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSyncNow).toHaveBeenCalledWith('venue-123', 'stripe', {
        syncType: undefined,
      });
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: result,
      });
    });

    it('should trigger sync with syncType', async () => {
      const result = { success: true };

      mockRequest.params = { provider: 'square' };
      mockRequest.body = { venueId: 'venue-123', syncType: 'incremental' };
      mockSyncNow.mockResolvedValue(result);

      await controller.triggerSync(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSyncNow).toHaveBeenCalledWith('venue-123', 'square', {
        syncType: 'incremental',
      });
    });

    it('should trigger sync with options', async () => {
      const result = { success: true };

      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.body = {
        venueId: 'venue-123',
        syncType: 'full',
        options: { force: true, priority: 'high' },
      };
      mockSyncNow.mockResolvedValue(result);

      await controller.triggerSync(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSyncNow).toHaveBeenCalledWith('venue-123', 'mailchimp', {
        syncType: 'full',
        force: true,
        priority: 'high',
      });
    });

    it('should trigger sync for different providers', async () => {
      const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.params = { provider };
        mockRequest.body = { venueId: 'venue-123' };
        mockSyncNow.mockResolvedValue({ success: true });

        await controller.triggerSync(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockSyncNow).toHaveBeenCalledWith('venue-123', provider, {
          syncType: undefined,
        });
      }
    });

    it('should propagate sync errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      const error = new Error('Sync failed: rate limit exceeded');
      mockSyncNow.mockRejectedValue(error);

      await expect(
        controller.triggerSync(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Sync failed: rate limit exceeded');
    });
  });

  describe('stopSync', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {};

      await controller.stopSync(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should stop sync by pausing pending items', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      mockUpdate.mockResolvedValue(3);

      await controller.stopSync(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDb).toHaveBeenCalledWith('sync_queue');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: 'venue-123',
        integration_type: 'stripe',
        status: 'pending',
      });
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'paused',
        updated_at: expect.any(Date),
      });
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Sync stopped successfully',
      });
    });

    it('should stop sync for different providers', async () => {
      const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.params = { provider };
        mockRequest.body = { venueId: 'venue-123' };
        mockUpdate.mockResolvedValue(1);

        await controller.stopSync(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockWhere).toHaveBeenCalledWith({
          venue_id: 'venue-123',
          integration_type: provider,
          status: 'pending',
        });
      }
    });

    it('should handle when no items are paused', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.body = { venueId: 'venue-456' };
      mockUpdate.mockResolvedValue(0);

      await controller.stopSync(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Sync stopped successfully',
      });
    });

    it('should propagate database errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      const error = new Error('Update failed');
      mockUpdate.mockRejectedValue(error);

      await expect(
        controller.stopSync(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Update failed');
    });
  });

  describe('getSyncStatus', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = {};

      await controller.getSyncStatus(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should return sync status with integration and queue data', async () => {
      const integration = {
        id: 'int-123',
        venue_id: 'venue-123',
        integration_type: 'stripe',
        status: 'active',
        last_sync: new Date(),
      };

      const queueStatus = [
        { status: 'pending', count: '5' },
        { status: 'processing', count: '2' },
        { status: 'failed', count: '1' },
      ];

      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      mockFirst.mockResolvedValue(integration);
      mockGroupBy.mockResolvedValue(queueStatus);

      await controller.getSyncStatus(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDb).toHaveBeenCalledWith('integration_configs');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: 'venue-123',
        integration_type: 'stripe',
      });
      expect(mockDb).toHaveBeenCalledWith('sync_queue');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          integration,
          queue: queueStatus,
        },
      });
    });

    it('should handle null integration', async () => {
      const queueStatus = [{ status: 'pending', count: '0' }];

      mockRequest.params = { provider: 'square' };
      mockRequest.query = { venueId: 'venue-456' };
      mockFirst.mockResolvedValue(null);
      mockGroupBy.mockResolvedValue(queueStatus);

      await controller.getSyncStatus(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          integration: null,
          queue: queueStatus,
        },
      });
    });

    it('should handle empty queue', async () => {
      const integration = { id: 'int-123' };

      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.query = { venueId: 'venue-789' };
      mockFirst.mockResolvedValue(integration);
      mockGroupBy.mockResolvedValue([]);

      await controller.getSyncStatus(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          integration,
          queue: [],
        },
      });
    });

    it('should get status for different providers', async () => {
      const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.params = { provider };
        mockRequest.query = { venueId: 'venue-123' };
        mockFirst.mockResolvedValue({});
        mockGroupBy.mockResolvedValue([]);

        await controller.getSyncStatus(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockWhere).toHaveBeenCalledWith({
          venue_id: 'venue-123',
          integration_type: provider,
        });
      }
    });

    it('should propagate database errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      const error = new Error('Query failed');
      mockFirst.mockRejectedValue(error);

      await expect(
        controller.getSyncStatus(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Query failed');
    });
  });

  describe('getSyncHistory', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = {};

      await controller.getSyncHistory(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should return sync history with default pagination', async () => {
      const history = [
        {
          id: 'log-1',
          venue_id: 'venue-123',
          integration_type: 'stripe',
          started_at: new Date('2025-01-15'),
          status: 'success',
        },
        {
          id: 'log-2',
          venue_id: 'venue-123',
          integration_type: 'stripe',
          started_at: new Date('2025-01-14'),
          status: 'success',
        },
      ];

      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      mockOffset.mockResolvedValue(history);

      await controller.getSyncHistory(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDb).toHaveBeenCalledWith('sync_logs');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: 'venue-123',
        integration_type: 'stripe',
      });
      expect(mockOrderBy).toHaveBeenCalledWith('started_at', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(50);
      expect(mockOffset).toHaveBeenCalledWith(0);
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: history,
      });
    });

    it('should return sync history with custom limit', async () => {
      const history = [{ id: 'log-1' }];

      mockRequest.params = { provider: 'square' };
      mockRequest.query = { venueId: 'venue-123', limit: 10 };
      mockOffset.mockResolvedValue(history);

      await controller.getSyncHistory(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should return sync history with custom offset', async () => {
      const history = [{ id: 'log-1' }];

      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.query = { venueId: 'venue-123', offset: 100 };
      mockOffset.mockResolvedValue(history);

      await controller.getSyncHistory(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockOffset).toHaveBeenCalledWith(100);
    });

    it('should return sync history with both limit and offset', async () => {
      const history = [{ id: 'log-1' }];

      mockRequest.params = { provider: 'quickbooks' };
      mockRequest.query = { venueId: 'venue-123', limit: 25, offset: 50 };
      mockOffset.mockResolvedValue(history);

      await controller.getSyncHistory(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLimit).toHaveBeenCalledWith(25);
      expect(mockOffset).toHaveBeenCalledWith(50);
    });

    it('should handle empty history', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-new' };
      mockOffset.mockResolvedValue([]);

      await controller.getSyncHistory(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: [],
      });
    });

    it('should get history for different providers', async () => {
      const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.params = { provider };
        mockRequest.query = { venueId: 'venue-123' };
        mockOffset.mockResolvedValue([]);

        await controller.getSyncHistory(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockWhere).toHaveBeenCalledWith({
          venue_id: 'venue-123',
          integration_type: provider,
        });
      }
    });

    it('should propagate database errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.query = { venueId: 'venue-123' };
      const error = new Error('Query timeout');
      mockOffset.mockRejectedValue(error);

      await expect(
        controller.getSyncHistory(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Query timeout');
    });
  });

  describe('retryFailed', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = {};

      await controller.retryFailed(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID is required',
      });
    });

    it('should retry all failed items', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      mockUpdate.mockResolvedValue(5);

      await controller.retryFailed(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDb).toHaveBeenCalledWith('sync_queue');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: 'venue-123',
        integration_type: 'stripe',
        status: 'failed',
      });
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'pending',
        attempts: 0,
        updated_at: expect.any(Date),
      });
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Failed items re-queued for retry',
      });
    });

    it('should retry specific queue item', async () => {
      mockRequest.params = { provider: 'square' };
      mockRequest.body = { venueId: 'venue-123', queueItemId: 'item-456' };
      mockWhere.mockReturnThis();
      mockUpdate.mockResolvedValue(1);

      await controller.retryFailed(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: 'venue-123',
        integration_type: 'square',
        status: 'failed',
      });
      expect(mockWhere).toHaveBeenCalledWith('id', 'item-456');
    });

    it('should retry for different providers', async () => {
      const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.params = { provider };
        mockRequest.body = { venueId: 'venue-123' };
        mockUpdate.mockResolvedValue(1);

        await controller.retryFailed(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockWhere).toHaveBeenCalledWith({
          venue_id: 'venue-123',
          integration_type: provider,
          status: 'failed',
        });
      }
    });

    it('should handle when no failed items exist', async () => {
      mockRequest.params = { provider: 'mailchimp' };
      mockRequest.body = { venueId: 'venue-789' };
      mockUpdate.mockResolvedValue(0);

      await controller.retryFailed(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Failed items re-queued for retry',
      });
    });

    it('should propagate database errors', async () => {
      mockRequest.params = { provider: 'stripe' };
      mockRequest.body = { venueId: 'venue-123' };
      const error = new Error('Update failed');
      mockUpdate.mockRejectedValue(error);

      await expect(
        controller.retryFailed(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Update failed');
    });
  });
});
