const { createCache } = require('./dist/index');

async function testCache() {
  console.log('🧪 Testing cache module...\n');
  
  // Create cache instance
  const { service, middleware, strategies, invalidator } = createCache({
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || '6OiGbg4L+SmoY/vh3hj7GJmMbkCyv+y+BJX8CPSLbyj9Sre9li7P2YPYV/qdRBDk'
    }
  });

  try {
    // Test 1: Basic set/get
    console.log('Test 1: Basic set/get');
    await service.set('test:key', { name: 'TicketToken', value: 42 }, { ttl: 60 });
    const value = await service.get('test:key');
    console.log('✅ Retrieved:', value);

    // Test 2: Cache miss with fetcher
    console.log('\nTest 2: Cache miss with fetcher');
    const fetched = await service.get('test:missing', async () => {
      console.log('  Fetching from source...');
      return { generated: true, timestamp: Date.now() };
    }, { ttl: 30 });
    console.log('✅ Fetched:', fetched);

    // Test 3: Cache hit
    console.log('\nTest 3: Cache hit (should not fetch)');
    const cached = await service.get('test:missing');
    console.log('✅ From cache:', cached);

    // Test 4: Stats
    console.log('\nTest 4: Cache statistics');
    const stats = service.getStats();
    console.log('📊 Stats:', stats);

    // Cleanup
    await service.delete(['test:key', 'test:missing']);
    await service.close();
    
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    await service.close();
    process.exit(1);
  }
}

testCache();
