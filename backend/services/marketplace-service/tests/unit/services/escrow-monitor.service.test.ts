/**
 * Unit Tests for escrow-monitor.service.ts
 * Tests escrow lifecycle management, timeout handling, and metrics
 */

import { escrowMonitorService, EscrowStatus } from '../../../src/services/escrow-monitor.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('../../../src/config/database', () => {
  const mockKnex = jest.fn(() => mockKnex);
  Object.assign(mockKnex, {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereRaw: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockReturnThis(),
    raw: jest.fn(),
  });
  return mockKnex;
});

jest.mock('../../../src/services/blockchain.service', () => ({
  blockchainService: {
    getEscrowStatus: jest.fn(),
    refundEscrowToBuyer: jest.fn(),
    releaseEscrowToSeller: jest.fn(),
  },
}));

jest.mock('../../../src/utils/metrics', () => ({
  BusinessMetrics: {
    record: jest.fn(),
  },
}));

import knex from '../../../src/config/database';
import { blockchainService } from '../../../src/services/blockchain.service';

describe('EscrowMonitorService', () => {
  const mockKnex = knex as jest.MockedFunction<any>;
  const mockBlockchainService = blockchainService as jest.Mocked<typeof blockchainService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should start the monitoring interval', () => {
      escrowMonitorService.start();
      expect(escrowMonitorService.isRunning()).toBe(true);
      escrowMonitorService.stop();
    });

    it('should not start if already running', () => {
      escrowMonitorService.start();
      escrowMonitorService.start(); // Second start should be no-op
      expect(escrowMonitorService.isRunning()).toBe(true);
      escrowMonitorService.stop();
    });
  });

  describe('stop', () => {
    it('should stop the monitoring interval', () => {
      escrowMonitorService.start();
      escrowMonitorService.stop();
      expect(escrowMonitorService.isRunning()).toBe(false);
    });

    it('should handle stop when not running', () => {
      escrowMonitorService.stop(); // Should not throw
      expect(escrowMonitorService.isRunning()).toBe(false);
    });
  });

  describe('checkTimedOutEscrows', () => {
    it('should query for pending transfers older than timeout', async () => {
      const mockTransfers: any[] = [];
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereRaw: jest.fn().mockResolvedValue(mockTransfers),
          }),
        }),
      });

      const result = await escrowMonitorService.checkTimedOutEscrows();
      expect(result).toEqual([]);
    });

    it('should return transfers with timed out escrows', async () => {
      const mockTransfers = [
        { id: 'transfer-1', escrow_address: 'escrow-1' },
        { id: 'transfer-2', escrow_address: 'escrow-2' },
      ];

      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereRaw: jest.fn().mockResolvedValue(mockTransfers),
          }),
        }),
      });

      const result = await escrowMonitorService.checkTimedOutEscrows();
      expect(result).toHaveLength(2);
    });

    it('should handle database errors gracefully', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            whereRaw: jest.fn().mockRejectedValue(new Error('DB error')),
          }),
        }),
      });

      const result = await escrowMonitorService.checkTimedOutEscrows();
      expect(result).toEqual([]);
    });
  });

  describe('handleTimedOutEscrow', () => {
    const mockTransfer = {
      id: 'transfer-123',
      escrow_address: 'escrow-address-123',
      buyer_id: 'buyer-123',
      seller_id: 'seller-123',
      total_amount: 10000,
    };

    it('should refund escrow when funds are locked', async () => {
      mockBlockchainService.getEscrowStatus.mockResolvedValue({
        exists: true,
        balance: 10000,
        status: 'locked',
      });
      mockBlockchainService.refundEscrowToBuyer.mockResolvedValue('refund-tx-123');

      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          update: jest.fn().mockResolvedValue(1),
        }),
      });

      const result = await escrowMonitorService.handleTimedOutEscrow(mockTransfer);

      expect(result.success).toBe(true);
      expect(result.action).toBe('refunded');
      expect(mockBlockchainService.refundEscrowToBuyer).toHaveBeenCalled();
    });

    it('should skip if escrow does not exist', async () => {
      mockBlockchainService.getEscrowStatus.mockResolvedValue({
        exists: false,
      });

      const result = await escrowMonitorService.handleTimedOutEscrow(mockTransfer);

      expect(result.success).toBe(true);
      expect(result.action).toBe('no_action');
    });

    it('should handle blockchain refund failure', async () => {
      mockBlockchainService.getEscrowStatus.mockResolvedValue({
        exists: true,
        balance: 10000,
        status: 'locked',
      });
      mockBlockchainService.refundEscrowToBuyer.mockRejectedValue(
        new Error('Blockchain error')
      );

      const result = await escrowMonitorService.handleTimedOutEscrow(mockTransfer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blockchain error');
    });

    it('should mark transfer as failed after refund', async () => {
      mockBlockchainService.getEscrowStatus.mockResolvedValue({
        exists: true,
        balance: 10000,
        status: 'locked',
      });
      mockBlockchainService.refundEscrowToBuyer.mockResolvedValue('refund-tx-123');

      const updateMock = jest.fn().mockResolvedValue(1);
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          update: updateMock,
        }),
      });

      await escrowMonitorService.handleTimedOutEscrow(mockTransfer);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
        })
      );
    });
  });

  describe('getMetrics', () => {
    it('should return escrow metrics', async () => {
      mockKnex.mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          count: jest.fn().mockReturnValue({
            first: jest.fn().mockResolvedValue({ count: '10' }),
          }),
        }),
      }).mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          whereRaw: jest.fn().mockReturnValue({
            count: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue({ count: '2' }),
            }),
          }),
        }),
      });

      const metrics = await escrowMonitorService.getMetrics();

      expect(metrics.active).toBe(10);
      expect(metrics.timedOut).toBe(2);
    });

    it('should handle errors and return zero counts', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          count: jest.fn().mockReturnValue({
            first: jest.fn().mockRejectedValue(new Error('DB error')),
          }),
        }),
      });

      const metrics = await escrowMonitorService.getMetrics();

      expect(metrics.active).toBe(0);
      expect(metrics.timedOut).toBe(0);
    });
  });

  describe('manuallyResolveEscrow', () => {
    it('should manually release escrow to seller', async () => {
      mockKnex.mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            id: 'transfer-123',
            escrow_address: 'escrow-address',
            seller_id: 'seller-123',
          }),
        }),
      });

      mockBlockchainService.releaseEscrowToSeller.mockResolvedValue('release-tx');

      mockKnex.mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          update: jest.fn().mockResolvedValue(1),
        }),
      });

      const result = await escrowMonitorService.manuallyResolveEscrow(
        'transfer-123',
        'release',
        'admin-user'
      );

      expect(result.success).toBe(true);
      expect(mockBlockchainService.releaseEscrowToSeller).toHaveBeenCalled();
    });

    it('should manually refund escrow to buyer', async () => {
      mockKnex.mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            id: 'transfer-123',
            escrow_address: 'escrow-address',
            buyer_id: 'buyer-123',
          }),
        }),
      });

      mockBlockchainService.refundEscrowToBuyer.mockResolvedValue('refund-tx');

      mockKnex.mockReturnValueOnce({
        where: jest.fn().mockReturnValue({
          update: jest.fn().mockResolvedValue(1),
        }),
      });

      const result = await escrowMonitorService.manuallyResolveEscrow(
        'transfer-123',
        'refund',
        'admin-user'
      );

      expect(result.success).toBe(true);
      expect(mockBlockchainService.refundEscrowToBuyer).toHaveBeenCalled();
    });

    it('should throw if transfer not found', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await escrowMonitorService.manuallyResolveEscrow(
        'non-existent',
        'refund',
        'admin-user'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject invalid action', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            id: 'transfer-123',
            escrow_address: 'escrow-address',
          }),
        }),
      });

      const result = await escrowMonitorService.manuallyResolveEscrow(
        'transfer-123',
        'invalid' as any,
        'admin-user'
      );

      expect(result.success).toBe(false);
    });
  });

  describe('EscrowStatus enum', () => {
    it('should have correct status values', () => {
      expect(EscrowStatus.LOCKED).toBe('locked');
      expect(EscrowStatus.RELEASED).toBe('released');
      expect(EscrowStatus.REFUNDED).toBe('refunded');
      expect(EscrowStatus.EXPIRED).toBe('expired');
    });
  });
});
