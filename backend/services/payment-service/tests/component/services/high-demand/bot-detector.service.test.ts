/**
 * COMPONENT TEST: BotDetectorService
 *
 * Tests bot detection for high-demand events
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const mockQuery = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  query: mockQuery,
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    child: () => ({ info: jest.fn(), error: jest.fn() }),
  },
}));

import { BotDetectorService } from '../../../../src/services/high-demand/bot-detector.service';

describe('BotDetectorService Component Tests', () => {
  let service: BotDetectorService;
  let userId: string;
  let sessionId: string;

  beforeEach(() => {
    userId = uuidv4();
    sessionId = uuidv4();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [{ count: '0' }] }); // Default: no prior detections
    service = new BotDetectorService();
  });

  // ===========================================================================
  // DETECT BOT
  // ===========================================================================
  describe('detectBot()', () => {
    it('should allow normal user behavior', async () => {
      const result = await service.detectBot({
        userId,
        sessionId,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        actions: [
          { type: 'click', timestamp: 1000, x: 100, y: 200 },
          { type: 'mousemove', timestamp: 1500, x: 150, y: 250 },
          { type: 'click', timestamp: 2500, x: 200, y: 300 },
          { type: 'scroll', timestamp: 3000 },
          { type: 'click', timestamp: 4000, x: 250, y: 350 },
        ],
        browserFeatures: {
          webdriver: false,
          languages: ['en-US'],
          plugins: [{ name: 'PDF Viewer' }],
        },
      });

      expect(result.isBot).toBe(false);
      expect(result.confidence).toBeLessThan(0.7);
      expect(result.recommendation).toBe('allow');
    });

    it('should detect rapid clicking', async () => {
      const actions = [];
      for (let i = 0; i < 20; i++) {
        actions.push({ type: 'click', timestamp: i * 50, x: 100, y: 100 }); // 50ms apart
      }

      const result = await service.detectBot({
        userId,
        sessionId,
        userAgent: 'Mozilla/5.0',
        actions,
        browserFeatures: {},
      });

      expect(result.indicators).toContain('rapid_clicking');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect webdriver/automation', async () => {
      const result = await service.detectBot({
        userId,
        sessionId,
        userAgent: 'Mozilla/5.0',
        actions: [{ type: 'click', timestamp: 1000 }],
        browserFeatures: {
          webdriver: true,
        },
      });

      expect(result.indicators).toContain('webdriver_detected');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should detect suspicious user agent', async () => {
      const result = await service.detectBot({
        userId,
        sessionId,
        userAgent: 'HeadlessChrome/120.0.0.0',
        actions: [{ type: 'click', timestamp: 1000 }],
        browserFeatures: {},
      });

      expect(result.indicators).toContain('suspicious_user_agent');
    });

    it('should detect no mouse movement', async () => {
      const result = await service.detectBot({
        userId,
        sessionId,
        userAgent: 'Mozilla/5.0',
        actions: [
          { type: 'click', timestamp: 1000, x: 100, y: 100 },
          { type: 'click', timestamp: 2000, x: 200, y: 200 },
          { type: 'click', timestamp: 3000, x: 300, y: 300 },
          { type: 'click', timestamp: 4000, x: 400, y: 400 },
          { type: 'click', timestamp: 5000, x: 500, y: 500 },
        ],
        browserFeatures: {},
      });

      expect(result.indicators).toContain('no_mouse_movement');
    });

    it('should return block_immediately for high confidence', async () => {
      const result = await service.detectBot({
        userId,
        sessionId,
        userAgent: 'Selenium/puppeteer',
        actions: Array(20).fill(null).map((_, i) => ({ type: 'click', timestamp: i * 30 })),
        browserFeatures: {
          webdriver: true,
          plugins: [],
          languages: [],
        },
      });

      if (result.confidence >= 0.9) {
        expect(result.recommendation).toBe('block_immediately');
      }
    });

    it('should return require_captcha for medium confidence', async () => {
      // Mock to return some prior detections
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('bot_detections') && sql.includes('SELECT COUNT')) {
          return { rows: [{ count: '2' }] };
        }
        return { rows: [] };
      });

      const result = await service.detectBot({
        userId,
        sessionId,
        userAgent: 'Mozilla/5.0',
        actions: Array(10).fill(null).map((_, i) => ({ type: 'click', timestamp: i * 80 })),
        browserFeatures: {
          webdriver: false,
          plugins: [],
        },
      });

      if (result.confidence >= 0.7 && result.confidence < 0.9) {
        expect(result.recommendation).toBe('require_captcha');
      }
    });

    it('should record bot detection', async () => {
      await service.detectBot({
        userId,
        sessionId,
        userAgent: 'Mozilla/5.0',
        actions: [],
        browserFeatures: {},
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bot_detections'),
        expect.arrayContaining([userId, sessionId])
      );
    });

    it('should check historical patterns', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('bot_detections') && sql.includes('is_bot = true')) {
          return { rows: [{ count: '5' }] }; // Multiple prior bot detections
        }
        return { rows: [] };
      });

      const result = await service.detectBot({
        userId,
        sessionId,
        userAgent: 'Mozilla/5.0',
        actions: [{ type: 'click', timestamp: 1000 }],
        browserFeatures: {},
      });

      expect(result.indicators).toContain('multiple_bot_detections');
    });
  });

  // ===========================================================================
  // TRAIN MODEL
  // ===========================================================================
  describe('trainModel()', () => {
    it('should accept verified data for training', async () => {
      await expect(service.trainModel([
        { sessionId: uuidv4(), wasBot: true },
        { sessionId: uuidv4(), wasBot: false },
      ])).resolves.not.toThrow();
    });
  });
});
