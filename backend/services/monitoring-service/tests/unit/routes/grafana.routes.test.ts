// Mock dependencies BEFORE imports
const mockQuery = jest.fn();
const mockPgPool = {
  query: mockQuery,
};

jest.mock('../../../src/utils/database', () => ({
  pgPool: mockPgPool,
}));

const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import grafanaRoutes from '../../../src/routes/grafana.routes';

describe('grafanaRoutes', () => {
  let mockServer: Partial<FastifyInstance>;
  let registeredRoutes: Map<string, Function>;
  let getSpy: jest.Mock;
  let postSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = new Map();

    getSpy = jest.fn((path, handler) => {
      registeredRoutes.set(`GET ${path}`, handler);
    });

    postSpy = jest.fn((path, handler) => {
      registeredRoutes.set(`POST ${path}`, handler);
    });

    mockServer = {
      get: getSpy,
      post: postSpy,
    };
  });

  describe('route registration', () => {
    it('should register GET / for health check', async () => {
      await grafanaRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/', expect.any(Function));
      expect(registeredRoutes.has('GET /')).toBe(true);
    });

    it('should register POST /search for metrics search', async () => {
      await grafanaRoutes(mockServer as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/search', expect.any(Function));
      expect(registeredRoutes.has('POST /search')).toBe(true);
    });

    it('should register POST /query for time series data', async () => {
      await grafanaRoutes(mockServer as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/query', expect.any(Function));
      expect(registeredRoutes.has('POST /query')).toBe(true);
    });

    it('should register POST /annotations', async () => {
      await grafanaRoutes(mockServer as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/annotations', expect.any(Function));
      expect(registeredRoutes.has('POST /annotations')).toBe(true);
    });

    it('should register all 4 routes', async () => {
      await grafanaRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledTimes(3);
      expect(registeredRoutes.size).toBe(4);
    });
  });

  describe('GET / handler (health check)', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(async () => {
      await grafanaRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('GET /')!;

      mockRequest = {};
      mockReply = {};
    });

    it('should return ok status', async () => {
      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('POST /search handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(async () => {
      await grafanaRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('POST /search')!;

      mockRequest = { body: {} };
      mockReply = {};
    });

    it('should return list of metric names', async () => {
      const mockRows = [
        { metric_name: 'cpu_usage' },
        { metric_name: 'memory_usage' },
        { metric_name: 'disk_io' },
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await handler(mockRequest, mockReply);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT DISTINCT metric_name FROM metrics ORDER BY metric_name'
      );
      expect(result).toEqual(['cpu_usage', 'memory_usage', 'disk_io']);
    });

    it('should return empty array when no metrics exist', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const error = new Error('Database connection failed');
      mockQuery.mockRejectedValue(error);

      const result = await handler(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith('Grafana search error:', error);
      expect(result).toEqual([]);
    });

    it('should return distinct metric names only', async () => {
      const mockRows = [
        { metric_name: 'cpu_usage' },
        { metric_name: 'cpu_usage' }, // Duplicate should be filtered by SQL
        { metric_name: 'memory_usage' },
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveLength(3);
    });
  });

  describe('POST /query handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(async () => {
      await grafanaRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('POST /query')!;

      mockRequest = {
        body: {
          targets: [{ target: 'cpu_usage' }],
          range: {
            from: '2024-01-01T00:00:00Z',
            to: '2024-01-01T23:59:59Z',
          },
        },
      };
      mockReply = {};
    });

    it('should return time series data for single target', async () => {
      const mockRows = [
        { time: '1704067200000', value: '45.5' },
        { time: '1704067260000', value: '48.2' },
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual([
        {
          target: 'cpu_usage',
          datapoints: [
            [45.5, 1704067200000],
            [48.2, 1704067260000],
          ],
        },
      ]);
    });

    it('should handle multiple targets', async () => {
      mockRequest.body = {
        targets: [{ target: 'cpu_usage' }, { target: 'memory_usage' }],
        range: {
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-01T23:59:59Z',
        },
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ time: '1704067200000', value: '45.5' }] })
        .mockResolvedValueOnce({ rows: [{ time: '1704067200000', value: '62.3' }] });

      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveLength(2);
      expect(result[0].target).toBe('cpu_usage');
      expect(result[1].target).toBe('memory_usage');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should query with correct time range', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await handler(mockRequest, mockReply);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'cpu_usage',
          expect.any(Date),
          expect.any(Date),
        ])
      );
    });

    it('should handle empty results', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual([
        {
          target: 'cpu_usage',
          datapoints: [],
        },
      ]);
    });

    it('should handle database errors gracefully', async () => {
      const error = new Error('Query timeout');
      mockQuery.mockRejectedValue(error);

      const result = await handler(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith('Grafana query error:', error);
      expect(result).toEqual([]);
    });

    it('should convert values to numbers', async () => {
      const mockRows = [
        { time: '1704067200000', value: '100.5' },
        { time: '1704067260000', value: '200' },
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await handler(mockRequest, mockReply);

      expect(result[0].datapoints[0][0]).toBe(100.5);
      expect(result[0].datapoints[1][0]).toBe(200);
    });

    it('should convert timestamps to integers', async () => {
      const mockRows = [{ time: '1704067200000', value: '50' }];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await handler(mockRequest, mockReply);

      expect(result[0].datapoints[0][1]).toBe(1704067200000);
      expect(typeof result[0].datapoints[0][1]).toBe('number');
    });
  });

  describe('POST /annotations handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(async () => {
      await grafanaRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('POST /annotations')!;

      mockRequest = {
        body: {
          range: {
            from: '2024-01-01T00:00:00Z',
            to: '2024-01-01T23:59:59Z',
          },
          annotation: {},
        },
      };
      mockReply = {};
    });

    it('should return fraud detection events as annotations', async () => {
      const mockRows = [
        { time: '1704067200000', title: 'fraud_high_risk', text: '8.5' },
        { time: '1704067260000', title: 'fraud_suspicious', text: '6.2' },
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual([
        {
          time: 1704067200000,
          title: 'fraud_high_risk',
          text: 'Value: 8.5',
          tags: ['fraud', 'alert'],
        },
        {
          time: 1704067260000,
          title: 'fraud_suspicious',
          text: 'Value: 6.2',
          tags: ['fraud', 'alert'],
        },
      ]);
    });

    it('should only return fraud metrics with value > 5', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await handler(mockRequest, mockReply);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('value > 5'),
        expect.any(Array)
      );
    });

    it('should only return fraud-related metrics', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await handler(mockRequest, mockReply);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("metric_name LIKE 'fraud_%'"),
        expect.any(Array)
      );
    });

    it('should query with correct time range', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await handler(mockRequest, mockReply);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.any(Date), expect.any(Date)])
      );
    });

    it('should handle empty results', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await handler(mockRequest, mockReply);

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const error = new Error('Database error');
      mockQuery.mockRejectedValue(error);

      const result = await handler(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith('Grafana annotations error:', error);
      expect(result).toEqual([]);
    });

    it('should include fraud and alert tags', async () => {
      const mockRows = [{ time: '1704067200000', title: 'fraud_detected', text: '10' }];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await handler(mockRequest, mockReply);

      expect(result[0].tags).toEqual(['fraud', 'alert']);
    });

    it('should format text with value', async () => {
      const mockRows = [{ time: '1704067200000', title: 'fraud_high', text: '9.5' }];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await handler(mockRequest, mockReply);

      expect(result[0].text).toBe('Value: 9.5');
    });
  });
});
