// =============================================================================
// TEST SUITE: blockchain.types
// =============================================================================

import { NFTMintRequest, GasEstimate, MintBatch } from '../../../src/types/blockchain.types';

describe('blockchain.types', () => {
  // ===========================================================================
  // NFTMintRequest Interface - 6 test cases
  // ===========================================================================

  describe('NFTMintRequest Interface', () => {
    it('should allow valid NFTMintRequest object', () => {
      const request: NFTMintRequest = {
        paymentId: 'payment-123',
        ticketIds: ['ticket-1', 'ticket-2'],
        venueId: 'venue-456',
        eventId: 'event-789',
        blockchain: 'solana',
        priority: 'standard',
      };

      expect(request.paymentId).toBe('payment-123');
      expect(request.ticketIds).toEqual(['ticket-1', 'ticket-2']);
      expect(request.venueId).toBe('venue-456');
      expect(request.eventId).toBe('event-789');
      expect(request.blockchain).toBe('solana');
      expect(request.priority).toBe('standard');
    });

    it('should allow solana blockchain', () => {
      const request: NFTMintRequest = {
        paymentId: 'payment-123',
        ticketIds: [],
        venueId: 'venue-456',
        eventId: 'event-789',
        blockchain: 'solana',
        priority: 'standard',
      };

      expect(request.blockchain).toBe('solana');
    });

    it('should allow polygon blockchain', () => {
      const request: NFTMintRequest = {
        paymentId: 'payment-123',
        ticketIds: [],
        venueId: 'venue-456',
        eventId: 'event-789',
        blockchain: 'polygon',
        priority: 'standard',
      };

      expect(request.blockchain).toBe('polygon');
    });

    it('should allow standard priority', () => {
      const request: NFTMintRequest = {
        paymentId: 'payment-123',
        ticketIds: [],
        venueId: 'venue-456',
        eventId: 'event-789',
        blockchain: 'solana',
        priority: 'standard',
      };

      expect(request.priority).toBe('standard');
    });

    it('should allow high priority', () => {
      const request: NFTMintRequest = {
        paymentId: 'payment-123',
        ticketIds: [],
        venueId: 'venue-456',
        eventId: 'event-789',
        blockchain: 'solana',
        priority: 'high',
      };

      expect(request.priority).toBe('high');
    });

    it('should allow urgent priority', () => {
      const request: NFTMintRequest = {
        paymentId: 'payment-123',
        ticketIds: [],
        venueId: 'venue-456',
        eventId: 'event-789',
        blockchain: 'solana',
        priority: 'urgent',
      };

      expect(request.priority).toBe('urgent');
    });
  });

  // ===========================================================================
  // GasEstimate Interface - 5 test cases
  // ===========================================================================

  describe('GasEstimate Interface', () => {
    it('should allow valid GasEstimate object', () => {
      const estimate: GasEstimate = {
        blockchain: 'ethereum',
        estimatedFee: 0.005,
        feeInUSD: 15.75,
        congestionLevel: 'medium',
        timestamp: new Date(),
      };

      expect(estimate.blockchain).toBe('ethereum');
      expect(estimate.estimatedFee).toBe(0.005);
      expect(estimate.feeInUSD).toBe(15.75);
      expect(estimate.congestionLevel).toBe('medium');
      expect(estimate.timestamp).toBeInstanceOf(Date);
    });

    it('should allow low congestion level', () => {
      const estimate: GasEstimate = {
        blockchain: 'polygon',
        estimatedFee: 0.001,
        feeInUSD: 0.5,
        congestionLevel: 'low',
        timestamp: new Date(),
      };

      expect(estimate.congestionLevel).toBe('low');
    });

    it('should allow medium congestion level', () => {
      const estimate: GasEstimate = {
        blockchain: 'polygon',
        estimatedFee: 0.001,
        feeInUSD: 0.5,
        congestionLevel: 'medium',
        timestamp: new Date(),
      };

      expect(estimate.congestionLevel).toBe('medium');
    });

    it('should allow high congestion level', () => {
      const estimate: GasEstimate = {
        blockchain: 'polygon',
        estimatedFee: 0.001,
        feeInUSD: 0.5,
        congestionLevel: 'high',
        timestamp: new Date(),
      };

      expect(estimate.congestionLevel).toBe('high');
    });

    it('should store timestamp as Date object', () => {
      const now = new Date();
      const estimate: GasEstimate = {
        blockchain: 'solana',
        estimatedFee: 0.0001,
        feeInUSD: 0.02,
        congestionLevel: 'low',
        timestamp: now,
      };

      expect(estimate.timestamp).toBe(now);
      expect(estimate.timestamp.getTime()).toBe(now.getTime());
    });
  });

  // ===========================================================================
  // MintBatch Interface - 10 test cases
  // ===========================================================================

  describe('MintBatch Interface', () => {
    it('should allow valid MintBatch object with all fields', () => {
      const batch: MintBatch = {
        id: 'batch-123',
        ticketIds: ['ticket-1', 'ticket-2', 'ticket-3'],
        status: 'completed',
        transactionHash: '0xabc123',
        gasUsed: 21000,
        attempts: 1,
        error: undefined,
      };

      expect(batch.id).toBe('batch-123');
      expect(batch.ticketIds).toHaveLength(3);
      expect(batch.status).toBe('completed');
      expect(batch.transactionHash).toBe('0xabc123');
      expect(batch.gasUsed).toBe(21000);
      expect(batch.attempts).toBe(1);
    });

    it('should allow queued status', () => {
      const batch: MintBatch = {
        id: 'batch-123',
        ticketIds: [],
        status: 'queued',
        attempts: 0,
      };

      expect(batch.status).toBe('queued');
    });

    it('should allow processing status', () => {
      const batch: MintBatch = {
        id: 'batch-123',
        ticketIds: [],
        status: 'processing',
        attempts: 1,
      };

      expect(batch.status).toBe('processing');
    });

    it('should allow completed status', () => {
      const batch: MintBatch = {
        id: 'batch-123',
        ticketIds: [],
        status: 'completed',
        attempts: 1,
      };

      expect(batch.status).toBe('completed');
    });

    it('should allow failed status', () => {
      const batch: MintBatch = {
        id: 'batch-123',
        ticketIds: [],
        status: 'failed',
        attempts: 3,
        error: 'Transaction failed',
      };

      expect(batch.status).toBe('failed');
      expect(batch.error).toBe('Transaction failed');
    });

    it('should allow collecting status', () => {
      const batch: MintBatch = {
        id: 'batch-123',
        ticketIds: [],
        status: 'collecting',
        attempts: 0,
      };

      expect(batch.status).toBe('collecting');
    });

    it('should allow optional transactionHash', () => {
      const batchWithHash: MintBatch = {
        id: 'batch-123',
        ticketIds: [],
        status: 'completed',
        transactionHash: '0xdef456',
        attempts: 1,
      };

      const batchWithoutHash: MintBatch = {
        id: 'batch-456',
        ticketIds: [],
        status: 'queued',
        attempts: 0,
      };

      expect(batchWithHash.transactionHash).toBe('0xdef456');
      expect(batchWithoutHash.transactionHash).toBeUndefined();
    });

    it('should allow optional gasUsed', () => {
      const batchWithGas: MintBatch = {
        id: 'batch-123',
        ticketIds: [],
        status: 'completed',
        gasUsed: 50000,
        attempts: 1,
      };

      const batchWithoutGas: MintBatch = {
        id: 'batch-456',
        ticketIds: [],
        status: 'queued',
        attempts: 0,
      };

      expect(batchWithGas.gasUsed).toBe(50000);
      expect(batchWithoutGas.gasUsed).toBeUndefined();
    });

    it('should allow optional error message', () => {
      const batchWithError: MintBatch = {
        id: 'batch-123',
        ticketIds: [],
        status: 'failed',
        attempts: 3,
        error: 'Network timeout',
      };

      const batchWithoutError: MintBatch = {
        id: 'batch-456',
        ticketIds: [],
        status: 'completed',
        attempts: 1,
      };

      expect(batchWithError.error).toBe('Network timeout');
      expect(batchWithoutError.error).toBeUndefined();
    });

    it('should track number of attempts', () => {
      const batch: MintBatch = {
        id: 'batch-123',
        ticketIds: [],
        status: 'processing',
        attempts: 5,
      };

      expect(batch.attempts).toBe(5);
      expect(typeof batch.attempts).toBe('number');
    });
  });
});
