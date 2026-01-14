/**
 * Payment Service Test Teardown
 * 
 * Cleanup after all tests complete.
 */

export default async function teardown(): Promise<void> {
  // Clean up any global resources
  console.log('Running test teardown...');
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Small delay to allow any pending operations to complete
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  console.log('Test teardown complete.');
}
