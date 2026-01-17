// Mock TensorFlow - must be defined inline to avoid hoisting issues
jest.mock('@tensorflow/tfjs-node', () => {
  const mockModel = {
    compile: jest.fn(),
    predict: jest.fn(),
  };

  return {
    sequential: jest.fn().mockReturnValue(mockModel),
    layers: {
      dense: jest.fn().mockReturnValue({}),
      dropout: jest.fn().mockReturnValue({}),
      lstm: jest.fn().mockReturnValue({}),
    },
    train: {
      adam: jest.fn().mockReturnValue({}),
    },
    tensor2d: jest.fn().mockReturnValue({
      dispose: jest.fn(),
    }),
    __mockModel: mockModel, // Expose for test access
  };
});

// Mock Kafka producer
jest.mock('../../../src/streaming/kafka-producer', () => ({
  kafkaProducer: {
    sendFraudEvent: jest.fn().mockResolvedValue(undefined),
    sendMetric: jest.fn().mockResolvedValue(undefined),
    sendAlert: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock database
jest.mock('../../../src/utils/database', () => ({
  pgPool: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { AdvancedFraudDetector } from '../../../src/analytics/advanced-fraud-ml';
import { kafkaProducer } from '../../../src/streaming/kafka-producer';
import { logger } from '../../../src/utils/logger';
import * as tf from '@tensorflow/tfjs-node';

describe('AdvancedFraudDetector', () => {
  let fraudDetector: AdvancedFraudDetector;
  let mockModel: any;

  const createMockUserData = (overrides = {}) => ({
    user_id: 'user-123',
    ip_address: '203.0.113.50',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
    request_count: 5,
    time_between_requests: 10,
    unique_events_targeted: 2,
    total_tickets_attempted: 4,
    failed_attempts: 1,
    account_age_days: 365,
    payment_methods_used: 2,
    time_window_minutes: 60,
    mouse_movements: 100,
    keyboard_events: 50,
    multiple_ips_used: false,
    targeting_high_demand: false,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Get the mock model
    mockModel = (tf as any).__mockModel;

    // Setup default mock for prediction
    mockModel.predict.mockReturnValue({
      data: jest.fn().mockResolvedValue([0.3]),
      dispose: jest.fn(),
    });

    fraudDetector = new AdvancedFraudDetector();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize TensorFlow model', () => {
      expect(tf.sequential).toHaveBeenCalled();
      expect(mockModel.compile).toHaveBeenCalledWith({
        optimizer: expect.anything(),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy'],
      });
    });

    it('should log initialization message', () => {
      expect(logger.info).toHaveBeenCalledWith(
        '🧠 Advanced fraud detection neural network initialized'
      );
    });

    it('should start realtime analysis interval', () => {
      jest.advanceTimersByTime(30000);
      expect(logger.debug).toHaveBeenCalledWith('Running fraud analysis...');
    });
  });

  describe('detectFraud', () => {
    describe('low risk users', () => {
      it('should return low risk score for normal user behavior', async () => {
        mockModel.predict.mockReturnValue({
          data: jest.fn().mockResolvedValue([0.1]),
          dispose: jest.fn(),
        });

        const userData = createMockUserData();
        const result = await fraudDetector.detectFraud(userData);

        expect(result.riskScore).toBeLessThan(0.5);
        expect(result.patterns).toEqual([]);
        expect(result.userId).toBe('user-123');
      });

      it('should not send Kafka event for low risk', async () => {
        mockModel.predict.mockReturnValue({
          data: jest.fn().mockResolvedValue([0.1]),
          dispose: jest.fn(),
        });

        const userData = createMockUserData();
        await fraudDetector.detectFraud(userData);

        expect(kafkaProducer.sendFraudEvent).not.toHaveBeenCalled();
      });
    });

    describe('high risk users', () => {
      it('should detect high velocity pattern', async () => {
        mockModel.predict.mockReturnValue({
          data: jest.fn().mockResolvedValue([0.5]),
          dispose: jest.fn(),
        });

        const userData = createMockUserData({
          request_count: 50, // High velocity
        });

        const result = await fraudDetector.detectFraud(userData);

        expect(result.patterns).toContain('high_velocity');
        expect(result.riskScore).toBeGreaterThan(0.5);
      });

      it('should detect suspicious IP pattern for VPN', async () => {
        mockModel.predict.mockReturnValue({
          data: jest.fn().mockResolvedValue([0.4]),
          dispose: jest.fn(),
        });

        const userData = createMockUserData({
          ip_address: '10.0.0.1', // VPN range
        });

        const result = await fraudDetector.detectFraud(userData);

        expect(result.patterns).toContain('suspicious_ip');
      });

      it('should detect scalper behavior', async () => {
        mockModel.predict.mockReturnValue({
          data: jest.fn().mockResolvedValue([0.3]),
          dispose: jest.fn(),
        });

        const userData = createMockUserData({
          time_between_requests: 0.5, // Very fast
          total_tickets_attempted: 20, // Many tickets
          multiple_ips_used: true,
          mouse_movements: 0, // No mouse = automation
          keyboard_events: 0,
          targeting_high_demand: true,
        });

        const result = await fraudDetector.detectFraud(userData);

        expect(result.patterns).toContain('scalper_behavior');
      });

      it('should send Kafka event for high risk (>0.7)', async () => {
        mockModel.predict.mockReturnValue({
          data: jest.fn().mockResolvedValue([0.8]),
          dispose: jest.fn(),
        });

        const userData = createMockUserData({
          request_count: 50,
        });

        await fraudDetector.detectFraud(userData);

        expect(kafkaProducer.sendFraudEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-123',
            riskLevel: expect.stringMatching(/high|critical/),
          })
        );
      });

      it('should mark as critical when risk > 0.9', async () => {
        mockModel.predict.mockReturnValue({
          data: jest.fn().mockResolvedValue([0.95]),
          dispose: jest.fn(),
        });

        const userData = createMockUserData({
          request_count: 100,
          ip_address: '10.0.0.1',
        });

        await fraudDetector.detectFraud(userData);

        expect(kafkaProducer.sendFraudEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            riskLevel: 'critical',
          })
        );
      });
    });

    describe('fraud pattern result', () => {
      it('should return complete FraudPattern object', async () => {
        mockModel.predict.mockReturnValue({
          data: jest.fn().mockResolvedValue([0.5]),
          dispose: jest.fn(),
        });

        const userData = createMockUserData();
        const result = await fraudDetector.detectFraud(userData);

        expect(result).toMatchObject({
          userId: 'user-123',
          ipAddress: '203.0.113.50',
          deviceFingerprint: expect.any(String),
          behaviorVector: expect.any(Array),
          riskScore: expect.any(Number),
          patterns: expect.any(Array),
          timestamp: expect.any(Date),
        });
      });

      it('should generate consistent fingerprint', async () => {
        mockModel.predict.mockReturnValue({
          data: jest.fn().mockResolvedValue([0.3]),
          dispose: jest.fn(),
        });

        const userData = createMockUserData();

        const result1 = await fraudDetector.detectFraud(userData);
        const result2 = await fraudDetector.detectFraud(userData);

        expect(result1.deviceFingerprint).toBe(result2.deviceFingerprint);
        expect(result1.deviceFingerprint).toHaveLength(64); // SHA256 hex
      });

      it('should extract correct number of features (10)', async () => {
        mockModel.predict.mockReturnValue({
          data: jest.fn().mockResolvedValue([0.3]),
          dispose: jest.fn(),
        });

        const userData = createMockUserData();
        const result = await fraudDetector.detectFraud(userData);

        expect(result.behaviorVector).toHaveLength(10);
      });
    });

    describe('error handling', () => {
      it('should log and throw error on prediction failure', async () => {
        mockModel.predict.mockReturnValue({
          data: jest.fn().mockRejectedValue(new Error('TensorFlow error')),
          dispose: jest.fn(),
        });

        const userData = createMockUserData();

        await expect(fraudDetector.detectFraud(userData)).rejects.toThrow('TensorFlow error');
        expect(logger.error).toHaveBeenCalledWith('Error detecting fraud:', expect.any(Error));
      });
    });
  });

  describe('feature extraction', () => {
    it('should detect VPN IP ranges', async () => {
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([0.3]),
        dispose: jest.fn(),
      });

      const vpnIPs = ['10.0.0.1', '172.16.0.1', '192.168.1.1'];

      for (const ip of vpnIPs) {
        const userData = createMockUserData({ ip_address: ip });
        const result = await fraudDetector.detectFraud(userData);

        // VPN detection adds to feature vector and increases risk
        expect(result.behaviorVector[5]).toBe(1); // isKnownVPN feature
      }
    });

    it('should detect non-VPN IP ranges', async () => {
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([0.3]),
        dispose: jest.fn(),
      });

      const publicIP = '203.0.113.50';
      const userData = createMockUserData({ ip_address: publicIP });
      const result = await fraudDetector.detectFraud(userData);

      expect(result.behaviorVector[5]).toBe(0); // Not a VPN
    });

    it('should detect suspicious user agents', async () => {
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([0.3]),
        dispose: jest.fn(),
      });

      const suspiciousAgents = [
        'curl/7.68.0',
        'wget/1.20.3',
        'python-requests/2.25.1 bot',
        'Scrapy/2.5.0',
        'Go-http-client spider',
      ];

      for (const agent of suspiciousAgents) {
        const userData = createMockUserData({ user_agent: agent });
        const result = await fraudDetector.detectFraud(userData);

        expect(result.behaviorVector[6]).toBe(1); // isSuspiciousUserAgent
      }
    });

    it('should not flag normal user agents', async () => {
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([0.3]),
        dispose: jest.fn(),
      });

      const normalAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Safari/604.1',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/89.0',
      ];

      for (const agent of normalAgents) {
        const userData = createMockUserData({ user_agent: agent });
        const result = await fraudDetector.detectFraud(userData);

        expect(result.behaviorVector[6]).toBe(0);
      }
    });

    it('should calculate velocity score correctly', async () => {
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([0.3]),
        dispose: jest.fn(),
      });

      // velocity = request_count / time_window_minutes / 100
      const userData = createMockUserData({
        request_count: 50,
        time_window_minutes: 10,
      });

      const result = await fraudDetector.detectFraud(userData);

      // 50 / 10 / 100 = 0.05
      expect(result.behaviorVector[9]).toBeCloseTo(0.05, 2);
    });

    it('should cap velocity score at 1', async () => {
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([0.3]),
        dispose: jest.fn(),
      });

      const userData = createMockUserData({
        request_count: 1000,
        time_window_minutes: 1,
      });

      const result = await fraudDetector.detectFraud(userData);

      expect(result.behaviorVector[9]).toBeLessThanOrEqual(1);
    });
  });

  describe('getFraudMetrics', () => {
    it('should return fraud metrics', async () => {
      const metrics = await fraudDetector.getFraudMetrics();

      expect(metrics).toMatchObject({
        high_risk_users: expect.any(Number),
        suspicious_ips: expect.any(Number),
        patterns_detected: expect.any(Number),
      });
    });
  });

  describe('automation detection', () => {
    it('should detect automation when no mouse/keyboard events', async () => {
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([0.3]),
        dispose: jest.fn(),
      });

      const userData = createMockUserData({
        mouse_movements: 0,
        keyboard_events: 0,
        time_between_requests: 0.5,
        total_tickets_attempted: 15,
        targeting_high_demand: true,
      });

      const result = await fraudDetector.detectFraud(userData);

      expect(result.patterns).toContain('scalper_behavior');
    });

    it('should not flag as automation with normal interaction', async () => {
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([0.1]),
        dispose: jest.fn(),
      });

      const userData = createMockUserData({
        mouse_movements: 150,
        keyboard_events: 80,
        time_between_requests: 30,
        total_tickets_attempted: 2,
      });

      const result = await fraudDetector.detectFraud(userData);

      expect(result.patterns).not.toContain('scalper_behavior');
    });
  });

  describe('risk score capping', () => {
    it('should never exceed risk score of 1', async () => {
      mockModel.predict.mockReturnValue({
        data: jest.fn().mockResolvedValue([0.9]),
        dispose: jest.fn(),
      });

      // Trigger all risk factors
      const userData = createMockUserData({
        request_count: 100,
        ip_address: '10.0.0.1',
        time_between_requests: 0.1,
        total_tickets_attempted: 50,
        multiple_ips_used: true,
        mouse_movements: 0,
        keyboard_events: 0,
        targeting_high_demand: true,
      });

      const result = await fraudDetector.detectFraud(userData);

      expect(result.riskScore).toBeLessThanOrEqual(1);
    });
  });
});
