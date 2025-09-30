// Mock Stripe that matches real Stripe SDK interface
export class StripeMock {
  paymentIntents = {
    create: async (params: any) => {
      // Generate realistic looking Stripe IDs
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 15);
      
      return {
        id: `pi_test_${timestamp}_${randomStr}`,
        client_secret: `pi_test_${timestamp}_${randomStr}_secret_${Math.random().toString(36).substring(2, 15)}`,
        amount: params.amount,
        currency: params.currency,
        status: 'requires_payment_method',
        application_fee_amount: params.application_fee_amount,
        metadata: params.metadata,
        created: Math.floor(timestamp / 1000)
      };
    },
    
    retrieve: async (id: string) => {
      return {
        id,
        status: 'succeeded',
        amount: 10000,
        currency: 'usd'
      };
    }
  };
  
  webhookEndpoints = {
    create: async (params: any) => {
      return {
        id: `we_test_${Date.now()}`,
        url: params.url,
        enabled_events: params.enabled_events
      };
    }
  };
}
