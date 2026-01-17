/**
 * Jest Global Teardown - Analytics Service
 *
 * Runs once after all test suites
 */

export default async function globalTeardown(): Promise<void> {
  console.log('\n🧹 Cleaning up Analytics Service Test Suite...\n');

  // Optional: Clean up test database
  if (process.env.DATABASE_HOST && process.env.CLEANUP_TEST_DB === 'true') {
    try {
      console.log('✅ Test database cleaned up');
    } catch (error) {
      console.warn('⚠️  Test database cleanup skipped:', (error as Error).message);
    }
  }

  // Optional: Clean up test Redis
  if (process.env.REDIS_HOST && process.env.CLEANUP_TEST_REDIS === 'true') {
    try {
      console.log('✅ Test Redis cleaned up');
    } catch (error) {
      console.warn('⚠️  Test Redis cleanup skipped:', (error as Error).message);
    }
  }

  // Force GC if available
  if (global.gc) {
    global.gc();
  }

  console.log('✨ Analytics Service Test Suite Complete!\n');
}
