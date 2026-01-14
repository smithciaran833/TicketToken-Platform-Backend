import { MockStripeService } from '../../../../src/services/mock/mock-stripe.service';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('MockStripeService', () => {
  let mockStripeService: MockStripeService;

  beforeEach(() => {
    mockStripeService = new MockStripeService();
  });

  // ===========================================================================
  // createPaymentIntent() - 8 test cases
  // ===========================================================================

  describe('createPaymentIntent()', () => {
    it('should create payment intent with correct amount', async () => {
      const result = await mockStripeService.createPaymentIntent(10000, { orderId: 'order-123' });

      expect(result.amount).toBe(10000);
    });

    it('should generate unique payment intent id', async () => {
      const result = await mockStripeService.createPaymentIntent(5000, {});

      expect(result.id).toMatch(/^pi_\d+_[a-z0-9]+$/);
    });

    it('should set currency to usd', async () => {
      const result = await mockStripeService.createPaymentIntent(10000, {});

      expect(result.currency).toBe('usd');
    });

    it('should set status to succeeded', async () => {
      const result = await mockStripeService.createPaymentIntent(10000, {});

      expect(result.status).toBe('succeeded');
    });

    it('should include metadata', async () => {
      const metadata = { orderId: 'order-456', userId: 'user-789' };
      const result = await mockStripeService.createPaymentIntent(10000, metadata);

      expect(result.metadata).toEqual(metadata);
    });

    it('should include created timestamp', async () => {
      const result = await mockStripeService.createPaymentIntent(10000, {});

      expect(result.created).toBeDefined();
      expect(typeof result.created).toBe('number');
    });

    it('should mark as mock data', async () => {
      const result = await mockStripeService.createPaymentIntent(10000, {});

      expect(result.mockData).toBe(true);
    });

    it('should generate different ids for multiple calls', async () => {
      const result1 = await mockStripeService.createPaymentIntent(5000, {});
      const result2 = await mockStripeService.createPaymentIntent(5000, {});

      expect(result1.id).not.toBe(result2.id);
    });
  });

  // ===========================================================================
  // createRefund() - 8 test cases
  // ===========================================================================

  describe('createRefund()', () => {
    it('should create refund with payment intent id', async () => {
      const result = await mockStripeService.createRefund('pi_test123', 5000);

      expect(result.payment_intent).toBe('pi_test123');
    });

    it('should generate unique refund id', async () => {
      const result = await mockStripeService.createRefund('pi_test123', 5000);

      expect(result.id).toMatch(/^re_\d+_[a-z0-9]+$/);
    });

    it('should use specified amount', async () => {
      const result = await mockStripeService.createRefund('pi_test123', 7500);

      expect(result.amount).toBe(7500);
    });

    it('should default to 0 amount when not specified', async () => {
      const result = await mockStripeService.createRefund('pi_test123');

      expect(result.amount).toBe(0);
    });

    it('should set status to succeeded', async () => {
      const result = await mockStripeService.createRefund('pi_test123', 5000);

      expect(result.status).toBe('succeeded');
    });

    it('should include created timestamp', async () => {
      const result = await mockStripeService.createRefund('pi_test123', 5000);

      expect(result.created).toBeDefined();
      expect(typeof result.created).toBe('number');
    });

    it('should mark as mock data', async () => {
      const result = await mockStripeService.createRefund('pi_test123', 5000);

      expect(result.mockData).toBe(true);
    });

    it('should generate different ids for multiple refunds', async () => {
      const result1 = await mockStripeService.createRefund('pi_test123', 1000);
      const result2 = await mockStripeService.createRefund('pi_test123', 1000);

      expect(result1.id).not.toBe(result2.id);
    });
  });

  // ===========================================================================
  // createCustomer() - 7 test cases
  // ===========================================================================

  describe('createCustomer()', () => {
    it('should create customer with email and name', async () => {
      const result = await mockStripeService.createCustomer('test@example.com', 'Test User');

      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
    });

    it('should generate unique customer id', async () => {
      const result = await mockStripeService.createCustomer('test@example.com', 'Test User');

      expect(result.id).toMatch(/^cus_\d+_[a-z0-9]+$/);
    });

    it('should include created timestamp', async () => {
      const result = await mockStripeService.createCustomer('test@example.com', 'Test User');

      expect(result.created).toBeDefined();
      expect(typeof result.created).toBe('number');
    });

    it('should mark as mock data', async () => {
      const result = await mockStripeService.createCustomer('test@example.com', 'Test User');

      expect(result.mockData).toBe(true);
    });

    it('should generate different ids for multiple customers', async () => {
      const result1 = await mockStripeService.createCustomer('user1@test.com', 'User One');
      const result2 = await mockStripeService.createCustomer('user2@test.com', 'User Two');

      expect(result1.id).not.toBe(result2.id);
    });

    it('should handle different email formats', async () => {
      const result = await mockStripeService.createCustomer('user+test@example.co.uk', 'User');

      expect(result.email).toBe('user+test@example.co.uk');
    });

    it('should handle names with special characters', async () => {
      const result = await mockStripeService.createCustomer('test@test.com', "O'Connor");

      expect(result.name).toBe("O'Connor");
    });
  });
});
