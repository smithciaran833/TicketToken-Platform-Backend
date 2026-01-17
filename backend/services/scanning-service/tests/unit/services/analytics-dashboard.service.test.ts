// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/services/analytics-dashboard.service.ts
 */

jest.mock('../../../src/config/database');
jest.mock('../../../src/config/redis');
jest.mock('../../../src/utils/logger');

describe('src/services/analytics-dashboard.service.ts - Comprehensive Unit Tests', () => {
  let AnalyticsDashboardService: any;
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
    AnalyticsDashboardService = require('../../../src/services/analytics-dashboard.service').default;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Helper to setup all queries for getDashboardMetrics
  const setupDashboardQueries = () => {
    mockPool.query
      // getRealtimeMetrics (3 queries)
      .mockResolvedValueOnce({ rows: [{ total: '50', allowed: '48', denied: '2', avg_time: '0.5' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ active_devices: '5' }] })
      // getHistoricalMetrics (3 queries)
      .mockResolvedValueOnce({ rows: [{ total_scans: '1000', unique_tickets: '500', allowed: '950', denied: '50' }] })
      .mockResolvedValueOnce({ rows: [{ hour: '18', count: '200' }] })
      .mockResolvedValueOnce({ rows: [] })
      // getDeviceMetrics (1 query)
      .mockResolvedValueOnce({ rows: [] })
      // getEntryPatterns (3 queries)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ reentry_tickets: '50', total_tickets: '500', avg_scans: '2' }] })
      // getAlerts (2 queries)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
  };

  // =============================================================================
  // Constructor
  // =============================================================================

  describe('constructor()', () => {
    it('should initialize with database pool', () => {
      const service = new AnalyticsDashboardService();

      expect(service.pool).toBe(mockPool);
      expect(getPool).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // getDashboardMetrics()
  // =============================================================================

  describe('getDashboardMetrics()', () => {
    const timeRange = {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31'),
    };

    it('should return comprehensive dashboard metrics', async () => {
      setupDashboardQueries();

      const service = new AnalyticsDashboardService();
      const result = await service.getDashboardMetrics('event-123', 'venue-456', timeRange);

      expect(result).toHaveProperty('realtime');
      expect(result).toHaveProperty('historical');
      expect(result).toHaveProperty('devices');
      expect(result).toHaveProperty('patterns');
      expect(result).toHaveProperty('alerts');
    });

    it('should call all sub-methods with correct parameters', async () => {
      setupDashboardQueries();

      const service = new AnalyticsDashboardService();
      await service.getDashboardMetrics('event-123', 'venue-456', timeRange);

      // Verify queries were made for each section (12 total)
      expect(mockPool.query).toHaveBeenCalledTimes(12);
    });

    it('should handle errors and log them', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const service = new AnalyticsDashboardService();

      await expect(service.getDashboardMetrics('event-123', 'venue-456', timeRange)).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Error fetching dashboard metrics', expect.objectContaining({
        eventId: 'event-123',
        error: expect.any(Error),
      }));
    });
  });

  // =============================================================================
  // getRealtimeMetrics()
  // =============================================================================

  describe('getRealtimeMetrics()', () => {
    it('should return realtime metrics with scan data', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '100', allowed: '95', denied: '5', avg_time: '0.75' }] })
        .mockResolvedValueOnce({ rows: [
          { reason: 'DUPLICATE', count: '3' },
          { reason: 'EXPIRED', count: '2' },
        ] })
        .mockResolvedValueOnce({ rows: [{ active_devices: '10' }] });

      const service = new AnalyticsDashboardService();
      const result = await service['getRealtimeMetrics']('event-123');

      expect(result.currentScansPerMinute).toBe(100);
      expect(result.activeDevices).toBe(10);
      expect(result.successRate).toBe(95);
      expect(result.avgResponseTime).toBe(0.75);
      expect(result.topDenialReasons).toHaveLength(2);
      expect(result.topDenialReasons[0]).toEqual({ reason: 'DUPLICATE', count: 3 });
    });

    it('should handle zero scans', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '0', allowed: '0', denied: '0', avg_time: null }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ active_devices: '0' }] });

      const service = new AnalyticsDashboardService();
      const result = await service['getRealtimeMetrics']('event-123');

      expect(result.currentScansPerMinute).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.avgResponseTime).toBe(0);
    });

    it('should query scans from last minute', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '50', allowed: '48', denied: '2', avg_time: '0.5' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ active_devices: '5' }] });

      const service = new AnalyticsDashboardService();
      await service['getRealtimeMetrics']('event-123');

      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).toContain('s.scanned_at > $2');
      expect(firstCall[1][0]).toBe('event-123');
      expect(firstCall[1][1]).toBeInstanceOf(Date);
    });

    it('should calculate success rate correctly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '200', allowed: '190', denied: '10', avg_time: '0.5' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ active_devices: '5' }] });

      const service = new AnalyticsDashboardService();
      const result = await service['getRealtimeMetrics']('event-123');

      expect(result.successRate).toBe(95); // 190/200 = 95%
    });
  });

  // =============================================================================
  // getHistoricalMetrics()
  // =============================================================================

  describe('getHistoricalMetrics()', () => {
    const timeRange = {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31'),
    };

    it('should return historical metrics with data', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ 
          total_scans: '5000', 
          unique_tickets: '2500', 
          allowed: '4750', 
          denied: '250' 
        }] })
        .mockResolvedValueOnce({ rows: [
          { hour: '18', count: '500' },
          { hour: '19', count: '450' },
        ] })
        .mockResolvedValueOnce({ rows: [
          { date: new Date('2024-01-15'), count: '300' },
          { date: new Date('2024-01-16'), count: '350' },
        ] });

      const service = new AnalyticsDashboardService();
      const result = await service['getHistoricalMetrics']('event-123', timeRange);

      expect(result.totalScans).toBe(5000);
      expect(result.uniqueTickets).toBe(2500);
      expect(result.allowedScans).toBe(4750);
      expect(result.deniedScans).toBe(250);
      expect(result.successRate).toBe(95); // 4750/5000
      expect(result.peakHour).toBe('18:00');
      expect(result.scansByHour).toHaveLength(2);
      expect(result.scansByDay).toHaveLength(2);
    });

    it('should handle no data', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total_scans: '0', unique_tickets: '0', allowed: '0', denied: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const service = new AnalyticsDashboardService();
      const result = await service['getHistoricalMetrics']('event-123', timeRange);

      expect(result.totalScans).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.peakHour).toBe('N/A');
      expect(result.scansByHour).toHaveLength(0);
    });

    it('should use time range in queries', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total_scans: '100', unique_tickets: '50', allowed: '95', denied: '5' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const service = new AnalyticsDashboardService();
      await service['getHistoricalMetrics']('event-123', timeRange);

      const firstCall = mockPool.query.mock.calls[0];
      expect(firstCall[0]).toContain('BETWEEN $2 AND $3');
      expect(firstCall[1][1]).toEqual(timeRange.start);
      expect(firstCall[1][2]).toEqual(timeRange.end);
    });

    it('should format dates correctly in scansByDay', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total_scans: '100', unique_tickets: '50', allowed: '95', denied: '5' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ date: new Date('2024-01-15T12:00:00Z'), count: '100' }] });

      const service = new AnalyticsDashboardService();
      const result = await service['getHistoricalMetrics']('event-123', timeRange);

      expect(result.scansByDay[0].date).toBe('2024-01-15');
    });
  });

  // =============================================================================
  // getDeviceMetrics()
  // =============================================================================

  describe('getDeviceMetrics()', () => {
    const timeRange = {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31'),
    };

    it('should return device metrics with status calculations', async () => {
      const now = Date.now();
      const recentScan = new Date(now - 2 * 60 * 1000); // 2 minutes ago
      const oldScan = new Date(now - 10 * 60 * 1000); // 10 minutes ago

      mockPool.query.mockResolvedValueOnce({ rows: [
        {
          device_id: 'device-1',
          device_name: 'Scanner 1',
          total_scans: '100',
          allowed: '95',
          avg_time: '0.5',
          last_scan: recentScan,
          is_active: true,
        },
        {
          device_id: 'device-2',
          device_name: 'Scanner 2',
          total_scans: '50',
          allowed: '48',
          avg_time: '0.6',
          last_scan: oldScan,
          is_active: true,
        },
        {
          device_id: 'device-3',
          device_name: 'Scanner 3',
          total_scans: '0',
          allowed: '0',
          avg_time: null,
          last_scan: null,
          is_active: false,
        },
      ] });

      const service = new AnalyticsDashboardService();
      const result = await service['getDeviceMetrics']('venue-123', timeRange);

      expect(result).toHaveLength(3);
      expect(result[0].deviceId).toBe('device-1');
      expect(result[0].status).toBe('active'); // Recent scan
      expect(result[1].status).toBe('idle'); // Old scan but active
      expect(result[2].status).toBe('offline'); // Not active
    });

    it('should calculate success rates correctly', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [
        {
          device_id: 'device-1',
          device_name: 'Scanner 1',
          total_scans: '200',
          allowed: '190',
          avg_time: '0.5',
          last_scan: new Date(),
          is_active: true,
        },
      ] });

      const service = new AnalyticsDashboardService();
      const result = await service['getDeviceMetrics']('venue-123', timeRange);

      expect(result[0].successRate).toBe(95); // 190/200
    });

    it('should handle devices with no scans', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [
        {
          device_id: 'device-1',
          device_name: 'Scanner 1',
          total_scans: '0',
          allowed: '0',
          avg_time: null,
          last_scan: null,
          is_active: true,
        },
      ] });

      const service = new AnalyticsDashboardService();
      const result = await service['getDeviceMetrics']('venue-123', timeRange);

      expect(result[0].successRate).toBe(0);
      expect(result[0].avgScanTime).toBe(0);
      expect(result[0].lastScan).toEqual(new Date(0));
    });

    it('should query by venue and time range', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const service = new AnalyticsDashboardService();
      await service['getDeviceMetrics']('venue-123', timeRange);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE d.venue_id = $1'),
        ['venue-123', timeRange.start, timeRange.end]
      );
    });
  });

  // =============================================================================
  // getEntryPatterns()
  // =============================================================================

  describe('getEntryPatterns()', () => {
    const timeRange = {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31'),
    };

    it('should return entry patterns with all data', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [
          { time: '18:30', count: '500' },
          { time: '19:00', count: '450' },
        ] })
        .mockResolvedValueOnce({ rows: [
          { zone: 'GA', count: '800' },
          { zone: 'VIP', count: '200' },
        ] })
        .mockResolvedValueOnce({ rows: [{ 
          reentry_tickets: '100', 
          total_tickets: '1000', 
          avg_scans: '1.2' 
        }] });

      const service = new AnalyticsDashboardService();
      const result = await service['getEntryPatterns']('event-123', timeRange);

      expect(result.peakTimes).toHaveLength(2);
      expect(result.peakTimes[0]).toEqual({ time: '18:30', count: 500 });
      expect(result.entryDistribution).toHaveLength(2);
      expect(result.entryDistribution[0]).toEqual({ zone: 'GA', count: 800 });
      expect(result.reentryRate).toBe(10); // 100/1000
      expect(result.avgScansPerTicket).toBe(1.2);
    });

    it('should handle no data', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ reentry_tickets: '0', total_tickets: '0', avg_scans: null }] });

      const service = new AnalyticsDashboardService();
      const result = await service['getEntryPatterns']('event-123', timeRange);

      expect(result.peakTimes).toHaveLength(0);
      expect(result.entryDistribution).toHaveLength(0);
      expect(result.reentryRate).toBe(0);
      expect(result.avgScansPerTicket).toBe(1);
    });

    it('should calculate re-entry rate correctly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ reentry_tickets: '250', total_tickets: '1000', avg_scans: '1.5' }] });

      const service = new AnalyticsDashboardService();
      const result = await service['getEntryPatterns']('event-123', timeRange);

      expect(result.reentryRate).toBe(25); // 250/1000
    });
  });

  // =============================================================================
  // getAlerts()
  // =============================================================================

  describe('getAlerts()', () => {
    it('should generate anomaly alerts for high denial rates', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [
          { reason: 'DUPLICATE', count: '60' },
          { reason: 'EXPIRED', count: '15' },
        ] })
        .mockResolvedValueOnce({ rows: [] });

      const service = new AnalyticsDashboardService();
      const result = await service['getAlerts']('event-123', 'venue-456');

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('anomaly');
      expect(result[0].severity).toBe('high'); // count > 50
      expect(result[0].message).toContain('DUPLICATE');
      expect(result[1].severity).toBe('medium'); // count <= 50
    });

    it('should generate performance alerts for devices with high denial rates', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [
          { device_name: 'Scanner 1', denied: '30', total: '50' },
        ] });

      const service = new AnalyticsDashboardService();
      const result = await service['getAlerts']('event-123', 'venue-456');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('performance');
      expect(result[0].severity).toBe('high');
      expect(result[0].message).toContain('Scanner 1');
      expect(result[0].message).toContain('30/50');
    });

    it('should return empty array when no alerts', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const service = new AnalyticsDashboardService();
      const result = await service['getAlerts']('event-123', 'venue-456');

      expect(result).toHaveLength(0);
    });

    it('should limit to 10 alerts', async () => {
      const manyAnomalies = Array(15).fill(null).map((_, i) => ({
        reason: `REASON_${i}`,
        count: '20',
      }));

      mockPool.query
        .mockResolvedValueOnce({ rows: manyAnomalies })
        .mockResolvedValueOnce({ rows: [] });

      const service = new AnalyticsDashboardService();
      const result = await service['getAlerts']('event-123', 'venue-456');

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should include metadata in alerts', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ reason: 'DUPLICATE', count: '60' }] })
        .mockResolvedValueOnce({ rows: [] });

      const service = new AnalyticsDashboardService();
      const result = await service['getAlerts']('event-123', 'venue-456');

      expect(result[0].metadata).toEqual({ reason: 'DUPLICATE', count: '60' });
      expect(result[0].timestamp).toBeInstanceOf(Date);
      expect(result[0].id).toContain('anomaly-DUPLICATE');
    });
  });

  // =============================================================================
  // exportAnalytics()
  // =============================================================================

  describe('exportAnalytics()', () => {
    const timeRange = {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31'),
    };

    const mockScanData = [
      {
        scanned_at: new Date('2024-01-15T10:30:00Z'),
        ticket_number: 'TKT-001',
        device_name: 'Scanner 1',
        zone: 'GA',
        result: 'ALLOW',
        reason: null,
      },
      {
        scanned_at: new Date('2024-01-15T10:31:00Z'),
        ticket_number: 'TKT-002',
        device_name: 'Scanner 2',
        zone: 'VIP',
        result: 'DENY',
        reason: 'DUPLICATE',
      },
    ];

    it('should export data as CSV by default', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: mockScanData });

      const service = new AnalyticsDashboardService();
      const result = await service.exportAnalytics('event-123', timeRange);

      expect(result).toContain('Timestamp,Ticket Number,Device,Zone,Result,Reason');
      expect(result).toContain('TKT-001');
      expect(result).toContain('Scanner 1');
      expect(result).toContain('ALLOW');
      expect(result.split('\n')).toHaveLength(3); // Header + 2 rows
    });

    it('should export data as JSON when specified', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: mockScanData });

      const service = new AnalyticsDashboardService();
      const result = await service.exportAnalytics('event-123', timeRange, 'json');

      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].ticket_number).toBe('TKT-001');
    });

    it('should handle empty data in CSV format', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const service = new AnalyticsDashboardService();
      const result = await service.exportAnalytics('event-123', timeRange, 'csv');

      expect(result).toBe('Timestamp,Ticket Number,Device,Zone,Result,Reason');
    });

    it('should handle empty data in JSON format', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const service = new AnalyticsDashboardService();
      const result = await service.exportAnalytics('event-123', timeRange, 'json');

      expect(result).toBe('[]');
    });

    it('should format timestamps as ISO strings in CSV', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: mockScanData });

      const service = new AnalyticsDashboardService();
      const result = await service.exportAnalytics('event-123', timeRange, 'csv');

      expect(result).toContain('2024-01-15T10:30:00');
    });

    it('should handle null reason in CSV', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockScanData[0]] });

      const service = new AnalyticsDashboardService();
      const result = await service.exportAnalytics('event-123', timeRange, 'csv');

      const lines = result.split('\n');
      expect(lines[1]).toMatch(/ALLOW,$/); // Ends with empty reason
    });

    it('should query with correct time range', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const service = new AnalyticsDashboardService();
      await service.exportAnalytics('event-123', timeRange, 'csv');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('BETWEEN $2 AND $3'),
        ['event-123', timeRange.start, timeRange.end]
      );
    });
  });
});
