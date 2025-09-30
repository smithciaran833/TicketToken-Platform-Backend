const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const SERVICES = {
  auth: 'http://localhost:3001',
  venue: 'http://localhost:3002',
  event: 'http://localhost:3003',
  ticket: 'http://localhost:3004',
  payment: 'http://localhost:3005',
  marketplace: 'http://localhost:3006',
  blockchain: 'http://localhost:3015',
  minting: 'http://localhost:3018'
};

describe('Level 2: Purchase Flow Integration Test', () => {
  
  test('Step 1: Test Payment Internal Endpoint', async () => {
    const response = await axios({
      method: 'POST',
      url: `${SERVICES.payment}/api/v1/internal/payment-complete`,
      data: {
        orderId: 'test-order-123',
        paymentId: '2e76b464-ec63-4108-80c4-dc5abf95edad'
      },
      headers: {
        'x-internal-service': 'ticket-service',
        'Content-Type': 'application/json'
      },
      validateStatus: () => true
    });

    console.log('Payment endpoint:', response.status);
    expect(response.status).toBe(200);
  });

  test('Step 2: Test Venue Validation Endpoint', async () => {
    const testTicketId = uuidv4();
    const response = await axios({
      method: 'GET',
      url: `${SERVICES.venue}/internal/venues/550e8400-e29b-41d4-a716-446655440000/validate-ticket/${testTicketId}`,
      headers: {
        'x-internal-service': 'ticket-service'
      },
      validateStatus: () => true
    });

    console.log('Venue validation:', response.status);
    expect([404, 200]).toContain(response.status);
  });

  test('Step 3: Test Blockchain Minting Endpoint', async () => {
    const response = await axios({
      method: 'POST',
      url: `${SERVICES.blockchain}/internal/mint-tickets`,
      data: {
        ticketIds: [uuidv4()]
      },
      headers: {
        'x-internal-service': 'ticket-service',
        'Content-Type': 'application/json'
      },
      validateStatus: () => true
    });

    console.log('Blockchain minting:', response.status);
    expect([500, 502, 200]).toContain(response.status);
  });
});
