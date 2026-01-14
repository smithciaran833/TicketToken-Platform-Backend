import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const eventCreationTime = new Trend('event_creation_duration');
const eventQueryTime = new Trend('event_query_duration');
const failedRequests = new Counter('failed_requests');

// Load test configuration
export const options = {
  stages: [
    // Ramp up
    { duration: '2m', target: 100 },   // Ramp to 100 users over 2 minutes
    { duration: '3m', target: 500 },   // Ramp to 500 users over 3 minutes
    { duration: '5m', target: 1000 },  // Ramp to 1000 users over 5 minutes
    
    // Sustained load
    { duration: '10m', target: 1000 }, // Maintain 1000 users for 10 minutes
    
    // Spike test
    { duration: '2m', target: 2000 },  // Spike to 2000 users
    { duration: '3m', target: 2000 },  // Hold at 2000
    
    // Ramp down
    { duration: '3m', target: 500 },   // Ramp down to 500
    { duration: '2m', target: 0 },     // Ramp down to 0
  ],
  thresholds: {
    // Performance thresholds
    http_req_duration: ['p(95)<1000', 'p(99)<2000'], // 95% < 1s, 99% < 2s
    http_req_failed: ['rate<0.05'],                   // Error rate < 5%
    
    // Custom thresholds
    errors: ['rate<0.05'],
    event_creation_duration: ['p(95)<1500'],
    event_query_duration: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3003';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

// Test data generators
function generateEvent(tenantId) {
  return {
    name: `Load Test Event ${Date.now()}`,
    description: 'Event created during load testing',
    venue_id: `venue-${Math.floor(Math.random() * 100)}`,
    tenant_id: tenantId,
    start_date: new Date(Date.now() + 86400000 * 7).toISOString(), // 7 days from now
    end_date: new Date(Date.now() + 86400000 * 8).toISOString(),   // 8 days from now
    capacity: Math.floor(Math.random() * 1000) + 100,
    category: ['concert', 'sports', 'theater', 'conference'][Math.floor(Math.random() * 4)],
    status: 'active',
  };
}

function getTenantId() {
  // Distribute load across multiple tenants
  return `tenant-${Math.floor(Math.random() * 10) + 1}`;
}

// Setup function - runs once per VU at start
export function setup() {
  // Verify service is accessible
  const healthCheck = http.get(`${BASE_URL}/health`);
  check(healthCheck, {
    'service is healthy': (r) => r.status === 200 && r.json('status') === 'healthy',
  });
  
  return { startTime: Date.now() };
}

// Main load test scenarios
export default function () {
  const tenantId = getTenantId();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'X-Tenant-ID': tenantId,
  };

  // Scenario 1: Create Event (30% of requests)
  if (Math.random() < 0.3) {
    const eventData = generateEvent(tenantId);
    const createRes = http.post(
      `${BASE_URL}/api/v1/events`,
      JSON.stringify(eventData),
      { headers }
    );

    const createSuccess = check(createRes, {
      'event created': (r) => r.status === 201,
      'event has ID': (r) => r.json('event_id') !== undefined,
    });

    eventCreationTime.add(createRes.timings.duration);
    errorRate.add(!createSuccess);
    
    if (!createSuccess) {
      failedRequests.add(1);
    }
  }

  // Scenario 2: List Events (50% of requests)
  else if (Math.random() < 0.5) {
    const listRes = http.get(
      `${BASE_URL}/api/v1/events?limit=20&offset=0`,
      { headers }
    );

    const listSuccess = check(listRes, {
      'events listed': (r) => r.status === 200,
      'events array returned': (r) => Array.isArray(r.json('events')),
    });

    eventQueryTime.add(listRes.timings.duration);
    errorRate.add(!listSuccess);
    
    if (!listSuccess) {
      failedRequests.add(1);
    }
  }

  // Scenario 3: Get Event Details (15% of requests)
  else if (Math.random() < 0.15) {
    // Get a random event first
    const listRes = http.get(
      `${BASE_URL}/api/v1/events?limit=1`,
      { headers }
    );

    if (listRes.status === 200) {
      const events = listRes.json('events');
      if (events && events.length > 0) {
        const eventId = events[0].event_id;
        
        const detailRes = http.get(
          `${BASE_URL}/api/v1/events/${eventId}`,
          { headers }
        );

        const detailSuccess = check(detailRes, {
          'event details retrieved': (r) => r.status === 200,
          'event ID matches': (r) => r.json('event_id') === eventId,
        });

        errorRate.add(!detailSuccess);
        
        if (!detailSuccess) {
          failedRequests.add(1);
        }
      }
    }
  }

  // Scenario 4: Health Check (5% of requests)
  else {
    const healthRes = http.get(`${BASE_URL}/health`);
    
    check(healthRes, {
      'health check passed': (r) => r.status === 200,
    });
  }

  // Realistic think time between requests
  sleep(Math.random() * 2 + 0.5); // 0.5-2.5 seconds
}

// Teardown function - runs once at end
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Load test completed in ${duration} seconds`);
}
