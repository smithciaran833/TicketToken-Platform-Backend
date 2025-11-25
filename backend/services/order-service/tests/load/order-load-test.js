/**
 * Order Service Load Test
 * 
 * Run with k6:
 * k6 run tests/load/order-load-test.js
 * 
 * Or with specific scenarios:
 * k6 run --env SCENARIO=spike tests/load/order-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const orderCreationDuration = new Trend('order_creation_duration');
const orderReservationDuration = new Trend('order_reservation_duration');
const orderConfirmationDuration = new Trend('order_confirmation_duration');
const orderCancellationDuration = new Trend('order_cancellation_duration');
const failureRate = new Rate('failure_rate');
const raceConditionDetected = new Counter('race_conditions_detected');
const rateLimitHits = new Counter('rate_limit_hits');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3003';
const SCENARIO = __ENV.SCENARIO || 'baseline';

// Test data
const TENANT_ID = 'test-tenant-123';
const USER_ID = 'test-user-456';
const EVENT_ID = 'test-event-789';

// Scenarios configuration
export const options = {
  scenarios: {
    // Baseline: Steady load testing
    baseline: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // Ramp up to 50 users
        { duration: '5m', target: 50 },   // Stay at 50 users
        { duration: '2m', target: 100 },  // Ramp up to 100 users
        { duration: '5m', target: 100 },  // Stay at 100 users
        { duration: '2m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '30s',
      exec: 'baselineScenario',
    },
    
    // Spike: Sudden traffic spike
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },    // Normal load
        { duration: '10s', target: 500 },  // Sudden spike!
        { duration: '3m', target: 500 },   // Sustain spike
        { duration: '10s', target: 50 },   // Drop back
        { duration: '1m', target: 0 },     // Cool down
      ],
      gracefulRampDown: '30s',
      exec: 'spikeScenario',
    },
    
    // Stress: Find breaking point
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 200 },
        { duration: '5m', target: 300 },
        { duration: '5m', target: 400 },
        { duration: '5m', target: 500 },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
      exec: 'stressScenario',
    },
    
    // Soak: Extended duration testing
    soak: {
      executor: 'constant-vus',
      vus: 100,
      duration: '30m',
      gracefulRampDown: '1m',
      exec: 'soakScenario',
    },
    
    // Race Conditions: High concurrency on same resources
    raceConditions: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 1000,
      maxDuration: '5m',
      exec: 'raceConditionScenario',
    },
  },
  
  thresholds: {
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'], // 95% under 2s, 99% under 5s
    'http_req_failed': ['rate<0.05'],                   // Error rate < 5%
    'failure_rate': ['rate<0.05'],                      // Business logic failures < 5%
    'order_creation_duration': ['p(95)<1500'],          // Order creation < 1.5s
    'order_reservation_duration': ['p(95)<2000'],       // Reservation < 2s
    'order_confirmation_duration': ['p(95)<2500'],      // Confirmation < 2.5s
  },
};

// Helper function to generate auth token
function getAuthToken() {
  return `Bearer test-token-${USER_ID}`;
}

// Helper function to generate unique order data
function generateOrderData() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  
  return {
    userId: USER_ID,
    eventId: EVENT_ID,
    currency: 'USD',
    idempotencyKey: `idempotency-${timestamp}-${random}`,
    items: [
      {
        ticketTypeId: `ticket-type-${Math.floor(Math.random() * 5) + 1}`,
        quantity: Math.floor(Math.random() * 3) + 1,
        unitPriceCents: 5000,
      },
    ],
    metadata: {
      source: 'load-test',
      timestamp,
    },
  };
}

// Baseline scenario: Normal mixed workload
export function baselineScenario() {
  const scenario = Math.random();
  
  if (scenario < 0.5) {
    // 50% order creation
    createOrder();
  } else if (scenario < 0.8) {
    // 30% full order flow (create -> reserve -> confirm)
    completeOrderFlow();
  } else {
    // 20% order queries
    queryOrders();
  }
  
  sleep(Math.random() * 3 + 1); // Random sleep 1-4 seconds
}

// Spike scenario: Simulates flash sale
export function spikeScenario() {
  createOrder();
  sleep(Math.random() * 0.5); // Minimal sleep during spike
}

// Stress scenario: Push system to limits
export function stressScenario() {
  if (Math.random() < 0.7) {
    createOrder();
  } else {
    completeOrderFlow();
  }
  
  sleep(Math.random() * 0.5); // Minimal sleep
}

// Soak scenario: Extended normal load
export function soakScenario() {
  const scenario = Math.random();
  
  if (scenario < 0.4) {
    createOrder();
  } else if (scenario < 0.7) {
    completeOrderFlow();
  } else if (scenario < 0.9) {
    queryOrders();
  } else {
    // 10% cancellations
    createAndCancelOrder();
  }
  
  sleep(Math.random() * 2 + 1);
}

// Race condition scenario: Test distributed locks
export function raceConditionScenario() {
  // All VUs try to operate on a limited set of orders simultaneously
  const sharedOrderId = `race-order-${__VU % 10}`;
  
  // Try to reserve the same order concurrently
  const startTime = Date.now();
  const res = http.post(
    `${BASE_URL}/api/orders/${sharedOrderId}/reserve`,
    JSON.stringify({}),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthToken(),
        'X-Tenant-ID': TENANT_ID,
      },
    }
  );
  
  const duration = Date.now() - startTime;
  
  // Check for race condition indicators
  if (res.status === 409 || res.status === 423) {
    // Conflict or Locked - expected due to distributed lock
    raceConditionDetected.add(0);
  } else if (res.status === 500) {
    // Server error might indicate race condition
    raceConditionDetected.add(1);
  }
  
  check(res, {
    'race condition handled': (r) => r.status === 409 || r.status === 423 || r.status === 200,
  });
}

// Test functions

function createOrder() {
  const orderData = generateOrderData();
  const startTime = Date.now();
  
  const res = http.post(
    `${BASE_URL}/api/orders`,
    JSON.stringify(orderData),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthToken(),
        'X-Tenant-ID': TENANT_ID,
        'X-Idempotency-Key': orderData.idempotencyKey,
      },
      tags: { name: 'CreateOrder' },
    }
  );
  
  const duration = Date.now() - startTime;
  orderCreationDuration.add(duration);
  
  const success = check(res, {
    'order created': (r) => r.status === 201,
    'has order id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.order && body.order.id;
      } catch {
        return false;
      }
    },
  });
  
  failureRate.add(!success);
  
  if (res.status === 429) {
    rateLimitHits.add(1);
  }
  
  return res.status === 201 ? JSON.parse(res.body) : null;
}

function reserveOrder(orderId) {
  const startTime = Date.now();
  
  const res = http.post(
    `${BASE_URL}/api/orders/${orderId}/reserve`,
    JSON.stringify({}),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthToken(),
        'X-Tenant-ID': TENANT_ID,
      },
      tags: { name: 'ReserveOrder' },
    }
  );
  
  const duration = Date.now() - startTime;
  orderReservationDuration.add(duration);
  
  const success = check(res, {
    'order reserved': (r) => r.status === 200,
    'has payment intent': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.paymentIntent && body.paymentIntent.paymentIntentId;
      } catch {
        return false;
      }
    },
  });
  
  failureRate.add(!success);
  
  return res.status === 200 ? JSON.parse(res.body) : null;
}

function confirmOrder(orderId, paymentIntentId) {
  const startTime = Date.now();
  
  const res = http.post(
    `${BASE_URL}/api/orders/${orderId}/confirm`,
    JSON.stringify({ paymentIntentId }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthToken(),
        'X-Tenant-ID': TENANT_ID,
      },
      tags: { name: 'ConfirmOrder' },
    }
  );
  
  const duration = Date.now() - startTime;
  orderConfirmationDuration.add(duration);
  
  const success = check(res, {
    'order confirmed': (r) => r.status === 200,
    'status is CONFIRMED': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.order && body.order.status === 'CONFIRMED';
      } catch {
        return false;
      }
    },
  });
  
  failureRate.add(!success);
  
  return success;
}

function cancelOrder(orderId) {
  const startTime = Date.now();
  
  const res = http.post(
    `${BASE_URL}/api/orders/${orderId}/cancel`,
    JSON.stringify({ reason: 'load-test-cancellation' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthToken(),
        'X-Tenant-ID': TENANT_ID,
      },
      tags: { name: 'CancelOrder' },
    }
  );
  
  const duration = Date.now() - startTime;
  orderCancellationDuration.add(duration);
  
  const success = check(res, {
    'order cancelled': (r) => r.status === 200,
  });
  
  failureRate.add(!success);
  
  return success;
}

function queryOrders() {
  const res = http.get(
    `${BASE_URL}/api/orders?limit=20`,
    {
      headers: {
        'Authorization': getAuthToken(),
        'X-Tenant-ID': TENANT_ID,
      },
      tags: { name: 'QueryOrders' },
    }
  );
  
  check(res, {
    'orders retrieved': (r) => r.status === 200,
    'has orders array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.orders);
      } catch {
        return false;
      }
    },
  });
}

function completeOrderFlow() {
  // Create order
  const createResult = createOrder();
  if (!createResult) return;
  
  sleep(0.5);
  
  // Reserve order
  const reserveResult = reserveOrder(createResult.order.id);
  if (!reserveResult) return;
  
  sleep(0.5);
  
  // Confirm order
  confirmOrder(createResult.order.id, reserveResult.paymentIntent.paymentIntentId);
}

function createAndCancelOrder() {
  // Create order
  const createResult = createOrder();
  if (!createResult) return;
  
  sleep(0.5);
  
  // Cancel order
  cancelOrder(createResult.order.id);
}

// Handle teardown
export function teardown(data) {
  console.log('Load test completed');
  console.log(`Total race conditions detected: ${raceConditionDetected.value}`);
  console.log(`Total rate limit hits: ${rateLimitHits.value}`);
}
