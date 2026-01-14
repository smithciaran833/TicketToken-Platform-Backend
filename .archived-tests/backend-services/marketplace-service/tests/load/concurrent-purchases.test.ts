import { performance } from 'perf_hooks';

/**
 * Load Test: Concurrent Purchase Attempts
 * 
 * This test simulates multiple users attempting to purchase the same listing
 * simultaneously to verify distributed locking and race condition handling.
 * 
 * Run with: npm run test:load
 */

interface LoadTestResult {
  totalRequests: number;
  successfulPurchases: number;
  failedPurchases: number;
  lockConflicts: number;
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
}

const MARKETPLACE_URL = process.env.MARKETPLACE_URL || 'http://localhost:3016';
const TEST_LISTING_ID = process.env.TEST_LISTING_ID || 'test-listing-id';

async function simulatePurchaseAttempt(buyerId: string): Promise<{
  success: boolean;
  statusCode: number;
  responseTime: number;
  error?: string;
}> {
  const startTime = performance.now();

  try {
    const response = await fetch(
      `${MARKETPLACE_URL}/api/v1/marketplace/listings/${TEST_LISTING_ID}/buy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test-${buyerId}`
        },
        body: JSON.stringify({
          walletAddress: `wallet-${buyerId}`
        })
      }
    );

    const responseTime = performance.now() - startTime;
    const body = await response.json();

    return {
      success: response.status === 200,
      statusCode: response.status,
      responseTime,
      error: body.error
    };
  } catch (error) {
    return {
      success: false,
      statusCode: 500,
      responseTime: performance.now() - startTime,
      error: (error as Error).message
    };
  }
}

async function runConcurrentPurchaseTest(
  concurrentUsers: number
): Promise<LoadTestResult> {
  console.log(`\n🔥 Starting concurrent purchase test with ${concurrentUsers} users...`);

  const promises = Array.from({ length: concurrentUsers }, (_, i) =>
    simulatePurchaseAttempt(`buyer-${i}`)
  );

  const results = await Promise.all(promises);

  const successfulPurchases = results.filter(r => r.success).length;
  const failedPurchases = results.filter(r => !r.success).length;
  const lockConflicts = results.filter(r => r.statusCode === 409).length;
  
  const responseTimes = results.map(r => r.responseTime);
  const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const maxResponseTime = Math.max(...responseTimes);
  const minResponseTime = Math.min(...responseTimes);

  return {
    totalRequests: concurrentUsers,
    successfulPurchases,
    failedPurchases,
    lockConflicts,
    averageResponseTime: Math.round(averageResponseTime),
    maxResponseTime: Math.round(maxResponseTime),
    minResponseTime: Math.round(minResponseTime)
  };
}

async function runLoadTests() {
  console.log('🚀 Marketplace Service Load Tests');
  console.log('==================================\n');
  console.log(`Target: ${MARKETPLACE_URL}`);
  console.log(`Listing ID: ${TEST_LISTING_ID}\n`);

  const testScenarios = [
    { users: 10, description: 'Low load (10 concurrent users)' },
    { users: 50, description: 'Medium load (50 concurrent users)' },
    { users: 100, description: 'High load (100 concurrent users)' },
    { users: 200, description: 'Stress test (200 concurrent users)' }
  ];

  const results: Array<{ scenario: string; result: LoadTestResult }> = [];

  for (const scenario of testScenarios) {
    const result = await runConcurrentPurchaseTest(scenario.users);
    results.push({ scenario: scenario.description, result });

    console.log(`\n📊 ${scenario.description}`);
    console.log('─'.repeat(60));
    console.log(`Total Requests:        ${result.totalRequests}`);
    console.log(`Successful Purchases:  ${result.successfulPurchases} (${Math.round(result.successfulPurchases / result.totalRequests * 100)}%)`);
    console.log(`Failed Purchases:      ${result.failedPurchases} (${Math.round(result.failedPurchases / result.totalRequests * 100)}%)`);
    console.log(`Lock Conflicts (409):  ${result.lockConflicts} (${Math.round(result.lockConflicts / result.totalRequests * 100)}%)`);
    console.log(`Avg Response Time:     ${result.averageResponseTime}ms`);
    console.log(`Max Response Time:     ${result.maxResponseTime}ms`);
    console.log(`Min Response Time:     ${result.minResponseTime}ms`);

    // Wait between scenarios
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log('\n\n📈 Summary');
  console.log('═'.repeat(60));
  
  // Check if lock worked correctly (only 1 success per scenario)
  const lockTestPassed = results.every(r => r.result.successfulPurchases <= 1);
  console.log(`\n✓ Distributed Lock Test: ${lockTestPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  (Expected: ≤1 successful purchase per test)`);

  // Check response times are reasonable (< 5 seconds)
  const responseTimeTest = results.every(r => r.result.averageResponseTime < 5000);
  console.log(`\n✓ Response Time Test: ${responseTimeTest ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  (Expected: Average response time < 5000ms)`);

  // Check error handling (no 500 errors)
  const errorHandlingTest = results.every(r => {
    const serverErrors = r.result.failedPurchases - r.result.lockConflicts;
    return serverErrors === 0;
  });
  console.log(`\n✓ Error Handling Test: ${errorHandlingTest ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  (Expected: No 500 server errors)`);

  console.log('\n' + '═'.repeat(60));
  console.log(`\n${lockTestPassed && responseTimeTest && errorHandlingTest ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);
}

// Run tests if executed directly
if (require.main === module) {
  runLoadTests()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Load test failed:', error);
      process.exit(1);
    });
}

export { runLoadTests, runConcurrentPurchaseTest };
