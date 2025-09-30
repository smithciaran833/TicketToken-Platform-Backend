import { PaymentState } from '../../services/state-machine/payment-state-machine';
import { OrderState } from '../../services/state-machine/order-state-machine';

export class FixtureBuilder {
  static createPayment(overrides: any = {}) {
    return {
      id: 'pay_test_' + Math.random().toString(36).substring(7),
      amount: 1000,
      currency: 'USD',
      state: PaymentState.PENDING,
      provider: 'stripe',
      provider_payment_id: 'pi_test_' + Math.random().toString(36).substring(7),
      customer_id: 'cus_test',
      order_id: 'ord_test',
      retry_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides
    };
  }

  static createOrder(overrides: any = {}) {
    return {
      id: 'ord_test_' + Math.random().toString(36).substring(7),
      customer_id: 'cus_test',
      total_amount: 1000,
      currency: 'USD',
      state: OrderState.CREATED,
      items: [],
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides
    };
  }

  static createWebhookPayload(provider: string, type: string, overrides: any = {}) {
    if (provider === 'stripe') {
      return {
        id: 'evt_test_' + Math.random().toString(36).substring(7),
        type: type,
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'pi_test_' + Math.random().toString(36).substring(7),
            amount: 1000,
            currency: 'usd',
            status: 'succeeded',
            ...overrides
          }
        }
      };
    }
    // Add other providers as needed
    return {};
  }
}
