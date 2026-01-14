/**
 * Jest Global Teardown for Transfer Service
 * 
 * Runs once after all test suites complete
 */

export default async function globalTeardown(): Promise<void> {
  const startTime = (global as any).__TEST_START_TIME__ || Date.now();
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n🧹 Cleaning up transfer-service test environment...');
  console.log(`⏱️  Total test time: ${duration}s`);
  console.log('✅ Global teardown complete\n');
}
