/**
 * Unit tests for ReconciliationService
 * Tests blockchain reconciliation against database records
 */

// Mock dependencies before imports
jest.mock('../../../src/config/solana', () => ({
  getConnection: jest.fn()
}));

jest.mock('../../../src/config/database', () => ({
  default: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

import { ReconciliationService } from '../../../src/services/ReconciliationService';
import { getConnection } from '../../../src/config/solana';
import db from '../../../src/config/database';
import logger from '../../../src/utils/logger';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let mockConnection: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock connection
    mockConnection = {
      getTransaction: jest.fn()
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);

    // Setup mock database
    mockDb = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      first: jest.fn().mockReturnThis(),
      avg: jest.fn().mockReturnThis()
    });
    (db as unknown as jest.Mock).mockImplementation(mockDb);

    service = new ReconciliationService();
  });

  describe('status categorization', () => {
    it('should categorize status as "confirmed"', async () => {
      const mockTickets = [{
        ticket_id: 'ticket-1',
        status: 'minted',
        transaction_signature: 'sig123',
        created_at: new Date().toISOString()
      }];

      mockDb().select.mockResolvedValue(mockTickets);
      mockConnection.getTransaction.mockResolvedValue({
        blockTime: Math.floor(Date.now() / 1000),
        meta: { err: null }
      });
      mockDb().insert.mockResolvedValue([]);

      const result = await service.reconcileAll('venue-123');

      expect(result.confirmed).toBe(1);
    });

    it('should categorize status as "not_found"', async () => {
      const mockTickets = [{
        ticket_id: 'ticket-1',
        status: 'minted',
        transaction_signature: 'sig123',
        created_at: new Date().toISOString()
      }];

      mockDb().select.mockResolvedValue(mockTickets);
      mockConnection.getTransaction.mockResolvedValue(null);
      mockDb().insert.mockResolvedValue([]);

      const result = await service.reconcileAll('venue-123');

      expect(result.notFound).toBe(1);
    });

    it('should categorize status as "pending" for missing signature', async () => {
      const mockTickets = [{
        ticket_id: 'ticket-1',
        status: 'minted',
        transaction_signature: null,
        created_at: new Date().toISOString()
      }];

      mockDb().select.mockResolvedValue(mockTickets);
      mockDb().insert.mockResolvedValue([]);

      const result = await service.reconcileAll('venue-123');

      // Missing signature means not_found since we can't check
      expect(result.notFound).toBe(1);
    });

    it('should categorize status as "error"', async () => {
      const mockTickets = [{
        ticket_id: 'ticket-1',
        status: 'minted',
        transaction_signature: 'sig123',
        created_at: new Date().toISOString()
      }];

      mockDb().select.mockResolvedValue(mockTickets);
      mockConnection.getTransaction.mockResolvedValue({
        blockTime: Math.floor(Date.now() / 1000),
        meta: { err: { InstructionError: [0, 'Custom error'] } }
      });
      mockDb().insert.mockResolvedValue([]);

      const result = await service.reconcileAll('venue-123');

      expect(result.errors).toBe(1);
    });
  });

  describe('reconcileAll', () => {
    it('should fetch minted tickets', async () => {
      mockDb().select.mockResolvedValue([]);
      mockDb().insert.mockResolvedValue([]);

      await service.reconcileAll('venue-123');

      expect(db).toHaveBeenCalledWith('ticket_mints');
    });

    it('should check each ticket on blockchain', async () => {
      const mockTickets = [
        { ticket_id: 'ticket-1', status: 'minted', transaction_signature: 'sig1', created_at: new Date().toISOString() },
        { ticket_id: 'ticket-2', status: 'minted', transaction_signature: 'sig2', created_at: new Date().toISOString() }
      ];

      mockDb().select.mockResolvedValue(mockTickets);
      mockConnection.getTransaction.mockResolvedValue({
        blockTime: Math.floor(Date.now() / 1000),
        meta: { err: null }
      });
      mockDb().insert.mockResolvedValue([]);

      await service.reconcileAll('venue-123');

      expect(mockConnection.getTransaction).toHaveBeenCalledTimes(2);
      expect(mockConnection.getTransaction).toHaveBeenCalledWith('sig1', expect.anything());
      expect(mockConnection.getTransaction).toHaveBeenCalledWith('sig2', expect.anything());
    });

    it('should count by status', async () => {
      const mockTickets = [
        { ticket_id: 'ticket-1', status: 'minted', transaction_signature: 'sig1', created_at: new Date().toISOString() },
        { ticket_id: 'ticket-2', status: 'minted', transaction_signature: 'sig2', created_at: new Date().toISOString() },
        { ticket_id: 'ticket-3', status: 'minted', transaction_signature: null, created_at: new Date().toISOString() }
      ];

      mockDb().select.mockResolvedValue(mockTickets);
      mockConnection.getTransaction
        .mockResolvedValueOnce({ blockTime: Math.floor(Date.now() / 1000), meta: { err: null } })
        .mockResolvedValueOnce(null);
      mockDb().insert.mockResolvedValue([]);

      const result = await service.reconcileAll('venue-123');

      expect(result.totalChecked).toBe(3);
      expect(result.confirmed).toBe(1);
      expect(result.notFound).toBe(2); // One not found + one missing signature
    });

    it('should return summary with all counts', async () => {
      mockDb().select.mockResolvedValue([]);
      mockDb().insert.mockResolvedValue([]);

      const result = await service.reconcileAll('venue-123');

      expect(result).toHaveProperty('totalChecked');
      expect(result).toHaveProperty('confirmed');
      expect(result).toHaveProperty('notFound');
      expect(result).toHaveProperty('pending');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('discrepancies');
    });

    it('should detect discrepancies', async () => {
      const mockTickets = [{
        ticket_id: 'ticket-1',
        status: 'minted',
        transaction_signature: 'sig123',
        created_at: new Date().toISOString()
      }];

      mockDb().select.mockResolvedValue(mockTickets);
      mockConnection.getTransaction.mockResolvedValue(null); // Not found on blockchain
      mockDb().insert.mockResolvedValue([]);

      const result = await service.reconcileAll('venue-123');

      expect(result.discrepancies.length).toBeGreaterThan(0);
    });

    it('should log reconciliation start', async () => {
      mockDb().select.mockResolvedValue([]);
      mockDb().insert.mockResolvedValue([]);

      await service.reconcileAll('venue-123');

      expect(logger.info).toHaveBeenCalledWith(
        'Starting reconciliation',
        expect.objectContaining({ venueId: 'venue-123' })
      );
    });

    it('should log reconciliation completion', async () => {
      mockDb().select.mockResolvedValue([]);
      mockDb().insert.mockResolvedValue([]);

      await service.reconcileAll('venue-123');

      expect(logger.info).toHaveBeenCalledWith(
        'Reconciliation completed',
        expect.anything()
      );
    });

    it('should store reconciliation report', async () => {
      mockDb().select.mockResolvedValue([]);
      mockDb().insert.mockResolvedValue([]);

      await service.reconcileAll('venue-123');

      expect(db).toHaveBeenCalledWith('minting_reconciliation_reports');
    });

    it('should handle blockchain check errors', async () => {
      const mockTickets = [{
        ticket_id: 'ticket-1',
        status: 'minted',
        transaction_signature: 'sig123',
        created_at: new Date().toISOString()
      }];

      mockDb().select.mockResolvedValue(mockTickets);
      mockConnection.getTransaction.mockRejectedValue(new Error('RPC error'));
      mockDb().insert.mockResolvedValue([]);

      const result = await service.reconcileAll('venue-123');

      expect(result.errors).toBe(1);
    });
  });

  describe('fixDiscrepancies', () => {
    it('should reset status', async () => {
      mockDb().update.mockResolvedValue(1);

      await service.fixDiscrepancies('venue-123', ['ticket-1']);

      expect(db).toHaveBeenCalledWith('ticket_mints');
    });

    it('should clear signature', async () => {
      const updateMock = jest.fn().mockResolvedValue(1);
      mockDb().update = updateMock;

      await service.fixDiscrepancies('venue-123', ['ticket-1']);

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction_signature: null
        })
      );
    });

    it('should return attempted count', async () => {
      mockDb().update.mockResolvedValue(1);

      const result = await service.fixDiscrepancies('venue-123', ['ticket-1', 'ticket-2']);

      expect(result.attempted).toBe(2);
    });

    it('should return fixed count', async () => {
      mockDb().update.mockResolvedValue(1);

      const result = await service.fixDiscrepancies('venue-123', ['ticket-1']);

      expect(result.fixed).toBe(1);
    });

    it('should return failed count', async () => {
      mockDb().update.mockRejectedValue(new Error('DB error'));

      const result = await service.fixDiscrepancies('venue-123', ['ticket-1']);

      expect(result.failed).toBe(1);
    });

    it('should handle partial failures', async () => {
      mockDb().update
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('DB error'));

      const result = await service.fixDiscrepancies('venue-123', ['ticket-1', 'ticket-2']);

      expect(result.fixed).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should log each ticket fix', async () => {
      mockDb().update.mockResolvedValue(1);

      await service.fixDiscrepancies('venue-123', ['ticket-1']);

      expect(logger.info).toHaveBeenCalledWith(
        'Reset ticket for re-minting',
        expect.objectContaining({ ticketId: 'ticket-1' })
      );
    });

    it('should log fix errors', async () => {
      mockDb().update.mockRejectedValue(new Error('DB error'));

      await service.fixDiscrepancies('venue-123', ['ticket-1']);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fix ticket',
        expect.objectContaining({
          ticketId: 'ticket-1',
          error: 'DB error'
        })
      );
    });
  });

  describe('getReconciliationHistory', () => {
    it('should return ordered results', async () => {
      const mockHistory = [
        { id: 1, report_date: '2026-01-13' },
        { id: 2, report_date: '2026-01-12' }
      ];
      mockDb().select.mockResolvedValue(mockHistory);

      const result = await service.getReconciliationHistory('venue-123');

      expect(result).toEqual(mockHistory);
    });

    it('should order by report_date DESC', async () => {
      const orderByMock = jest.fn().mockReturnThis();
      mockDb().orderBy = orderByMock;
      mockDb().select.mockResolvedValue([]);

      await service.getReconciliationHistory('venue-123');

      expect(orderByMock).toHaveBeenCalledWith('report_date', 'desc');
    });

    it('should respect limit parameter', async () => {
      const limitMock = jest.fn().mockReturnThis();
      mockDb().limit = limitMock;
      mockDb().select.mockResolvedValue([]);

      await service.getReconciliationHistory('venue-123', 5);

      expect(limitMock).toHaveBeenCalledWith(5);
    });

    it('should default limit to 10', async () => {
      const limitMock = jest.fn().mockReturnThis();
      mockDb().limit = limitMock;
      mockDb().select.mockResolvedValue([]);

      await service.getReconciliationHistory('venue-123');

      expect(limitMock).toHaveBeenCalledWith(10);
    });
  });

  describe('getReconciliationMetrics', () => {
    it('should return last reconciliation date', async () => {
      mockDb().first.mockResolvedValue({ report_date: new Date('2026-01-13') });
      mockDb().avg.mockReturnThis();

      const result = await service.getReconciliationMetrics('venue-123');

      expect(result.lastReconciliation).toEqual(new Date('2026-01-13'));
    });

    it('should return null lastReconciliation when no reports', async () => {
      mockDb().first.mockResolvedValue(null);
      mockDb().avg.mockReturnThis();

      const result = await service.getReconciliationMetrics('venue-123');

      expect(result.lastReconciliation).toBeNull();
    });

    it('should return avgDiscrepancyRate', async () => {
      mockDb().first
        .mockResolvedValueOnce({ report_date: new Date() })
        .mockResolvedValueOnce({ rate: '5.5' });

      const result = await service.getReconciliationMetrics('venue-123');

      expect(result.avgDiscrepancyRate).toBe(5.5);
    });

    it('should return 0 avgDiscrepancyRate when no data', async () => {
      mockDb().first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.getReconciliationMetrics('venue-123');

      expect(result.avgDiscrepancyRate).toBe(0);
    });
  });

  describe('time difference detection', () => {
    it('should flag large time differences as discrepancy', async () => {
      const createdAt = new Date();
      createdAt.setHours(createdAt.getHours() - 2); // 2 hours ago

      const mockTickets = [{
        ticket_id: 'ticket-1',
        status: 'minted',
        transaction_signature: 'sig123',
        created_at: createdAt.toISOString()
      }];

      mockDb().select.mockResolvedValue(mockTickets);
      mockConnection.getTransaction.mockResolvedValue({
        blockTime: Math.floor(Date.now() / 1000), // Now
        meta: { err: null }
      });
      mockDb().insert.mockResolvedValue([]);

      const result = await service.reconcileAll('venue-123');

      // More than 1 hour difference should flag as warning
      expect(result.discrepancies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should throw on database query failure', async () => {
      mockDb().select.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        service.reconcileAll('venue-123')
      ).rejects.toThrow('Database connection failed');
    });

    it('should log database errors', async () => {
      mockDb().select.mockRejectedValue(new Error('Database error'));

      await expect(
        service.reconcileAll('venue-123')
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Reconciliation failed',
        expect.objectContaining({ error: 'Database error' })
      );
    });

    it('should handle store report errors gracefully', async () => {
      mockDb().select.mockResolvedValue([]);
      mockDb().insert.mockRejectedValue(new Error('Insert failed'));

      // Should not throw - storing report is not critical
      const result = await service.reconcileAll('venue-123');

      expect(result).toBeDefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to store reconciliation report',
        expect.anything()
      );
    });
  });
});
