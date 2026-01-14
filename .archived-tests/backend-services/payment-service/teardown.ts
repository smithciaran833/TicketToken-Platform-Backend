// Test teardown file
// Runs after all tests complete

export default async function globalTeardown() {
  // Close any open connections
  // Clean up test resources
  console.log('Global teardown complete');
}
