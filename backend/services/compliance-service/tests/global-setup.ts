/**
 * Global Test Setup for Compliance Service
 * AUDIT FIX: TST-H3 - Test infrastructure
 * 
 * This runs once before all test suites
 */

export default async function globalSetup() {
  console.log('\n🧪 Starting compliance-service test suite...\n');
  
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Verify required environment variables
  const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables (using defaults): ${missing.join(', ')}`);
  }
  
  // Set defaults for test environment
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/compliance_test';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only-32-chars';
  process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'test-webhook-secret-32-characters';
  process.env.LOG_LEVEL = 'error';
  
  // Store start time for performance tracking
  (global as any).__TEST_START_TIME__ = Date.now();
  
  console.log('✅ Global test setup complete\n');
}
