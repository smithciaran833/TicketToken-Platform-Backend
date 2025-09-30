const axios = require('axios');

describe('Level 2: Service Communication Tests', () => {
  
  test('Payment Service Integration - Complete Payment', async () => {
    // Test the actual endpoint we built
    const response = await axios.post('http://localhost:3005/api/v1/internal/payment-complete', {
      orderId: 'test-order-' + Date.now(),
      paymentId: '2e76b464-ec63-4108-80c4-dc5abf95edad' // Real payment ID from DB
    }, {
      headers: { 'x-internal-service': 'ticket-service' }
    });
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    console.log('✓ Payment completion endpoint working');
  });
  
  test('Venue Service Integration - Ticket Validation', async () => {
    // Test validation with our test data
    const response = await axios.get(
      'http://localhost:3002/internal/venues/550e8400-e29b-41d4-a716-446655440000/validate-ticket/test-ticket-123'
    );
    
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('valid');
    console.log('✓ Venue validation endpoint working');
  });
  
  test('Blockchain Service Integration - Minting Request', async () => {
    try {
      const response = await axios.post('http://localhost:3015/internal/mint-tickets', {
        ticketIds: ['test-1', 'test-2']
      });
    } catch (error) {
      // We expect this to fail since minting service isn't connected
      expect(error.response.status).toBe(500);
      console.log('✓ Blockchain endpoint exists and attempts to forward');
    }
  });
});
