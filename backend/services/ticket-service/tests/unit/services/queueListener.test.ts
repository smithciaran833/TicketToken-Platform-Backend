/**
 * Unit Tests for src/services/queueListener.ts
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

const mockHandlePaymentSucceeded = jest.fn();
const mockHandlePaymentFailed = jest.fn();

jest.mock('../../../src/services/paymentEventHandler', () => ({
  PaymentEventHandler: {
    handlePaymentSucceeded: mockHandlePaymentSucceeded,
    handlePaymentFailed: mockHandlePaymentFailed,
  },
}));

import { QueueListener } from '../../../src/services/queueListener';

describe('services/queueListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('start()', () => {
    it('starts without throwing', async () => {
      await expect(QueueListener.start()).resolves.not.toThrow();
    });
  });

  describe('processPaymentSuccess()', () => {
    it('delegates to PaymentEventHandler.handlePaymentSucceeded', async () => {
      mockHandlePaymentSucceeded.mockResolvedValueOnce(undefined);

      await QueueListener.processPaymentSuccess('order-123', 'payment-456');

      expect(mockHandlePaymentSucceeded).toHaveBeenCalledWith('order-123', 'payment-456');
    });
  });

  describe('processPaymentFailure()', () => {
    it('delegates to PaymentEventHandler.handlePaymentFailed', async () => {
      mockHandlePaymentFailed.mockResolvedValueOnce(undefined);

      await QueueListener.processPaymentFailure('order-123', 'Card declined');

      expect(mockHandlePaymentFailed).toHaveBeenCalledWith('order-123', 'Card declined');
    });
  });
});
