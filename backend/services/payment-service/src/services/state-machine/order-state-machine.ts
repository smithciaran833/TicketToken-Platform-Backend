export enum OrderState {
  CREATED = 'created',
  PAYMENT_PENDING = 'payment_pending',
  PAYMENT_PROCESSING = 'payment_processing',
  PAID = 'paid',
  PAYMENT_FAILED = 'payment_failed',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

export class OrderStateMachine {
  private currentState: OrderState;
  
  constructor(initialState: OrderState = OrderState.CREATED) {
    this.currentState = initialState;
  }

  canTransition(to: OrderState): boolean {
    const transitions: Record<OrderState, OrderState[]> = {
      [OrderState.CREATED]: [OrderState.PAYMENT_PENDING, OrderState.CANCELLED],
      [OrderState.PAYMENT_PENDING]: [OrderState.PAYMENT_PROCESSING, OrderState.CANCELLED],
      [OrderState.PAYMENT_PROCESSING]: [OrderState.PAID, OrderState.PAYMENT_FAILED],
      [OrderState.PAYMENT_FAILED]: [OrderState.PAYMENT_PENDING, OrderState.CANCELLED],
      [OrderState.PAID]: [OrderState.FULFILLED, OrderState.REFUNDED],
      [OrderState.FULFILLED]: [OrderState.REFUNDED],
      [OrderState.CANCELLED]: [],
      [OrderState.REFUNDED]: []
    };
    
    return transitions[this.currentState]?.includes(to) ?? false;
  }

  transition(to: OrderState): void {
    if (!this.canTransition(to)) {
      throw new Error(`Cannot transition from ${this.currentState} to ${to}`);
    }
    this.currentState = to;
  }

  getState(): OrderState {
    return this.currentState;
  }
}
