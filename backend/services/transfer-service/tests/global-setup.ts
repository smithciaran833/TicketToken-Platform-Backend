/**
 * Jest Global Setup for Transfer Service
 * 
 * Runs once before all test suites
 */

export default async function globalSetup(): Promise<void> {
  console.log('\n🧪 Setting up transfer-service test environment...\n');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  
  // Store start time for reporting
  (global as any).__TEST_START_TIME__ = Date.now();
  
  console.log('✅ Global setup complete\n');
}
