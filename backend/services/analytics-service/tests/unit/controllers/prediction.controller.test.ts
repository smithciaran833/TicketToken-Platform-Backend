/**
 * Prediction Controller Unit Tests
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockPredictionService = {
  predictDemand: jest.fn(),
  optimizePrice: jest.fn(),
  predictChurn: jest.fn(),
  predictCustomerLifetimeValue: jest.fn(),
  predictNoShow: jest.fn(),
  runWhatIfScenario: jest.fn(),
};

jest.mock('../../../src/services/prediction.service', () => ({
  predictionService: mockPredictionService,
}));

import { predictionController } from '../../../src/controllers/prediction.controller';

describe('PredictionController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      params: {},
      body: {},
      user: { id: 'user-123', tenantId: 'tenant-123' },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Default mock responses
    mockPredictionService.predictDemand.mockResolvedValue({
      predictions: [
        { date: '2024-02-01', demand: 150 },
        { date: '2024-02-02', demand: 175 },
      ],
      confidence: 0.85,
    });

    mockPredictionService.optimizePrice.mockResolvedValue({
      recommendedPrice: 75.50,
      currentPrice: 80.00,
      expectedRevenue: 11325,
      priceChange: -4.50,
    });

    mockPredictionService.predictChurn.mockResolvedValue({
      churnProbability: 0.35,
      riskLevel: 'medium',
      factors: ['Decreased engagement', 'No purchases in 90 days'],
    });

    mockPredictionService.predictCustomerLifetimeValue.mockResolvedValue({
      predictedCLV: 7500,
      currentCLV: 5000,
      confidence: 0.82,
    });

    mockPredictionService.predictNoShow.mockResolvedValue({
      noShowProbability: 0.15,
      riskLevel: 'low',
      factors: ['Good attendance history'],
    });

    mockPredictionService.runWhatIfScenario.mockResolvedValue({
      projectedRevenue: 50000,
      projectedAttendance: 650,
      revenueChange: 5000,
      attendanceChange: 50,
    });
  });

  describe('predictDemand', () => {
    it('should predict demand with default days ahead', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        eventId: 'event-456',
      };

      await predictionController.predictDemand(mockRequest, mockReply);

      expect(mockPredictionService.predictDemand).toHaveBeenCalledWith(
        'venue-123',
        'event-456',
        30
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          forecast: expect.objectContaining({
            predictions: expect.any(Array),
            confidence: expect.any(Number),
          }),
        },
      });
    });

    it('should predict demand with custom days ahead', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        eventId: 'event-456',
        daysAhead: 60,
      };

      await predictionController.predictDemand(mockRequest, mockReply);

      expect(mockPredictionService.predictDemand).toHaveBeenCalledWith(
        'venue-123',
        'event-456',
        60
      );
    });
  });

  describe('optimizePricing', () => {
    it('should optimize ticket pricing', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        eventId: 'event-456',
        ticketTypeId: 'ticket-type-789',
        currentPrice: 80.00,
      };

      await predictionController.optimizePricing(mockRequest, mockReply);

      expect(mockPredictionService.optimizePrice).toHaveBeenCalledWith(
        'venue-123',
        'event-456',
        'ticket-type-789',
        80.00
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          optimization: expect.objectContaining({
            recommendedPrice: expect.any(Number),
            currentPrice: expect.any(Number),
          }),
        },
      });
    });
  });

  describe('predictChurn', () => {
    it('should predict customer churn', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        customerId: 'customer-456',
      };

      await predictionController.predictChurn(mockRequest, mockReply);

      expect(mockPredictionService.predictChurn).toHaveBeenCalledWith(
        'venue-123',
        'customer-456'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          prediction: expect.objectContaining({
            churnProbability: expect.any(Number),
            riskLevel: expect.any(String),
          }),
        },
      });
    });
  });

  describe('predictCLV', () => {
    it('should predict customer lifetime value', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        customerId: 'customer-456',
      };

      await predictionController.predictCLV(mockRequest, mockReply);

      expect(mockPredictionService.predictCustomerLifetimeValue).toHaveBeenCalledWith(
        'venue-123',
        'customer-456'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          clv: expect.objectContaining({
            predictedCLV: expect.any(Number),
          }),
        },
      });
    });
  });

  describe('predictNoShow', () => {
    it('should predict no-show probability', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        ticketId: 'ticket-456',
        customerId: 'customer-789',
        eventId: 'event-012',
      };

      await predictionController.predictNoShow(mockRequest, mockReply);

      expect(mockPredictionService.predictNoShow).toHaveBeenCalledWith(
        'venue-123',
        'ticket-456',
        'customer-789',
        'event-012'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          prediction: expect.objectContaining({
            noShowProbability: expect.any(Number),
          }),
        },
      });
    });
  });

  describe('runWhatIfScenario', () => {
    it('should run what-if scenario for pricing', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        scenario: {
          type: 'pricing',
          parameters: {
            priceIncrease: 10,
            ticketTypeId: 'ticket-type-456',
          },
        },
      };

      await predictionController.runWhatIfScenario(mockRequest, mockReply);

      expect(mockPredictionService.runWhatIfScenario).toHaveBeenCalledWith(
        'venue-123',
        expect.objectContaining({
          type: 'pricing',
          priceIncrease: 10,
        })
      );
    });

    it('should run what-if scenario for capacity', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        scenario: {
          type: 'capacity',
          parameters: {
            capacityIncrease: 100,
          },
        },
      };

      await predictionController.runWhatIfScenario(mockRequest, mockReply);

      expect(mockPredictionService.runWhatIfScenario).toHaveBeenCalledWith(
        'venue-123',
        expect.objectContaining({
          type: 'capacity',
        })
      );
    });

    it('should run what-if scenario for marketing', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        scenario: {
          type: 'marketing',
          parameters: {
            campaignBudget: 5000,
            channels: ['email', 'social'],
          },
        },
      };

      await predictionController.runWhatIfScenario(mockRequest, mockReply);

      expect(mockPredictionService.runWhatIfScenario).toHaveBeenCalledWith(
        'venue-123',
        expect.objectContaining({
          type: 'marketing',
        })
      );
    });
  });

  describe('getModelPerformance', () => {
    it('should get demand model performance', async () => {
      mockRequest.params = { modelType: 'demand' };

      await predictionController.getModelPerformance(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          performance: expect.objectContaining({
            modelType: 'demand',
            metrics: expect.objectContaining({
              accuracy: 0.87,
              precision: 0.84,
              recall: 0.81,
            }),
            status: 'active',
          }),
        },
      });
    });

    it('should get pricing model performance', async () => {
      mockRequest.params = { modelType: 'pricing' };

      await predictionController.getModelPerformance(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.performance.modelType).toBe('pricing');
      expect(sendCall.data.performance.metrics.accuracy).toBe(0.89);
    });

    it('should get churn model performance', async () => {
      mockRequest.params = { modelType: 'churn' };

      await predictionController.getModelPerformance(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.performance.modelType).toBe('churn');
    });

    it('should get CLV model performance', async () => {
      mockRequest.params = { modelType: 'clv' };

      await predictionController.getModelPerformance(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.performance.modelType).toBe('clv');
    });

    it('should get no-show model performance', async () => {
      mockRequest.params = { modelType: 'no_show' };

      await predictionController.getModelPerformance(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.performance.modelType).toBe('no_show');
    });

    it('should default to demand model for unknown type', async () => {
      mockRequest.params = { modelType: 'unknown' };

      await predictionController.getModelPerformance(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.performance.metrics.accuracy).toBe(0.87);
    });

    it('should include training metadata', async () => {
      mockRequest.params = { modelType: 'demand' };

      await predictionController.getModelPerformance(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.data.performance.lastTrainedAt).toBeInstanceOf(Date);
      expect(sendCall.data.performance.trainingDataSize).toBe(52000);
      expect(sendCall.data.performance.version).toBe('1.2.0');
    });
  });
});
