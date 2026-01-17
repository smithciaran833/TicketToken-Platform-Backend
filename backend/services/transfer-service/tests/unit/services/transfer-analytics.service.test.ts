/**
 * Unit Tests for TransferAnalyticsService
 *
 * Tests:
 * - Transfer metrics
 * - User statistics
 * - Transfer trends
 * - Fee analytics
 * - Blockchain analytics
 * - Transfer velocity
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import { TransferAnalyticsService } from '../../../src/services/transfer-analytics.service';

jest.mock('../../../src/utils/logger');

describe('TransferAnalyticsService', () => {
  let analyticsService: TransferAnalyticsService;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    } as any;

    analyticsService = new TransferAnalyticsService(mockPool);

    jest.clearAllMocks();
  });

  describe('getTransferMetrics()', () => {
    const params = {
      tenantId: 'tenant-123',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31')
    };

    it('should return transfer metrics', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            total_transfers: '100',
            completed_transfers: '80',
            pending_transfers: '15',
            failed_transfers: '5',
            avg_transfer_time: '3600'
          }]
        } as any)
        .mockResolvedValueOnce({
          rows: [
            { ticket_id: 'ticket-1', transfer_count: '10' },
            { ticket_id: 'ticket-2', transfer_count: '8' }
          ]
        } as any);

      const result = await analyticsService.getTransferMetrics(params);

      expect(result.totalTransfers).toBe(100);
      expect(result.completedTransfers).toBe(80);
      expect(result.pendingTransfers).toBe(15);
      expect(result.failedTransfers).toBe(5);
      expect(result.avgTransferTime).toBe(3600);
      expect(result.topTransferredTickets).toHaveLength(2);
    });

    it('should use FILTER for status counts', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getTransferMetrics(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain("FILTER (WHERE status = 'COMPLETED')");
      expect(query).toContain("FILTER (WHERE status = 'PENDING')");
      expect(query).toContain("FILTER (WHERE status = 'FAILED')");
    });

    it('should calculate average transfer time', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getTransferMetrics(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))');
    });

    it('should filter by tenant and date range', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getTransferMetrics(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tenant_id = $1');
      expect(query).toContain('created_at BETWEEN $2 AND $3');
    });

    it('should get top 10 transferred tickets', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getTransferMetrics(params);

      const query = mockPool.query.mock.calls[1][0] as string;
      expect(query).toContain('GROUP BY ticket_id');
      expect(query).toContain('ORDER BY transfer_count DESC');
      expect(query).toContain('LIMIT 10');
    });

    it('should only count completed transfers for top tickets', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getTransferMetrics(params);

      const query = mockPool.query.mock.calls[1][0] as string;
      expect(query).toContain("status = 'COMPLETED'");
    });

    it('should handle null values gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            total_transfers: null,
            completed_transfers: null,
            pending_transfers: null,
            failed_transfers: null,
            avg_transfer_time: null
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await analyticsService.getTransferMetrics(params);

      expect(result.totalTransfers).toBe(0);
      expect(result.completedTransfers).toBe(0);
      expect(result.avgTransferTime).toBe(0);
    });

    it('should throw error on database failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await expect(
        analyticsService.getTransferMetrics(params)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getUserTransferStats()', () => {
    const userId = 'user-123';

    it('should return user transfer statistics', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ total: '10', completed: '8' }]
        } as any)
        .mockResolvedValueOnce({
          rows: [{ total: '5' }]
        } as any)
        .mockResolvedValueOnce({
          rows: [{ avg_time: '7200' }]
        } as any);

      const result = await analyticsService.getUserTransferStats(userId);

      expect(result.userId).toBe(userId);
      expect(result.totalSent).toBe(10);
      expect(result.totalReceived).toBe(5);
      expect(result.successRate).toBe(80);
      expect(result.avgTimeToAccept).toBe(7200);
    });

    it('should calculate success rate correctly', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ total: '20', completed: '15' }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ total: '0' }] } as any)
        .mockResolvedValueOnce({ rows: [{ avg_time: '0' }] } as any);

      const result = await analyticsService.getUserTransferStats(userId);

      expect(result.successRate).toBe(75); // 15/20 * 100
    });

    it('should handle zero sent transfers', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ total: '0', completed: '0' }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ total: '0' }] } as any)
        .mockResolvedValueOnce({ rows: [{ avg_time: '0' }] } as any);

      const result = await analyticsService.getUserTransferStats(userId);

      expect(result.successRate).toBe(0);
    });

    it('should query sent transfers with FILTER', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getUserTransferStats(userId);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain("FILTER (WHERE status = 'COMPLETED')");
    });

    it('should only count completed received transfers', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getUserTransferStats(userId);

      const query = mockPool.query.mock.calls[1][0] as string;
      expect(query).toContain("status = 'COMPLETED'");
    });

    it('should calculate average acceptance time', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getUserTransferStats(userId);

      const query = mockPool.query.mock.calls[2][0] as string;
      expect(query).toContain('AVG(EXTRACT(EPOCH FROM (completed_at - created_at)))');
    });

    it('should handle null values', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ total: null, completed: null }]
        } as any)
        .mockResolvedValueOnce({ rows: [{ total: null }] } as any)
        .mockResolvedValueOnce({ rows: [{ avg_time: null }] } as any);

      const result = await analyticsService.getUserTransferStats(userId);

      expect(result.totalSent).toBe(0);
      expect(result.totalReceived).toBe(0);
      expect(result.avgTimeToAccept).toBe(0);
    });

    it('should throw error on database failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await expect(
        analyticsService.getUserTransferStats(userId)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getTransferTrends()', () => {
    const params = {
      tenantId: 'tenant-123',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      interval: 'day' as const
    };

    it('should return transfer trends', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            period: new Date('2024-01-01'),
            transfer_count: '10',
            completed_count: '8',
            failed_count: '2'
          },
          {
            period: new Date('2024-01-02'),
            transfer_count: '15',
            completed_count: '12',
            failed_count: '3'
          }
        ]
      } as any);

      const result = await analyticsService.getTransferTrends(params);

      expect(result).toHaveLength(2);
      expect(result[0].transferCount).toBe(10);
      expect(result[0].completedCount).toBe(8);
      expect(result[0].failedCount).toBe(2);
    });

    it('should use DATE_TRUNC with specified interval', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await analyticsService.getTransferTrends(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('DATE_TRUNC($1, created_at)');
    });

    it('should support different intervals', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await analyticsService.getTransferTrends({
        ...params,
        interval: 'hour'
      });

      const queryParams = mockPool.query.mock.calls[0][1] as any[];
      expect(queryParams[0]).toBe('hour');
    });

    it('should group by period', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await analyticsService.getTransferTrends(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('GROUP BY period');
    });

    it('should order by period', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await analyticsService.getTransferTrends(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('ORDER BY period');
    });

    it('should use FILTER for status-specific counts', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await analyticsService.getTransferTrends(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain("FILTER (WHERE status = 'COMPLETED')");
      expect(query).toContain("FILTER (WHERE status = 'FAILED')");
    });

    it('should throw error on database failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await expect(
        analyticsService.getTransferTrends(params)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getTransferFeeAnalytics()', () => {
    const params = {
      tenantId: 'tenant-123',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31')
    };

    it('should return fee analytics', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_paid_transfers: '50',
          total_fees_collected: '1250.50',
          avg_fee: '25.01',
          total_platform_fees: '500.00',
          total_base_fees: '400.50',
          total_service_fees: '350.00'
        }]
      } as any);

      const result = await analyticsService.getTransferFeeAnalytics(params);

      expect(result.totalPaidTransfers).toBe(50);
      expect(result.totalFeesCollected).toBe(1250.50);
      expect(result.avgFee).toBe(25.01);
      expect(result.totalPlatformFees).toBe(500.00);
      expect(result.totalBaseFees).toBe(400.50);
      expect(result.totalServiceFees).toBe(350.00);
    });

    it('should join transfer_fees with ticket_transfers', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getTransferFeeAnalytics(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('FROM transfer_fees tf');
      expect(query).toContain('JOIN ticket_transfers tt');
    });

    it('should filter by tenant and date range', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getTransferFeeAnalytics(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('tt.tenant_id = $1');
      expect(query).toContain('tf.paid_at BETWEEN $2 AND $3');
    });

    it('should aggregate fee components', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getTransferFeeAnalytics(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('SUM(total_fee)');
      expect(query).toContain('SUM(platform_fee)');
      expect(query).toContain('SUM(base_fee)');
      expect(query).toContain('SUM(service_fee)');
    });

    it('should handle null values', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_paid_transfers: null,
          total_fees_collected: null,
          avg_fee: null,
          total_platform_fees: null,
          total_base_fees: null,
          total_service_fees: null
        }]
      } as any);

      const result = await analyticsService.getTransferFeeAnalytics(params);

      expect(result.totalPaidTransfers).toBe(0);
      expect(result.totalFeesCollected).toBe(0);
      expect(result.avgFee).toBe(0);
    });

    it('should throw error on database failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await expect(
        analyticsService.getTransferFeeAnalytics(params)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getBlockchainTransferAnalytics()', () => {
    const params = {
      tenantId: 'tenant-123',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31')
    };

    it('should return blockchain analytics', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_blockchain_transfers: '100',
          successful_blockchain_transfers: '95',
          avg_blockchain_transfer_time: '180'
        }]
      } as any);

      const result = await analyticsService.getBlockchainTransferAnalytics(params);

      expect(result.totalBlockchainTransfers).toBe(100);
      expect(result.successfulBlockchainTransfers).toBe(95);
      expect(result.avgBlockchainTransferTime).toBe(180);
    });

    it('should count transfers with signatures', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getBlockchainTransferAnalytics(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('FILTER (WHERE blockchain_signature IS NOT NULL)');
    });

    it('should calculate average blockchain transfer time', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getBlockchainTransferAnalytics(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('AVG(EXTRACT(EPOCH FROM (blockchain_transferred_at - created_at)))');
    });

    it('should filter by blockchain_transferred_at date range', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] } as any);

      await analyticsService.getBlockchainTransferAnalytics(params);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain('blockchain_transferred_at BETWEEN $2 AND $3');
    });

    it('should handle null values', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_blockchain_transfers: null,
          successful_blockchain_transfers: null,
          avg_blockchain_transfer_time: null
        }]
      } as any);

      const result = await analyticsService.getBlockchainTransferAnalytics(params);

      expect(result.totalBlockchainTransfers).toBe(0);
      expect(result.successfulBlockchainTransfers).toBe(0);
      expect(result.avgBlockchainTransferTime).toBe(0);
    });

    it('should throw error on database failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await expect(
        analyticsService.getBlockchainTransferAnalytics(params)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getTransferVelocity()', () => {
    const tenantId = 'tenant-123';

    it('should return transfer velocity', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ transfer_count: '48' }]
      } as any);

      const result = await analyticsService.getTransferVelocity(tenantId, 24);

      expect(result.totalTransfers).toBe(48);
      expect(result.transfersPerHour).toBe(2); // 48 / 24
      expect(result.periodHours).toBe(24);
    });

    it('should default to 24 hours', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ transfer_count: '0' }]
      } as any);

      const result = await analyticsService.getTransferVelocity(tenantId);

      expect(result.periodHours).toBe(24);
    });

    it('should use INTERVAL for time range', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ transfer_count: '0' }]
      } as any);

      await analyticsService.getTransferVelocity(tenantId, 48);

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain("INTERVAL '48 hours'");
    });

    it('should calculate velocity correctly', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ transfer_count: '100' }]
      } as any);

      const result = await analyticsService.getTransferVelocity(tenantId, 10);

      expect(result.transfersPerHour).toBe(10); // 100 / 10
    });

    it('should handle zero transfers', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ transfer_count: '0' }]
      } as any);

      const result = await analyticsService.getTransferVelocity(tenantId, 24);

      expect(result.transfersPerHour).toBe(0);
      expect(result.totalTransfers).toBe(0);
    });

    it('should handle null values', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ transfer_count: null }]
      } as any);

      const result = await analyticsService.getTransferVelocity(tenantId);

      expect(result.totalTransfers).toBe(0);
      expect(result.transfersPerHour).toBe(0);
    });

    it('should throw error on database failure', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await expect(
        analyticsService.getTransferVelocity(tenantId)
      ).rejects.toThrow('Database error');
    });
  });
});
