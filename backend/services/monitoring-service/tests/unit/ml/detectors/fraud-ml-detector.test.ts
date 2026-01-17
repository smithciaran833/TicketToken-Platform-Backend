// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock database
jest.mock('../../../../src/utils/database', () => ({
  pgPool: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  },
}));

import { FraudMLDetector } from '../../../../src/ml/detectors/fraud-ml-detector';
import { logger } from '../../../../src/utils/logger';

describe('FraudMLDetector', () => {
  let detector: FraudMLDetector;

  beforeEach(() => {
    jest.clearAllMocks();
    detector = new FraudMLDetector();
  });

  describe('detectScalperPattern', () => {
    it('should return low score for normal activity', async () => {
      const data = {
        requestsPerMinute: 10,
        paymentMethodCount: 1,
        ticketCount: 2,
        geoDistance: 50,
        timestamps: [1000, 2500, 4200],
      };

      const result = await detector.detectScalperPattern(data);

      expect(result.pattern).toBe('scalper');
      expect(result.score).toBeLessThan(50);
      expect(result.indicators).toHaveLength(0);
    });

    it('should detect rapid request rate', async () => {
      const data = {
        requestsPerMinute: 100,
        paymentMethodCount: 1,
        ticketCount: 2,
        geoDistance: 50,
        timestamps: [1000, 2500, 4200],
      };

      const result = await detector.detectScalperPattern(data);

      expect(result.score).toBeGreaterThanOrEqual(30);
      expect(result.indicators).toContain('Rapid request rate');
    });

    it('should detect multiple payment methods', async () => {
      const data = {
        requestsPerMinute: 10,
        paymentMethodCount: 5,
        ticketCount: 2,
        geoDistance: 50,
        timestamps: [1000, 2500, 4200],
      };

      const result = await detector.detectScalperPattern(data);

      expect(result.score).toBeGreaterThanOrEqual(25);
      expect(result.indicators).toContain('Multiple payment methods');
    });

    it('should detect bulk ticket purchases', async () => {
      const data = {
        requestsPerMinute: 10,
        paymentMethodCount: 1,
        ticketCount: 15,
        geoDistance: 50,
        timestamps: [1000, 2500, 4200],
      };

      const result = await detector.detectScalperPattern(data);

      expect(result.score).toBeGreaterThanOrEqual(35);
      expect(result.indicators).toContain('Bulk purchase attempt');
    });

    it('should detect geographic anomaly', async () => {
      const data = {
        requestsPerMinute: 10,
        paymentMethodCount: 1,
        ticketCount: 2,
        geoDistance: 5000,
        timestamps: [1000, 2500, 4200],
      };

      const result = await detector.detectScalperPattern(data);

      expect(result.score).toBeGreaterThanOrEqual(20);
      expect(result.indicators).toContain('Geographic anomaly');
    });

    it('should detect automated timing pattern', async () => {
      const data = {
        requestsPerMinute: 10,
        paymentMethodCount: 1,
        ticketCount: 2,
        geoDistance: 50,
        timestamps: [1000, 2000, 3000, 4000, 5000], // Exactly 1 second intervals
      };

      const result = await detector.detectScalperPattern(data);

      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.indicators).toContain('Automated timing pattern');
    });

    it('should detect multiple patterns and combine scores', async () => {
      const data = {
        requestsPerMinute: 100,
        paymentMethodCount: 5,
        ticketCount: 20,
        geoDistance: 5000,
        timestamps: [1000, 2000, 3000, 4000, 5000],
      };

      const result = await detector.detectScalperPattern(data);

      expect(result.score).toBe(100); // Capped at 100
      expect(result.indicators.length).toBeGreaterThanOrEqual(4);
    });

    it('should cap score at 100', async () => {
      const data = {
        requestsPerMinute: 100,
        paymentMethodCount: 10,
        ticketCount: 50,
        geoDistance: 10000,
        timestamps: [1000, 2000, 3000, 4000, 5000],
      };

      const result = await detector.detectScalperPattern(data);

      expect(result.score).toBe(100);
    });
  });

  describe('detectBotActivity', () => {
    it('should return low score for normal user activity', async () => {
      const data = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
        mouseMovements: 150,
        keypressInterval: 200,
        sessionDuration: 120,
      };

      const result = await detector.detectBotActivity(data);

      expect(result.pattern).toBe('bot');
      expect(result.score).toBeLessThan(50);
      expect(result.indicators).toHaveLength(0);
    });

    it('should detect bot user agent', async () => {
      const data = {
        userAgent: 'Googlebot/2.1',
        mouseMovements: 150,
        keypressInterval: 200,
        sessionDuration: 120,
      };

      const result = await detector.detectBotActivity(data);

      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.indicators).toContain('Bot user agent');
    });

    it('should detect missing user agent', async () => {
      const data = {
        userAgent: null,
        mouseMovements: 150,
        keypressInterval: 200,
        sessionDuration: 120,
      };

      const result = await detector.detectBotActivity(data);

      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.indicators).toContain('Bot user agent');
    });

    it('should detect no mouse movements', async () => {
      const data = {
        userAgent: 'Mozilla/5.0',
        mouseMovements: 0,
        keypressInterval: 200,
        sessionDuration: 120,
      };

      const result = await detector.detectBotActivity(data);

      expect(result.score).toBeGreaterThanOrEqual(30);
      expect(result.indicators).toContain('No mouse movements');
    });

    it('should detect inhuman typing speed', async () => {
      const data = {
        userAgent: 'Mozilla/5.0',
        mouseMovements: 150,
        keypressInterval: 5,
        sessionDuration: 120,
      };

      const result = await detector.detectBotActivity(data);

      expect(result.score).toBeGreaterThanOrEqual(25);
      expect(result.indicators).toContain('Inhuman typing speed');
    });

    it('should detect extremely short session', async () => {
      const data = {
        userAgent: 'Mozilla/5.0',
        mouseMovements: 150,
        keypressInterval: 200,
        sessionDuration: 2,
      };

      const result = await detector.detectBotActivity(data);

      expect(result.score).toBeGreaterThanOrEqual(20);
      expect(result.indicators).toContain('Extremely short session');
    });

    it('should detect multiple bot indicators', async () => {
      const data = {
        userAgent: 'bot',
        mouseMovements: 0,
        keypressInterval: 5,
        sessionDuration: 2,
      };

      const result = await detector.detectBotActivity(data);

      expect(result.score).toBe(100);
      expect(result.indicators.length).toBe(4);
    });
  });

  describe('detectTimePattern', () => {
    it('should return false for insufficient timestamps', () => {
      const result = (detector as any).detectTimePattern([1000, 2000]);

      expect(result).toBe(false);
    });

    it('should detect automated consistent intervals', () => {
      const timestamps = [1000, 2000, 3000, 4000, 5000];
      const result = (detector as any).detectTimePattern(timestamps);

      expect(result).toBe(true);
    });

    it('should not flag random intervals as automated', () => {
      const timestamps = [1000, 2500, 3100, 5000, 7500];
      const result = (detector as any).detectTimePattern(timestamps);

      expect(result).toBe(false);
    });
  });

  describe('calculateConfidence', () => {
    it('should return low confidence for low score', () => {
      const confidence = (detector as any).calculateConfidence(10, 1);

      expect(confidence).toBeLessThan(0.5);
    });

    it('should return high confidence for high score and many indicators', () => {
      const confidence = (detector as any).calculateConfidence(90, 5);

      expect(confidence).toBeGreaterThan(0.8);
    });

    it('should cap indicator contribution at 5', () => {
      const conf5 = (detector as any).calculateConfidence(50, 5);
      const conf10 = (detector as any).calculateConfidence(50, 10);

      expect(conf5).toBe(conf10);
    });
  });

  describe('trainOnHistoricalFraud', () => {
    it('should log training start', async () => {
      jest.useFakeTimers();

      await detector.trainOnHistoricalFraud();

      expect(logger.info).toHaveBeenCalledWith(
        'Training fraud ML detector on historical data...'
      );

      jest.advanceTimersByTime(2000);

      expect(logger.info).toHaveBeenCalledWith('Fraud ML detector training complete');

      jest.useRealTimers();
    });
  });
});
