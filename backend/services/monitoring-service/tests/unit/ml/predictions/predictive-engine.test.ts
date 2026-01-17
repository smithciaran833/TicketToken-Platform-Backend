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
const mockQuery = jest.fn();
jest.mock('../../../../src/utils/database', () => ({
  pgPool: {
    query: mockQuery,
  },
}));

import { PredictiveEngine } from '../../../../src/ml/predictions/predictive-engine';
import { logger } from '../../../../src/utils/logger';

describe('PredictiveEngine', () => {
  let engine: PredictiveEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    engine = new PredictiveEngine();
  });

  describe('predictMetricValue', () => {
    it('should return default values for insufficient data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await engine.predictMetricValue('cpu_usage');

      expect(result).toEqual({
        prediction: 0,
        confidence: 0,
        trend: 'stable',
      });
    });

    it('should return default values for less than 10 data points', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: Array(5).fill({ value: '50', timestamp: new Date() }),
      });

      const result = await engine.predictMetricValue('cpu_usage');

      expect(result).toEqual({
        prediction: 0,
        confidence: 0,
        trend: 'stable',
      });
    });

    it('should calculate prediction with sufficient data', async () => {
      const rows = Array(30).fill(null).map((_, i) => ({
        value: String(50 + i * 0.5),
        timestamp: new Date(Date.now() - (30 - i) * 3600000),
      }));

      mockQuery.mockResolvedValueOnce({ rows });

      const result = await engine.predictMetricValue('cpu_usage', 1);

      expect(result.prediction).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(['up', 'down', 'stable']).toContain(result.trend);
    });

    it('should detect upward trend', async () => {
      const rows = Array(30).fill(null).map((_, i) => ({
        value: String(50 + i * 2), // Clearly increasing
        timestamp: new Date(Date.now() - (30 - i) * 3600000),
      }));

      mockQuery.mockResolvedValueOnce({ rows });

      const result = await engine.predictMetricValue('cpu_usage', 1);

      expect(result.trend).toBe('up');
    });

    it('should detect downward trend', async () => {
      const rows = Array(30).fill(null).map((_, i) => ({
        value: String(100 - i * 2), // Clearly decreasing
        timestamp: new Date(Date.now() - (30 - i) * 3600000),
      }));

      mockQuery.mockResolvedValueOnce({ rows });

      const result = await engine.predictMetricValue('cpu_usage', 1);

      expect(result.trend).toBe('down');
    });

    it('should detect stable trend', async () => {
      const rows = Array(30).fill(null).map((_, i) => ({
        value: String(50 + (Math.random() - 0.5) * 2), // Small variations
        timestamp: new Date(Date.now() - (30 - i) * 3600000),
      }));

      mockQuery.mockResolvedValueOnce({ rows });

      const result = await engine.predictMetricValue('cpu_usage', 1);

      expect(result.trend).toBe('stable');
    });

    it('should scale confidence with data points', async () => {
      const rows50 = Array(50).fill({ value: '50', timestamp: new Date() });
      const rows100 = Array(100).fill({ value: '50', timestamp: new Date() });

      mockQuery.mockResolvedValueOnce({ rows: rows50 });
      const result50 = await engine.predictMetricValue('cpu_usage');

      mockQuery.mockResolvedValueOnce({ rows: rows100 });
      const result100 = await engine.predictMetricValue('cpu_usage');

      expect(result100.confidence).toBeGreaterThan(result50.confidence);
    });

    it('should cap confidence at 0.95', async () => {
      const rows = Array(200).fill({ value: '50', timestamp: new Date() });
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await engine.predictMetricValue('cpu_usage');

      expect(result.confidence).toBeLessThanOrEqual(0.95);
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await engine.predictMetricValue('cpu_usage');

      expect(result).toEqual({
        prediction: 0,
        confidence: 0,
        trend: 'stable',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error predicting metric value:',
        expect.any(Error)
      );
    });

    it('should use hoursAhead parameter for prediction', async () => {
      const rows = Array(30).fill(null).map((_, i) => ({
        value: String(50 + i),
        timestamp: new Date(Date.now() - (30 - i) * 3600000),
      }));

      mockQuery.mockResolvedValueOnce({ rows });
      const result1 = await engine.predictMetricValue('cpu_usage', 1);

      mockQuery.mockResolvedValueOnce({ rows });
      const result5 = await engine.predictMetricValue('cpu_usage', 5);

      // With upward trend, 5 hours ahead should predict higher
      expect(result5.prediction).toBeGreaterThan(result1.prediction);
    });
  });

  describe('predictSystemFailure', () => {
    it('should return low probability when all metrics are healthy', async () => {
      // Mock all metric queries to return low values
      mockQuery
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '30', timestamp: new Date() }),
        }) // CPU
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '40', timestamp: new Date() }),
        }) // Memory
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '0.1', timestamp: new Date() }),
        }) // Error rate
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '100', timestamp: new Date() }),
        }); // Response time

      const result = await engine.predictSystemFailure();

      expect(result.probability).toBeLessThan(0.5);
      expect(result.riskFactors).toHaveLength(0);
    });

    it('should detect high CPU risk', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '90', timestamp: new Date() }),
        }) // High CPU
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '40', timestamp: new Date() }),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '0.1', timestamp: new Date() }),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '100', timestamp: new Date() }),
        });

      const result = await engine.predictSystemFailure();

      expect(result.riskFactors).toContain('High CPU usage predicted');
    });

    it('should detect high memory risk', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '30', timestamp: new Date() }),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '90', timestamp: new Date() }),
        }) // High memory
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '0.1', timestamp: new Date() }),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '100', timestamp: new Date() }),
        });

      const result = await engine.predictSystemFailure();

      expect(result.riskFactors).toContain('High memory usage predicted');
    });

    it('should detect increasing error rate', async () => {
      // CPU - low
      mockQuery.mockResolvedValueOnce({
        rows: Array(30).fill({ value: '30', timestamp: new Date() }),
      });
      // Memory - low
      mockQuery.mockResolvedValueOnce({
        rows: Array(30).fill({ value: '40', timestamp: new Date() }),
      });
      // Error rate - increasing trend
      mockQuery.mockResolvedValueOnce({
        rows: Array(30).fill(null).map((_, i) => ({
          value: String(0.1 + i * 0.1),
          timestamp: new Date(),
        })),
      });
      // Response time - low
      mockQuery.mockResolvedValueOnce({
        rows: Array(30).fill({ value: '100', timestamp: new Date() }),
      });

      const result = await engine.predictSystemFailure();

      expect(result.riskFactors).toContain('Increasing error rate');
    });

    it('should detect slow response times', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '30', timestamp: new Date() }),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '40', timestamp: new Date() }),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '0.1', timestamp: new Date() }),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '3000', timestamp: new Date() }),
        }); // High response time

      const result = await engine.predictSystemFailure();

      expect(result.riskFactors).toContain('Slow response times predicted');
    });

    it('should return short timeToFailure for high probability', async () => {
      // All metrics critical
      mockQuery
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '95', timestamp: new Date() }),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '95', timestamp: new Date() }),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill(null).map((_, i) => ({
            value: String(i * 0.5),
            timestamp: new Date(),
          })),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '5000', timestamp: new Date() }),
        });

      const result = await engine.predictSystemFailure();

      expect(result.probability).toBeGreaterThan(0.5);
      expect(result.timeToFailure).toBeLessThanOrEqual(30);
    });

    it('should cap probability at 0.95', async () => {
      // All metrics extremely critical
      mockQuery
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '99', timestamp: new Date() }),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '99', timestamp: new Date() }),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill(null).map((_, i) => ({
            value: String(i),
            timestamp: new Date(),
          })),
        })
        .mockResolvedValueOnce({
          rows: Array(30).fill({ value: '10000', timestamp: new Date() }),
        });

      const result = await engine.predictSystemFailure();

      expect(result.probability).toBeLessThanOrEqual(0.95);
    });

    it('should handle errors gracefully by returning defaults', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      const result = await engine.predictSystemFailure();

      // Errors are caught in predictMetricValue, which returns defaults
      // So predictSystemFailure gets 0 predictions and calculates accordingly
      expect(result.probability).toBe(0);
      expect(result.timeToFailure).toBe(60);
      expect(result.riskFactors).toHaveLength(0);
      // The errors are logged at predictMetricValue level
      expect(logger.error).toHaveBeenCalledWith(
        'Error predicting metric value:',
        expect.any(Error)
      );
    });
  });
});
