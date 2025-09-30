import { PaymentState, PaymentStateMachine } from './payment-state-machine';
import { OrderState, OrderStateMachine } from './order-state-machine';
import { Pool } from 'pg';

export interface TransitionContext {
  paymentId: string;
  orderId: string;
  provider: string;
  amount: number;
  metadata?: Record<string, any>;
}

export class StateTransitionService {
  private paymentStateMachine: PaymentStateMachine;
  private db: Pool;

  constructor(db: Pool) {
    this.paymentStateMachine = new PaymentStateMachine();
    this.db = db;
  }

  async handlePaymentEvent(
    event: string,
    currentState: PaymentState,
    context: TransitionContext
  ): Promise<PaymentState> {
    if (!this.paymentStateMachine.canTransition(currentState, event)) {
      throw new Error(`Invalid transition: ${currentState} cannot handle ${event}`);
    }

    const newState = this.paymentStateMachine.transition(currentState, event);

    // Update database
    await this.db.query(
      'UPDATE payments SET state = $1, updated_at = NOW() WHERE id = $2',
      [newState, context.paymentId]
    );

    // Update order state based on payment state
    await this.syncOrderState(context.orderId, newState);

    return newState;
  }

  private async syncOrderState(orderId: string, paymentState: PaymentState): Promise<void> {
    const orderStateMap: Record<PaymentState, OrderState> = {
      [PaymentState.PENDING]: OrderState.PAYMENT_PENDING,
      [PaymentState.PROCESSING]: OrderState.PAYMENT_PROCESSING,
      [PaymentState.COMPLETED]: OrderState.PAID,
      [PaymentState.FAILED]: OrderState.PAYMENT_FAILED,
      [PaymentState.REFUNDED]: OrderState.REFUNDED,
      [PaymentState.CANCELLED]: OrderState.CANCELLED
    };

    const newOrderState = orderStateMap[paymentState];
    if (newOrderState) {
      await this.db.query(
        'UPDATE orders SET state = $1, updated_at = NOW() WHERE id = $2',
        [newOrderState, orderId]
      );
    }
  }
}
