const { orderServiceClient } = require('./dist/clients/OrderServiceClient');

async function test() {
  console.log('🧪 Testing OrderServiceClient\n');
  
  // Test 1: Circuit breaker status
  console.log('1. Circuit Breaker Status:');
  console.log(orderServiceClient.getCircuitBreakerStatus());
  console.log('');
  
  // Test 2: Try to create an order (will fail - missing auth/validation)
  console.log('2. Testing createOrder (expect validation error):');
  try {
    const result = await orderServiceClient.createOrder({
      userId: 'test-user-123',
      eventId: 'test-event-456',
      items: [{
        ticketTypeId: 'test-ticket-789',
        quantity: 2,
        unitPriceCents: 5000
      }],
      currency: 'USD'
    });
    console.log('✅ Result:', result);
  } catch (error) {
    console.log('❌ Error (expected):', error.name, '-', error.message);
  }
  console.log('');
  
  // Test 3: Circuit breaker status after call
  console.log('3. Circuit Breaker Status After Call:');
  console.log(orderServiceClient.getCircuitBreakerStatus());
}

test().then(() => {
  console.log('\n✅ Test complete');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
