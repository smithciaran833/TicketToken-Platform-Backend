// Load .env.test BEFORE any other code runs
require('dotenv').config({ path: '.env.test' });

// Verify critical env vars are set
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not loaded from .env.test');
  process.exit(1);
}

console.log('✓ Test environment loaded from .env.test');
console.log('✓ DATABASE_URL:', process.env.DATABASE_URL);
console.log('✓ REDIS_URL:', process.env.REDIS_URL);
