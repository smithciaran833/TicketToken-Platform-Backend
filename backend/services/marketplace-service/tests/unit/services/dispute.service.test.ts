/**
 * Unit Tests for dispute.service.ts
 * Tests dispute creation, evidence handling, and user disputes
 */

import { disputeService } from '../../../src/services/dispute.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => {
  const mockDb = jest.fn(() => mockDb);
  Object.assign(mockDb, {
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn(),
  });
  return { db: mockDb };
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

import { db } from '../../../src/config/database';

describe('DisputeService', () => {
  const mockDb = db as jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDispute', () => {
    const mockTransfer = {
      id: 'transfer-123',
      buyer_id: 'buyer-123',
      seller_id: 'seller-456',
    };

    beforeEach(() => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(mockTransfer),
        }),
        insert: jest.fn().mockResolvedValue([1]),
      });
    });

    it('should create a dispute successfully', async () => {
      const result = await disputeService.createDispute(
        'transfer-123',
        'listing-456',
        'buyer-123',
        'damaged_item',
        'Item was damaged'
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('mock-uuid-1234');
      expect(result.transfer_id).toBe('transfer-123');
      expect(result.listing_id).toBe('listing-456');
      expect(result.initiator_id).toBe('buyer-123');
      expect(result.respondent_id).toBe('seller-456');
      expect(result.reason).toBe('damaged_item');
      expect(result.status).toBe('open');
    });

    it('should assign seller as respondent when buyer initiates', async () => {
      const result = await disputeService.createDispute(
        'transfer-123',
        'listing-456',
        'buyer-123',
        'damaged_item'
      );

      expect(result.initiator_id).toBe('buyer-123');
      expect(result.respondent_id).toBe('seller-456');
    });

    it('should assign buyer as respondent when seller initiates', async () => {
      const result = await disputeService.createDispute(
        'transfer-123',
        'listing-456',
        'seller-456',
        'non_payment'
      );

      expect(result.initiator_id).toBe('seller-456');
      expect(result.respondent_id).toBe('buyer-123');
    });

    it('should throw NotFoundError when transfer not found', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        disputeService.createDispute(
          'non-existent',
          'listing-456',
          'buyer-123',
          'damaged_item'
        )
      ).rejects.toThrow('Transfer not found');
    });

    it('should add evidence when provided', async () => {
      const mockEvidence = { files: ['file1.jpg'] };
      const insertMock = jest.fn().mockResolvedValue([1]);
      
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(mockTransfer),
        }),
        insert: insertMock,
      });

      await disputeService.createDispute(
        'transfer-123',
        'listing-456',
        'buyer-123',
        'damaged_item',
        'Item was damaged',
        mockEvidence
      );

      // Should call insert twice - once for dispute, once for evidence
      expect(insertMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('addEvidence', () => {
    it('should add evidence to dispute', async () => {
      const insertMock = jest.fn().mockResolvedValue([1]);
      mockDb.mockReturnValue({
        insert: insertMock,
      });

      await disputeService.addEvidence(
        'dispute-123',
        'user-456',
        'text',
        'Evidence content',
        { source: 'email' }
      );

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dispute_id: 'dispute-123',
          submitted_by: 'user-456',
          evidence_type: 'text',
          content: 'Evidence content',
          metadata: JSON.stringify({ source: 'email' }),
        })
      );
    });

    it('should handle metadata as null when not provided', async () => {
      const insertMock = jest.fn().mockResolvedValue([1]);
      mockDb.mockReturnValue({
        insert: insertMock,
      });

      await disputeService.addEvidence(
        'dispute-123',
        'user-456',
        'image',
        'image-url.jpg'
      );

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: null,
        })
      );
    });

    it('should throw on database error', async () => {
      mockDb.mockReturnValue({
        insert: jest.fn().mockRejectedValue(new Error('DB error')),
      });

      await expect(
        disputeService.addEvidence('dispute-123', 'user-456', 'text', 'content')
      ).rejects.toThrow('DB error');
    });
  });

  describe('getDispute', () => {
    it('should return dispute by id', async () => {
      const mockDispute = {
        id: 'dispute-123',
        transfer_id: 'transfer-123',
        status: 'open',
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(mockDispute),
        }),
      });

      const result = await disputeService.getDispute('dispute-123');

      expect(result).toEqual(mockDispute);
    });

    it('should return null on error', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockRejectedValue(new Error('DB error')),
        }),
      });

      const result = await disputeService.getDispute('dispute-123');

      expect(result).toBeNull();
    });

    it('should return null for non-existent dispute', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await disputeService.getDispute('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getUserDisputes', () => {
    const mockDisputes = [
      { id: 'dispute-1', status: 'open' },
      { id: 'dispute-2', status: 'resolved' },
    ];

    it('should return disputes for user as initiator or respondent', async () => {
      const whereMock = jest.fn().mockReturnThis();
      const orWhereMock = jest.fn().mockReturnThis();
      const orderByMock = jest.fn().mockResolvedValue(mockDisputes);

      mockDb.mockReturnValue({
        where: whereMock,
        orWhere: orWhereMock,
        orderBy: orderByMock,
      });

      const result = await disputeService.getUserDisputes('user-123');

      expect(result).toEqual(mockDisputes);
    });

    it('should order disputes by created_at desc', async () => {
      const orderByMock = jest.fn().mockResolvedValue(mockDisputes);

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: orderByMock,
        }),
      });

      await disputeService.getUserDisputes('user-123');

      expect(orderByMock).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('should return empty array on error', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockRejectedValue(new Error('DB error')),
        }),
      });

      const result = await disputeService.getUserDisputes('user-123');

      expect(result).toEqual([]);
    });
  });
});
