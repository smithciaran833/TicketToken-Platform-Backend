// Mock services and database BEFORE imports
const mockGetHealthSummary = jest.fn();
const mockProcessDeadLetterQueue = jest.fn();
const mockRecoverStaleOperations = jest.fn();

jest.mock('../../../src/services/monitoring.service', () => ({
  monitoringService: {
    getHealthSummary: mockGetHealthSummary,
  },
}));

jest.mock('../../../src/services/recovery.service', () => ({
  recoveryService: {
    processDeadLetterQueue: mockProcessDeadLetterQueue,
    recoverStaleOperations: mockRecoverStaleOperations,
  },
}));

const mockSyncNow = jest.fn();
jest.mock('../../../src/services/integration.service', () => ({
  integrationService: {
    syncNow: mockSyncNow,
  },
}));

// Mock database with proper chaining
let mockQueryResult: any;
const mockSelect = jest.fn();
const mockWhere = jest.fn();
const mockGroupBy = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockOffset = jest.fn();
const mockCount = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockRaw = jest.fn();

// Create a chainable query builder that properly handles promises
const createQueryBuilder = () => {
  const builder: any = {
    where: mockWhere,
    select: mockSelect,
    groupBy: mockGroupBy,
    orderBy: mockOrderBy,
    limit: mockLimit,
    offset: mockOffset,
    count: mockCount,
    update: mockUpdate,
    delete: mockDelete,
  };
  
  // Make it thenable (Promise-like)
  builder.then = function(resolve: any, reject: any) {
    return mockQueryResult.then(resolve, reject);
  };
  
  builder.catch = function(reject: any) {
    return mockQueryResult.catch(reject);
  };
  
  mockWhere.mockReturnValue(builder);
  mockSelect.mockReturnValue(builder);
  mockGroupBy.mockReturnValue(builder);
  mockOrderBy.mockReturnValue(builder);
  mockLimit.mockReturnValue(builder);
  mockOffset.mockReturnValue(builder);
  mockCount.mockReturnValue(builder);
  
  return builder;
};

const mockDb = jest.fn(() => createQueryBuilder());
mockDb.raw = mockRaw;

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

