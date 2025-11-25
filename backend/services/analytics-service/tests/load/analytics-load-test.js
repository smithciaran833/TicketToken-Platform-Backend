import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const revenueResponseTime = new Trend('revenue_response_time');
const customerResponseTime = new Trend('customer_response_time');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 20 },  // Ramp up to 20 users
    { duration: '3m', target: 50 },  // Stay at 50 users
    { duration: '2m', target: 100 }, // Spike to 100 users
    { duration: '2m', target: 50 },  // Drop back to 50
    { duration: '1m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'], // 95% < 2s, 99% < 5s
    http_req_failed: ['rate<0.01'],                   // Error rate < 1%
    errors: ['rate<0.01'],
    revenue_response_time: ['p(95)<2000'],
    customer_response_time: ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3010';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'Bearer test-token';

export default function () {
  const headers = {
    'Authorization': AUTH_TOKEN,
    'Content-Type': 'application/json',
  };

  group('Revenue Analytics', () => {
    const revenueRes = http.get(
      `${BASE_URL}/api/analytics/revenue/summary?startDate=2024-01-01&endDate=2024-12-31`,
      { headers }
    );

    check(revenueRes, {
      'revenue status is 200': (r) => r.status === 200,
      'revenue has data': (r) => JSON.parse(r.body).total !== undefined,
    }) || errorRate.add(1);

    revenueResponseTime.add(revenueRes.timings.duration);
  });

  sleep(1);

  group('Customer Analytics', () => {
    const clvRes = http.get(
      `${BASE_URL}/api/analytics/customers/lifetime-value`,
      { headers }
    );

    check(clvRes, {
      'CLV status is 200': (r) => r.status === 200,
      'CLV has average': (r) => JSON.parse(r.body).averageClv !== undefined,
    }) || errorRate.add(1);

    customerResponseTime.add(clvRes.timings.duration);
  });

  sleep(1);

  group('Customer Segmentation', () => {
    const segmentRes = http.get(
      `${BASE_URL}/api/analytics/customers/segments`,
      { headers }
    );

    check(segmentRes, {
      'segments status is 200': (r) => r.status === 200,
      'segments is array': (r) => Array.isArray(JSON.parse(r.body)),
    }) || errorRate.add(1);
  });

  sleep(1);

  group('Churn Risk Analysis', () => {
    const churnRes = http.get(
      `${BASE_URL}/api/analytics/customers/churn-risk?daysThreshold=90`,
      { headers }
    );

    check(churnRes, {
      'churn status is 200': (r) => r.status === 200,
      'churn has risk data': (r) => JSON.parse(r.body).totalAtRisk !== undefined,
    }) || errorRate.add(1);
  });

  sleep(1);

  group('Revenue Projections', () => {
    const projectionRes = http.get(
      `${BASE_URL}/api/analytics/revenue/projections?days=30`,
      { headers }
    );

    check(projectionRes, {
      'projection status is 200': (r) => r.status === 200,
      'projection has data': (r) => JSON.parse(r.body).projectedRevenue !== undefined,
    }) || errorRate.add(1);
  });

  sleep(2);
}

export function handleSummary(data) {
  return {
    'load-test-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, opts) {
  const indent = opts.indent || '';
  const colors = opts.enableColors ? {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m',
  } : { green: '', red: '', yellow: '', reset: '' };

  let summary = '\n' + indent + '=== Load Test Summary ===\n\n';
  
  // HTTP metrics
  summary += indent + 'HTTP Requests:\n';
  summary += indent + `  Total: ${data.metrics.http_reqs.values.count}\n`;
  summary += indent + `  Failed: ${data.metrics.http_req_failed.values.passes} (${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%)\n`;
  
  // Response times
  summary += indent + '\nResponse Times:\n';
  summary += indent + `  p50: ${data.metrics.http_req_duration.values.p50.toFixed(2)}ms\n`;
  summary += indent + `  p95: ${data.metrics.http_req_duration.values.p95.toFixed(2)}ms\n`;
  summary += indent + `  p99: ${data.metrics.http_req_duration.values.p99.toFixed(2)}ms\n`;
  
  // Custom metrics
  if (data.metrics.revenue_response_time) {
    summary += indent + '\nRevenue Endpoint:\n';
    summary += indent + `  p95: ${data.metrics.revenue_response_time.values.p95.toFixed(2)}ms\n`;
  }
  
  if (data.metrics.customer_response_time) {
    summary += indent + '\nCustomer Endpoint:\n';
    summary += indent + `  p95: ${data.metrics.customer_response_time.values.p95.toFixed(2)}ms\n`;
  }
  
  // Thresholds
  summary += indent + '\nThreshold Results:\n';
  const thresholds = data.root_group.checks || [];
  thresholds.forEach(check => {
    const status = check.passes >= check.fails ? colors.green + '✓' : colors.red + '✗';
    summary += indent + `  ${status} ${check.name}${colors.reset}\n`;
  });
  
  return summary;
}
