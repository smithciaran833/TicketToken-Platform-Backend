export class MockStripeService {
  async createPaymentIntent(amount: number, metadata: any) {
    return {
      id: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount: amount, // Convert to cents
      currency: 'usd',
      status: 'succeeded',
      metadata,
      created: Date.now(),
      mockData: true
    };
  }

  async createRefund(paymentIntentId: string, amount?: number) {
    return {
      id: `re_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      payment_intent: paymentIntentId,
      amount: amount || 0,
      status: 'succeeded',
      created: Date.now(),
      mockData: true
    };
  }

  async createCustomer(email: string, name: string) {
    return {
      id: `cus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email,
      name,
      created: Date.now(),
      mockData: true
    };
  }
}
