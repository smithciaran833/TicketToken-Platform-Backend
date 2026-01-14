/**
 * Unit Tests for Dispute Model
 * Tests marketplace dispute database operations
 */

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-dispute')
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock database
const mockDbChain = {
  insert: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  whereIn: jest.fn().mockReturnThis(),
  first: jest.fn(),
  update: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  orWhere: jest.fn().mockReturnThis()
};

jest.mock('../../../src/config/database', () => ({
  db: jest.fn(() => mockDbChain)
}));

import { DisputeModel, disputeModel } from '../../../src/models/dispute.model';
import { logger } from '../../../src/utils/logger';

describe('DisputeModel', () => {
  const mockDispute = {
    id: 'dispute-123',
    transfer_id: 'transfer-456',
    listing_id: 'listing-789',
    initiator_id: 'user-111',
    respondent_id: 'user-222',
    reason: 'Item not as described',
    description: 'The ticket section was different than listed',
    status: 'open',
    resolution: null,
    resolved_by: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    resolved_at: null
  };

  const mockEvidence = {
    id: 'evidence-123',
    dispute_id: 'dispute-123',
    submitted_by: 'user-111',
    evidence_type: 'text',
    content: 'Here is my evidence...',
    metadata: JSON.stringify({ source: 'chat' }),
    submitted_at: new Date('2024-01-01')
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockDbChain).forEach(mock => {
      if (jest.isMockFunction(mock)) {
        mock.mockClear();
        mock.mockReturnThis();
      }
    });
  });

  describe('createDispute', () => {
    it('should create a new dispute', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await disputeModel.createDispute(
        'transfer-456',
        'listing-789',
        'user-111',
        'user-222',
        'Item not as described',
        'The ticket section was different than listed'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-dispute',
          transfer_id: 'transfer-456',
          listing_id: 'listing-789',
          initiator_id: 'user-111',
          respondent_id: 'user-222',
          reason: 'Item not as described',
          description: 'The ticket section was different than listed',
          status: 'open'
        })
      );
      expect(result.id).toBe('test-uuid-dispute');
      expect(logger.info).toHaveBeenCalledWith('Dispute created: test-uuid-dispute');
    });

    it('should create dispute without description', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await disputeModel.createDispute(
        'transfer-456',
        'listing-789',
        'user-111',
        'user-222',
        'Fraud'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          description: undefined
        })
      );
      expect(result.status).toBe('open');
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Database error');
      mockDbChain.insert.mockRejectedValue(dbError);
      
      await expect(disputeModel.createDispute(
        'transfer-456',
        'listing-789',
        'user-111',
        'user-222',
        'Reason'
      )).rejects.toThrow('Database error');
      
      expect(logger.error).toHaveBeenCalledWith('Error creating dispute:', dbError);
    });
  });

  describe('addEvidence', () => {
    it('should add text evidence', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await disputeModel.addEvidence(
        'dispute-123',
        'user-111',
        'text',
        'This is my evidence text'
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-dispute',
          dispute_id: 'dispute-123',
          submitted_by: 'user-111',
          evidence_type: 'text',
          content: 'This is my evidence text',
          metadata: null
        })
      );
      expect(result.id).toBe('test-uuid-dispute');
      expect(logger.info).toHaveBeenCalledWith('Evidence added to dispute dispute-123');
    });

    it('should add evidence with metadata', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      const metadata = { source: 'email', timestamp: '2024-01-01' };
      
      const result = await disputeModel.addEvidence(
        'dispute-123',
        'user-111',
        'document',
        'document-url',
        metadata
      );
      
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          evidence_type: 'document',
          metadata: JSON.stringify(metadata)
        })
      );
      expect(result.metadata).toEqual(metadata);
    });

    it('should add blockchain_tx evidence', async () => {
      mockDbChain.insert.mockResolvedValue([1]);
      
      const result = await disputeModel.addEvidence(
        'dispute-123',
        'user-111',
        'blockchain_tx',
        'sig123456'
      );
      
      expect(result.evidence_type).toBe('blockchain_tx');
      expect(result.content).toBe('sig123456');
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Insert failed');
      mockDbChain.insert.mockRejectedValue(dbError);
      
      await expect(disputeModel.addEvidence(
        'dispute-123',
        'user-111',
        'text',
        'content'
      )).rejects.toThrow('Insert failed');
      
      expect(logger.error).toHaveBeenCalledWith('Error adding evidence:', dbError);
    });
  });

  describe('updateDisputeStatus', () => {
    it('should update status to investigating', async () => {
      mockDbChain.update.mockResolvedValue(1);
      
      await disputeModel.updateDisputeStatus('dispute-123', 'investigating');
      
      expect(mockDbChain.where).toHaveBeenCalledWith('id', 'dispute-123');
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'investigating',
          updated_at: expect.any(Date)
        })
      );
      expect(logger.info).toHaveBeenCalledWith('Dispute dispute-123 updated to status: investigating');
    });

    it('should set resolution fields when resolved', async () => {
      mockDbChain.update.mockResolvedValue(1);
      
      await disputeModel.updateDisputeStatus(
        'dispute-123',
        'resolved',
        'Refund issued to buyer',
        'admin-123'
      );
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'resolved',
          resolution: 'Refund issued to buyer',
          resolved_by: 'admin-123',
          resolved_at: expect.any(Date)
        })
      );
    });

    it('should set resolution fields when cancelled', async () => {
      mockDbChain.update.mockResolvedValue(1);
      
      await disputeModel.updateDisputeStatus(
        'dispute-123',
        'cancelled',
        'Dispute withdrawn by initiator',
        'user-111'
      );
      
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          resolution: 'Dispute withdrawn by initiator',
          resolved_at: expect.any(Date)
        })
      );
    });

    it('should throw error on database failure', async () => {
      const dbError = new Error('Update failed');
      mockDbChain.update.mockRejectedValue(dbError);
      
      await expect(disputeModel.updateDisputeStatus(
        'dispute-123',
        'resolved'
      )).rejects.toThrow('Update failed');
      
      expect(logger.error).toHaveBeenCalledWith('Error updating dispute status:', dbError);
    });
  });

  describe('getDispute', () => {
    it('should return dispute by ID', async () => {
      mockDbChain.first.mockResolvedValue(mockDispute);
      
      const result = await disputeModel.getDispute('dispute-123');
      
      expect(mockDbChain.where).toHaveBeenCalledWith('id', 'dispute-123');
      expect(result).toEqual(mockDispute);
    });

    it('should return null when not found', async () => {
      mockDbChain.first.mockResolvedValue(null);
      
      const result = await disputeModel.getDispute('nonexistent');
      
      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockDbChain.first.mockRejectedValue(new Error('Query failed'));
      
      const result = await disputeModel.getDispute('dispute-123');
      
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error getting dispute:', expect.any(Error));
    });
  });

  describe('getDisputeEvidence', () => {
    it('should return evidence for dispute', async () => {
      const evidenceList = [
        mockEvidence,
        { ...mockEvidence, id: 'evidence-124', metadata: null }
      ];
      mockDbChain.select.mockResolvedValue(evidenceList);
      
      const result = await disputeModel.getDisputeEvidence('dispute-123');
      
      expect(mockDbChain.where).toHaveBeenCalledWith('dispute_id', 'dispute-123');
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('submitted_at', 'asc');
      expect(result).toHaveLength(2);
      expect(result[0].metadata).toEqual({ source: 'chat' });
      expect(result[1].metadata).toBeUndefined();
    });

    it('should return empty array when no evidence', async () => {
      mockDbChain.select.mockResolvedValue([]);
      
      const result = await disputeModel.getDisputeEvidence('dispute-123');
      
      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockDbChain.select.mockRejectedValue(new Error('Query failed'));
      
      const result = await disputeModel.getDisputeEvidence('dispute-123');
      
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('Error getting dispute evidence:', expect.any(Error));
    });
  });

  describe('getActiveDisputes', () => {
    it('should return all active disputes', async () => {
      const disputes = [mockDispute, { ...mockDispute, id: 'dispute-124' }];
      mockDbChain.select.mockResolvedValue(disputes);
      
      const result = await disputeModel.getActiveDisputes();
      
      expect(mockDbChain.whereIn).toHaveBeenCalledWith('status', ['open', 'investigating']);
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(result).toHaveLength(2);
    });

    it('should filter by user ID when provided', async () => {
      mockDbChain.select.mockResolvedValue([mockDispute]);
      
      // Mock the where callback
      const mockWhereCallback = jest.fn();
      mockDbChain.where.mockImplementation((callback) => {
        if (typeof callback === 'function') {
          callback.call({
            where: jest.fn().mockReturnThis(),
            orWhere: jest.fn().mockReturnThis()
          });
        }
        return mockDbChain;
      });
      
      const result = await disputeModel.getActiveDisputes('user-111');
      
      expect(mockDbChain.where).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should return empty array on error', async () => {
      mockDbChain.select.mockRejectedValue(new Error('Query failed'));
      
      const result = await disputeModel.getActiveDisputes();
      
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('Error getting active disputes:', expect.any(Error));
    });
  });

  describe('disputeModel export', () => {
    it('should export singleton instance', () => {
      expect(disputeModel).toBeInstanceOf(DisputeModel);
    });
  });
});
