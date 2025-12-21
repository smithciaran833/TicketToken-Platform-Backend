import { Pool } from 'pg';
import { OrderState } from '../services/state-machine/order-state-machine';

export interface OrderEvent {
  orderId: string;
  type: string;
  payload: any;
  timestamp: Date;
}

export class OrderEventProcessor {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async processOrderEvent(event: OrderEvent): Promise<void> {
    const order = await this.db.query(
      'SELECT status FROM orders WHERE id = $1',
      [event.orderId]
    );

    if (order.rows.length === 0) {
      throw new Error(`Order ${event.orderId} not found`);
    }

    const currentState = order.rows[0].status as OrderState;

    // Process based on event type and current state
    switch (event.type) {
      case 'order.payment_received':
        if (currentState === OrderState.PAYMENT_PROCESSING) {
          await this.updateOrderStatus(event.orderId, OrderState.PAID);
        }
        break;
      case 'order.items_shipped':
        if (currentState === OrderState.PAID) {
          await this.updateOrderStatus(event.orderId, OrderState.FULFILLED);
        }
        break;
      case 'order.cancelled':
        await this.handleOrderCancellation(event.orderId, currentState);
        break;
    }
  }

  private async updateOrderStatus(orderId: string, newState: OrderState): Promise<void> {
    await this.db.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
      [newState, orderId]
    );
  }

  private async handleOrderCancellation(orderId: string, currentState: OrderState): Promise<void> {
    // Can only cancel if not already fulfilled or refunded
    const cancellableStates = [
      OrderState.CREATED,
      OrderState.PAYMENT_PENDING,
      OrderState.PAYMENT_FAILED
    ];

    if (cancellableStates.includes(currentState)) {
      await this.updateOrderStatus(orderId, OrderState.CANCELLED);
    }
  }
}
