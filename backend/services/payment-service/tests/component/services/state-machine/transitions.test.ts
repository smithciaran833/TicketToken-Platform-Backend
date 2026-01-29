/**
 * COMPONENT TEST: StateTransitionService
 *
 * Tests state transition coordination between payment and order
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const mockPoolQuery = jest.fn();

import { StateTransitionService, TransitionContext } from '../../../../src/services/state-machine/transitions';
import { PaymentState } from '../../../../src/services/state-machine/payment-state-machine';
import { OrderState } from '../../../../src/services/state-machine/order-state-machine';

describe('StateTransitionService Component Tests', () => {
  let service: StateTransitionService;
  let mockPool: any;
  let context: TransitionContext;

  beforeEach(() => {
    mockPoolQuery.mockReset();
    mockPoolQuery.mockResolvedValue({ rows: [] });
    
    mockPool = { query: mockPoolQuery };
    service = new StateTransitionService(mockPool);
    
    context = {
      paymentId: uuidv4(),
      orderId: uuidv4(),
      provider: 'stripe',
      amount: 10000,
      metadata: { ticketId: uuidv4() }
    };
  });

  // ===========================================================================
  // HANDLE PAYMENT EVENT
  // ===========================================================================
  describe('handlePaymentEvent()', () => {
    it('should transition payment and update database', async () => {
      const newState = await service.handlePaymentEvent(
        'process',
        PaymentState.PENDING,
        context
      );

      expect(newState).toBe(PaymentState.PROCESSING);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payment_transactions'),
        [PaymentState.PROCESSING, context.paymentId]
      );
    });

    it('should sync order state after payment transition', async () => {
      await service.handlePaymentEvent(
        'complete',
        PaymentState.PROCESSING,
        context
      );

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders'),
        [OrderState.PAID, context.orderId]
      );
    });

    it('should throw on invalid transition', async () => {
      await expect(service.handlePaymentEvent(
        'complete',
        PaymentState.PENDING, // Can't complete from pending
        context
      )).rejects.toThrow('Invalid transition');
    });

    it('should map payment states to order states correctly', async () => {
      // Test processing -> payment_processing
      await service.handlePaymentEvent('process', PaymentState.PENDING, context);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders'),
        [OrderState.PAYMENT_PROCESSING, context.orderId]
      );

      mockPoolQuery.mockClear();

      // Test failed -> payment_failed
      await service.handlePaymentEvent('fail', PaymentState.PROCESSING, context);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders'),
        [OrderState.PAYMENT_FAILED, context.orderId]
      );

      mockPoolQuery.mockClear();

      // Test refund -> refunded
      await service.handlePaymentEvent('refund', PaymentState.COMPLETED, context);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders'),
        [OrderState.REFUNDED, context.orderId]
      );
    });
  });

  // ===========================================================================
  // FULL FLOWS
  // ===========================================================================
  describe('full transaction flows', () => {
    it('should handle complete payment flow', async () => {
      let state = PaymentState.PENDING;

      state = await service.handlePaymentEvent('process', state, context);
      expect(state).toBe(PaymentState.PROCESSING);

      state = await service.handlePaymentEvent('complete', state, context);
      expect(state).toBe(PaymentState.COMPLETED);

      // Verify both tables updated
      expect(mockPoolQuery).toHaveBeenCalledTimes(4); // 2 payment + 2 order updates
    });

    it('should handle failure and retry flow', async () => {
      let state = PaymentState.PENDING;

      state = await service.handlePaymentEvent('process', state, context);
      state = await service.handlePaymentEvent('fail', state, context);
      expect(state).toBe(PaymentState.FAILED);

      state = await service.handlePaymentEvent('retry', state, context);
      expect(state).toBe(PaymentState.PROCESSING);

      state = await service.handlePaymentEvent('complete', state, context);
      expect(state).toBe(PaymentState.COMPLETED);
    });

    it('should handle refund flow', async () => {
      let state = PaymentState.PENDING;

      state = await service.handlePaymentEvent('process', state, context);
      state = await service.handlePaymentEvent('complete', state, context);
      state = await service.handlePaymentEvent('refund', state, context);
      
      expect(state).toBe(PaymentState.REFUNDED);
    });
  });
});
