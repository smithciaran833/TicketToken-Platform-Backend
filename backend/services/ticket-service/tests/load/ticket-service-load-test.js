import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/**
 * K6 Load Test for Ticket Service
 * 
 * Test Scenarios:
 * - Concurrent ticket purchases (500+ users)
 * - QR code validation under load
 * - Reservation creation and expiry
 * - User ticket listing
 * - Mixed workload simulation
 * 
 * Run with:
 * k6 run --vus 500 --duration 5m ticket-service-load-test.js
 */

// ==========================================
// CONFIGURATION
// ==========================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3004';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-jwt-token-here';

// Custom metrics
const purchaseErrorRate = new Rate('purchase_errors');
const purchaseLatency = new Trend('purchase_latency');
const qrValidationLatency = new Trend('qr_validation_latency');
const reservationSuccessRate = new Rate('reservation_success');
const ticketListingLatency = new Trend('ticket_listing_latency');
const purchaseSuccessCounter = new Counter('successful_purchases');
const purchaseFailureCounter = new Counter('failed_purchases');

// ==========================================
// TEST OPTIONS
// ==========================================

export const options = {
  scenarios: {
    // Scenario 1: Gradual ramp-up for ticket purchases
    ticket_purchases: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },  // Ramp up to 100 users
        { duration: '5m', target: 500 },  // Ramp up to 500 users
        { duration: '3m', target: 500 },  // Stay at 500 users
        { duration: '2m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '30s',
      exec: 'purchaseTickets',
    },

    // Scenario 2: QR validation stress test
    qr_validation: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
      startTime: '1m',
      exec: 'validateQRCodes',
    },

    // Scenario 3: User ticket listings
    ticket_listings: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 100,
      startTime: '30s',
      exec: 'listUserTickets',
    },

    // Scenario 4: Health check monitoring
    health_check: {
      executor: 'constant-vus',
      vus: 1,
      duration: '12m',
      exec: 'checkHealth',
    },
  },

  thresholds: {
    // HTTP request duration thresholds
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    
    // HTTP request failure rate
    http_req_failed: ['rate<0.05'], // <5% errors
    
    // Purchase-specific thresholds
    purchase_errors: ['rate<0.10'], // <10% purchase errors
    purchase_latency: ['p(95)<2000', 'p(99)<3000'],
    
    // QR validation thresholds
    qr_validation_latency: ['p(95)<100', 'p(99)<200'],
    
    // Reservation success rate
    reservation_success: ['rate>0.90'], // >90% success
    
    // Ticket listing performance
    ticket_listing_latency: ['p(95)<500'],
  },
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getHeaders(includeAuth = true) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (includeAuth && AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }
  
  return headers;
}

function generateUserId() {
  return `user-${__VU}-${__ITER}`;
}

function generateEventId() {
  // Simulate 10 different events
  return `event-${Math.floor(Math.random() * 10) + 1}`;
}

function generateTicketTypeId() {
  return `ticket-type-${Math.floor(Math.random() * 5) + 1}`;
}

function logResult(name, response, checkResult) {
  if (!checkResult) {
    console.log(`[FAIL] ${name}: Status ${response.status}, Body: ${response.body}`);
  }
}

// ==========================================
// TEST SCENARIOS
// ==========================================

/**
 * Scenario 1: Ticket Purchase Flow
 * Tests the complete purchase process including:
 * - Reservation creation
 * - Payment processing
 * - Ticket issuance
 */
