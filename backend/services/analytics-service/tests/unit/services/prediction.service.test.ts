/**
 * Prediction Service Unit Tests
 */

import { ModelType } from '../../../src/types';

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

const mockCustomerIntelligenceService = {
  getCustomerProfile: jest.fn(),
};

jest.mock('../../../src/services/customer-intelligence.service', () => ({
  customerIntelligenceService: mockCustomerIntelligenceService,
}));

jest.mock('@tensorflow/tfjs-node', () => ({
  sequential: jest.fn().mockReturnValue({
    compile: jest.fn(),
    predict: jest.fn().mockReturnValue({ dataSync: () => [0.5] }),
  }),
  layers: {
    dense: jest.fn().mockReturnValue({}),
    dropout: jest.fn().mockReturnValue({}),
  },
}));

import { PredictionService, predictionService } from '../../../src/services/prediction.service';

describe('PredictionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = PredictionService.getInstance();
      const instance2 = PredictionService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('initialize', () => {
    it('should initialize placeholder models', async () => {
      await predictionService.initialize();
      expect(mockLogger.info).toHaveBeenCalledWith('Initializing prediction models...');
      expect(mockLogger.info).toHaveBeenCalledWith('Prediction models initialized');
    });
  });

  describe('predictDemand', () => {
    it('should return demand forecast for specified days', async () => {
      const result = await predictionService.predictDemand('venue-123', 'event-123', 7);

      expect(result).toEqual(expect.objectContaining({
        eventId: 'event-123',
        predictions: expect.any(Array),
        aggregated: expect.objectContaining({
          totalPredictedDemand: expect.any(Number),
          peakDemandDate: expect.any(Date),
          sellOutProbability: expect.any(Number),
        }),
      }));
      expect(result.predictions).toHaveLength(7);
    });

    it('should use default 30 days when not specified', async () => {
      const result = await predictionService.predictDemand('venue-123', 'event-123');
      expect(result.predictions).toHaveLength(30);
    });

    it('should include confidence intervals in predictions', async () => {
      const result = await predictionService.predictDemand('venue-123', 'event-123', 5);

      result.predictions.forEach(prediction => {
        expect(prediction).toHaveProperty('confidenceInterval');
        expect(prediction.confidenceInterval.lower).toBeLessThan(prediction.predictedDemand);
        expect(prediction.confidenceInterval.upper).toBeGreaterThan(prediction.predictedDemand);
      });
    });

    it('should include demand factors', async () => {
      const result = await predictionService.predictDemand('venue-123', 'event-123', 1);

      expect(result.predictions[0].factors).toContainEqual(
        expect.objectContaining({ name: 'Day of Week' })
      );
    });
  });

  describe('optimizePrice', () => {
    it('should return price optimization recommendations', async () => {
      const result = await predictionService.optimizePrice('venue-123', 'event-123', 'ticket-123', 10000);

      expect(result).toEqual(expect.objectContaining({
        eventId: 'event-123',
        ticketTypeId: 'ticket-123',
        currentPrice: 10000,
        optimalPrice: expect.any(Number),
        recommendations: expect.any(Array),
        priceRange: expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
      }));
    });

    it('should include multiple price point recommendations', async () => {
      const result = await predictionService.optimizePrice('venue-123', 'event-123', 'ticket-123', 10000);

      expect(result.recommendations.length).toBeGreaterThan(1);
      result.recommendations.forEach(rec => {
        expect(rec).toHaveProperty('price');
        expect(rec).toHaveProperty('expectedDemand');
        expect(rec).toHaveProperty('expectedRevenue');
        expect(rec).toHaveProperty('elasticity');
        expect(rec).toHaveProperty('confidence');
      });
    });

    it('should identify optimal price based on expected revenue', async () => {
      const result = await predictionService.optimizePrice('venue-123', 'event-123', 'ticket-123', 10000);

      const optimalRec = result.recommendations.find(r => r.price === result.optimalPrice);
      const maxRevenue = Math.max(...result.recommendations.map(r => r.expectedRevenue));
      expect(optimalRec?.expectedRevenue).toBe(maxRevenue);
    });
  });

  describe('predictChurn', () => {
    it('should return churn prediction for customer', async () => {
      mockCustomerIntelligenceService.getCustomerProfile.mockResolvedValue({
        customerId: 'cust-123',
        churnProbability: 0.75,
        daysSinceLastPurchase: 120,
        purchaseFrequency: 1.5,
      });

      const result = await predictionService.predictChurn('venue-123', 'cust-123');

      expect(result).toEqual(expect.objectContaining({
        customerId: 'cust-123',
        churnProbability: 0.75,
        riskLevel: 'high',
        timeframe: 90,
        reasons: expect.any(Array),
        recommendedActions: expect.any(Array),
      }));
    });

    it('should classify high risk customers', async () => {
      mockCustomerIntelligenceService.getCustomerProfile.mockResolvedValue({
        customerId: 'cust-123',
        churnProbability: 0.8,
        daysSinceLastPurchase: 150,
        purchaseFrequency: 0.5,
      });

      const result = await predictionService.predictChurn('venue-123', 'cust-123');

      expect(result.riskLevel).toBe('high');
      expect(result.recommendedActions.length).toBeGreaterThan(0);
    });

    it('should classify low risk customers', async () => {
      mockCustomerIntelligenceService.getCustomerProfile.mockResolvedValue({
        customerId: 'cust-123',
        churnProbability: 0.2,
        daysSinceLastPurchase: 15,
        purchaseFrequency: 5,
      });

      const result = await predictionService.predictChurn('venue-123', 'cust-123');

      expect(result.riskLevel).toBe('low');
    });

    it('should throw error when customer not found', async () => {
      mockCustomerIntelligenceService.getCustomerProfile.mockResolvedValue(null);

      await expect(predictionService.predictChurn('venue-123', 'nonexistent'))
        .rejects.toThrow('Customer profile not found');
    });
  });

  describe('predictCustomerLifetimeValue', () => {
    it('should return CLV prediction', async () => {
      mockCustomerIntelligenceService.getCustomerProfile.mockResolvedValue({
        customerId: 'cust-123',
        averageOrderValue: 100,
        purchaseFrequency: 4,
        churnProbability: 0.2,
        segment: 'regular',
      });

      const result = await predictionService.predictCustomerLifetimeValue('venue-123', 'cust-123');

      expect(result).toEqual(expect.objectContaining({
        customerId: 'cust-123',
        predictedCLV: expect.any(Number),
        confidence: expect.any(Number),
        timeHorizon: 36,
        breakdown: expect.objectContaining({
          expectedPurchases: expect.any(Number),
          averageOrderValue: 100,
          retentionProbability: 0.8,
        }),
        segment: 'regular',
        growthPotential: expect.any(Number),
      }));
    });

    it('should throw error when customer not found', async () => {
      mockCustomerIntelligenceService.getCustomerProfile.mockResolvedValue(null);

      await expect(predictionService.predictCustomerLifetimeValue('venue-123', 'nonexistent'))
        .rejects.toThrow('Customer profile not found');
    });
  });

  describe('predictNoShow', () => {
    it('should return no-show prediction', async () => {
      mockCustomerIntelligenceService.getCustomerProfile.mockResolvedValue({
        daysSinceLastPurchase: 30,
        averageOrderValue: 100,
      });

      const result = await predictionService.predictNoShow('venue-123', 'ticket-123', 'cust-123', 'event-123');

      expect(result).toEqual(expect.objectContaining({
        ticketId: 'ticket-123',
        customerId: 'cust-123',
        eventId: 'event-123',
        noShowProbability: expect.any(Number),
        riskFactors: expect.any(Array),
        recommendedActions: expect.any(Array),
      }));
    });

    it('should increase probability for inactive customers', async () => {
      mockCustomerIntelligenceService.getCustomerProfile.mockResolvedValue({
        daysSinceLastPurchase: 200,
        averageOrderValue: 100,
      });

      const result = await predictionService.predictNoShow('venue-123', 'ticket-123', 'cust-123', 'event-123');

      expect(result.noShowProbability).toBeGreaterThan(0.1);
      expect(result.riskFactors).toContainEqual(expect.objectContaining({ factor: 'Inactive customer' }));
    });

    it('should handle missing customer profile', async () => {
      mockCustomerIntelligenceService.getCustomerProfile.mockResolvedValue(null);

      const result = await predictionService.predictNoShow('venue-123', 'ticket-123', 'cust-123', 'event-123');

      expect(result.noShowProbability).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('runWhatIfScenario', () => {
    it('should run pricing what-if scenario', async () => {
      const result = await predictionService.runWhatIfScenario('venue-123', {
        type: 'pricing',
        name: 'Price Test',
      });

      expect(result).toEqual(expect.objectContaining({
        name: 'Price Test',
        type: 'pricing',
        baselineMetrics: expect.any(Object),
        scenarios: expect.any(Array),
        recommendations: expect.any(Array),
      }));
    });

    it('should generate multiple pricing scenarios', async () => {
      const result = await predictionService.runWhatIfScenario('venue-123', { type: 'pricing' });

      expect(result.scenarios.length).toBeGreaterThan(1);
      result.scenarios.forEach(scenario => {
        expect(scenario).toHaveProperty('name');
        expect(scenario).toHaveProperty('parameters');
        expect(scenario).toHaveProperty('predictions');
        expect(scenario).toHaveProperty('impact');
      });
    });

    it('should calculate revenue and attendance impact', async () => {
      const result = await predictionService.runWhatIfScenario('venue-123', { type: 'pricing' });

      result.scenarios.forEach(scenario => {
        expect(scenario.impact).toHaveProperty('revenue');
        expect(scenario.impact).toHaveProperty('attendance');
      });
    });
  });
});
