import { PaymentController } from '../../../src/controllers/payment.controller';
import { FraudDecision } from '../../../src/types';

// Mock all dependencies
jest.mock('../../../src/services/core', () => ({
  PaymentProcessorService: jest.fn().mockImplementation(() => ({
    processPayment: jest.fn()
  })),
  FeeCalculatorService: jest.fn().mockImplementation(() => ({
    calculateDynamicFees: jest.fn()
  }))
}));

jest.mock('../../../src/services/blockchain', () => ({
  NFTQueueService: jest.fn().mockImplementation(() => ({
    queueMinting: jest.fn(),
    getJobStatus: jest.fn()
  })),
  GasEstimatorService: jest.fn().mockImplementation(() => ({
    getBestBlockchain: jest.fn()
  }))
}));

jest.mock('../../../src/services/fraud', () => ({
  ScalperDetectorService: jest.fn().mockImplementation(() => ({
    detectScalper: jest.fn()
  })),
  VelocityCheckerService: jest.fn().mockImplementation(() => ({
    checkVelocity: jest.fn(),
    recordPurchase: jest.fn()
  }))
}));

jest.mock('../../../src/services/high-demand', () => ({
  WaitingRoomService: jest.fn().mockImplementation(() => ({
    getQueueStats: jest.fn(),
    validateAccessToken: jest.fn()
  })),
  BotDetectorService: jest.fn().mockImplementation(() => ({
    detectBot: jest.fn()
  }))
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({}));
});

jest.mock('../../../src/config', () => ({
  config: {
    stripe: { secretKey: 'sk_test_mock' }
  }
}));