export function purchaseTickets() {
  const userId = generateUserId();
  const eventId = generateEventId();
  const ticketTypeId = generateTicketTypeId();

  group('Ticket Purchase Flow', () => {
    // Step 1: Create reservation
    const reservationPayload = JSON.stringify({
      userId,
      eventId,
      ticketTypeId,
      quantity: Math.floor(Math.random() * 3) + 1, // 1-3 tickets
    });

    const startTime = Date.now();
    
    const reservationResponse = http.post(
      `${BASE_URL}/api/v1/tickets/reservations`,
      reservationPayload,
      { headers: getHeaders(), tags: { name: 'CreateReservation' } }
    );

    const reservationSuccess = check(reservationResponse, {
      'reservation created': (r) => r.status === 201 || r.status === 200,
      'reservation has ID': (r) => {
        try {
          return JSON.parse(r.body).reservationId !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    reservationSuccessRate.add(reservationSuccess);

    if (!reservationSuccess) {
      purchaseErrorRate.add(1);
      purchaseFailureCounter.add(1);
      logResult('Create Reservation', reservationResponse, false);
      return;
    }

    const reservationId = JSON.parse(reservationResponse.body).reservationId;

    sleep(Math.random() * 2); // Simulate user payment time

    // Step 2: Confirm purchase
    const purchasePayload = JSON.stringify({
      reservationId,
      paymentMethod: 'stripe',
      paymentToken: `tok_${Date.now()}`,
    });

    const purchaseResponse = http.post(
      `${BASE_URL}/api/v1/tickets/purchase`,
      purchasePayload,
      { headers: getHeaders(), tags: { name: 'ConfirmPurchase' } }
    );

    const latency = Date.now() - startTime;
    purchaseLatency.add(latency);

    const purchaseSuccess = check(purchaseResponse, {
      'purchase successful': (r) => r.status === 200 || r.status === 201,
      'tickets issued': (r) => {
        try {
          return JSON.parse(r.body).tickets !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    if (purchaseSuccess) {
      purchaseSuccessCounter.add(1);
      purchaseErrorRate.add(0);
    } else {
      purchaseErrorRate.add(1);
      purchaseFailureCounter.add(1);
      logResult('Confirm Purchase', purchaseResponse, false);
    }
  });

  sleep(1);
}

/**
 * Scenario 2: QR Code Validation
 * Simulates venue staff validating tickets at entry gates
 */
export function validateQRCodes() {
  const ticketId = `ticket-${Math.floor(Math.random() * 1000)}`;
  const qrCode = `QR-${ticketId}-${Date.now()}`;

  group('QR Code Validation', () => {
    const startTime = Date.now();

    const response = http.post(
      `${BASE_URL}/api/v1/tickets/validate-qr`,
      JSON.stringify({ qrCode }),
      { headers: getHeaders(), tags: { name: 'ValidateQR' } }
    );

    const latency = Date.now() - startTime;
    qrValidationLatency.add(latency);

    check(response, {
      'QR validation response': (r) => r.status === 200 || r.status === 404 || r.status === 400,
      'QR validation fast': () => latency < 200, // Must be <200ms
    });
  });

  sleep(0.1); // Quick sleep for high throughput
}

/**
 * Scenario 3: User Ticket Listing
 * Tests user viewing their tickets
 */
export function listUserTickets() {
  const userId = generateUserId();

  group('List User Tickets', () => {
    const startTime = Date.now();

    const response = http.get(
      `${BASE_URL}/api/v1/tickets/users/${userId}`,
      { headers: getHeaders(), tags: { name: 'ListTickets' } }
    );

    const latency = Date.now() - startTime;
    ticketListingLatency.add(latency);

    check(response, {
      'tickets listed': (r) => r.status === 200,
      'tickets array returned': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body).tickets);
        } catch (e) {
          return false;
        }
      },
      'listing fast': () => latency < 500,
    });
  });

  sleep(1);
}

/**
 * Scenario 4: Health Check
 * Continuous health monitoring during load test
 */
export function checkHealth() {
  const response = http.get(`${BASE_URL}/health`, {
    tags: { name: 'HealthCheck' }
  });

  check(response, {
    'health check passes': (r) => r.status === 200,
  });

  sleep(5); // Check every 5 seconds
}

// ==========================================
// SETUP AND TEARDOWN
// ==========================================

export function setup() {
  console.log('='.repeat(50));
  console.log('Starting Load Test for Ticket Service');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Target: 500+ concurrent users`);
  console.log(`Duration: 12 minutes`);
  console.log('='.repeat(50));

  // Verify service is accessible
  const response = http.get(`${BASE_URL}/health`);
  if (response.status !== 200) {
    throw new Error(`Service is not accessible: ${response.status}`);
  }

  console.log('✓ Service is accessible');
  console.log('');
}

export function teardown(data) {
  console.log('');
  console.log('='.repeat(50));
  console.log('Load Test Complete');
  console.log(`Successful Purchases: ${purchaseSuccessCounter.counter}`);
  console.log(`Failed Purchases: ${purchaseFailureCounter.counter}`);
  console.log('='.repeat(50));
}

// ==========================================
// ADDITIONAL TEST SCENARIOS
// ==========================================

/**
 * Spike Test Configuration
 * Uncomment and run separately to test service under sudden load
 */
/*
export const spikeOptions = {
  stages: [
    { duration: '10s', target: 100 },   // Fast ramp up
    { duration: '1m', target: 1000 },   // Spike to 1000
    { duration: '10s', target: 100 },   // Fast ramp down
    { duration: '3m', target: 100 },    // Recovery
  ],
};
*/

/**
 * Stress Test Configuration  
 * Uncomment and run separately to find breaking point
 */
/*
export const stressOptions = {
  stages: [
    { duration: '2m', target: 200 },
    { duration: '5m', target: 500 },
    { duration: '5m', target: 1000 },
    { duration: '5m', target: 1500 },
    { duration: '10m', target: 2000 },
  ],
};
*/
