const fs = require('fs');
const path = require('path');

// Scan all L2.1 test files
const testFiles = fs.readdirSync('.').filter(f => f.startsWith('test-L2.1-') && f.endsWith('.js'));

console.log('=== TEST QUALITY AUDIT ===\n');
console.log(`Found ${testFiles.length} L2.1 test files\n`);

const issues = [];
const good = [];

testFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const testNum = file.match(/L2\.1-(\d+)/)?.[1] || '???';
  
  const checks = {
    hasDbVerification: content.includes('pool.query') || content.includes('SELECT'),
    hasErrorHandling: content.includes('catch'),
    hasDataValidation: content.includes('assert') || content.includes('throw new Error') || content.includes('!=='),
    hasTokenAuth: content.includes('Authorization') || content.includes('Bearer'),
    createsRealData: content.includes('axios.post') && !content.includes('mock'),
    checksResponseBody: content.includes('response.data') || content.includes('.data.')
  };
  
  const score = Object.values(checks).filter(Boolean).length;
  
  if (score < 4) {
    issues.push({
      file,
      testNum,
      score,
      missing: Object.entries(checks).filter(([k,v]) => !v).map(([k]) => k)
    });
  } else {
    good.push({ file, testNum, score });
  }
});

console.log(`GOOD TESTS (${good.length}):`);
good.slice(0, 5).forEach(t => console.log(`  L2.1-${t.testNum}: Score ${t.score}/6`));
if (good.length > 5) console.log(`  ... and ${good.length - 5} more`);

console.log(`\nSUSPICIOUS TESTS (${issues.length}):`);
issues.forEach(t => {
  console.log(`  L2.1-${t.testNum}: Score ${t.score}/6 - Missing: ${t.missing.join(', ')}`);
});
