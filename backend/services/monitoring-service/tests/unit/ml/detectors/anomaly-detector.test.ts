// Mock TensorFlow
const mockModel = {
  compile: jest.fn(),
  predict: jest.fn(),
  fit: jest.fn().mockResolvedValue({}),
};

jest.mock('@tensorflow/tfjs-node', () => ({
  sequential: jest.fn().mockReturnValue({
    apply: jest.fn().mockReturnValue({}),
  }),
  layers: {
    dense: jest.fn().mockReturnValue({}),
  },
  input: jest.fn().mockReturnValue({}),
  model: jest.fn().mockReturnValue(mockModel),
  tensor2d: jest.fn().mockReturnValue({
    dispose: jest.fn(),
    array: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]]),
  }),
}));

// Mock database
const mockQuery = jest.fn();
jest.mock('../../../../src/utils/database', () => ({
  pgPool: {
    query: mockQuery,
  },
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock alert service
jest.mock('../../../../src/services/alert.service', () => ({
  alertService: {
    createAlert: jest.fn(),
  },
}));

import { AnomalyDetector } from '../../../../src/ml/detectors/anomaly-detector';
import { logger } from '../../../../src/utils/logger';
import { pgPool } from '../../../../src/utils/database';

describe('AnomalyDetector', () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    detector = new AnomalyDetector();
  });

  describe('constructor', () => {
    it('should initialize the model', () => {
      expect(logger.info).toHaveBeenCalledWith('Anomaly detection model initialized');
    });
  });

  describe('detectAnomaly', () => {
    it('should use simple detection when history is insufficient', async () => {
      const result = await detector.detectAnomaly('test_metric', 100);

      expect(result).toMatchObject({
        isAnomaly: false,
        score: 0,
        prediction: 100,
        confidence: 0,
      });
    });

    it('should detect anomaly using simple statistics with short history', async () => {
      // Use less than 10 items to trigger simple detection
      (detector as any).historicalData.set('test_metric', [10, 11, 12, 10, 11, 12, 10, 11, 12]);

      const result = await detector.detectAnomaly('test_metric', 100);

      expect(result.isAnomaly).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should not flag normal values as anomaly', async () => {
      (detector as any).historicalData.set('test_metric', [10, 11, 12, 10, 11, 12, 10, 11, 12]);

      const result = await detector.detectAnomaly('test_metric', 11);

      expect(result.isAnomaly).toBe(false);
    });

    it('should use ML model when available and enough history', async () => {
      (detector as any).historicalData.set('test_metric', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

      mockModel.predict.mockReturnValue({
        array: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]]),
        dispose: jest.fn(),
      });

      const result = await detector.detectAnomaly('test_metric', 10);

      expect(result).toHaveProperty('isAnomaly');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('prediction');
      expect(result).toHaveProperty('confidence');
    });

    it('should detect anomaly via ML model with high reconstruction error', async () => {
      (detector as any).historicalData.set('test_metric', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

      // Return very different values to create high reconstruction error
      mockModel.predict.mockReturnValue({
        array: jest.fn().mockResolvedValue([[0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9]]),
        dispose: jest.fn(),
      });

      const result = await detector.detectAnomaly('test_metric', 100);

      expect(result.score).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      (detector as any).historicalData.set('test_metric', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      mockModel.predict.mockImplementation(() => {
        throw new Error('Model error');
      });

      const result = await detector.detectAnomaly('test_metric', 10);

      expect(result).toMatchObject({
        isAnomaly: false,
        score: 0,
        confidence: 0,
      });
      expect(logger.error).toHaveBeenCalledWith('Error detecting anomaly:', expect.any(Error));
    });
  });

  describe('normalizeData', () => {
    it('should normalize values to 0-1 range', () => {
      const normalized = (detector as any).normalizeData([0, 50, 100]);

      expect(normalized[0]).toBe(0);
      expect(normalized[1]).toBe(0.5);
      expect(normalized[2]).toBe(1);
    });

    it('should handle same values', () => {
      const normalized = (detector as any).normalizeData([50, 50, 50]);

      expect(normalized).toEqual([0, 0, 0]);
    });
  });

  describe('calculateReconstructionError', () => {
    it('should calculate MSE correctly', () => {
      const original = [0.1, 0.2, 0.3];
      const reconstructed = [0.1, 0.2, 0.3];

      const error = (detector as any).calculateReconstructionError(original, reconstructed);

      expect(error).toBe(0);
    });

    it('should return non-zero error for different values', () => {
      const original = [0.1, 0.2, 0.3];
      const reconstructed = [0.2, 0.3, 0.4];

      const error = (detector as any).calculateReconstructionError(original, reconstructed);

      expect(error).toBeGreaterThan(0);
    });
  });

  describe('simpleAnomalyDetection', () => {
    it('should return default values for empty history', () => {
      const result = (detector as any).simpleAnomalyDetection([], 100);

      expect(result).toMatchObject({
        isAnomaly: false,
        score: 0,
        prediction: 100,
        confidence: 0,
      });
    });

    it('should detect anomaly for values > 3 std deviations', () => {
      const history = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
      const result = (detector as any).simpleAnomalyDetection(history, 100);

      expect(result.isAnomaly).toBe(true);
    });

    it('should not flag normal values', () => {
      const history = [10, 11, 12, 9, 10, 11, 12, 9, 10, 11];
      const result = (detector as any).simpleAnomalyDetection(history, 10);

      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('predictNextValue', () => {
    it('should return last value for short history', () => {
      const prediction = (detector as any).predictNextValue([5, 10]);

      expect(prediction).toBe(10);
    });

    it('should return 0 for empty history', () => {
      const prediction = (detector as any).predictNextValue([]);

      expect(prediction).toBe(0);
    });

    it('should use linear regression for longer history', () => {
      const prediction = (detector as any).predictNextValue([1, 2, 3, 4, 5]);

      expect(prediction).toBeGreaterThan(5);
    });
  });

  describe('checkAllMetrics', () => {
    it('should check all recent metrics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { metric_name: 'cpu', value: '50', timestamp: new Date() },
          { metric_name: 'memory', value: '60', timestamp: new Date() },
        ],
      });

      await detector.checkAllMetrics();

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should create alert for anomalies using simple detection', async () => {
      // Use short history to trigger simple anomaly detection
      (detector as any).historicalData.set('cpu', [10, 10, 10, 10, 10, 10, 10, 10, 10]);

      mockQuery.mockResolvedValueOnce({
        rows: [{ metric_name: 'cpu', value: '100', timestamp: new Date() }],
      });

      mockQuery.mockResolvedValueOnce({ rows: [] }); // For alert insert

      await detector.checkAllMetrics();

      // The log is a single string argument
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Anomaly detected in cpu')
      );
    });

    it('should handle errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await detector.checkAllMetrics();

      expect(logger.error).toHaveBeenCalledWith(
        'Error checking metrics for anomalies:',
        expect.any(Error)
      );
    });
  });

  describe('createAnomalyAlert', () => {
    it('should insert alert into database', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await (detector as any).createAnomalyAlert('cpu', 100, {
        prediction: 50,
        score: 2,
        confidence: 0.8,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.any(Array)
      );
      expect(logger.info).toHaveBeenCalledWith('Created anomaly alert for cpu');
    });

    it('should set critical severity for high scores', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await (detector as any).createAnomalyAlert('cpu', 100, {
        prediction: 50,
        score: 10,
        confidence: 0.8,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['critical'])
      );
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await (detector as any).createAnomalyAlert('cpu', 100, {
        prediction: 50,
        score: 2,
        confidence: 0.8,
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Error creating anomaly alert:',
        expect.any(Error)
      );
    });
  });

  describe('trainOnHistoricalData', () => {
    it('should fetch and process historical metrics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: Array(150).fill(null).map((_, i) => ({
          metric_name: 'cpu',
          value: String(50 + Math.random() * 10),
          timestamp: new Date(),
        })),
      });

      await (detector as any).trainOnHistoricalData();

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Trained on'));
    });

    it('should handle training errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await (detector as any).trainOnHistoricalData();

      expect(logger.error).toHaveBeenCalledWith(
        'Error training on historical data:',
        expect.any(Error)
      );
    });
  });
});
