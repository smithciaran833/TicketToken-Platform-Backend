/**
 * Jest Global Teardown
 * Runs after all test suites complete
 */

export default async function globalTeardown(): Promise<void> {
  // Force close any remaining handles
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Log completion
  console.log('\n✓ Test teardown complete\n');
}
