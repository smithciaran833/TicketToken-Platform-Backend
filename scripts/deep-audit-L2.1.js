const fs = require('fs');
const { execSync } = require('child_process');

console.log('=== DEEP L2.1 TEST AUDIT ===\n');
console.log('Analyzing what each test ACTUALLY proves...\n');

// Define what REAL integration testing should verify
const criteria = {
  'Data Persistence': 'Does it verify data exists in DB after creation?',
  'State Changes': 'Does it verify state transitions properly?',
  'Cross-Service': 'Does it test actual service communication?',
  'Error Cases': 'Does it test failure scenarios?',
  'Data Integrity': 'Does it verify data consistency across services?',
  'Side Effects': 'Does it verify webhooks/events/queues triggered?'
};

// Analyze each group
const groups = [
  { range: '001-005', name: 'Auth Service', files: [] },
  { range: '006-010', name: 'Venue Service', files: [] },
  { range: '011-015', name: 'Event Service', files: [] },
  { range: '016-020', name: 'Ticket Service', files: [] },
  { range: '021-025', name: 'Order Service', files: [] },
  { range: '026-030', name: 'Payment Service', files: [] },
  { range: '031-035', name: 'Blockchain Service', files: [] }
];

// Group files
const testFiles = fs.readdirSync('.').filter(f => f.match(/test-L2\.1-\d{3}/));
testFiles.forEach(file => {
  const num = parseInt(file.match(/L2\.1-(\d{3})/)[1]);
  const groupIndex = Math.floor((num - 1) / 5);
  if (groups[groupIndex]) {
    groups[groupIndex].files.push(file);
  }
});

// Analyze each group
groups.forEach(group => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${group.name} (L2.1-${group.range})`);
  console.log(`${'='.repeat(60)}`);
  
  let groupScore = 0;
  const issues = [];
  const strengths = [];
  
  group.files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const testNum = file.match(/L2\.1-(\d{3})/)[1];
    
    // Check for real validation patterns
    const checks = {
      dbQuery: (content.match(/pool\.query|SELECT|INSERT|UPDATE/g) || []).length,
      assertions: (content.match(/if \(.*\)|throw new Error|console\.error/g) || []).length,
      multiService: (content.match(/localhost:30\d{2}/g) || []).length,
      dataChecks: (content.match(/response\.data\.|\.rows\[|\.length/g) || []).length,
      errorHandling: (content.match(/catch|validateStatus|4\d{2}|5\d{2}/g) || []).length
    };
    
    // Score this test
    let testScore = 0;
    if (checks.dbQuery > 0) testScore += 2;
    if (checks.assertions > 2) testScore += 2;
    if (checks.multiService > 1) testScore += 2;
    if (checks.dataChecks > 3) testScore += 2;
    if (checks.errorHandling > 1) testScore += 2;
    
    groupScore += testScore;
    
    if (testScore < 6) {
      issues.push(`L2.1-${testNum}: Low validation score (${testScore}/10)`);
    } else if (testScore >= 8) {
      strengths.push(`L2.1-${testNum}: Strong validation (${testScore}/10)`);
    }
  });
  
  // Group summary
  const avgScore = group.files.length > 0 ? (groupScore / group.files.length).toFixed(1) : 0;
  console.log(`\nAverage Quality Score: ${avgScore}/10`);
  
  if (strengths.length > 0) {
    console.log(`\n✅ Strong Tests:`);
    strengths.forEach(s => console.log(`  ${s}`));
  }
  
  if (issues.length > 0) {
    console.log(`\n⚠️ Weak Tests:`);
    issues.forEach(i => console.log(`  ${i}`));
  }
});

// Check for missing critical validations
console.log(`\n\n${'='.repeat(60)}`);
console.log('CRITICAL GAPS FOUND');
console.log(`${'='.repeat(60)}\n`);

const allContent = testFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

const gaps = [];

// Check for specific patterns we SHOULD see in integration tests
if (!allContent.includes('Transaction') && !allContent.includes('BEGIN')) {
  gaps.push('❌ No transaction testing found - atomicity not verified');
}

if (!allContent.includes('concurrent') && !allContent.includes('Promise.all')) {
  gaps.push('❌ No concurrency testing - race conditions not checked');
}

if (!allContent.includes('rollback') && !allContent.includes('revert')) {
  gaps.push('❌ No rollback testing - failure recovery not verified');
}

if (!allContent.includes('queue') && !allContent.includes('rabbit') && !allContent.includes('amqp')) {
  gaps.push('❌ No queue/messaging verification - async flows not tested');
}

if (!allContent.includes('cache') && !allContent.includes('redis')) {
  gaps.push('❌ No cache verification - caching layer not tested');
}

if (!allContent.includes('timeout') && !allContent.includes('expires')) {
  gaps.push('⚠️ Limited timeout testing - expiry handling not fully verified');
}

gaps.forEach(gap => console.log(gap));

console.log(`\n${'='.repeat(60)}`);
console.log('RECOMMENDATIONS BEFORE CONTINUING');
console.log(`${'='.repeat(60)}\n`);

console.log('1. Add transaction boundary testing (especially for Order->Payment flow)');
console.log('2. Add concurrent purchase testing (same ticket by 2 users)');
console.log('3. Add rollback scenarios (payment fails after reservation)');
console.log('4. Verify RabbitMQ messages are actually published');
console.log('5. Check Redis cache invalidation on updates');
console.log('6. Add timeout testing for reservations and orders');
