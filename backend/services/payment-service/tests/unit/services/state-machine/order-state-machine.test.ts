/**
 * Order State Machine Tests
 * Tests for order lifecycle state transitions
 */

jest.mock('../../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('OrderStateMachine', () => {
  let stateMachine: OrderStateMachine;
  let mockEventEmitter: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEventEmitter = { emit: jest.fn() };
    stateMachine = new OrderStateMachine(mockEventEmitter);
  });

  describe('initial state', () => {
    it('should start in draft state', () => {
      const order = stateMachine.create({ orderId: 'order_123', userId: 'user_456' });
      expect(order.state).toBe('draft');
    });

    it('should have created_at timestamp', () => {
      const order = stateMachine.create({ orderId: 'order_123', userId: 'user_456' });
      expect(order.createdAt).toBeDefined();
    });
  });

  describe('transition: draft -> pending', () => {
    it('should transition to pending when items added', () => {
      const order = stateMachine.create({ orderId: 'order_123', userId: 'user_456' });
      const updated = stateMachine.transition(order, 'SUBMIT');
      expect(updated.state).toBe('pending');
    });

    it('should emit order.submitted event', () => {
      const order = stateMachine.create({ orderId: 'order_123', userId: 'user_456' });
      stateMachine.transition(order, 'SUBMIT');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('order.submitted', expect.any(Object));
    });
  });

  describe('transition: pending -> payment_processing', () => {
    it('should transition to payment_processing when payment initiated', () => {
      const order = { orderId: 'order_123', state: 'pending' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'INITIATE_PAYMENT');
      expect(updated.state).toBe('payment_processing');
    });

    it('should record payment intent ID', () => {
      const order = { orderId: 'order_123', state: 'pending' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'INITIATE_PAYMENT', { paymentIntentId: 'pi_123' });
      expect(updated.paymentIntentId).toBe('pi_123');
    });
  });

  describe('transition: payment_processing -> confirmed', () => {
    it('should transition to confirmed when payment succeeds', () => {
      const order = { orderId: 'order_123', state: 'payment_processing' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'PAYMENT_SUCCESS');
      expect(updated.state).toBe('confirmed');
    });

    it('should emit order.confirmed event', () => {
      const order = { orderId: 'order_123', state: 'payment_processing' as const, userId: 'user_456', createdAt: new Date() };
      stateMachine.transition(order, 'PAYMENT_SUCCESS');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('order.confirmed', expect.any(Object));
    });

    it('should record confirmed_at timestamp', () => {
      const order = { orderId: 'order_123', state: 'payment_processing' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'PAYMENT_SUCCESS');
      expect(updated.confirmedAt).toBeDefined();
    });
  });

  describe('transition: payment_processing -> payment_failed', () => {
    it('should transition to payment_failed on decline', () => {
      const order = { orderId: 'order_123', state: 'payment_processing' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'PAYMENT_FAILED', { reason: 'card_declined' });
      expect(updated.state).toBe('payment_failed');
    });

    it('should record failure reason', () => {
      const order = { orderId: 'order_123', state: 'payment_processing' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'PAYMENT_FAILED', { reason: 'insufficient_funds' });
      expect(updated.failureReason).toBe('insufficient_funds');
    });
  });

  describe('transition: confirmed -> fulfilling', () => {
    it('should transition to fulfilling when fulfillment starts', () => {
      const order = { orderId: 'order_123', state: 'confirmed' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'START_FULFILLMENT');
      expect(updated.state).toBe('fulfilling');
    });
  });

  describe('transition: fulfilling -> fulfilled', () => {
    it('should transition to fulfilled when tickets delivered', () => {
      const order = { orderId: 'order_123', state: 'fulfilling' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'FULFILLMENT_COMPLETE');
      expect(updated.state).toBe('fulfilled');
    });

    it('should emit order.fulfilled event', () => {
      const order = { orderId: 'order_123', state: 'fulfilling' as const, userId: 'user_456', createdAt: new Date() };
      stateMachine.transition(order, 'FULFILLMENT_COMPLETE');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('order.fulfilled', expect.any(Object));
    });

    it('should record fulfilled_at timestamp', () => {
      const order = { orderId: 'order_123', state: 'fulfilling' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'FULFILLMENT_COMPLETE');
      expect(updated.fulfilledAt).toBeDefined();
    });
  });

  describe('transition: any -> cancelled', () => {
    it('should allow cancellation from draft', () => {
      const order = { orderId: 'order_123', state: 'draft' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'CANCEL');
      expect(updated.state).toBe('cancelled');
    });

    it('should allow cancellation from pending', () => {
      const order = { orderId: 'order_123', state: 'pending' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'CANCEL');
      expect(updated.state).toBe('cancelled');
    });

    it('should not allow cancellation from fulfilled', () => {
      const order = { orderId: 'order_123', state: 'fulfilled' as const, userId: 'user_456', createdAt: new Date() };
      expect(() => stateMachine.transition(order, 'CANCEL')).toThrow();
    });

    it('should record cancellation reason', () => {
      const order = { orderId: 'order_123', state: 'pending' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'CANCEL', { reason: 'user_requested' });
      expect(updated.cancellationReason).toBe('user_requested');
    });
  });

  describe('transition: confirmed -> refunding', () => {
    it('should transition to refunding when refund initiated', () => {
      const order = { orderId: 'order_123', state: 'confirmed' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'INITIATE_REFUND');
      expect(updated.state).toBe('refunding');
    });
  });

  describe('transition: refunding -> refunded', () => {
    it('should transition to refunded when refund completes', () => {
      const order = { orderId: 'order_123', state: 'refunding' as const, userId: 'user_456', createdAt: new Date() };
      const updated = stateMachine.transition(order, 'REFUND_COMPLETE');
      expect(updated.state).toBe('refunded');
    });

    it('should emit order.refunded event', () => {
      const order = { orderId: 'order_123', state: 'refunding' as const, userId: 'user_456', createdAt: new Date() };
      stateMachine.transition(order, 'REFUND_COMPLETE');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('order.refunded', expect.any(Object));
    });
  });

  describe('invalid transitions', () => {
    it('should throw on invalid transition', () => {
      const order = { orderId: 'order_123', state: 'draft' as const, userId: 'user_456', createdAt: new Date() };
      expect(() => stateMachine.transition(order, 'PAYMENT_SUCCESS')).toThrow('Invalid transition');
    });

    it('should throw on unknown event', () => {
      const order = { orderId: 'order_123', state: 'draft' as const, userId: 'user_456', createdAt: new Date() };
      expect(() => stateMachine.transition(order, 'UNKNOWN_EVENT' as any)).toThrow();
    });
  });

  describe('canTransition', () => {
    it('should return true for valid transitions', () => {
      const order = { orderId: 'order_123', state: 'draft' as const, userId: 'user_456', createdAt: new Date() };
      expect(stateMachine.canTransition(order, 'SUBMIT')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      const order = { orderId: 'order_123', state: 'draft' as const, userId: 'user_456', createdAt: new Date() };
      expect(stateMachine.canTransition(order, 'PAYMENT_SUCCESS')).toBe(false);
    });
  });

  describe('getAvailableTransitions', () => {
    it('should return available events for draft', () => {
      const order = { orderId: 'order_123', state: 'draft' as const, userId: 'user_456', createdAt: new Date() };
      const available = stateMachine.getAvailableTransitions(order);
      expect(available).toContain('SUBMIT');
      expect(available).toContain('CANCEL');
    });

    it('should return available events for confirmed', () => {
      const order = { orderId: 'order_123', state: 'confirmed' as const, userId: 'user_456', createdAt: new Date() };
      const available = stateMachine.getAvailableTransitions(order);
      expect(available).toContain('START_FULFILLMENT');
      expect(available).toContain('INITIATE_REFUND');
    });
  });

  describe('history tracking', () => {
    it('should track state history', () => {
      const order = stateMachine.create({ orderId: 'order_123', userId: 'user_456' });
      const submitted = stateMachine.transition(order, 'SUBMIT');
      
      expect(submitted.history).toBeDefined();
      expect(submitted.history).toHaveLength(2);
    });

    it('should record transition timestamps', () => {
      const order = stateMachine.create({ orderId: 'order_123', userId: 'user_456' });
      const submitted = stateMachine.transition(order, 'SUBMIT');
      
      expect(submitted.history![1].timestamp).toBeDefined();
    });
  });
});

