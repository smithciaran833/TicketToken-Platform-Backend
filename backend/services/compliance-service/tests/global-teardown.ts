/**
 * Global Test Teardown for Compliance Service
 * AUDIT FIX: TST-H3 - Test infrastructure
 * 
 * This runs once after all test suites complete
 */

export default async function globalTeardown() {
  const startTime = (global as any).__TEST_START_TIME__;
  const duration = startTime ? Date.now() - startTime : 0;
  
  console.log('\n🧹 Cleaning up test environment...\n');
  
  // Report test duration
  console.log(`⏱️  Total test duration: ${(duration / 1000).toFixed(2)}s`);
  
  // Additional cleanup tasks can be added here
  // - Close database connections
  // - Clear Redis test data
  // - Remove temporary files
  
  console.log('✅ Global test teardown complete\n');
}
