// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/services/anomaly-detector.service.ts
 */

jest.mock('../../../src/config/database');
jest.mock('../../../src/config/redis');
jest.mock('../../../src/utils/logger');

describe('src/services/anomaly-detector.service.ts - Comprehensive Unit Tests', () => {
  let AnomalyDetectorService: any;
  let getPool: any;
  let getRedis: any;
  let logger: any;
  let mockPool: any;
  let mockRedis: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };

    // Mock pool
    mockPool = {
      query: jest.fn(),
    };

    // Mock Redis
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
    };

    // Import mocked modules
    ({ getPool } = require('../../../src/config/database'));
    ({ getRedis } = require('../../../src/config/redis'));
    logger = require('../../../src/utils/logger').default;

    getPool.mockReturnValue(mockPool);
    getRedis.mockReturnValue(mockRedis);

    // Import class under test
    AnomalyDetectorService = require('../../../src/services/anomaly-detector.service').default;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // Constructor
  // =============================================================================

  describe('constructor()', () => {
    it('should initialize with database pool and redis', () => {
      const service = new AnomalyDetectorService();

      expect(service.pool).toBe(mockPool);
      expect(service.redis).toBe(mockRedis);
      expect(getPool).toHaveBeenCalled();
      expect(getRedis).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // analyzeScan()
  // =============================================================================

  describe('analyzeScan()', () => {
    const timestamp = new Date('2024-01-15T14:30:00Z');

    it('should detect no anomalies when all checks pass', async () => {
      // Mock all detection methods to return null
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1', devices: ['device-1'] }] }) // screenshot
        .mockResolvedValueOnce({ rows: [{ device_count: '1', devices: ['device-1'] }] }) // duplicate
        .mockResolvedValueOnce({ rows: [{ total: '5', denied: '1' }] }); // pattern

      const service = new AnomalyDetectorService();
      const result = await service.analyzeScan('ticket-123', 'device-1', timestamp);

      expect(result.detected).toBe(false);
      expect(result.anomalies).toHaveLength(0);
      expect(result.riskScore).toBe(0);
    });

    it('should detect screenshot fraud anomaly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '5', devices: ['device-1', 'device-2'] }] }) // screenshot - DETECTED
        .mockResolvedValueOnce({ rows: [{ device_count: '1', devices: ['device-1'] }] }) // duplicate
        .mockResolvedValueOnce({ rows: [{ total: '5', denied: '1' }] }); // pattern

      const service = new AnomalyDetectorService();
      const result = await service.analyzeScan('ticket-123', 'device-1', timestamp);

      expect(result.detected).toBe(true);
      expect(result.anomalies).toHaveLength(1);
      expect(result.anomalies[0].type).toBe('screenshot_fraud');
      expect(result.anomalies[0].severity).toBe('critical'); // multiple devices
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should detect multiple anomalies', async () => {
      const earlyMorning = new Date('2024-01-15T03:00:00Z'); // 3 AM - timing anomaly
      
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '5', devices: ['device-1'] }] }) // screenshot - DETECTED
        .mockResolvedValueOnce({ rows: [{ device_count: '3', devices: ['d1', 'd2', 'd3'] }] }) // duplicate - DETECTED
        .mockResolvedValueOnce({ rows: [{ total: '20', denied: '15' }] }); // pattern - DETECTED

      const service = new AnomalyDetectorService();
      const result = await service.analyzeScan('ticket-123', 'device-1', earlyMorning);

      expect(result.detected).toBe(true);
      expect(result.anomalies.length).toBeGreaterThanOrEqual(3); // screenshot, duplicate, pattern, timing
      expect(result.riskScore).toBeGreaterThan(50);
    });

    it('should log and record high-risk anomalies', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '10', devices: ['d1', 'd2', 'd3'] }] }) // critical screenshot
        .mockResolvedValueOnce({ rows: [{ device_count: '5', devices: ['d1', 'd2', 'd3', 'd4', 'd5'] }] }) // high duplicate
        .mockResolvedValueOnce({ rows: [{ total: '20', denied: '18' }] }) // pattern
        .mockResolvedValueOnce({}); // INSERT anomaly record

      const service = new AnomalyDetectorService();
      const result = await service.analyzeScan('ticket-123', 'device-1', timestamp);

      expect(result.riskScore).toBeGreaterThan(70);
      expect(logger.warn).toHaveBeenCalledWith('High-risk anomaly detected', expect.objectContaining({
        ticketId: 'ticket-123',
        deviceId: 'device-1',
        riskScore: expect.any(Number),
      }));
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scan_anomalies'),
        expect.any(Array)
      );
    });

    it('should not log low-risk anomalies', async () => {
      const earlyMorning = new Date('2024-01-15T03:00:00Z'); // Only timing anomaly (low severity)
      
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1', devices: ['device-1'] }] })
        .mockResolvedValueOnce({ rows: [{ device_count: '1', devices: ['device-1'] }] })
        .mockResolvedValueOnce({ rows: [{ total: '5', denied: '1' }] });

      const service = new AnomalyDetectorService();
      const result = await service.analyzeScan('ticket-123', 'device-1', earlyMorning);

      expect(result.riskScore).toBeLessThan(70);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledTimes(3); // No INSERT query
    });

    it('should run all detection algorithms in parallel', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1', devices: ['device-1'] }] })
        .mockResolvedValueOnce({ rows: [{ device_count: '1', devices: ['device-1'] }] })
        .mockResolvedValueOnce({ rows: [{ total: '5', denied: '1' }] });

      const service = new AnomalyDetectorService();
      await service.analyzeScan('ticket-123', 'device-1', timestamp);

      // All 3 queries should have been called (parallel execution)
      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });
  });

  // =============================================================================
  // detectScreenshotFraud()
  // =============================================================================

  describe('detectScreenshotFraud()', () => {
    const timestamp = new Date('2024-01-15T14:30:00Z');

    it('should detect fraud when ticket scanned multiple times in 5 seconds', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5', devices: ['device-1'] }] });

      const service = new AnomalyDetectorService();
      const result = await service['detectScreenshotFraud']('ticket-123', 'device-1', timestamp);

      expect(result).not.toBeNull();
      expect(result.type).toBe('screenshot_fraud');
      expect(result.severity).toBe('high');
      expect(result.evidence.count).toBe(5);
    });

    it('should detect critical fraud when scanned on multiple devices', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '4', devices: ['device-1', 'device-2'] }] });

      const service = new AnomalyDetectorService();
      const result = await service['detectScreenshotFraud']('ticket-123', 'device-1', timestamp);

      expect(result).not.toBeNull();
      expect(result.severity).toBe('critical'); // Multiple devices
      expect(result.evidence.devices).toHaveLength(2);
    });

    it('should return null when no fraud detected', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1', devices: ['device-1'] }] });

      const service = new AnomalyDetectorService();
      const result = await service['detectScreenshotFraud']('ticket-123', 'device-1', timestamp);

      expect(result).toBeNull();
    });

    it('should query within 5 second window', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1', devices: ['device-1'] }] });

      const service = new AnomalyDetectorService();
      await service['detectScreenshotFraud']('ticket-123', 'device-1', timestamp);

      const fiveSecondsAgo = new Date(timestamp.getTime() - 5000);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('scanned_at > $2'),
        ['ticket-123', fiveSecondsAgo]
      );
    });

    it('should handle null devices array', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '2', devices: null }] });

      const service = new AnomalyDetectorService();
      const result = await service['detectScreenshotFraud']('ticket-123', 'device-1', timestamp);

      expect(result).toBeNull(); // count=2 but devices.length=0
    });
  });

  // =============================================================================
  // detectDuplicateDeviceScans()
  // =============================================================================

  describe('detectDuplicateDeviceScans()', () => {
    const timestamp = new Date('2024-01-15T14:30:00Z');

    it('should detect duplicate when scanned on multiple devices', async () => {
      mockPool.query.mockResolvedValueOnce({ 
        rows: [{ device_count: '4', devices: ['d1', 'd2', 'd3', 'd4'] }] 
      });

      const service = new AnomalyDetectorService();
      const result = await service['detectDuplicateDeviceScans']('ticket-123', timestamp);

      expect(result).not.toBeNull();
      expect(result.type).toBe('duplicate_device');
      expect(result.severity).toBe('high');
      expect(result.evidence.deviceCount).toBe(4);
      expect(result.evidence.devices).toHaveLength(4);
    });

    it('should return null when scanned on 2 or fewer devices', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ device_count: '2', devices: ['d1', 'd2'] }] });

      const service = new AnomalyDetectorService();
      const result = await service['detectDuplicateDeviceScans']('ticket-123', timestamp);

      expect(result).toBeNull();
    });

    it('should query within 1 minute window', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ device_count: '1', devices: ['d1'] }] });

      const service = new AnomalyDetectorService();
      await service['detectDuplicateDeviceScans']('ticket-123', timestamp);

      const oneMinuteAgo = new Date(timestamp.getTime() - 60000);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('scanned_at > $2'),
        ['ticket-123', oneMinuteAgo]
      );
    });
  });

  // =============================================================================
  // detectTimingAnomalies()
  // =============================================================================

  describe('detectTimingAnomalies()', () => {
    it('should detect anomaly at 2 AM', async () => {
      const earlyMorning = new Date('2024-01-15T02:00:00Z');

      const service = new AnomalyDetectorService();
      const result = await service['detectTimingAnomalies']('ticket-123', earlyMorning);

      expect(result).not.toBeNull();
      expect(result.type).toBe('timing');
      expect(result.severity).toBe('low');
      expect(result.evidence.hour).toBe(2);
    });

    it('should detect anomaly at 4 AM', async () => {
      const earlyMorning = new Date('2024-01-15T04:30:00Z');

      const service = new AnomalyDetectorService();
      const result = await service['detectTimingAnomalies']('ticket-123', earlyMorning);

      expect(result).not.toBeNull();
      expect(result.evidence.hour).toBe(4);
    });

    it('should not detect anomaly at 5 AM or later', async () => {
      const morning = new Date('2024-01-15T05:00:00Z');

      const service = new AnomalyDetectorService();
      const result = await service['detectTimingAnomalies']('ticket-123', morning);

      expect(result).toBeNull();
    });

    it('should not detect anomaly before 2 AM', async () => {
      const lateNight = new Date('2024-01-15T01:59:00Z');

      const service = new AnomalyDetectorService();
      const result = await service['detectTimingAnomalies']('ticket-123', lateNight);

      expect(result).toBeNull();
    });

    it('should not detect anomaly during normal hours', async () => {
      const normalTime = new Date('2024-01-15T14:30:00Z');

      const service = new AnomalyDetectorService();
      const result = await service['detectTimingAnomalies']('ticket-123', normalTime);

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // detectPatternAnomalies()
  // =============================================================================

  describe('detectPatternAnomalies()', () => {
    it('should detect pattern when device has high denial rate', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '20', denied: '15' }] });

      const service = new AnomalyDetectorService();
      const result = await service['detectPatternAnomalies']('ticket-123', 'device-1');

      expect(result).not.toBeNull();
      expect(result.type).toBe('pattern');
      expect(result.severity).toBe('medium');
      expect(result.evidence.denialRate).toBe(0.75); // 15/20
      expect(result.description).toContain('75%');
    });

    it('should return null when denial rate is acceptable', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '20', denied: '5' }] });

      const service = new AnomalyDetectorService();
      const result = await service['detectPatternAnomalies']('ticket-123', 'device-1');

      expect(result).toBeNull(); // 5/20 = 25% < 50%
    });

    it('should return null when total scans is too low', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '5', denied: '4' }] });

      const service = new AnomalyDetectorService();
      const result = await service['detectPatternAnomalies']('ticket-123', 'device-1');

      expect(result).toBeNull(); // total < 10
    });

    it('should query last hour of scans', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '10', denied: '3' }] });

      const service = new AnomalyDetectorService();
      await service['detectPatternAnomalies']('ticket-123', 'device-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("scanned_at > NOW() - INTERVAL '1 hour'"),
        ['device-1']
      );
    });
  });

  // =============================================================================
  // calculateRiskScore()
  // =============================================================================

  describe('calculateRiskScore()', () => {
    it('should return 0 for no anomalies', () => {
      const service = new AnomalyDetectorService();
      const score = service['calculateRiskScore']([]);

      expect(score).toBe(0);
    });

    it('should calculate score for single low severity anomaly', () => {
      const anomalies = [
        { severity: 'low', type: 'timing' }
      ];

      const service = new AnomalyDetectorService();
      const score = service['calculateRiskScore'](anomalies);

      expect(score).toBe(10); // low = 10
    });

    it('should calculate score for single critical anomaly', () => {
      const anomalies = [
        { severity: 'critical', type: 'screenshot_fraud' }
      ];

      const service = new AnomalyDetectorService();
      const score = service['calculateRiskScore'](anomalies);

      expect(score).toBe(100); // critical = 100
    });

    it('should calculate weighted score for multiple anomalies', () => {
      const anomalies = [
        { severity: 'high', type: 'screenshot_fraud' }, // 60
        { severity: 'medium', type: 'pattern' }, // 30
        { severity: 'low', type: 'timing' }, // 10
      ];

      const service = new AnomalyDetectorService();
      const score = service['calculateRiskScore'](anomalies);

      // 70% of max (60) + 30% of avg ((60+30+10)/3 = 33.33)
      // = 42 + 10 = 52
      expect(score).toBe(52);
    });

    it('should cap score at 100', () => {
      const anomalies = [
        { severity: 'critical', type: 'a' }, // 100
        { severity: 'critical', type: 'b' }, // 100
        { severity: 'critical', type: 'c' }, // 100
      ];

      const service = new AnomalyDetectorService();
      const score = service['calculateRiskScore'](anomalies);

      expect(score).toBe(100); // Capped at 100
    });

    it('should handle mix of all severity levels', () => {
      const anomalies = [
        { severity: 'critical', type: 'a' }, // 100
        { severity: 'high', type: 'b' }, // 60
        { severity: 'medium', type: 'c' }, // 30
        { severity: 'low', type: 'd' }, // 10
      ];

      const service = new AnomalyDetectorService();
      const score = service['calculateRiskScore'](anomalies);

      // Max = 100, Avg = (100+60+30+10)/4 = 50
      // 100*0.7 + 50*0.3 = 70 + 15 = 85
      expect(score).toBe(85);
    });
  });

  // =============================================================================
  // recordAnomaly()
  // =============================================================================

  describe('recordAnomaly()', () => {
    it('should insert anomaly record into database', async () => {
      mockPool.query.mockResolvedValueOnce({});

      const anomalies = [
        { 
          type: 'screenshot_fraud', 
          severity: 'high',
          description: 'Test',
          evidence: { count: 5 },
          timestamp: new Date()
        }
      ];

      const service = new AnomalyDetectorService();
      await service['recordAnomaly']('ticket-123', 'device-1', anomalies, 75);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scan_anomalies'),
        [
          'ticket-123',
          'device-1',
          ['screenshot_fraud'],
          75,
          expect.any(String) // JSON stringified anomalies
        ]
      );
    });

    it('should stringify anomalies as JSON in details', async () => {
      mockPool.query.mockResolvedValueOnce({});

      const anomalies = [
        { type: 'pattern', severity: 'medium', evidence: { test: 'data' } }
      ];

      const service = new AnomalyDetectorService();
      await service['recordAnomaly']('ticket-123', 'device-1', anomalies, 50);

      const jsonDetails = mockPool.query.mock.calls[0][1][4];
      const parsed = JSON.parse(jsonDetails);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('pattern');
    });

    it('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const anomalies = [{ type: 'timing', severity: 'low' }];

      const service = new AnomalyDetectorService();
      await service['recordAnomaly']('ticket-123', 'device-1', anomalies, 20);

      expect(logger.error).toHaveBeenCalledWith('Failed to record anomaly', expect.objectContaining({
        error: expect.any(Error),
        ticketId: 'ticket-123',
        deviceId: 'device-1',
      }));
    });

    it('should record multiple anomaly types', async () => {
      mockPool.query.mockResolvedValueOnce({});

      const anomalies = [
        { type: 'screenshot_fraud', severity: 'high' },
        { type: 'duplicate_device', severity: 'high' },
        { type: 'pattern', severity: 'medium' },
      ];

      const service = new AnomalyDetectorService();
      await service['recordAnomaly']('ticket-123', 'device-1', anomalies, 85);

      const anomalyTypes = mockPool.query.mock.calls[0][1][2];
      expect(anomalyTypes).toEqual(['screenshot_fraud', 'duplicate_device', 'pattern']);
    });
  });

  // =============================================================================
  // getAnomalyStats()
  // =============================================================================

  describe('getAnomalyStats()', () => {
    const timeRange = {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31'),
    };

    it('should return anomaly statistics', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{
        total_anomalies: '150',
        avg_risk_score: '45.5',
        screenshot_fraud_count: '30',
        duplicate_device_count: '20',
        high_risk_count: '10',
      }] });

      const service = new AnomalyDetectorService();
      const result = await service.getAnomalyStats('venue-123', timeRange);

      expect(result).toMatchObject({
        total_anomalies: '150',
        avg_risk_score: '45.5',
        screenshot_fraud_count: '30',
        duplicate_device_count: '20',
        high_risk_count: '10',
      });
    });

    it('should query with venue and time range', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{}] });

      const service = new AnomalyDetectorService();
      await service.getAnomalyStats('venue-123', timeRange);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE d.venue_id = $1'),
        ['venue-123', timeRange.start, timeRange.end]
      );
    });

    it('should use array operators for anomaly type filtering', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{}] });

      const service = new AnomalyDetectorService();
      await service.getAnomalyStats('venue-123', timeRange);

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('= ANY(anomaly_types)');
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{
        total_anomalies: '0',
        avg_risk_score: null,
        screenshot_fraud_count: '0',
        duplicate_device_count: '0',
        high_risk_count: '0',
      }] });

      const service = new AnomalyDetectorService();
      const result = await service.getAnomalyStats('venue-123', timeRange);

      expect(result.total_anomalies).toBe('0');
      expect(result.avg_risk_score).toBeNull();
    });
  });
});
