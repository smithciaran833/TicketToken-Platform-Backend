/**
 * Unit Tests: Royalty Service
 * Tests royalty distribution and reversal
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/utils/http-client.util', () => ({
  createSecureServiceClient: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
  })),
  executeWithRetry: jest.fn(),
  getServiceUrl: jest.fn(() => 'http://localhost:3006'),
}));

jest.mock('../../../src/config/rabbitmq', () => ({
  publishEvent: jest.fn().mockResolvedValue(undefined),
}));

import { RoyaltyService } from '../../../src/services/royalty.service';
import { executeWithRetry } from '../../../src/utils/http-client.util';
import { publishEvent } from '../../../src/config/rabbitmq';
import { logger } from '../../../src/utils/logger';

describe('RoyaltyService', () => {
  let service: RoyaltyService;
  let mockExecuteWithRetry: jest.Mock;

  const sampleDistributions = [
    { id: 'dist-1', transactionId: 'tx-1', recipientType: 'venue', recipientId: 'venue-1', amount: 100, percentage: 10, createdAt: new Date() },
    { id: 'dist-2', transactionId: 'tx-1', recipientType: 'artist', recipientId: 'artist-1', amount: 50, percentage: 5, createdAt: new Date() },
    { id: 'dist-3', transactionId: 'tx-1', recipientType: 'platform', recipientId: 'platform', amount: 30, percentage: 3, createdAt: new Date() },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteWithRetry = executeWithRetry as jest.Mock;
    service = new RoyaltyService();
  });

  describe('getRoyaltiesForOrder', () => {
    it('should return royalty distributions', async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ data: { distributions: sampleDistributions } });

      const result = await service.getRoyaltiesForOrder('order-123');

      expect(result).toHaveLength(3);
      expect(result[0].recipientType).toBe('venue');
    });

    it('should return empty array on error', async () => {
      mockExecuteWithRetry.mockRejectedValueOnce(new Error('Service down'));

      const result = await service.getRoyaltiesForOrder('order-123');

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should return empty array when no distributions field', async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ data: {} });

      const result = await service.getRoyaltiesForOrder('order-123');

      expect(result).toEqual([]);
    });
  });

  describe('processReversals', () => {
    const reversalRequest = {
      orderId: 'order-123',
      refundId: 'refund-456',
      refundAmountCents: 1000,
      refundPercentage: 100,
      reason: 'Customer refund',
    };

    it('should process full reversals', async () => {
      mockExecuteWithRetry
        .mockResolvedValueOnce({ data: { distributions: sampleDistributions } })
        .mockResolvedValueOnce({ data: { reversalId: 'rev-1' } })
        .mockResolvedValueOnce({ data: { reversalId: 'rev-2' } });

      const result = await service.processReversals(reversalRequest);

      expect(result.success).toBe(true);
      expect(result.reversals).toHaveLength(2); // venue + artist, not platform
      expect(result.totalReversed).toBeGreaterThan(0);
    });

    it('should skip platform fees', async () => {
      mockExecuteWithRetry
        .mockResolvedValueOnce({ data: { distributions: sampleDistributions } })
        .mockResolvedValueOnce({ data: { reversalId: 'rev-1' } })
        .mockResolvedValueOnce({ data: { reversalId: 'rev-2' } });

      const result = await service.processReversals(reversalRequest);

      const platformReversal = result.reversals.find(r => r.recipientType === 'platform');
      expect(platformReversal).toBeUndefined();
    });

    it('should skip already reversed distributions', async () => {
      const withReversed = [
        { ...sampleDistributions[0], reversedAt: new Date() },
        sampleDistributions[1],
      ];
      mockExecuteWithRetry
        .mockResolvedValueOnce({ data: { distributions: withReversed } })
        .mockResolvedValueOnce({ data: { reversalId: 'rev-1' } });

      const result = await service.processReversals(reversalRequest);

      expect(result.reversals).toHaveLength(1);
    });

    it('should handle partial refunds', async () => {
      mockExecuteWithRetry
        .mockResolvedValueOnce({ data: { distributions: sampleDistributions } })
        .mockResolvedValueOnce({ data: { reversalId: 'rev-1' } })
        .mockResolvedValueOnce({ data: { reversalId: 'rev-2' } });

      const result = await service.processReversals({
        ...reversalRequest,
        refundPercentage: 50,
      });

      expect(result.reversals[0].reversedAmount).toBe(50); // 50% of 100
    });

    it('should return success with no reversals when no distributions', async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ data: { distributions: [] } });

      const result = await service.processReversals(reversalRequest);

      expect(result.success).toBe(true);
      expect(result.reversals).toHaveLength(0);
      expect(result.totalReversed).toBe(0);
    });

    it('should notify recipients of reversals', async () => {
      mockExecuteWithRetry
        .mockResolvedValueOnce({ data: { distributions: [sampleDistributions[0]] } })
        .mockResolvedValueOnce({ data: { reversalId: 'rev-1' } });

      await service.processReversals(reversalRequest);

      expect(publishEvent).toHaveBeenCalledWith(
        'notification.venue.royalty_reversed',
        expect.objectContaining({
          recipientType: 'venue',
          recipientId: 'venue-1',
        })
      );
    });

    it('should handle reversal errors gracefully', async () => {
      mockExecuteWithRetry
        .mockResolvedValueOnce({ data: { distributions: sampleDistributions } })
        .mockRejectedValueOnce(new Error('Reversal failed'))
        .mockResolvedValueOnce({ data: { reversalId: 'rev-2' } });

      const result = await service.processReversals(reversalRequest);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.reversals).toHaveLength(1);
    });

    it('should return error when getRoyalties fails', async () => {
      mockExecuteWithRetry.mockRejectedValueOnce(new Error('Service down'));

      const result = await service.processReversals(reversalRequest);

      expect(result.success).toBe(true); // Returns empty distributions, not error
      expect(result.totalReversed).toBe(0);
    });
  });

  describe('hasRoyalties', () => {
    it('should return true when non-platform royalties exist', async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ data: { distributions: sampleDistributions } });

      const result = await service.hasRoyalties('order-123');

      expect(result).toBe(true);
    });

    it('should return false when only platform royalties', async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ data: { distributions: [sampleDistributions[2]] } });

      const result = await service.hasRoyalties('order-123');

      expect(result).toBe(false);
    });

    it('should return false when no royalties', async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ data: { distributions: [] } });

      const result = await service.hasRoyalties('order-123');

      expect(result).toBe(false);
    });

    it('should exclude already reversed', async () => {
      const allReversed = sampleDistributions.map(d => ({ ...d, reversedAt: new Date() }));
      mockExecuteWithRetry.mockResolvedValueOnce({ data: { distributions: allReversed } });

      const result = await service.hasRoyalties('order-123');

      expect(result).toBe(false);
    });
  });

  describe('getTotalRoyalties', () => {
    it('should calculate totals by recipient type', async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ data: { distributions: sampleDistributions } });

      const result = await service.getTotalRoyalties('order-123');

      expect(result.total).toBe(180);
      expect(result.venue).toBe(100);
      expect(result.artist).toBe(50);
      expect(result.platform).toBe(30);
    });

    it('should return zeros when no distributions', async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ data: { distributions: [] } });

      const result = await service.getTotalRoyalties('order-123');

      expect(result.total).toBe(0);
      expect(result.venue).toBe(0);
      expect(result.artist).toBe(0);
      expect(result.platform).toBe(0);
    });
  });
});