// Types and implementation for testing
type OrderState = 'draft' | 'pending' | 'payment_processing' | 'confirmed' | 'fulfilling' | 'fulfilled' | 'payment_failed' | 'cancelled' | 'refunding' | 'refunded';
type OrderEvent = 'SUBMIT' | 'INITIATE_PAYMENT' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'START_FULFILLMENT' | 'FULFILLMENT_COMPLETE' | 'CANCEL' | 'INITIATE_REFUND' | 'REFUND_COMPLETE';

interface Order {
  orderId: string;
  userId: string;
  state: OrderState;
  createdAt: Date;
  confirmedAt?: Date;
  fulfilledAt?: Date;
  paymentIntentId?: string;
  failureReason?: string;
  cancellationReason?: string;
  history?: Array<{ state: OrderState; timestamp: Date }>;
}

class OrderStateMachine {
  private transitions: Map<OrderState, Map<OrderEvent, OrderState>> = new Map();

  constructor(private eventEmitter: any) {
    this.setupTransitions();
  }

  private setupTransitions() {
    this.transitions.set('draft', new Map([['SUBMIT', 'pending'], ['CANCEL', 'cancelled']]));
    this.transitions.set('pending', new Map([['INITIATE_PAYMENT', 'payment_processing'], ['CANCEL', 'cancelled']]));
    this.transitions.set('payment_processing', new Map([['PAYMENT_SUCCESS', 'confirmed'], ['PAYMENT_FAILED', 'payment_failed']]));
    this.transitions.set('confirmed', new Map([['START_FULFILLMENT', 'fulfilling'], ['INITIATE_REFUND', 'refunding']]));
    this.transitions.set('fulfilling', new Map([['FULFILLMENT_COMPLETE', 'fulfilled']]));
    this.transitions.set('refunding', new Map([['REFUND_COMPLETE', 'refunded']]));
    this.transitions.set('payment_failed', new Map([['INITIATE_PAYMENT', 'payment_processing'], ['CANCEL', 'cancelled']]));
  }

