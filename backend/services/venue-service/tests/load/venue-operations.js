/**
 * Load Test - Venue Operations
 * Tests venue CRUD operations under load
 * 
 * Run with: k6 run tests/load/venue-operations.js
 * 
 * Scenarios:
 * - Sustained load: 500 concurrent users for 30 minutes
 * - Spike test: Ramp from 0 to 1000 users in 1 minute
 * - Stress test: Gradually increase until service degrades
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const venueReadTime = new Trend('venue_read_time');
const venueCreateTime = new Trend('venue_create_time');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-jwt-token';

// Test scenarios
export const options = {
  scenarios: {
    // Scenario 1: Sustained Load (default)
    sustained_load: {
      executor: 'constant-vus',
      vus: 500,
      duration: '30m',
      gracefulStop: '30s',
    },
    
    // Scenario 2: Spike Test (uncomment to run)
    // spike_test: {
    //   executor: 'ramping-vus',
    //   startVUs: 0,
    //   stages: [
    //     { duration: '1m', target: 1000 },   // Ramp up to 1000 users
    //     { duration: '5m', target: 1000 },   // Stay at 1000 for 5 minutes
    //     { duration: '1m', target: 0 },      // Ramp down
    //   ],
    //   gracefulStop: '30s',
    // },
    
    // Scenario 3: Stress Test (uncomment to run)
    // stress_test: {
    //   executor: 'ramping-vus',
    //   startVUs: 0,
    //   stages: [
    //     { duration: '5m', target: 500 },
    //     { duration: '5m', target: 1000 },
    //     { duration: '5m', target: 1500 },
    //     { duration: '5m', target: 2000 },
    //     { duration: '5m', target: 2500 },
    //     { duration: '2m', target: 0 },
    //   ],
    //   gracefulStop: '30s',
    // },
  },
  
  // Performance thresholds
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],  // 95% < 500ms, 99% < 1000ms
    'http_req_failed': ['rate<0.01'],                   // Error rate < 1%
    'venue_read_time': ['p(95)<200'],                   // Reads < 200ms (95th percentile)
    'venue_create_time': ['p(95)<1000'],                // Creates < 1000ms (95th percentile)
  },
};

// Setup function - runs once per VU
export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);
  return { baseUrl: BASE_URL, authToken: AUTH_TOKEN };
}

// Main load test function
export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.authToken}`,
  };

  // 70% reads, 30% writes (realistic traffic pattern)
  const operation = Math.random();
  
  if (operation < 0.7) {
    // Read operation - list venues or get specific venue
    if (Math.random() < 0.5) {
      // List all venues
      const listStart = Date.now();
      const listRes = http.get(`${data.baseUrl}/api/venues`, { headers });
      
      check(listRes, {
        'venue list status 200': (r) => r.status === 200,
        'venue list has data': (r) => r.json('data') !== undefined,
      });
      
      venueReadTime.add(Date.now() - listStart);
      errorRate.add(listRes.status !== 200);
    } else {
      // Get specific venue (random ID between 1-1000)
      const venueId = Math.floor(Math.random() * 1000) + 1;
      const getStart = Date.now();
      const getRes = http.get(`${data.baseUrl}/api/venues/${venueId}`, { headers });
      
      check(getRes, {
        'get venue status 200 or 404': (r) => r.status === 200 || r.status === 404,
      });
      
      venueReadTime.add(Date.now() - getStart);
      errorRate.add(getRes.status >= 500);
    }
  } else {
    // Write operation - create or update venue
    if (Math.random() < 0.8) {
      // Create venue (80% of writes)
      const venueData = {
        name: `Load Test Venue ${Date.now()}-${Math.random()}`,
        description: 'Created during load testing',
        venueType: ['stadium', 'arena', 'theater', 'club'][Math.floor(Math.random() * 4)],
        address: '123 Test Street',
        city: 'Test City',
        state: 'CA',
        zipCode: '90210',
        maxCapacity: 1000 + Math.floor(Math.random() * 9000),
      };
      
      const createStart = Date.now();
      const createRes = http.post(
        `${data.baseUrl}/api/venues`,
        JSON.stringify(venueData),
        { headers }
      );
      
      check(createRes, {
        'create venue status 201': (r) => r.status === 201,
        'create venue returns ID': (r) => r.json('data.id') !== undefined,
      });
      
      venueCreateTime.add(Date.now() - createStart);
      errorRate.add(createRes.status !== 201);
    } else {
      // Update existing venue (20% of writes)
      const venueId = Math.floor(Math.random() * 100) + 1;
      const updateData = {
        description: `Updated during load test at ${Date.now()}`,
        maxCapacity: 2000 + Math.floor(Math.random() * 8000),
      };
      
      const updateRes = http.patch(
        `${data.baseUrl}/api/venues/${venueId}`,
        JSON.stringify(updateData),
        { headers }
      );
      
      check(updateRes, {
        'update venue status 200 or 404': (r) => r.status === 200 || r.status === 404,
      });
      
      errorRate.add(updateRes.status >= 500);
    }
  }

  // Think time - simulate user reading/processing
  sleep(Math.random() * 2 + 0.5); // 0.5-2.5 seconds
}

// Teardown function
export function teardown(data) {
  console.log('Load test complete');
}
