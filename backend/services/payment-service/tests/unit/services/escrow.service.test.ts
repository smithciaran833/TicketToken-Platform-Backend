/**
 * Escrow Service Unit Tests
 * 
 * Tests for:
 * - Escrow account creation
 * - Fund release (full and partial)
 * - Escrow cancellation
 * - Dispute handling
 * - Automatic release processing
 * - Tenant isolation
 */

import { escrowService, EscrowAccount, CreateEscrowParams, ReleaseEscrowParams } from '../../../src/services/escrow.service';
import { DatabaseService } from '../../../src/services/databaseService';
import * as dbTransactionUtil from '../../../src/utils/database-transaction.util';

// Mock dependencies
jest.mock('../../../src/services/databaseService');
jest.mock('../../../src/utils/database-transaction.util');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

describe('EscrowService', () => {
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    
    (DatabaseService.getPool as jest.Mock).mockReturnValue(mockPool);
  });

  // ===========================================================================
  // CREATE ESCROW
  // ===========================================================================

  describe('createEscrow', () => {
    it('should create an escrow account with default hold period', async () => {
      const params: CreateEscrowParams = {
        orderId: 'order-123',
        paymentIntentId: 'pi_abc123',
        amount: 10000,
        tenantId: 'tenant-123',
      };

      const mockRow = {
        id: 'test-uuid-1234',
        order_id: 'order-123',
        payment_intent_id: 'pi_abc123',
        amount: 10000,
        held_amount: 10000,
        released_amount: 0,
        status: 'held',
        hold_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        release_conditions: '[]',
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockRow] });

      const result = await escrowService.createEscrow(params);

      expect(result.id).toBe('test-uuid-1234');
      expect(result.orderId).toBe('order-123');
      expect(result.amount).toBe(10000);
      expect(result.heldAmount).toBe(10000);
      expect(result.releasedAmount).toBe(0);
      expect(result.status).toBe('held');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO escrow_accounts'),
        expect.arrayContaining([
          'test-uuid-1234',
          'order-123',
          'pi_abc123',
          10000,
          expect.any(Date),
          '[]',
          'tenant-123',
        ])
      );
    });

    it('should create escrow with custom hold days', async () => {
      const params: CreateEscrowParams = {
        orderId: 'order-456',
        paymentIntentId: 'pi_def456',
        amount: 25000,
        holdDays: 14,
        tenantId: 'tenant-123',
      };

      const mockRow = {
        id: 'test-uuid-1234',
        order_id: 'order-456',
        payment_intent_id: 'pi_def456',
        amount: 25000,
        held_amount: 25000,
        released_amount: 0,
        status: 'held',
        hold_until: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        release_conditions: '[]',
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockRow] });

      const result = await escrowService.createEscrow(params);

      expect(result.heldAmount).toBe(25000);
      // Verify the hold_until date is approximately 14 days from now
      const holdUntilParam = mockPool.query.mock.calls[0][1][4] as Date;
      const daysDiff = Math.round((holdUntilParam.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      expect(daysDiff).toBeGreaterThanOrEqual(13);
      expect(daysDiff).toBeLessThanOrEqual(14);
    });

    it('should create escrow with release conditions', async () => {
      const params: CreateEscrowParams = {
        orderId: 'order-789',
        paymentIntentId: 'pi_ghi789',
        amount: 5000,
        releaseConditions: ['event_completed', 'no_disputes'],
        tenantId: 'tenant-123',
      };

      const mockRow = {
        id: 'test-uuid-1234',
        order_id: 'order-789',
        payment_intent_id: 'pi_ghi789',
        amount: 5000,
        held_amount: 5000,
        released_amount: 0,
        status: 'held',
        hold_until: new Date(),
        release_conditions: JSON.stringify(['event_completed', 'no_disputes']),
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockRow] });

      const result = await escrowService.createEscrow(params);

      expect(result.releaseConditions).toEqual(['event_completed', 'no_disputes']);
    });
  });

  // ===========================================================================
  // GET ESCROW
  // ===========================================================================

  describe('getEscrow', () => {
    it('should return escrow account if found', async () => {
      const mockRow = {
        id: 'escrow-123',
        order_id: 'order-123',
        payment_intent_id: 'pi_abc',
        amount: 10000,
        held_amount: 10000,
        released_amount: 0,
        status: 'held',
        hold_until: new Date(),
        release_conditions: '[]',
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [mockRow] });

      const result = await escrowService.getEscrow('escrow-123', 'tenant-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('escrow-123');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM escrow_accounts'),
        ['escrow-123', 'tenant-123']
      );
    });

    it('should return null if escrow not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await escrowService.getEscrow('nonexistent', 'tenant-123');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // RELEASE ESCROW
  // ===========================================================================

  describe('releaseEscrow', () => {
    beforeEach(() => {
      // Mock withSerializableTransaction to execute the callback immediately
      (dbTransactionUtil.withSerializableTransaction as jest.Mock).mockImplementation(
        async (callback: any) => {
          return callback(mockClient);
        }
      );
    });

    it('should fully release escrow when no amount specified', async () => {
      const lockedRow = {
        id: 'escrow-123',
        order_id: 'order-123',
        payment_intent_id: 'pi_abc',
        amount: 10000,
        held_amount: 10000,
        released_amount: 0,
        status: 'held',
        hold_until: new Date(),
        release_conditions: '[]',
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedRow = {
        ...lockedRow,
        held_amount: 0,
        released_amount: 10000,
        status: 'released',
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [lockedRow] }) // Lock query
        .mockResolvedValueOnce({ rows: [updatedRow] }) // Update query
        .mockResolvedValueOnce({ rows: [] }); // Event insert

      const params: ReleaseEscrowParams = {
        escrowId: 'escrow-123',
        reason: 'Event completed',
        tenantId: 'tenant-123',
      };

      const result = await escrowService.releaseEscrow(params);

      expect(result.status).toBe('released');
      expect(result.heldAmount).toBe(0);
      expect(result.releasedAmount).toBe(10000);
    });

    it('should partially release escrow when amount specified', async () => {
      const lockedRow = {
        id: 'escrow-123',
        order_id: 'order-123',
        payment_intent_id: 'pi_abc',
        amount: 10000,
        held_amount: 10000,
        released_amount: 0,
        status: 'held',
        hold_until: new Date(),
        release_conditions: '[]',
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedRow = {
        ...lockedRow,
        held_amount: 7000,
        released_amount: 3000,
        status: 'partially_released',
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [lockedRow] })
        .mockResolvedValueOnce({ rows: [updatedRow] })
        .mockResolvedValueOnce({ rows: [] });

      const params: ReleaseEscrowParams = {
        escrowId: 'escrow-123',
        amount: 3000,
        reason: 'Partial release',
        tenantId: 'tenant-123',
      };

      const result = await escrowService.releaseEscrow(params);

      expect(result.status).toBe('partially_released');
      expect(result.heldAmount).toBe(7000);
      expect(result.releasedAmount).toBe(3000);
    });

    it('should throw error if escrow not found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const params: ReleaseEscrowParams = {
        escrowId: 'nonexistent',
        tenantId: 'tenant-123',
      };

      await expect(escrowService.releaseEscrow(params)).rejects.toThrow(
        'Escrow account not found'
      );
    });

    it('should throw error if escrow already released', async () => {
      const lockedRow = {
        id: 'escrow-123',
        order_id: 'order-123',
        payment_intent_id: 'pi_abc',
        amount: 10000,
        held_amount: 0,
        released_amount: 10000,
        status: 'released',
        hold_until: new Date(),
        release_conditions: '[]',
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockClient.query.mockResolvedValue({ rows: [lockedRow] });

      const params: ReleaseEscrowParams = {
        escrowId: 'escrow-123',
        tenantId: 'tenant-123',
      };

      await expect(escrowService.releaseEscrow(params)).rejects.toThrow(
        'Escrow already fully released'
      );
    });

    it('should throw error if escrow is cancelled', async () => {
      const lockedRow = {
        id: 'escrow-123',
        status: 'cancelled',
        held_amount: 10000,
        released_amount: 0,
        hold_until: new Date(),
        release_conditions: '[]',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockClient.query.mockResolvedValue({ rows: [lockedRow] });

      await expect(
        escrowService.releaseEscrow({ escrowId: 'escrow-123', tenantId: 'tenant-123' })
      ).rejects.toThrow('Escrow has been cancelled');
    });

    it('should throw error if escrow is disputed', async () => {
      const lockedRow = {
        id: 'escrow-123',
        status: 'disputed',
        held_amount: 10000,
        released_amount: 0,
        hold_until: new Date(),
        release_conditions: '[]',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockClient.query.mockResolvedValue({ rows: [lockedRow] });

      await expect(
        escrowService.releaseEscrow({ escrowId: 'escrow-123', tenantId: 'tenant-123' })
      ).rejects.toThrow('Escrow is under dispute');
    });

    it('should throw error if release amount exceeds held amount', async () => {
      const lockedRow = {
        id: 'escrow-123',
        status: 'held',
        held_amount: 5000,
        released_amount: 5000,
        hold_until: new Date(),
        release_conditions: '[]',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockClient.query.mockResolvedValue({ rows: [lockedRow] });

      await expect(
        escrowService.releaseEscrow({
          escrowId: 'escrow-123',
          amount: 10000,
          tenantId: 'tenant-123',
        })
      ).rejects.toThrow('Release amount exceeds held amount');
    });
  });

  // ===========================================================================
  // CANCEL ESCROW
  // ===========================================================================

  describe('cancelEscrow', () => {
    beforeEach(() => {
      (dbTransactionUtil.withSerializableTransaction as jest.Mock).mockImplementation(
        async (callback: any) => callback(mockClient)
      );
    });

    it('should cancel a held escrow', async () => {
      const lockedRow = {
        id: 'escrow-123',
        order_id: 'order-123',
        status: 'held',
        held_amount: 10000,
        released_amount: 0,
        hold_until: new Date(),
        release_conditions: '[]',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedRow = {
        ...lockedRow,
        status: 'cancelled',
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [lockedRow] })
        .mockResolvedValueOnce({ rows: [updatedRow] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await escrowService.cancelEscrow(
        'escrow-123',
        'Order cancelled',
        'tenant-123'
      );

      expect(result.status).toBe('cancelled');
    });

    it('should throw error if escrow not found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await expect(
        escrowService.cancelEscrow('nonexistent', 'reason', 'tenant-123')
      ).rejects.toThrow('Escrow account not found');
    });

    it('should throw error if escrow fully released', async () => {
      const lockedRow = {
        id: 'escrow-123',
        status: 'released',
        held_amount: 0,
        released_amount: 10000,
        hold_until: new Date(),
        release_conditions: '[]',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockClient.query.mockResolvedValue({ rows: [lockedRow] });

      await expect(
        escrowService.cancelEscrow('escrow-123', 'reason', 'tenant-123')
      ).rejects.toThrow('Cannot cancel fully released escrow');
    });
  });

  // ===========================================================================
  // DISPUTE ESCROW
  // ===========================================================================

  describe('disputeEscrow', () => {
    it('should mark escrow as disputed', async () => {
      const updatedRow = {
        id: 'escrow-123',
        order_id: 'order-123',
        status: 'disputed',
        held_amount: 10000,
        released_amount: 0,
        hold_until: new Date(),
        release_conditions: '[]',
        dispute_id: 'dp_abc123',
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [updatedRow] });

      const result = await escrowService.disputeEscrow(
        'escrow-123',
        'dp_abc123',
        'tenant-123'
      );

      expect(result.status).toBe('disputed');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE escrow_accounts'),
        ['escrow-123', 'dp_abc123', 'tenant-123']
      );
    });

    it('should throw error if escrow not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await expect(
        escrowService.disputeEscrow('nonexistent', 'dp_abc', 'tenant-123')
      ).rejects.toThrow('Escrow account not found');
    });
  });

  // ===========================================================================
  // PROCESS READY ESCROWS
  // ===========================================================================

  describe('processReadyEscrows', () => {
    it('should process escrows ready for auto-release', async () => {
      const readyEscrows = [
        { id: 'escrow-1', tenant_id: 'tenant-123' },
        { id: 'escrow-2', tenant_id: 'tenant-123' },
      ];

      // Mock the client queries
      mockClient.query.mockResolvedValueOnce({ rows: readyEscrows });

      // Mock releaseEscrow calls (via transaction)
      (dbTransactionUtil.withSerializableTransaction as jest.Mock)
        .mockResolvedValueOnce({
          id: 'escrow-1',
          status: 'released',
          heldAmount: 0,
          releasedAmount: 10000,
        })
        .mockResolvedValueOnce({
          id: 'escrow-2',
          status: 'released',
          heldAmount: 0,
          releasedAmount: 5000,
        });

      const count = await escrowService.processReadyEscrows();

      expect(count).toBe(2);
    });

    it('should return 0 when no escrows are ready', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const count = await escrowService.processReadyEscrows();

      expect(count).toBe(0);
    });

    it('should continue processing on individual failures', async () => {
      const readyEscrows = [
        { id: 'escrow-1', tenant_id: 'tenant-123' },
        { id: 'escrow-2', tenant_id: 'tenant-123' },
        { id: 'escrow-3', tenant_id: 'tenant-123' },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: readyEscrows });

      (dbTransactionUtil.withSerializableTransaction as jest.Mock)
        .mockResolvedValueOnce({ id: 'escrow-1', status: 'released' })
        .mockRejectedValueOnce(new Error('Release failed'))
        .mockResolvedValueOnce({ id: 'escrow-3', status: 'released' });

      const count = await escrowService.processReadyEscrows();

      // Two succeeded, one failed
      expect(count).toBe(2);
    });
  });

  // ===========================================================================
  // LIST ESCROWS FOR ORDER
  // ===========================================================================

  describe('listEscrowsForOrder', () => {
    it('should return all escrows for an order', async () => {
      const escrows = [
        {
          id: 'escrow-1',
          order_id: 'order-123',
          status: 'released',
          amount: 10000,
          held_amount: 0,
          released_amount: 10000,
          hold_until: new Date(),
          release_conditions: '[]',
          tenant_id: 'tenant-123',
          created_at: new Date('2025-01-01'),
          updated_at: new Date(),
        },
        {
          id: 'escrow-2',
          order_id: 'order-123',
          status: 'held',
          amount: 5000,
          held_amount: 5000,
          released_amount: 0,
          hold_until: new Date(),
          release_conditions: '[]',
          tenant_id: 'tenant-123',
          created_at: new Date('2025-01-02'),
          updated_at: new Date(),
        },
      ];

      mockPool.query.mockResolvedValue({ rows: escrows });

      const result = await escrowService.listEscrowsForOrder('order-123', 'tenant-123');

      expect(result).toHaveLength(2);
      expect(result[0].orderId).toBe('order-123');
    });

    it('should return empty array if no escrows found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await escrowService.listEscrowsForOrder('order-999', 'tenant-123');

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // GET ESCROW BY PAYMENT INTENT
  // ===========================================================================

  describe('getEscrowByPaymentIntent', () => {
    it('should return escrow for payment intent', async () => {
      const escrowRow = {
        id: 'escrow-123',
        order_id: 'order-123',
        payment_intent_id: 'pi_abc123',
        amount: 10000,
        held_amount: 10000,
        released_amount: 0,
        status: 'held',
        hold_until: new Date(),
        release_conditions: '[]',
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [escrowRow] });

      const result = await escrowService.getEscrowByPaymentIntent('pi_abc123', 'tenant-123');

      expect(result).not.toBeNull();
      expect(result?.paymentIntentId).toBe('pi_abc123');
    });

    it('should return null if no escrow for payment intent', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await escrowService.getEscrowByPaymentIntent('pi_unknown', 'tenant-123');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // DATA MAPPING
  // ===========================================================================

  describe('data mapping', () => {
    it('should parse JSON release conditions', async () => {
      const escrowRow = {
        id: 'escrow-123',
        order_id: 'order-123',
        payment_intent_id: 'pi_abc',
        amount: 10000,
        held_amount: 10000,
        released_amount: 0,
        status: 'held',
        hold_until: new Date(),
        release_conditions: JSON.stringify(['condition1', 'condition2']),
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [escrowRow] });

      const result = await escrowService.getEscrow('escrow-123', 'tenant-123');

      expect(result?.releaseConditions).toEqual(['condition1', 'condition2']);
    });

    it('should handle object release conditions (already parsed)', async () => {
      const escrowRow = {
        id: 'escrow-123',
        order_id: 'order-123',
        payment_intent_id: 'pi_abc',
        amount: 10000,
        held_amount: 10000,
        released_amount: 0,
        status: 'held',
        hold_until: new Date(),
        release_conditions: ['condition1', 'condition2'],
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [escrowRow] });

      const result = await escrowService.getEscrow('escrow-123', 'tenant-123');

      expect(result?.releaseConditions).toEqual(['condition1', 'condition2']);
    });

    it('should handle null/undefined release conditions', async () => {
      const escrowRow = {
        id: 'escrow-123',
        order_id: 'order-123',
        payment_intent_id: 'pi_abc',
        amount: 10000,
        held_amount: 10000,
        released_amount: 0,
        status: 'held',
        hold_until: new Date(),
        release_conditions: null,
        tenant_id: 'tenant-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPool.query.mockResolvedValue({ rows: [escrowRow] });

      const result = await escrowService.getEscrow('escrow-123', 'tenant-123');

      expect(result?.releaseConditions).toEqual([]);
    });
  });
});
