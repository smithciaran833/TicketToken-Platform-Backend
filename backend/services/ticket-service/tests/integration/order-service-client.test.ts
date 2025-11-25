import { orderServiceClient } from '../../src/clients/OrderServiceClient';

/**
 * Manual integration test for OrderServiceClient
 * Run this when order-service is running
 */
async function testOrderServiceClient() {
  console.log('🧪 Testing OrderServiceClient...\n');

  try {
    // Test 1: Check circuit breaker status
    console.log('Test 1: Circuit Breaker Status');
    const status = orderServiceClient.getCircuitBreakerStatus();
    console.log('✅ Circuit breaker status:', status);
    console.log('');

    // Test 2: Try to create an order (will fail if order-service is down)
    console.log('Test 2: Create Order (expecting failure if service is down)');
    try {
      const result = await orderServiceClient.createOrder({
        userId: 'test-user-123',
        eventId: 'test-event-123',
        items: [
          {
            ticketTypeId: 'test-ticket-type-123',
            quantity: 2,
            unitPriceCents: 5000,
          },
        ],
        currency: 'USD',
        metadata: { test: true },
      });
      console.log('✅ Order created:', result);
    } catch (error: any) {
      console.log('❌ Expected error (service not running):', error.message);
    }
    console.log('');

    // Test 3: Check circuit breaker status after failure
    console.log('Test 3: Circuit Breaker Status After Failure');
    const statusAfter = orderServiceClient.getCircuitBreakerStatus();
    console.log('Circuit breaker status after failure:', statusAfter);
    console.log('');

    console.log('🎉 All tests completed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testOrderServiceClient().then(() => {
    console.log('✅ Test suite finished');
    process.exit(0);
  }).catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}
