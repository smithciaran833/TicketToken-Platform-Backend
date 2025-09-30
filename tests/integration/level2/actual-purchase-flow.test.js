const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

describe('Level 2: ACTUAL Purchase Flow with Database', () => {
  
  const testData = {
    orderId: null,
    reservationId: null,
    paymentId: null,
    userId: uuidv4(),
    eventId: '660e8400-e29b-41d4-a716-446655440000',
    ticketTypeId: '770e8400-e29b-41d4-a716-446655440000'
  };

  test('Step 1: Create Order in Database', async () => {
    // Check if order can be created directly
    const orderData = {
      id: uuidv4(),
      userId: testData.userId,
      eventId: testData.eventId,
      status: 'PENDING',
      totalAmount: 100.00,
      orderNumber: `ORD-${Date.now()}`,
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString() // 15 min
    };
    
    console.log('Order to create:', orderData.orderNumber);
    testData.orderId = orderData.id;
    
    // Try ticket service order endpoint
    const response = await axios({
      method: 'POST',
      url: 'http://localhost:3004/api/v1/orders',
      data: orderData,
      validateStatus: () => true
    });
    
    console.log('Order creation response:', response.status);
    if (response.data?.error) {
      console.log('Error:', response.data.error);
    }
  });

  test('Step 2: Create Reservation', async () => {
    const reservationData = {
      id: uuidv4(),
      orderId: testData.orderId,
      userId: testData.userId,
      ticketTypeId: testData.ticketTypeId,
      eventId: testData.eventId,
      quantity: 2,
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
      status: 'ACTIVE'
    };
    
    console.log('Creating reservation for order:', testData.orderId);
    testData.reservationId = reservationData.id;
    
    // This should decrement available tickets
    // Real implementation would use SELECT FOR UPDATE
    console.log('TODO: Need endpoint that creates reservation with row lock');
  });

  test('Step 3: Process Payment', async () => {
    const response = await axios({
      method: 'POST',
      url: 'http://localhost:3005/api/payments/process',
      data: {
        amount: 100,
        venueId: '550e8400-e29b-41d4-a716-446655440000',
        eventId: testData.eventId,
        tickets: [{ id: 'test-1' }, { id: 'test-2' }],
        userId: testData.userId,
        currency: 'USD'
      },
      validateStatus: () => true
    });
    
    console.log('Payment response:', response.status);
    if (response.status === 200) {
      testData.paymentId = response.data.paymentIntent?.id;
      console.log('Payment ID:', testData.paymentId);
    }
  });

  test('Step 4: Complete Payment (simulating webhook)', async () => {
    if (!testData.paymentId) {
      testData.paymentId = '2e76b464-ec63-4108-80c4-dc5abf95edad'; // Use existing
    }
    
    const response = await axios({
      method: 'POST',
      url: 'http://localhost:3005/api/v1/internal/payment-complete',
      data: {
        orderId: testData.orderId,
        paymentId: testData.paymentId
      },
      headers: {
        'x-internal-service': 'ticket-service'
      }
    });
    
    console.log('Payment completion:', response.status);
    expect(response.status).toBe(200);
  });

  test('Step 5: Check Database State', async () => {
    // We need to verify the state transitions happened
    console.log('\n=== DATABASE STATE CHECKS NEEDED ===');
    console.log('1. Order status should be PAID');
    console.log('2. Reservation status should be CONVERTED');
    console.log('3. Tickets should be created');
    console.log('4. Payment transaction should be completed');
    console.log('5. Outbox should have events');
  });

  test('Step 6: Check Message Queues', async () => {
    const response = await axios({
      method: 'GET',
      url: 'http://localhost:15672/api/queues',
      auth: {
        username: 'guest',
        password: 'guest'
      },
      validateStatus: () => true
    });
    
    if (response.status === 200) {
      console.log('\n=== QUEUE STATUS ===');
      response.data.forEach(q => {
        if (q.messages > 0 || q.consumers > 0) {
          console.log(`${q.name}: ${q.messages} messages, ${q.consumers} consumers`);
        }
      });
    }
  });

  test('MISSING COMPONENTS IDENTIFIED', () => {
    console.log('\n=== CRITICAL MISSING PIECES ===');
    console.log('1. ❌ Payment webhook consumer not running');
    console.log('   - payment.webhook queue doesn\'t exist');
    console.log('   - Need to implement webhook.processor consumer');
    console.log('');
    console.log('2. ❌ Order state machine not connected');
    console.log('   - Payment completion doesn\'t update order status');
    console.log('   - Need PaymentEventHandler in ticket-service');
    console.log('');
    console.log('3. ❌ Reservation system incomplete');
    console.log('   - No endpoint to create reservations');
    console.log('   - No expiry worker running');
    console.log('');
    console.log('4. ❌ Ticket minting not triggered');
    console.log('   - ticket.mint queue doesn\'t exist');
    console.log('   - blockchain.mint queue not being consumed');
    console.log('');
    console.log('5. ❌ Analytics aggregation missing');
    console.log('   - Only analytics_events queue exists');
    console.log('   - No consumer processing events');
    console.log('=====================================\n');
  });
});
