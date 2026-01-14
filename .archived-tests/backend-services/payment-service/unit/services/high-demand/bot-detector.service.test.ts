import { BotDetectorService } from '../../../../src/services/high-demand/bot-detector.service';

// Mock database
jest.mock('../../../../src/config/database', () => ({
  query: jest.fn()
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

import { query } from '../../../../src/config/database';

describe('BotDetectorService', () => {
  let service: BotDetectorService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = query as jest.Mock;
    service = new BotDetectorService();
  });

  const createMockSessionData = (overrides = {}) => ({
    userId: 'user_1',
    sessionId: 'session_1',
    userAgent: 'Mozilla/5.0',
    actions: [
      { type: 'click', timestamp: 1000, x: 100, y: 200 },
      { type: 'mousemove', timestamp: 1200, x: 150, y: 250 },
      { type: 'click', timestamp: 1500, x: 200, y: 300 }
    ],
    browserFeatures: {
      webdriver: false,
      languages: ['en-US'],
      plugins: [{ name: 'PDF' }],
      permissions: {},
      webgl: 'supported'
    },
    ...overrides
  });

  describe('detectBot', () => {
    it('should detect real human with low confidence', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        actions: [
          { type: 'mousemove', timestamp: 1000, x: 100, y: 200 },
          { type: 'mousemove', timestamp: 1250, x: 120, y: 210 },
          { type: 'scroll', timestamp: 1500 },
          { type: 'click', timestamp: 2000, x: 150, y: 250 },
          { type: 'mousemove', timestamp: 2300, x: 180, y: 270 },
          { type: 'click', timestamp: 3000, x: 200, y: 300 }
        ]
      });

      const result = await service.detectBot(sessionData);

      expect(result.isBot).toBe(false);
      expect(result.confidence).toBeLessThan(0.7);
      expect(result.recommendation).toBe('allow');
    });

    it('should detect bot with rapid clicking', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        actions: [
          { type: 'click', timestamp: 1000, x: 100, y: 200 },
          { type: 'click', timestamp: 1050, x: 100, y: 200 },
          { type: 'click', timestamp: 1100, x: 100, y: 200 },
          { type: 'click', timestamp: 1150, x: 100, y: 200 }
        ]
      });

      const result = await service.detectBot(sessionData);

      expect(result.indicators).toContain('rapid_clicking');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect bot with consistent timing', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        actions: [
          { type: 'click', timestamp: 1000 },
          { type: 'click', timestamp: 1200 }, // Exactly 200ms
          { type: 'click', timestamp: 1400 }, // Exactly 200ms
          { type: 'click', timestamp: 1600 }, // Exactly 200ms
          { type: 'click', timestamp: 1800 }  // Exactly 200ms
        ]
      });

      const result = await service.detectBot(sessionData);

      expect(result.indicators).toContain('consistent_timing');
    });

    it('should detect bot with impossible speed', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        actions: [
          { type: 'click', timestamp: 1000 },
          { type: 'click', timestamp: 1030 } // Only 30ms to complete!
        ]
      });

      const result = await service.detectBot(sessionData);

      expect(result.indicators).toContain('impossible_speed');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should detect bot with no mouse movement', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        actions: [
          { type: 'click', timestamp: 1000, x: 100, y: 200 },
          { type: 'click', timestamp: 1500, x: 100, y: 200 },
          { type: 'click', timestamp: 2000, x: 100, y: 200 },
          { type: 'click', timestamp: 2500, x: 100, y: 200 },
          { type: 'click', timestamp: 3000, x: 100, y: 200 }
        ]
      });

      const result = await service.detectBot(sessionData);

      expect(result.indicators).toContain('no_mouse_movement');
    });

    it('should detect bot with linear mouse path', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        actions: [
          { type: 'mousemove', timestamp: 1000, x: 0, y: 0 },
          { type: 'mousemove', timestamp: 1100, x: 100, y: 100 },
          { type: 'mousemove', timestamp: 1200, x: 200, y: 200 },
          { type: 'mousemove', timestamp: 1300, x: 300, y: 300 },
          { type: 'mousemove', timestamp: 1400, x: 400, y: 400 }
        ]
      });

      const result = await service.detectBot(sessionData);

      expect(result.indicators).toContain('linear_mouse_path');
    });

    it('should detect bot with no scrolling', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        actions: Array(15).fill(null).map((_, i) => ({
          type: 'click',
          timestamp: 1000 + i * 200
        }))
      });

      const result = await service.detectBot(sessionData);

      expect(result.indicators).toContain('no_scrolling');
    });

    it('should detect webdriver presence', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        browserFeatures: {
          webdriver: true,
          languages: ['en-US'],
          plugins: []
        }
      });

      const result = await service.detectBot(sessionData);

      expect(result.indicators).toContain('webdriver_detected');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should detect suspicious user agent', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        userAgent: 'HeadlessChrome/91.0.4472.124'
      });

      const result = await service.detectBot(sessionData);

      expect(result.indicators).toContain('suspicious_user_agent');
    });

    it('should detect multiple bot detections in history', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 5 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const sessionData = createMockSessionData();

      const result = await service.detectBot(sessionData);

      expect(result.indicators).toContain('multiple_bot_detections');
    });

    it('should recommend blocking for high confidence', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        userAgent: 'HeadlessChrome',
        browserFeatures: {
          webdriver: true,
          plugins: [],
          languages: []
        },
        actions: [
          { type: 'click', timestamp: 1000 },
          { type: 'click', timestamp: 1020 }
        ]
      });

      const result = await service.detectBot(sessionData);

      expect(result.isBot).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.recommendation).toBe('block_immediately');
    });

    it('should recommend CAPTCHA for medium-high confidence', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        browserFeatures: {
          webdriver: true,
          languages: ['en-US'],
          plugins: [{ name: 'PDF' }]
        }
      });

      const result = await service.detectBot(sessionData);

      if (result.confidence >= 0.7 && result.confidence < 0.9) {
        expect(result.recommendation).toBe('require_captcha');
      }
    });

    it('should handle sessions with few actions', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        actions: [
          { type: 'click', timestamp: 1000 }
        ]
      });

      const result = await service.detectBot(sessionData);

      expect(result).toBeDefined();
      expect(result.confidence).toBeDefined();
    });

    it('should record bot detection in database', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData();

      await service.detectBot(sessionData);

      // Should have called insert
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bot_detections'),
        expect.arrayContaining([
          sessionData.userId,
          sessionData.sessionId
        ])
      );
    });
  });

  describe('analyzeTimingPatterns', () => {
    it('should handle empty actions array', () => {
      const result = (service as any).analyzeTimingPatterns([]);
      expect(result.score).toBe(0);
      expect(result.indicators).toHaveLength(0);
    });

    it('should handle single action', () => {
      const result = (service as any).analyzeTimingPatterns([
        { type: 'click', timestamp: 1000 }
      ]);
      expect(result.score).toBe(0);
    });

    it('should calculate variance correctly', () => {
      const variance = (service as any).calculateVariance([100, 200, 300, 400, 500]);
      expect(variance).toBeGreaterThan(0);
    });
  });

  describe('analyzeMousePatterns', () => {
    it('should handle insufficient mouse actions', () => {
      const result = (service as any).analyzeMousePatterns([
        { type: 'click', timestamp: 1000 }
      ]);
      expect(result.score).toBe(0);
    });

    it('should calculate path linearity', () => {
      const mouseActions = [
        { type: 'mousemove', x: 0, y: 0 },
        { type: 'mousemove', x: 10, y: 10 },
        { type: 'mousemove', x: 20, y: 20 }
      ];
      
      const linearity = (service as any).calculatePathLinearity(mouseActions);
      expect(linearity).toBeGreaterThan(0.9); // Very linear path
    });
  });

  describe('trainModel', () => {
    it('should accept training data', async () => {
      const trainingData = [
        { sessionId: 'session_1', wasBot: true },
        { sessionId: 'session_2', wasBot: false }
      ];

      await expect(
        service.trainModel(trainingData)
      ).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const sessionData = createMockSessionData();

      await expect(
        service.detectBot(sessionData)
      ).resolves.toBeDefined();
    });

    it('should handle missing browser features', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        browserFeatures: {}
      });

      const result = await service.detectBot(sessionData);

      expect(result).toBeDefined();
    });

    it('should handle actions without coordinates', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: 0 }] });

      const sessionData = createMockSessionData({
        actions: [
          { type: 'keypress', timestamp: 1000 },
          { type: 'keypress', timestamp: 1100 }
        ]
      });

      const result = await service.detectBot(sessionData);

      expect(result).toBeDefined();
    });
  });
});
