/**
 * RFM Calculator Worker Unit Tests
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

const mockScheduleJob = jest.fn();
const mockCancelJob = jest.fn();
jest.mock('node-schedule', () => ({
  scheduleJob: (cron: string, callback: () => void) => {
    mockScheduleJob(cron, callback);
    return { cancel: mockCancelJob };
  },
}));

const mockAcquireRFMLock = jest.fn();
const mockRelease = jest.fn();
const mockReleaseAll = jest.fn();
jest.mock('../../src/utils/distributed-lock', () => ({
  acquireRFMLock: mockAcquireRFMLock,
  getDistributedLock: () => ({
    release: mockRelease,
    releaseAll: mockReleaseAll,
  }),
}));

// Create chainable mock for knex
const createChainableMock = () => {
  const mock: any = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockReturnThis(),
    onConflict: jest.fn().mockReturnThis(),
    merge: jest.fn().mockResolvedValue(undefined),
    distinct: jest.fn().mockReturnThis(),
    pluck: jest.fn().mockResolvedValue([]),
  };
  return mock;
};

const mockDbChain = createChainableMock();
const mockDb = jest.fn(() => mockDbChain);
(mockDb as any).raw = jest.fn();
(mockDb as any).schema = { hasTable: jest.fn().mockResolvedValue(false) };

jest.mock('../../src/config/database', () => ({
  db: mockDb,
}));

import { rfmCalculatorWorker } from '../../src/workers/rfm-calculator.worker';
import { logger } from '../../src/utils/logger';

describe('RFMCalculatorWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset mock chain
    Object.keys(mockDbChain).forEach(key => {
      if (typeof mockDbChain[key].mockReturnThis === 'function') {
        mockDbChain[key].mockReturnThis();
      }
    });
    mockDbChain.first.mockResolvedValue(null);
    mockDbChain.pluck.mockResolvedValue([]);
    mockDbChain.merge.mockResolvedValue(undefined);

    (mockDb as any).schema.hasTable.mockResolvedValue(false);
    mockAcquireRFMLock.mockResolvedValue('lock-token');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should schedule job at 2 AM daily', async () => {
      await rfmCalculatorWorker.start();

      expect(mockScheduleJob).toHaveBeenCalledWith(
        '0 2 * * *',
        expect.any(Function)
      );
    });

    it('should log startup message', async () => {
      await rfmCalculatorWorker.start();

      expect(logger.info).toHaveBeenCalledWith('Starting RFM Calculator Worker');
    });

    it('should run initial calculation after delay', async () => {
      mockAcquireRFMLock.mockResolvedValue('lock-token');
      (mockDb as any).schema.hasTable.mockResolvedValue(false);
      mockDbChain.pluck.mockResolvedValue([]);

      await rfmCalculatorWorker.start();

      // Advance timers by 5 seconds for initial calculation
      jest.advanceTimersByTime(5000);

      await Promise.resolve(); // flush promises

      expect(logger.info).toHaveBeenCalledWith('Running initial RFM calculation on startup');
    });
  });

  describe('stop', () => {
    it('should cancel scheduled job', async () => {
      await rfmCalculatorWorker.start();
      await rfmCalculatorWorker.stop();

      expect(mockCancelJob).toHaveBeenCalled();
    });

    it('should release all locks', async () => {
      await rfmCalculatorWorker.stop();

      expect(mockReleaseAll).toHaveBeenCalled();
    });

    it('should log stop message', async () => {
      await rfmCalculatorWorker.start();
      await rfmCalculatorWorker.stop();

      expect(logger.info).toHaveBeenCalledWith('RFM Calculator Worker stopped');
    });
  });

  describe('calculateAllVenueRFM', () => {
    it('should skip if lock cannot be acquired', async () => {
      mockAcquireRFMLock.mockResolvedValueOnce(null);

      await rfmCalculatorWorker.calculateAllVenueRFM();

      expect(logger.info).toHaveBeenCalledWith(
        'RFM calculation already running on another instance, skipping...'
      );
    });

    it('should acquire distributed lock', async () => {
      mockAcquireRFMLock.mockResolvedValueOnce('lock-123');
      (mockDb as any).schema.hasTable.mockResolvedValue(false);
      mockDbChain.pluck.mockResolvedValue([]);

      await rfmCalculatorWorker.calculateAllVenueRFM();

      expect(mockAcquireRFMLock).toHaveBeenCalledWith(undefined, {
        ttl: 300000,
        retryCount: 0,
      });
    });

    it('should release lock after completion', async () => {
      mockAcquireRFMLock.mockResolvedValueOnce('lock-123');
      (mockDb as any).schema.hasTable.mockResolvedValue(false);
      mockDbChain.pluck.mockResolvedValue([]);

      await rfmCalculatorWorker.calculateAllVenueRFM();

      expect(mockRelease).toHaveBeenCalledWith('lock-123');
    });

    it('should release lock even on error', async () => {
      mockAcquireRFMLock.mockResolvedValueOnce('lock-123');
      (mockDb as any).schema.hasTable.mockRejectedValueOnce(new Error('DB error'));

      await rfmCalculatorWorker.calculateAllVenueRFM();

      expect(mockRelease).toHaveBeenCalledWith('lock-123');
    });

    it('should get venues from venues table if exists', async () => {
      mockAcquireRFMLock.mockResolvedValueOnce('lock-123');
      (mockDb as any).schema.hasTable.mockResolvedValueOnce(true);
      mockDbChain.select.mockResolvedValueOnce([{ id: 'v1', name: 'Venue 1' }]);

      await rfmCalculatorWorker.calculateAllVenueRFM();

      expect(logger.info).toHaveBeenCalledWith('Calculating RFM for 1 venues');
    });
  });

  describe('scoring methods', () => {
    describe('scoreRecency', () => {
      it('should return 5 for 30 days or less', () => {
        expect((rfmCalculatorWorker as any).scoreRecency(30)).toBe(5);
        expect((rfmCalculatorWorker as any).scoreRecency(15)).toBe(5);
      });

      it('should return 4 for 31-60 days', () => {
        expect((rfmCalculatorWorker as any).scoreRecency(45)).toBe(4);
        expect((rfmCalculatorWorker as any).scoreRecency(60)).toBe(4);
      });

      it('should return 3 for 61-90 days', () => {
        expect((rfmCalculatorWorker as any).scoreRecency(75)).toBe(3);
        expect((rfmCalculatorWorker as any).scoreRecency(90)).toBe(3);
      });

      it('should return 2 for 91-180 days', () => {
        expect((rfmCalculatorWorker as any).scoreRecency(120)).toBe(2);
        expect((rfmCalculatorWorker as any).scoreRecency(180)).toBe(2);
      });

      it('should return 1 for more than 180 days', () => {
        expect((rfmCalculatorWorker as any).scoreRecency(181)).toBe(1);
        expect((rfmCalculatorWorker as any).scoreRecency(365)).toBe(1);
      });
    });

    describe('scoreFrequency', () => {
      it('should return 5 for 10+ purchases', () => {
        expect((rfmCalculatorWorker as any).scoreFrequency(10)).toBe(5);
        expect((rfmCalculatorWorker as any).scoreFrequency(25)).toBe(5);
      });

      it('should return 4 for 7-9 purchases', () => {
        expect((rfmCalculatorWorker as any).scoreFrequency(7)).toBe(4);
        expect((rfmCalculatorWorker as any).scoreFrequency(9)).toBe(4);
      });

      it('should return 3 for 4-6 purchases', () => {
        expect((rfmCalculatorWorker as any).scoreFrequency(4)).toBe(3);
        expect((rfmCalculatorWorker as any).scoreFrequency(6)).toBe(3);
      });

      it('should return 2 for 2-3 purchases', () => {
        expect((rfmCalculatorWorker as any).scoreFrequency(2)).toBe(2);
        expect((rfmCalculatorWorker as any).scoreFrequency(3)).toBe(2);
      });

      it('should return 1 for 1 purchase', () => {
        expect((rfmCalculatorWorker as any).scoreFrequency(1)).toBe(1);
      });
    });

    describe('determineSegment', () => {
      it('should return VIP for score >= 12', () => {
        expect((rfmCalculatorWorker as any).determineSegment(12, 30)).toBe('VIP');
        expect((rfmCalculatorWorker as any).determineSegment(15, 30)).toBe('VIP');
      });

      it('should return Regular for score 8-11', () => {
        expect((rfmCalculatorWorker as any).determineSegment(8, 30)).toBe('Regular');
        expect((rfmCalculatorWorker as any).determineSegment(11, 30)).toBe('Regular');
      });

      it('should return At-Risk for score 5-7 with recent activity', () => {
        expect((rfmCalculatorWorker as any).determineSegment(5, 90)).toBe('At-Risk');
        expect((rfmCalculatorWorker as any).determineSegment(7, 180)).toBe('At-Risk');
      });

      it('should return Lost for low score or old activity', () => {
        expect((rfmCalculatorWorker as any).determineSegment(4, 30)).toBe('Lost');
        expect((rfmCalculatorWorker as any).determineSegment(6, 200)).toBe('Lost');
      });
    });

    describe('calculateChurnRisk', () => {
      it('should return high for >180 days and 3+ purchases', () => {
        expect((rfmCalculatorWorker as any).calculateChurnRisk(200, 3)).toBe('high');
        expect((rfmCalculatorWorker as any).calculateChurnRisk(365, 5)).toBe('high');
      });

      it('should return medium for >90 days and 2+ purchases', () => {
        expect((rfmCalculatorWorker as any).calculateChurnRisk(100, 2)).toBe('medium');
        expect((rfmCalculatorWorker as any).calculateChurnRisk(150, 3)).toBe('medium');
      });

      it('should return low otherwise', () => {
        expect((rfmCalculatorWorker as any).calculateChurnRisk(30, 5)).toBe('low');
        expect((rfmCalculatorWorker as any).calculateChurnRisk(60, 1)).toBe('low');
      });
    });
  });
});
