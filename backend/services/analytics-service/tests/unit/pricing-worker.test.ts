/**
 * Pricing Worker Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockRaw = jest.fn();
jest.mock('../../src/config/database', () => ({
  getDb: jest.fn(() => ({
    raw: mockRaw,
  })),
}));

const mockGetVenuePricingRules = jest.fn();
const mockCalculateOptimalPrice = jest.fn();
const mockApplyPriceChange = jest.fn();
jest.mock('../../src/services/dynamic-pricing.service', () => ({
  dynamicPricingService: {
    getVenuePricingRules: mockGetVenuePricingRules,
    calculateOptimalPrice: mockCalculateOptimalPrice,
    applyPriceChange: mockApplyPriceChange,
  },
}));

import { PricingWorker } from '../../src/workers/pricing-worker';
import { logger } from '../../src/utils/logger';

describe('PricingWorker', () => {
  let worker: PricingWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    worker = new PricingWorker();
  });

  afterEach(() => {
    worker.stop();
  });

  describe('stop', () => {
    it('should log stop message', () => {
      worker.stop();

      expect(logger.info).toHaveBeenCalledWith('🛑 Pricing worker stopped');
    });

    it('should set isRunning to false', () => {
      worker.stop();

      expect((worker as any).isRunning).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should query events with dynamic pricing enabled', async () => {
      mockRaw.mockResolvedValueOnce({ rows: [] });

      await (worker as any).processEvents();

      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining('dynamic_pricing_enabled = true')
      );
    });

    it('should log number of events being processed', async () => {
      mockRaw.mockResolvedValueOnce({
        rows: [
          { id: 'event-1', price_cents: 5000, venue_id: 'venue-1' },
          { id: 'event-2', price_cents: 7500, venue_id: 'venue-1' },
        ],
      });

      mockGetVenuePricingRules.mockResolvedValue({ requireApproval: false });
      mockCalculateOptimalPrice.mockResolvedValue({
        recommendedPrice: 5000,
        demandScore: 50,
        confidence: 0.8,
        reasoning: ['test'],
      });

      await (worker as any).processEvents();

      expect(logger.info).toHaveBeenCalledWith('Processing 2 events with dynamic pricing');
    });

    it('should handle errors for individual events', async () => {
      mockRaw.mockResolvedValueOnce({
        rows: [{ id: 'event-1', price_cents: 5000, venue_id: 'venue-1' }],
      });

      mockGetVenuePricingRules.mockRejectedValueOnce(new Error('DB error'));

      await (worker as any).processEvents();

      expect(logger.error).toHaveBeenCalledWith(
        'Error processing event event-1:',
        expect.any(Error)
      );
    });
  });

  describe('processEvent', () => {
    const mockEvent = {
      id: 'event-123',
      price_cents: 5000,
      venue_id: 'venue-456',
    };

    beforeEach(() => {
      mockGetVenuePricingRules.mockResolvedValue({
        requireApproval: false,
        minPrice: 1000,
        maxPrice: 10000,
      });
    });

    it('should skip if price change is too small', async () => {
      mockCalculateOptimalPrice.mockResolvedValueOnce({
        recommendedPrice: 5100, // 2% change
        demandScore: 60,
        confidence: 0.85,
        reasoning: ['Slight demand increase'],
      });

      await (worker as any).processEvent(mockEvent);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Change too small')
      );
      expect(mockApplyPriceChange).not.toHaveBeenCalled();
    });

    it('should apply price change automatically when approval not required', async () => {
      mockCalculateOptimalPrice.mockResolvedValueOnce({
        recommendedPrice: 6000, // 20% change
        demandScore: 80,
        confidence: 0.9,
        reasoning: ['High demand'],
      });

      await (worker as any).processEvent(mockEvent);

      expect(mockApplyPriceChange).toHaveBeenCalledWith(
        'event-123',
        6000,
        expect.stringContaining('Auto-adjusted')
      );
      expect(logger.info).toHaveBeenCalledWith('  ✅ Price updated automatically');
    });

    it('should queue for approval when required', async () => {
      mockGetVenuePricingRules.mockResolvedValueOnce({
        requireApproval: true,
      });

      mockCalculateOptimalPrice.mockResolvedValueOnce({
        recommendedPrice: 6000,
        demandScore: 80,
        confidence: 0.9,
        reasoning: ['High demand'],
      });

      mockRaw.mockResolvedValueOnce({}); // For insert

      await (worker as any).processEvent(mockEvent);

      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining('pending_price_changes'),
        expect.any(Array)
      );
      expect(logger.info).toHaveBeenCalledWith('  ⏸️  Awaiting approval');
    });

    it('should log current and recommended prices', async () => {
      mockCalculateOptimalPrice.mockResolvedValueOnce({
        recommendedPrice: 6000,
        demandScore: 75,
        confidence: 0.85,
        reasoning: ['Market conditions'],
      });

      await (worker as any).processEvent(mockEvent);

      expect(logger.info).toHaveBeenCalledWith('Event event-123:');
      expect(logger.info).toHaveBeenCalledWith('  Current: $50.00');
      expect(logger.info).toHaveBeenCalledWith('  Recommended: $60.00');
      expect(logger.info).toHaveBeenCalledWith('  Demand Score: 75/100');
      expect(logger.info).toHaveBeenCalledWith('  Confidence: 85%');
    });
  });

  describe('sleep', () => {
    it('should delay for specified milliseconds', async () => {
      const start = Date.now();
      await (worker as any).sleep(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);
    });
  });
});