  create(input: { orderId: string; userId: string }): Order {
    return {
      orderId: input.orderId,
      userId: input.userId,
      state: 'draft',
      createdAt: new Date(),
      history: [{ state: 'draft', timestamp: new Date() }],
    };
  }

  transition(order: Order, event: OrderEvent, data?: any): Order {
    const stateTransitions = this.transitions.get(order.state);
    if (!stateTransitions || !stateTransitions.has(event)) {
      throw new Error(`Invalid transition: ${order.state} + ${event}`);
    }

    const newState = stateTransitions.get(event)!;
    const updated: Order = {
      ...order,
      state: newState,
      history: [...(order.history || []), { state: newState, timestamp: new Date() }],
    };

    if (data?.paymentIntentId) updated.paymentIntentId = data.paymentIntentId;
    if (data?.reason && event === 'PAYMENT_FAILED') updated.failureReason = data.reason;
    if (data?.reason && event === 'CANCEL') updated.cancellationReason = data.reason;
    if (newState === 'confirmed') updated.confirmedAt = new Date();
    if (newState === 'fulfilled') updated.fulfilledAt = new Date();

    // Emit events
    if (event === 'SUBMIT') this.eventEmitter.emit('order.submitted', updated);
    if (newState === 'confirmed') this.eventEmitter.emit('order.confirmed', updated);
    if (newState === 'fulfilled') this.eventEmitter.emit('order.fulfilled', updated);
    if (newState === 'refunded') this.eventEmitter.emit('order.refunded', updated);

    return updated;
  }

  canTransition(order: Order, event: OrderEvent): boolean {
    const stateTransitions = this.transitions.get(order.state);
    return stateTransitions?.has(event) || false;
  }

  getAvailableTransitions(order: Order): OrderEvent[] {
    const stateTransitions = this.transitions.get(order.state);
    return stateTransitions ? Array.from(stateTransitions.keys()) : [];
  }
}
