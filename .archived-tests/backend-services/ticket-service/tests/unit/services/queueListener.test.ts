// =============================================================================
// MOCKS
// =============================================================================

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockPaymentEventHandler = {
  handlePaymentSucceeded: jest.fn().mockResolvedValue(undefined),
  handlePaymentFailed: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => mockLogger),
  },
}));

jest.mock('../../../src/services/paymentEventHandler', () => ({
  PaymentEventHandler: mockPaymentEventHandler,
}));

// Import after mocks
import { QueueListener } from '../../../src/services/queueListener';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('QueueListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('start()', () => {
    it('should start successfully', async () => {
      await QueueListener.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Queue listener ready (webhook mode)');
    });

    it('should not throw error', async () => {
      await expect(QueueListener.start()).resolves.not.toThrow();
    });
  });

  describe('processPaymentSuccess()', () => {
    const orderId = 'order-123';
    const paymentId = 'payment-456';

    it('should process payment success', async () => {
      await QueueListener.processPaymentSuccess(orderId, paymentId);

      expect(mockPaymentEventHandler.handlePaymentSucceeded).toHaveBeenCalledWith(
        orderId,
        paymentId
      );
    });

    it('should handle different order and payment IDs', async () => {
      await QueueListener.processPaymentSuccess('order-999', 'payment-888');

      expect(mockPaymentEventHandler.handlePaymentSucceeded).toHaveBeenCalledWith(
        'order-999',
        'payment-888'
      );
    });

    it('should propagate errors from handler', async () => {
      const error = new Error('Payment handler error');
      mockPaymentEventHandler.handlePaymentSucceeded.mockRejectedValue(error);

      await expect(
        QueueListener.processPaymentSuccess(orderId, paymentId)
      ).rejects.toThrow('Payment handler error');
    });
  });

  describe('processPaymentFailure()', () => {
    const orderId = 'order-123';
    const reason = 'Insufficient funds';

    it('should process payment failure', async () => {
      await QueueListener.processPaymentFailure(orderId, reason);

      expect(mockPaymentEventHandler.handlePaymentFailed).toHaveBeenCalledWith(
        orderId,
        reason
      );
    });

    it('should handle different order IDs and reasons', async () => {
      await QueueListener.processPaymentFailure('order-999', 'Card declined');

      expect(mockPaymentEventHandler.handlePaymentFailed).toHaveBeenCalledWith(
        'order-999',
        'Card declined'
      );
    });

    it('should propagate errors from handler', async () => {
      const error = new Error('Payment handler error');
      mockPaymentEventHandler.handlePaymentFailed.mockRejectedValue(error);

      await expect(
        QueueListener.processPaymentFailure(orderId, reason)
      ).rejects.toThrow('Payment handler error');
    });
  });

  describe('instance', () => {
    it('should be a singleton', () => {
      expect(QueueListener).toBeDefined();
    });

    it('should have all required methods', () => {
      expect(typeof QueueListener.start).toBe('function');
      expect(typeof QueueListener.processPaymentSuccess).toBe('function');
      expect(typeof QueueListener.processPaymentFailure).toBe('function');
    });
  });
});