jest.mock('../../../src/config/database', () => ({
  db: {}
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

describe('PaymentController', () => {
  let controller: PaymentController;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PaymentController();

    mockRequest = {
      body: {},
      headers: {},
      params: {},
      user: { id: 'user_1', tenantId: 'tenant_1' },
      id: 'req_123',
      ip: '192.168.1.1'
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('processPayment', () => {
    beforeEach(() => {
      mockRequest.body = {
        eventId: 'event_1',
        venueId: 'venue_1',
        tickets: [
          { ticketTypeId: 'type_1', price: 100, quantity: 2 }
        ],
        paymentMethod: { token: 'pm_mock' }
      };

      // Setup default mocks for successful payment
      (controller as any).waitingRoom.getQueueStats.mockResolvedValue({
        totalInQueue: 0,
        activeUsers: 0
      });
      (controller as any).botDetector.detectBot.mockResolvedValue({
        isBot: false
      });
      (controller as any).scalperDetector.detectScalper.mockResolvedValue({
        decision: FraudDecision.APPROVE
      });
      (controller as any).velocityChecker.checkVelocity.mockResolvedValue({
        allowed: true
      });
      (controller as any).feeCalculator.calculateDynamicFees.mockResolvedValue({
        breakdown: { platformFee: 500, processingFee: 300 },
        total: 800
      });
      (controller as any).paymentProcessor.processPayment.mockResolvedValue({
        transactionId: 'txn_123',
        status: 'completed'
      });
      (controller as any).nftQueue.queueMinting.mockResolvedValue('job_123');
      (controller as any).velocityChecker.recordPurchase.mockResolvedValue(undefined);
    });

    it('should reject unauthenticated requests', async () => {
      mockRequest.user = null;

      await controller.processPayment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should require queue token for high-demand events', async () => {
      (controller as any).waitingRoom.getQueueStats.mockResolvedValue({
        totalInQueue: 100,
        activeUsers: 50
      });

      await controller.processPayment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'This is a high-demand event. Queue token required.',
        code: 'QUEUE_TOKEN_REQUIRED',
        waitingRoomActive: true
      });
    });

    it('should validate queue token for high-demand events', async () => {
      (controller as any).waitingRoom.getQueueStats.mockResolvedValue({
        totalInQueue: 100,
        activeUsers: 50
      });
      mockRequest.headers['x-access-token'] = 'token_123';
      (controller as any).waitingRoom.validateAccessToken.mockResolvedValue({
        valid: true,
        eventId: 'event_1'
      });

      await controller.processPayment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect((controller as any).waitingRoom.validateAccessToken).toHaveBeenCalledWith('token_123');
    });

    it('should reject invalid queue tokens', async () => {
      (controller as any).waitingRoom.getQueueStats.mockResolvedValue({
        totalInQueue: 100,
        activeUsers: 50
      });
      mockRequest.headers['x-access-token'] = 'invalid_token';
      (controller as any).waitingRoom.validateAccessToken.mockResolvedValue({
        valid: false
      });

      await controller.processPayment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid or expired queue token',
        code: 'INVALID_ACCESS_TOKEN'
      });
    });

    it('should reject bot behavior', async () => {
      (controller as any).botDetector.detectBot.mockResolvedValue({
        isBot: true,
        recommendation: 'Block user'
      });

      await controller.processPayment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Automated behavior detected',
        code: 'BOT_DETECTED',
        recommendation: 'Block user'
      });
    });

    it('should detect and decline fraudulent payments', async () => {
      (controller as any).scalperDetector.detectScalper.mockResolvedValue({
        decision: FraudDecision.DECLINE,
        riskScore: 95
      });

      await controller.processPayment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Payment declined due to security reasons',
        code: 'FRAUD_DETECTED',
        decision: FraudDecision.DECLINE
      });
    });

    it('should enforce velocity limits', async () => {
      (controller as any).velocityChecker.checkVelocity.mockResolvedValue({
        allowed: false,
        reason: 'Too many purchases',
        limits: { maxPerHour: 5 }
      });

      await controller.processPayment(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(429);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Too many purchases',
        code: 'RATE_LIMIT_EXCEEDED',
        limits: { maxPerHour: 5 }
      });
    });

    it('should calculate fees correctly', async () => {
      await controller.processPayment(mockRequest, mockReply);

      expect((controller as any).feeCalculator.calculateDynamicFees).toHaveBeenCalledWith(
        'venue_1',
        200, // 2 tickets @ $100
        2
      );
    });

    it('should process payment successfully', async () => {
      await controller.processPayment(mockRequest, mockReply);

      expect((controller as any).paymentProcessor.processPayment).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should queue NFT minting after successful payment', async () => {
      await controller.processPayment(mockRequest, mockReply);

      expect((controller as any).nftQueue.queueMinting).toHaveBeenCalledWith({
        paymentId: 'txn_123',
        ticketIds: ['type_1'],
        venueId: 'venue_1',
        eventId: 'event_1',
        blockchain: 'solana',
        priority: 'standard'
      });
    });

    it('should record purchase for velocity tracking', async () => {
      await controller.processPayment(mockRequest, mockReply);

      expect((controller as any).velocityChecker.recordPurchase).toHaveBeenCalledWith(
        'user_1',
        'event_1',
        '192.168.1.1',
        'pm_mock'
      );
    });

    it('should handle multiple ticket types', async () => {
      mockRequest.body.tickets = [
        { ticketTypeId: 'type_1', price: 100, quantity: 2 },
        { ticketTypeId: 'type_2', price: 150, quantity: 1 }
      ];

      await controller.processPayment(mockRequest, mockReply);

      expect((controller as any).feeCalculator.calculateDynamicFees).toHaveBeenCalledWith(
        'venue_1',
        350, // (100*2) + (150*1)
        3
      );
    });

    it('should use idempotency key from header', async () => {
      mockRequest.headers['idempotency-key'] = 'idem_123';

      await controller.processPayment(mockRequest, mockReply);

      expect((controller as any).paymentProcessor.processPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'idem_123'
        })
      );
    });

    it('should pass user agent for bot detection', async () => {
      mockRequest.headers['user-agent'] = 'Mozilla/5.0';

      await controller.processPayment(mockRequest, mockReply);

      expect((controller as any).botDetector.detectBot).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'Mozilla/5.0'
        })
      );
    });
  });

  describe('calculateFees', () => {
    it('should calculate fees and gas estimates', async () => {
      mockRequest.body = {
        venueId: 'venue_1',
        amount: 10000,
        ticketCount: 5
      };

      (controller as any).feeCalculator.calculateDynamicFees.mockResolvedValue({
        breakdown: { platformFee: 500, processingFee: 300 },
        total: 800
      });

      (controller as any).gasEstimator.getBestBlockchain.mockResolvedValue({
        estimates: { solana: 0.001, ethereum: 0.05 },
        recommended: 'solana'
      });

      await controller.calculateFees(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        fees: { platformFee: 500, processingFee: 300 },
        gasEstimates: { solana: 0.001, ethereum: 0.05 },
        recommendedBlockchain: 'solana',
        total: 800
      });
    });
  });

  describe('getTransactionStatus', () => {
    it('should require authentication', async () => {
      mockRequest.user = null;
      mockRequest.params = { transactionId: 'txn_123' };

      await controller.getTransactionStatus(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should return transaction status with NFT info', async () => {
      mockRequest.params = { transactionId: 'txn_123' };
      (controller as any).nftQueue.getJobStatus.mockResolvedValue({
        status: 'completed',
        mintAddress: '0x123'
      });

      await controller.getTransactionStatus(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          nftStatus: expect.any(Object)
        })
      );
    });
  });

  describe('refundTransaction', () => {
    it('should process refund request', async () => {
      mockRequest.params = { transactionId: 'txn_123' };
      mockRequest.body = { amount: 10000, reason: 'Customer request' };

      await controller.refundTransaction(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        refund: expect.objectContaining({
          amount: 10000,
          reason: 'Customer request'
        })
      });
    });
  });
});
