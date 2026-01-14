import { MockNFTService } from '../../../../src/services/mock/mock-nft.service';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('MockNFTService', () => {
  let mockNFTService: MockNFTService;

  beforeEach(() => {
    mockNFTService = new MockNFTService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===========================================================================
  // queueMinting() - 10 test cases
  // ===========================================================================

  describe('queueMinting()', () => {
    it('should queue minting job with ticket ids', async () => {
      const result = await mockNFTService.queueMinting(['ticket-1', 'ticket-2'], 'event-123');

      expect(result.ticketIds).toEqual(['ticket-1', 'ticket-2']);
    });

    it('should queue minting job with event id', async () => {
      const result = await mockNFTService.queueMinting(['ticket-1'], 'event-456');

      expect(result.eventId).toBe('event-456');
    });

    it('should generate unique job id', async () => {
      const result = await mockNFTService.queueMinting(['ticket-1'], 'event-123');

      expect(result.id).toMatch(/^mint_\d+_[a-z0-9]+$/);
    });

    it('should set initial status to queued', async () => {
      const result = await mockNFTService.queueMinting(['ticket-1'], 'event-123');

      expect(result.status).toBe('queued');
    });

    it('should include createdAt timestamp', async () => {
      const result = await mockNFTService.queueMinting(['ticket-1'], 'event-123');

      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should mark as mock data', async () => {
      const result = await mockNFTService.queueMinting(['ticket-1'], 'event-123');

      expect(result.mockData).toBe(true);
    });

    it('should update status to completed after timeout', async () => {
      const result = await mockNFTService.queueMinting(['ticket-1'], 'event-123');

      jest.advanceTimersByTime(2000);

      const status = await mockNFTService.getMintStatus(result.id);
      expect(status.status).toBe('completed');
    });

    it('should add transaction hash after completion', async () => {
      const result = await mockNFTService.queueMinting(['ticket-1'], 'event-123');

      jest.advanceTimersByTime(2000);

      const status = await mockNFTService.getMintStatus(result.id);
      expect(status.transactionHash).toMatch(/^0x[a-f0-9]{40}$/);
    });

    it('should handle multiple tickets in queue', async () => {
      const result = await mockNFTService.queueMinting(
        ['ticket-1', 'ticket-2', 'ticket-3', 'ticket-4'],
        'event-123'
      );

      expect(result.ticketIds).toHaveLength(4);
    });

    it('should generate different job ids for multiple queues', async () => {
      const result1 = await mockNFTService.queueMinting(['ticket-1'], 'event-1');
      const result2 = await mockNFTService.queueMinting(['ticket-2'], 'event-2');

      expect(result1.id).not.toBe(result2.id);
    });
  });

  // ===========================================================================
  // getMintStatus() - 5 test cases
  // ===========================================================================

  describe('getMintStatus()', () => {
    it('should return job status for existing job', async () => {
      const job = await mockNFTService.queueMinting(['ticket-1'], 'event-123');

      const status = await mockNFTService.getMintStatus(job.id);

      expect(status.id).toBe(job.id);
      expect(status.status).toBe('queued');
    });

    it('should return not_found for non-existent job', async () => {
      const status = await mockNFTService.getMintStatus('fake-job-id');

      expect(status.id).toBe('fake-job-id');
      expect(status.status).toBe('not_found');
    });

    it('should return updated status after completion', async () => {
      const job = await mockNFTService.queueMinting(['ticket-1'], 'event-123');

      jest.advanceTimersByTime(2000);

      const status = await mockNFTService.getMintStatus(job.id);
      expect(status.status).toBe('completed');
    });

    it('should return transaction hash after completion', async () => {
      const job = await mockNFTService.queueMinting(['ticket-1'], 'event-123');

      jest.advanceTimersByTime(2000);

      const status = await mockNFTService.getMintStatus(job.id);
      expect(status.transactionHash).toBeDefined();
    });

    it('should track multiple jobs independently', async () => {
      const job1 = await mockNFTService.queueMinting(['ticket-1'], 'event-1');
      const job2 = await mockNFTService.queueMinting(['ticket-2'], 'event-2');

      const status1 = await mockNFTService.getMintStatus(job1.id);
      const status2 = await mockNFTService.getMintStatus(job2.id);

      expect(status1.id).toBe(job1.id);
      expect(status2.id).toBe(job2.id);
      expect(status1.id).not.toBe(status2.id);
    });
  });

  // ===========================================================================
  // estimateGasFees() - 6 test cases
  // ===========================================================================

  describe('estimateGasFees()', () => {
    it('should estimate gas fees for single ticket', async () => {
      const result = await mockNFTService.estimateGasFees(1);

      expect(result.estimatedFee).toBe(0.002);
      expect(result.feeInUSD).toBe(0.05);
    });

    it('should estimate gas fees for multiple tickets', async () => {
      const result = await mockNFTService.estimateGasFees(10);

      expect(result.estimatedFee).toBe(0.02);
      expect(result.feeInUSD).toBe(0.5);
    });

    it('should use solana blockchain', async () => {
      const result = await mockNFTService.estimateGasFees(5);

      expect(result.blockchain).toBe('solana');
    });

    it('should set congestion level to low', async () => {
      const result = await mockNFTService.estimateGasFees(3);

      expect(result.congestionLevel).toBe('low');
    });

    it('should include timestamp', async () => {
      const result = await mockNFTService.estimateGasFees(2);

      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should scale fees linearly with ticket count', async () => {
      const result1 = await mockNFTService.estimateGasFees(1);
      const result10 = await mockNFTService.estimateGasFees(10);

      expect(result10.estimatedFee).toBe(result1.estimatedFee * 10);
      expect(result10.feeInUSD).toBe(result1.feeInUSD * 10);
    });
  });
});
