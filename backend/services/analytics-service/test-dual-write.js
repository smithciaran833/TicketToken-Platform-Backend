const { metricsService } = require('./dist/services/metrics.service');

async function testDualWrite() {
  console.log('=== Testing Dual-Write Mode ===\n');
  
  try {
    // Test health check
    console.log('1. Checking metrics backend health...');
    const health = await metricsService.healthCheck();
    console.log('Health:', JSON.stringify(health, null, 2));
    console.log('');

    // Test single metric write
    console.log('2. Recording a single metric...');
    const metric = await metricsService.recordMetric(
      'test-venue-456',
      'page_views',
      100,
      { page: 'homepage', browser: 'chrome' },
      { session_id: 'test-session-123' }
    );
    console.log('Metric recorded:', metric.id);
    console.log('');

    // Test bulk write
    console.log('3. Recording bulk metrics...');
    await metricsService.bulkRecordMetrics([
      {
        venueId: 'test-venue-456',
        metricType: 'ticket_sales',
        value: 5,
        dimensions: { event: 'concert-1' }
      },
      {
        venueId: 'test-venue-456',
        metricType: 'revenue',
        value: 500,
        dimensions: { currency: 'USD' }
      }
    ]);
    console.log('Bulk metrics recorded!');
    console.log('');

    console.log('✅ All tests passed! Check InfluxDB to verify data was written.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDualWrite();
