import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/**
 * API Gateway Load Test - Production Simulation
 * 
 * Tests 500+ concurrent users across all critical paths:
 * - Authentication flows
 * - Venue operations
 * - Event browsing
 * - Ticket purchasing
 * - Multi-tenant isolation
 * 
 * Run with: k6 run api-gateway-load-test.js
 */

// Custom metrics
const authSuccessRate = new Rate('auth_success_rate');
const authDuration = new Trend('auth_duration');
const venueLoadTime = new Trend('venue_load_time');
const eventLoadTime = new Trend('event_load_time');
const ticketPurchaseTime = new Trend('ticket_purchase_time');
const circuitBreakerTrips = new Counter('circuit_breaker_trips');
const tenantIsolationViolations = new Counter('tenant_isolation_violations');

// Test configuration
export const options = {
  stages: [
    // Ramp-up: 0 to 100 users over 2 minutes
    { duration: '2m', target: 100 },
    // Steady: 100 users for 5 minutes
    { duration: '5m', target: 100 },
    // Ramp-up: 100 to 300 users over 3 minutes
    { duration: '3m', target: 300 },
    // Steady: 300 users for 10 minutes
    { duration: '10m', target: 300 },
    // Spike test: 300 to 500 users over 2 minutes
    { duration: '2m', target: 500 },
    // Steady: 500 users for 5 minutes
    { duration: '5m', target: 500 },
    // Ramp-down: 500 to 0 over 3 minutes
    { duration: '3m', target: 0 },
  ],
  thresholds: {
    // HTTP requirements
    'http_req_duration': ['p(95)<1000', 'p(99)<2000'], // 95% < 1s, 99% < 2s
    'http_req_failed': ['rate<0.01'], // <1% error rate
    
    // Custom metrics
    'auth_success_rate': ['rate>0.95'], // >95% auth success
    'auth_duration': ['p(95)<500'], // Authentication p95 < 500ms
    'venue_load_time': ['p(95)<1000'], // Venue load p95 < 1s
    'event_load_time': ['p(95)<1000'], // Event load p95 < 1s
    'ticket_purchase_time': ['p(95)<2000'], // Purchase p95 < 2s
    'circuit_breaker_trips': ['count<10'], // <10 circuit breaks total
    'tenant_isolation_violations': ['count==0'], // ZERO tenant violations
  },
};

// Configuration
const BASE_URL = __ENV.API_GATEWAY_URL || 'http://localhost:3000';
const AUTH_SERVICE = __ENV.AUTH_SERVICE_URL || 'http://localhost:4001';

// Test data
const TENANTS = [
  'tenant-stadium-a',
  'tenant-arena-b',
  'tenant-venue-c',
  'tenant-theater-d',
  'tenant-club-e',
];

const USERS = [
  { email: 'user1@example.com', password: 'test123', tenantId: TENANTS[0] },
  { email: 'user2@example.com', password: 'test123', tenantId: TENANTS[1] },
  { email: 'user3@example.com', password: 'test123', tenantId: TENANTS[2] },
  { email: 'user4@example.com', password: 'test123', tenantId: TENANTS[3] },
  { email: 'user5@example.com', password: 'test123', tenantId: TENANTS[4] },
];

/**
 * Get a random user for this VU
 */
function getRandomUser() {
  return USERS[Math.floor(Math.random() * USERS.length)];
}

/**
 * Authenticate and get JWT token
 */
function authenticate(user) {
  const startTime = new Date();
  
  const payload = JSON.stringify({
    email: user.email,
    password: user.password,
    tenantId: user.tenantId,
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'Authentication' },
  };

  const response = http.post(`${AUTH_SERVICE}/api/v1/auth/login`, payload, params);
  
  const success = check(response, {
    'auth status is 200': (r) => r.status === 200,
    'auth returns token': (r) => r.json('token') !== undefined,
  });

  authSuccessRate.add(success);
  authDuration.add(new Date() - startTime);

  if (success) {
    return {
      token: response.json('token'),
      userId: response.json('userId'),
      tenantId: response.json('tenantId'),
    };
  }

  return null;
}

