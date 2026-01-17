/**
 * Unit Tests for BatchTransferService
 * 
 * Tests:
 * - Batch transfer execution
 * - Batch record management
 * - Status tracking
 * - Error handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import { BatchTransferService } from '../../../src/services/batch-transfer.service';

jest.mock('../../../src/utils/logger');
jest.mock('../../../src/services/transfer.service');

describe('BatchTransferService', () => {
  let batchTransferService: BatchTransferService;
  let mockPool: jest.Mocked<Pool>;
  let MockTransferService: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    } as any;

    // Mock TransferService
    MockTransferService = require('../../../src/services/transfer.service').TransferService;
    MockTransferService.mockImplementation(() => ({
      createGiftTransfer: jest.fn()
    }));

    batchTransferService = new BatchTransferService(mockPool);
    jest.clearAllMocks();
  });

  describe('executeBatchTransfer()', () => {
    it('should execute batch transfer successfully', async () => {
      const transferService = (batchTransferService as any).transferService;
      transferService.createGiftTransfer
        .mockResolvedValueOnce({ transferId: 'transfer-1' })
        .mockResolvedValueOnce({ transferId: 'transfer-2' });

      mockPool.query.mockResolvedValue({} as any);

      const items = [
        { ticketId: 'ticket-1', toEmail: 'user1@example.com', message: 'Gift 1' },
        { ticketId: 'ticket-2', toEmail: 'user2@example.com', message: 'Gift 2' }
      ];

      const result = await batchTransferService.executeBatchTransfer('user-123', items);

      expect(result.totalItems).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].transferId).toBe('transfer-1');
    });

    it('should handle partial failures', async () => {
      const transferService = (batchTransferService as any).transferService;
      transferService.createGiftTransfer
        .mockResolvedValueOnce({ transferId: 'transfer-1' })
        .mockRejectedValueOnce(new Error('Transfer failed'));

      mockPool.query.mockResolvedValue({} as any);

      const items = [
        { ticketId: 'ticket-1', toEmail: 'user1@example.com' },
        { ticketId: 'ticket-2', toEmail: 'user2@example.com' }
      ];

      const result = await batchTransferService.executeBatchTransfer('user-123', items);

      expect(result.totalItems).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Transfer failed');
    });

    it('should create batch record', async () => {
      const transferService = (batchTransferService as any).transferService;
      transferService.createGiftTransfer.mockResolvedValue({ transferId: 'transfer-1' });

      mockPool.query.mockResolvedValue({} as any);

      const items = [{ ticketId: 'ticket-1', toEmail: 'user1@example.com' }];

      await batchTransferService.executeBatchTransfer('user-123', items);

      const createCall = mockPool.query.mock.calls[0];
      expect(createCall[0]).toContain('INSERT INTO batch_transfers');
      expect(createCall[1]).toContain('user-123');
      expect(createCall[1]).toContain(1); // item count
    });

    it('should update batch item status on success', async () => {
      const transferService = (batchTransferService as any).transferService;
      transferService.createGiftTransfer.mockResolvedValue({ transferId: 'transfer-1' });

      mockPool.query.mockResolvedValue({} as any);

      const items = [{ ticketId: 'ticket-1', toEmail: 'user1@example.com' }];

      await batchTransferService.executeBatchTransfer('user-123', items);

      const updateCall = mockPool.query.mock.calls.find(
        call => (call[0] as string).includes('batch_transfer_items')
      );

      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toContain('SUCCESS');
      expect(updateCall![1]).toContain('transfer-1');
    });

    it('should update batch item status on failure', async () => {
      const transferService = (batchTransferService as any).transferService;
      transferService.createGiftTransfer.mockRejectedValue(new Error('Failed'));

      mockPool.query.mockResolvedValue({} as any);

      const items = [{ ticketId: 'ticket-1', toEmail: 'user1@example.com' }];

      await batchTransferService.executeBatchTransfer('user-123', items);

      const updateCall = mockPool.query.mock.calls.find(
        call => (call[0] as string).includes('batch_transfer_items') &&
              (call[1] as any[]).includes('FAILED')
      );

      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toContain('Failed');
    });

    it('should complete batch record', async () => {
      const transferService = (batchTransferService as any).transferService;
      transferService.createGiftTransfer.mockResolvedValue({ transferId: 'transfer-1' });

      mockPool.query.mockResolvedValue({} as any);

      const items = [{ ticketId: 'ticket-1', toEmail: 'user1@example.com' }];

      await batchTransferService.executeBatchTransfer('user-123', items);

      const completeCall = mockPool.query.mock.calls.find(
        call => (call[0] as string).includes('UPDATE batch_transfers')
      );

      expect(completeCall).toBeDefined();
      expect(completeCall![1]).toContain(1); // success count
      expect(completeCall![1]).toContain(0); // failure count
    });

    it('should generate unique batch ID', async () => {
      const transferService = (batchTransferService as any).transferService;
      transferService.createGiftTransfer.mockResolvedValue({ transferId: 'transfer-1' });

      mockPool.query.mockResolvedValue({} as any);

      const items = [{ ticketId: 'ticket-1', toEmail: 'user1@example.com' }];

      const result = await batchTransferService.executeBatchTransfer('user-123', items);

      expect(result.batchId).toMatch(/^batch_\d+_[a-z0-9]+$/);
    });

    it('should process items sequentially', async () => {
      const transferService = (batchTransferService as any).transferService;
      const callOrder: number[] = [];

      transferService.createGiftTransfer
        .mockImplementation(async () => {
          callOrder.push(1);
          return { transferId: 'transfer-1' };
        })
        .mockImplementationOnce(async () => {
          callOrder.push(0);
          return { transferId: 'transfer-1' };
        });

      mockPool.query.mockResolvedValue({} as any);

      const items = [
        { ticketId: 'ticket-1', toEmail: 'user1@example.com' },
        { ticketId: 'ticket-2', toEmail: 'user2@example.com' }
      ];

      await batchTransferService.executeBatchTransfer('user-123', items);

      expect(callOrder).toEqual([0, 1]);
    });

    it('should pass message to transfer service', async () => {
      const transferService = (batchTransferService as any).transferService;
      transferService.createGiftTransfer.mockResolvedValue({ transferId: 'transfer-1' });

      mockPool.query.mockResolvedValue({} as any);

      const items = [
        { ticketId: 'ticket-1', toEmail: 'user1@example.com', message: 'Custom message' }
      ];

      await batchTransferService.executeBatchTransfer('user-123', items);

      expect(transferService.createGiftTransfer).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          ticketId: 'ticket-1',
          toEmail: 'user1@example.com',
          message: 'Custom message'
        })
      );
    });

    it('should handle empty items array', async () => {
      mockPool.query.mockResolvedValue({} as any);

      const result = await batchTransferService.executeBatchTransfer('user-123', []);

      expect(result.totalItems).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('getBatchStatus()', () => {
    it('should return batch status with items', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'batch-1',
            user_id: 'user-123',
            total_items: 2,
            success_count: 1,
            failure_count: 1,
            status: 'COMPLETED',
            created_at: new Date(),
            completed_at: new Date()
          }]
        } as any)
        .mockResolvedValueOnce({
          rows: [
            {
              ticket_id: 'ticket-1',
              transfer_id: 'transfer-1',
              status: 'SUCCESS',
              error_message: null,
              processed_at: new Date()
            },
            {
              ticket_id: 'ticket-2',
              transfer_id: null,
              status: 'FAILED',
              error_message: 'Error',
              processed_at: new Date()
            }
          ]
        } as any);

      const result = await batchTransferService.getBatchStatus('batch-1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('batch-1');
      expect(result!.items).toHaveLength(2);
      expect(result!.items[0].status).toBe('SUCCESS');
      expect(result!.items[1].status).toBe('FAILED');
    });

    it('should return null for non-existent batch', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      const result = await batchTransferService.getBatchStatus('non-existent');

      expect(result).toBeNull();
    });

    it('should query batch by ID', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await batchTransferService.getBatchStatus('batch-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM batch_transfers'),
        ['batch-123']
      );
    });

    it('should query items ordered by processed_at', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'batch-1',
            user_id: 'user-123',
            total_items: 1,
            status: 'COMPLETED'
          }]
        } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await batchTransferService.getBatchStatus('batch-1');

      const itemsQuery = mockPool.query.mock.calls[1][0] as string;
      expect(itemsQuery).toContain('ORDER BY processed_at');
    });
  });

  describe('cancelBatch()', () => {
    it('should cancel pending batch', async () => {
      mockPool.query.mockResolvedValue({} as any);

      await batchTransferService.cancelBatch('batch-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE batch_transfers'),
        ['batch-123']
      );
    });

    it('should set status to CANCELLED', async () => {
      mockPool.query.mockResolvedValue({} as any);

      await batchTransferService.cancelBatch('batch-123');

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain("status = 'CANCELLED'");
    });

    it('should only cancel PROCESSING batches', async () => {
      mockPool.query.mockResolvedValue({} as any);

      await batchTransferService.cancelBatch('batch-123');

      const query = mockPool.query.mock.calls[0][0] as string;
      expect(query).toContain("status = 'PROCESSING'");
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large batches', async () => {
      const transferService = (batchTransferService as any).transferService;
      transferService.createGiftTransfer.mockResolvedValue({ transferId: 'transfer-1' });

      mockPool.query.mockResolvedValue({} as any);

      const items = Array(100).fill(null).map((_, i) => ({
        ticketId: `ticket-${i}`,
        toEmail: `user${i}@example.com`
      }));

      const result = await batchTransferService.executeBatchTransfer('user-123', items);

      expect(result.totalItems).toBe(100);
      expect(result.successCount).toBe(100);
    });

    it('should handle all failures', async () => {
      const transferService = (batchTransferService as any).transferService;
      transferService.createGiftTransfer.mockRejectedValue(new Error('All failed'));

      mockPool.query.mockResolvedValue({} as any);

      const items = [
        { ticketId: 'ticket-1', toEmail: 'user1@example.com' },
        { ticketId: 'ticket-2', toEmail: 'user2@example.com' }
      ];

      const result = await batchTransferService.executeBatchTransfer('user-123', items);

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(2);
    });

    it('should handle missing optional message', async () => {
      const transferService = (batchTransferService as any).transferService;
      transferService.createGiftTransfer.mockResolvedValue({ transferId: 'transfer-1' });

      mockPool.query.mockResolvedValue({} as any);

      const items = [{ ticketId: 'ticket-1', toEmail: 'user1@example.com' }];

      await batchTransferService.executeBatchTransfer('user-123', items);

      expect(transferService.createGiftTransfer).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          ticketId: 'ticket-1',
          toEmail: 'user1@example.com'
        })
      );
    });
  });
});
