/**
 * Load Tests for Venue Service (MT3)
 * 
 * Uses k6 for load testing. Install: https://k6.io/docs/get-started/installation/
 * Run: k6 run tests/load/venue.load.test.js
 * 
 * Environment variables:
 * - K6_BASE_URL: API base URL (default: http://localhost:3004)
 * - K6_AUTH_TOKEN: JWT token for authentication
 * - K6_TENANT_ID: Tenant ID for testing
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const venueCreationTrend = new Trend('venue_creation_duration');
const venueListTrend = new Trend('venue_list_duration');
const venueGetTrend = new Trend('venue_get_duration');
const venueUpdateTrend = new Trend('venue_update_duration');
const venueDeleteTrend = new Trend('venue_delete_duration');
const requestCounter = new Counter('requests');

// Configuration
const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3004';
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN || 'test-jwt-token';
const TENANT_ID = __ENV.K6_TENANT_ID || '11111111-1111-1111-1111-111111111111';

// Test configuration
export const options = {
  // Smoke test
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { test_type: 'smoke' },
    },
    // Load test
    load: {
      executor: 'ramping-vus',
      startTime: '1m',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },   // Ramp up to 20 users
        { duration: '5m', target: 20 },   // Stay at 20 users
        { duration: '2m', target: 50 },   // Ramp up to 50 users
        { duration: '5m', target: 50 },   // Stay at 50 users
        { duration: '2m', target: 0 },    // Ramp down
      ],
      tags: { test_type: 'load' },
    },
    // Stress test
    stress: {
      executor: 'ramping-vus',
      startTime: '18m',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },  // Ramp up to 100 users
        { duration: '5m', target: 100 },  // Stay at 100 users
        { duration: '2m', target: 200 },  // Ramp up to 200 users
        { duration: '5m', target: 200 },  // Stay at 200 users
        { duration: '2m', target: 0 },    // Ramp down
      ],
      tags: { test_type: 'stress' },
    },
    // Spike test
    spike: {
      executor: 'ramping-vus',
      startTime: '35m',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 500 }, // Spike to 500 users
        { duration: '1m', target: 500 },  // Stay at 500 users
        { duration: '10s', target: 0 },   // Quick ramp down
      ],
      tags: { test_type: 'spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95% under 500ms, 99% under 1s
    http_req_failed: ['rate<0.01'],                   // Less than 1% errors
    errors: ['rate<0.01'],
    venue_list_duration: ['p(95)<300'],
    venue_get_duration: ['p(95)<200'],
  },
};

// Headers
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'X-Tenant-ID': TENANT_ID,
  };
}

// Test data generator
function generateVenueData() {
  const timestamp = Date.now();
  const vuId = __VU;
  return {
    name: `Load Test Venue ${timestamp}-${vuId}`,
    address: `${Math.floor(Math.random() * 9999)} Test Street`,
    city: 'Load Test City',
    state: 'LT',
    country: 'US',
    postal_code: '12345',
    capacity: Math.floor(Math.random() * 50000) + 1000,
    venue_type: ['arena', 'stadium', 'theater', 'club'][Math.floor(Math.random() * 4)],
  };
}

// Main test function
export default function () {
  let venueId = null;

  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/health`);
    requestCounter.add(1);
    
    check(res, {
      'health check status is 200': (r) => r.status === 200,
      'health check response time < 100ms': (r) => r.timings.duration < 100,
    });
    
    errorRate.add(res.status !== 200);
  });

  group('List Venues', () => {
    const startTime = Date.now();
    const res = http.get(`${BASE_URL}/api/v1/venues?page=1&limit=10`, {
      headers: getHeaders(),
    });
    venueListTrend.add(Date.now() - startTime);
    requestCounter.add(1);
    
    const success = check(res, {
      'list venues status is 200': (r) => r.status === 200,
      'list venues has data array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data);
        } catch {
          return false;
        }
      },
      'list venues response time < 500ms': (r) => r.timings.duration < 500,
    });
    
    errorRate.add(!success);
  });

  group('Create Venue', () => {
    const venueData = generateVenueData();
    const startTime = Date.now();
    
    const res = http.post(`${BASE_URL}/api/v1/venues`, JSON.stringify(venueData), {
      headers: getHeaders(),
    });
    venueCreationTrend.add(Date.now() - startTime);
    requestCounter.add(1);
    
    const success = check(res, {
      'create venue status is 201': (r) => r.status === 201,
      'create venue returns id': (r) => {
        try {
          const body = JSON.parse(r.body);
          venueId = body.id;
          return !!body.id;
        } catch {
          return false;
        }
      },
      'create venue response time < 1000ms': (r) => r.timings.duration < 1000,
    });
    
    errorRate.add(!success);
  });

  if (venueId) {
    group('Get Venue', () => {
      const startTime = Date.now();
      const res = http.get(`${BASE_URL}/api/v1/venues/${venueId}`, {
        headers: getHeaders(),
      });
      venueGetTrend.add(Date.now() - startTime);
      requestCounter.add(1);
      
      const success = check(res, {
        'get venue status is 200': (r) => r.status === 200,
        'get venue returns correct id': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.id === venueId;
          } catch {
            return false;
          }
        },
        'get venue response time < 300ms': (r) => r.timings.duration < 300,
      });
      
      errorRate.add(!success);
    });

    group('Update Venue', () => {
      const updateData = {
        name: `Updated Load Test Venue ${Date.now()}`,
        capacity: Math.floor(Math.random() * 50000) + 1000,
      };
      
      const startTime = Date.now();
      const res = http.put(`${BASE_URL}/api/v1/venues/${venueId}`, JSON.stringify(updateData), {
        headers: getHeaders(),
      });
      venueUpdateTrend.add(Date.now() - startTime);
      requestCounter.add(1);
      
      const success = check(res, {
        'update venue status is 200': (r) => r.status === 200,
        'update venue response time < 500ms': (r) => r.timings.duration < 500,
      });
      
      errorRate.add(!success);
    });

    group('Delete Venue', () => {
      const startTime = Date.now();
      const res = http.del(`${BASE_URL}/api/v1/venues/${venueId}`, null, {
        headers: getHeaders(),
      });
      venueDeleteTrend.add(Date.now() - startTime);
      requestCounter.add(1);
      
      const success = check(res, {
        'delete venue status is 204': (r) => r.status === 204,
        'delete venue response time < 500ms': (r) => r.timings.duration < 500,
      });
      
      errorRate.add(!success);
    });
  }

  sleep(1); // Think time between iterations
}

// Setup function - runs once per VU
export function setup() {
  console.log('Starting load test against:', BASE_URL);
  
  // Verify API is reachable
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`API not reachable. Health check returned: ${healthRes.status}`);
  }
  
  return { startTime: Date.now() };
}

// Teardown function - runs once at the end
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Load test completed in ${duration} seconds`);
}