import { AdminController } from '../../../src/controllers/admin.controller';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('AdminController', () => {
  let controller: AdminController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockCode: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new AdminController();

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

    // Reset query result to resolved promise by default
    mockQueryResult = Promise.resolve([]);
    mockUpdate.mockResolvedValue(1);
    mockDelete.mockResolvedValue(1);
  });

  describe('getAllVenueIntegrations', () => {
    it('should return all integrations without filters', async () => {
      const integrations = [
        { id: '1', venue_id: 'v1', status: 'active' },
        { id: '2', venue_id: 'v2', status: 'inactive' },
      ];

      mockRequest.query = {};
      mockQueryResult = Promise.resolve(integrations);

      await controller.getAllVenueIntegrations(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDb).toHaveBeenCalledWith('integration_configs');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: integrations,
      });
    });

    it('should filter by status', async () => {
      const integrations = [{ id: '1', status: 'active' }];

      mockRequest.query = { status: 'active' };
      mockQueryResult = Promise.resolve(integrations);

      await controller.getAllVenueIntegrations(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith('status', 'active');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: integrations,
      });
    });

    it('should filter by healthStatus', async () => {
      const integrations = [{ id: '1', health_status: 'healthy' }];

      mockRequest.query = { healthStatus: 'healthy' };
      mockQueryResult = Promise.resolve(integrations);

      await controller.getAllVenueIntegrations(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith('health_status', 'healthy');
    });

    it('should filter by both status and healthStatus', async () => {
      const integrations = [{ id: '1', status: 'active', health_status: 'healthy' }];

      mockRequest.query = { status: 'active', healthStatus: 'healthy' };
      mockQueryResult = Promise.resolve(integrations);

      await controller.getAllVenueIntegrations(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith('status', 'active');
      expect(mockWhere).toHaveBeenCalledWith('health_status', 'healthy');
    });

    it('should return empty array when no integrations exist', async () => {
      mockRequest.query = {};
      mockQueryResult = Promise.resolve([]);

      await controller.getAllVenueIntegrations(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: [],
      });
    });

    it('should propagate database errors', async () => {
      mockRequest.query = {};
      const error = new Error('Database connection failed');
      mockQueryResult = Promise.reject(error);

      await expect(
        controller.getAllVenueIntegrations(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('getHealthSummary', () => {
    it('should return health summary from monitoring service', async () => {
      const summary = {
        total: 10,
        healthy: 8,
        degraded: 1,
        unhealthy: 1,
      };

      mockGetHealthSummary.mockResolvedValue(summary);

      await controller.getHealthSummary(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockGetHealthSummary).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: summary,
      });
    });

    it('should handle empty summary', async () => {
      mockGetHealthSummary.mockResolvedValue({});

      await controller.getHealthSummary(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {},
      });
    });

    it('should propagate monitoring service errors', async () => {
      const error = new Error('Monitoring service unavailable');
      mockGetHealthSummary.mockRejectedValue(error);

      await expect(
        controller.getHealthSummary(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Monitoring service unavailable');
    });
  });

  describe('getCostAnalysis', () => {
    it('should return cost analysis without date filters', async () => {
      const costs = [
        {
          venue_id: 'v1',
          integration_type: 'stripe',
          total_api_calls: '100',
          total_data_mb: '50',
          total_cost: '25.50',
        },
        {
          venue_id: 'v2',
          integration_type: 'square',
          total_api_calls: '200',
          total_data_mb: '100',
          total_cost: '50.00',
        },
      ];

      mockRequest.query = {};
      mockRaw.mockReturnValue('SUM(api_calls) as total_api_calls');
      mockQueryResult = Promise.resolve(costs);

      await controller.getCostAnalysis(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDb).toHaveBeenCalledWith('integration_costs');
      expect(mockSelect).toHaveBeenCalled();
      expect(mockGroupBy).toHaveBeenCalledWith('venue_id', 'integration_type');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          costs,
          total: 75.5,
        },
      });
    });

    it('should filter by startDate', async () => {
      const costs = [{ total_cost: '10.00' }];

      mockRequest.query = { startDate: '2025-01-01' };
      mockQueryResult = Promise.resolve(costs);

      await controller.getCostAnalysis(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith('period_start', '>=', '2025-01-01');
    });

    it('should filter by endDate', async () => {
      const costs = [{ total_cost: '20.00' }];

      mockRequest.query = { endDate: '2025-12-31' };
      mockQueryResult = Promise.resolve(costs);

      await controller.getCostAnalysis(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith('period_end', '<=', '2025-12-31');
    });

    it('should filter by both startDate and endDate', async () => {
      const costs = [{ total_cost: '15.00' }];

      mockRequest.query = { startDate: '2025-01-01', endDate: '2025-12-31' };
      mockQueryResult = Promise.resolve(costs);

      await controller.getCostAnalysis(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith('period_start', '>=', '2025-01-01');
      expect(mockWhere).toHaveBeenCalledWith('period_end', '<=', '2025-12-31');
    });

    it('should handle zero costs', async () => {
      mockRequest.query = {};
      mockQueryResult = Promise.resolve([]);

      await controller.getCostAnalysis(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          costs: [],
          total: 0,
        },
      });
    });

    it('should handle null total_cost values', async () => {
      const costs = [
        { total_cost: null },
        { total_cost: '10.00' },
      ];

      mockRequest.query = {};
      mockQueryResult = Promise.resolve(costs);

      await controller.getCostAnalysis(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          costs,
          total: 10,
        },
      });
    });

    it('should propagate database errors', async () => {
      mockRequest.query = {};
      const error = new Error('Query timeout');
      mockQueryResult = Promise.reject(error);

      await expect(
        controller.getCostAnalysis(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Query timeout');
    });
  });

  describe('forceSync', () => {
    it('should return 400 when venueId is missing', async () => {
      mockRequest.body = { integrationType: 'stripe' };

      await controller.forceSync(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID and integration type are required',
      });
    });

    it('should return 400 when integrationType is missing', async () => {
      mockRequest.body = { venueId: 'venue-123' };

      await controller.forceSync(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Venue ID and integration type are required',
      });
    });

    it('should return 400 when both are missing', async () => {
      mockRequest.body = {};

      await controller.forceSync(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCode).toHaveBeenCalledWith(400);
    });

    it('should trigger forced sync successfully', async () => {
      const result = {
        success: true,
        syncId: 'sync-123',
        startedAt: new Date(),
      };

      mockRequest.body = { venueId: 'venue-123', integrationType: 'stripe' };
      mockSyncNow.mockResolvedValue(result);

      await controller.forceSync(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSyncNow).toHaveBeenCalledWith('venue-123', 'stripe', {
        force: true,
      });
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: result,
      });
    });

    it('should trigger sync for different providers', async () => {
      const providers = ['stripe', 'square', 'mailchimp', 'quickbooks'];

      for (const provider of providers) {
        jest.clearAllMocks();
        mockRequest.body = { venueId: 'venue-123', integrationType: provider };
        mockSyncNow.mockResolvedValue({ success: true });

        await controller.forceSync(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockSyncNow).toHaveBeenCalledWith('venue-123', provider, {
          force: true,
        });
      }
    });

    it('should propagate sync errors', async () => {
      mockRequest.body = { venueId: 'venue-123', integrationType: 'stripe' };
      const error = new Error('Sync failed: rate limit exceeded');
      mockSyncNow.mockRejectedValue(error);

      await expect(
        controller.forceSync(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Sync failed: rate limit exceeded');
    });
  });

  describe('clearQueue', () => {
    it('should clear all queue items without filters', async () => {
      mockRequest.body = {};
      mockDelete.mockResolvedValue(5);

      await controller.clearQueue(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDb).toHaveBeenCalledWith('sync_queue');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: '5 queue items cleared',
      });
    });

    it('should filter by venueId', async () => {
      mockRequest.body = { venueId: 'venue-123' };
      mockDelete.mockResolvedValue(3);

      await controller.clearQueue(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith('venue_id', 'venue-123');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: '3 queue items cleared',
      });
    });

    it('should filter by integrationType', async () => {
      mockRequest.body = { integrationType: 'stripe' };
      mockDelete.mockResolvedValue(2);

      await controller.clearQueue(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith('integration_type', 'stripe');
    });

    it('should filter by status', async () => {
      mockRequest.body = { status: 'failed' };
      mockDelete.mockResolvedValue(1);

      await controller.clearQueue(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith('status', 'failed');
    });

    it('should filter by multiple criteria', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        integrationType: 'stripe',
        status: 'failed',
      };
      mockDelete.mockResolvedValue(1);

      await controller.clearQueue(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockWhere).toHaveBeenCalledWith('venue_id', 'venue-123');
      expect(mockWhere).toHaveBeenCalledWith('integration_type', 'stripe');
      expect(mockWhere).toHaveBeenCalledWith('status', 'failed');
    });

    it('should handle zero deletions', async () => {
      mockRequest.body = { venueId: 'nonexistent' };
      mockDelete.mockResolvedValue(0);

      await controller.clearQueue(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: '0 queue items cleared',
      });
    });

    it('should propagate database errors', async () => {
      mockRequest.body = {};
      const error = new Error('Delete operation failed');
      mockDelete.mockRejectedValue(error);

      await expect(
        controller.clearQueue(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Delete operation failed');
    });
  });

  describe('processDeadLetter', () => {
    it('should initiate dead letter queue processing', async () => {
      mockProcessDeadLetterQueue.mockResolvedValue(undefined);

      await controller.processDeadLetter(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockProcessDeadLetterQueue).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Dead letter queue processing initiated',
      });
    });

    it('should propagate recovery service errors', async () => {
      const error = new Error('Recovery service unavailable');
      mockProcessDeadLetterQueue.mockRejectedValue(error);

      await expect(
        controller.processDeadLetter(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Recovery service unavailable');
    });
  });

  describe('recoverStale', () => {
    it('should initiate stale operations recovery', async () => {
      mockRecoverStaleOperations.mockResolvedValue(undefined);

      await controller.recoverStale(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRecoverStaleOperations).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Stale operations recovery initiated',
      });
    });

    it('should propagate recovery service errors', async () => {
      const error = new Error('Recovery failed');
      mockRecoverStaleOperations.mockRejectedValue(error);

      await expect(
        controller.recoverStale(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Recovery failed');
    });
  });

  describe('getQueueMetrics', () => {
    it('should return queue metrics grouped by priority and status', async () => {
      const metrics = [
        { priority: 'high', status: 'pending', count: '5' },
        { priority: 'high', status: 'processing', count: '2' },
        { priority: 'low', status: 'pending', count: '10' },
        { priority: 'low', status: 'failed', count: '1' },
      ];

      mockQueryResult = Promise.resolve(metrics);

      await controller.getQueueMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockDb).toHaveBeenCalledWith('sync_queue');
      expect(mockSelect).toHaveBeenCalledWith('priority', 'status');
      expect(mockCount).toHaveBeenCalledWith('* as count');
      expect(mockGroupBy).toHaveBeenCalledWith('priority', 'status');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: metrics,
      });
    });

    it('should handle empty metrics', async () => {
      mockQueryResult = Promise.resolve([]);

      await controller.getQueueMetrics(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: [],
      });
    });

    it('should propagate database errors', async () => {
      const error = new Error('Aggregation failed');
      mockQueryResult = Promise.reject(error);

      await expect(
        controller.getQueueMetrics(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow('Aggregation failed');
    });
  });
});