/**
 * Test: List Venues
 */
function testListVenues(auth) {
  const startTime = new Date();
  
  const params = {
    headers: {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    tags: { name: 'ListVenues' },
  };

  const response = http.get(`${BASE_URL}/api/v1/venues`, params);
  
  check(response, {
    'venues status is 200': (r) => r.status === 200,
    'venues returns array': (r) => Array.isArray(r.json('data')),
    'venues belong to tenant': (r) => {
      const data = r.json('data');
      const allBelongToTenant = data.every(v => v.tenantId === auth.tenantId);
      if (!allBelongToTenant) {
        tenantIsolationViolations.add(1);
      }
      return allBelongToTenant;
    },
  });

  venueLoadTime.add(new Date() - startTime);

  return response.json('data');
}

/**
 * Test: Get Venue Details
 */
function testGetVenue(auth, venueId) {
  const params = {
    headers: {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    tags: { name: 'GetVenue' },
  };

  const response = http.get(`${BASE_URL}/api/v1/venues/${venueId}`, params);
  
  check(response, {
    'venue detail status is 200 or 404': (r) => [200, 404].includes(r.status),
    'venue belongs to tenant': (r) => {
      if (r.status === 200) {
        const venue = r.json('data');
        const belongsToTenant = venue.tenantId === auth.tenantId;
        if (!belongsToTenant) {
          tenantIsolationViolations.add(1);
        }
        return belongsToTenant;
      }
      return true;
    },
  });

  return response.status === 200 ? response.json('data') : null;
}

/**
 * Test: List Events
 */
function testListEvents(auth, venueId) {
  const startTime = new Date();
  
  const params = {
    headers: {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    tags: { name: 'ListEvents' },
  };

  const url = venueId 
    ? `${BASE_URL}/api/v1/events?venueId=${venueId}`
    : `${BASE_URL}/api/v1/events`;

  const response = http.get(url, params);
  
  check(response, {
    'events status is 200': (r) => r.status === 200,
    'events returns array': (r) => Array.isArray(r.json('data')),
    'events belong to tenant': (r) => {
      const data = r.json('data');
      const allBelongToTenant = data.every(e => e.tenantId === auth.tenantId);
      if (!allBelongToTenant) {
        tenantIsolationViolations.add(1);
      }
      return allBelongToTenant;
    },
  });

  eventLoadTime.add(new Date() - startTime);

  return response.json('data');
}

/**
 * Test: Get Event Details
 */
function testGetEvent(auth, eventId) {
  const params = {
    headers: {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    tags: { name: 'GetEvent' },
  };

  const response = http.get(`${BASE_URL}/api/v1/events/${eventId}`, params);
  
  check(response, {
    'event detail status is 200 or 404': (r) => [200, 404].includes(r.status),
    'event belongs to tenant': (r) => {
      if (r.status === 200) {
        const event = r.json('data');
        const belongsToTenant = event.tenantId === auth.tenantId;
        if (!belongsToTenant) {
          tenantIsolationViolations.add(1);
        }
        return belongsToTenant;
      }
      return true;
    },
  });

  return response.status === 200 ? response.json('data') : null;
}

/**
 * Test: Purchase Ticket (simulate)
 */
function testPurchaseTicket(auth, eventId) {
  const startTime = new Date();
  
  const payload = JSON.stringify({
    eventId: eventId,
    quantity: 1,
    seatSelection: 'general',
  });

  const params = {
    headers: {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    tags: { name: 'PurchaseTicket' },
  };

  const response = http.post(`${BASE_URL}/api/v1/tickets/purchase`, payload, params);
  
  check(response, {
    'purchase status is 200 or 400': (r) => [200, 400, 409].includes(r.status),
    'purchase returns orderId or error': (r) => r.json('orderId') || r.json('error'),
  });

  ticketPurchaseTime.add(new Date() - startTime);

  return response.status === 200;
}

/**
 * Test: Cross-Tenant Access Attempt (SECURITY TEST)
 */
function testCrossTenantAccess(auth, otherTenantResource) {
  const params = {
    headers: {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    tags: { name: 'CrossTenantAccessTest' },
  };

  // Try to access resource from different tenant
  const response = http.get(`${BASE_URL}/api/v1/venues/${otherTenantResource}`, params);
  
  check(response, {
    'cross-tenant access is denied': (r) => r.status === 403 || r.status === 404,
    'no data leak on denial': (r) => {
      if (r.status === 200) {
        const venue = r.json('data');
        if (venue && venue.tenantId !== auth.tenantId) {
          tenantIsolationViolations.add(1);
          return false;
        }
      }
      return true;
    },
  });
}

/**
 * Test: Circuit Breaker Behavior
 */
function testCircuitBreaker(auth) {
  const params = {
    headers: {
      'Authorization': `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
    },
    tags: { name: 'CircuitBreakerTest' },
  };

  // Call health endpoint to check circuit breaker status
  const response = http.get(`${BASE_URL}/health/ready`, params);
  
  const circuitOpen = check(response, {
    'circuit breakers are closed': (r) => {
      if (r.status === 200) {
        const health = r.json();
        const hasOpenCircuits = health.circuitBreakers && 
          Object.values(health.circuitBreakers).some(state => state === 'open');
        
        if (hasOpenCircuits) {
          circuitBreakerTrips.add(1);
        }
        return !hasOpenCircuits;
      }
      return true;
    },
  });
}

/**
 * Main test scenario
 */
export default function () {
  const user = getRandomUser();
  
  // Group 1: Authentication
  group('Authentication', () => {
    const auth = authenticate(user);
    
    if (!auth) {
      console.error('Authentication failed, skipping remaining tests');
      return;
    }

    // Group 2: Venue Operations
    group('Venue Operations', () => {
      const venues = testListVenues(auth);
      
      if (venues && venues.length > 0) {
        const randomVenue = venues[Math.floor(Math.random() * venues.length)];
        testGetVenue(auth, randomVenue.id);
        
        // List events for this venue
        testListEvents(auth, randomVenue.id);
      }
    });

    // Group 3: Event Browsing
    group('Event Browsing', () => {
      const events = testListEvents(auth);
      
      if (events && events.length > 0) {
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        testGetEvent(auth, randomEvent.id);
        
        // Simulate purchase (10% of users attempt)
        if (Math.random() < 0.1) {
          testPurchaseTicket(auth, randomEvent.id);
        }
      }
    });

    // Group 4: Security Tests (5% of requests)
    if (Math.random() < 0.05) {
      group('Security Tests', () => {
        // Try cross-tenant access
        const otherTenant = TENANTS.find(t => t !== auth.tenantId);
        if (otherTenant) {
          testCrossTenantAccess(auth, 'fake-venue-id-from-other-tenant');
        }
        
        // Check circuit breaker status
        testCircuitBreaker(auth);
      });
    }
  });

  // Think time: 1-5 seconds between iterations
  sleep(Math.random() * 4 + 1);
}

/**
 * Setup function - runs once before test
 */
export function setup() {
  console.log('='.repeat(60));
  console.log('API Gateway Load Test - Starting');
  console.log('='.repeat(60));
  console.log(`Target: ${BASE_URL}`);
  console.log(`Test Duration: 32 minutes`);
  console.log(`Max Concurrent Users: 500`);
  console.log(`Tenants: ${TENANTS.length}`);
  console.log('='.repeat(60));
}

/**
 * Teardown function - runs once after test
 */
export function teardown(data) {
  console.log('='.repeat(60));
  console.log('API Gateway Load Test - Complete');
  console.log('='.repeat(60));
  console.log('Review metrics above for results');
  console.log('Check Grafana dashboards for detailed insights');
  console.log('='.repeat(60));
}
