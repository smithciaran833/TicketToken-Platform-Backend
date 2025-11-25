# Testing Guide - Minting Service

This guide covers how to test the minting service, including unit tests, integration tests, and manual testing procedures.

---

## Test Structure

```
tests/
├── setup.ts                           # Global test setup
├── unit/                              # Unit tests (no external dependencies)
│   ├── solana.test.ts                # Solana utility functions
│   ├── internal-auth.test.ts         # Authentication middleware
│   └── BalanceMonitor.test.ts        # Balance monitoring service
└── integration/                       # Integration tests (real services)
    └── devnet-mint.test.ts           # Full minting flow on devnet
```

---

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Watch Mode (during development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

Coverage reports are generated in `coverage/` directory.

---

## Unit Tests

Unit tests run in isolation with mocked dependencies. They're fast and don't require any external services.

### What's Tested

**Solana Utilities** (`tests/unit/solana.test.ts`)
- Public key validation
- SOL formatting
- Configuration validation
- Balance checking logic

**Internal Authentication** (`tests/unit/internal-auth.test.ts`)
- HMAC signature validation
- Timestamp expiration
- Service authorization
- Security configuration

**Balance Monitor** (`tests/unit/BalanceMonitor.test.ts`)
- Monitoring lifecycle (start/stop)
- Balance checking intervals
- Low balance alerts
- Status reporting

### Running Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run specific test file
npm test tests/unit/solana.test.ts

# Run with coverage
npm run test:coverage -- tests/unit
```

---

## Integration Tests

Integration tests interact with real services (Solana devnet, IPFS). They verify the service works end-to-end.

### Prerequisites

Before running integration tests:

1. **Funded Devnet Wallet**
   ```bash
   # Create wallet if needed
   solana-keygen new --outfile devnet-wallet.json
   
   # Fund wallet
   solana airdrop 2 devnet-wallet.json
   
   # Check balance
   solana balance devnet-wallet.json
   ```

2. **Configure Environment**
   ```bash
   # .env file must have:
   SOLANA_NETWORK=devnet
   SOLANA_RPC_URL=https://api.devnet.solana.com
   WALLET_PATH=./devnet-wallet.json
   IPFS_PROVIDER=pinata
   PINATA_API_KEY=your_key
   PINATA_SECRET_API_KEY=your_secret
   ```

3. **Collection NFT** (optional for full test)
   ```bash
   npm run create-collection
   ```

### Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test
npm test tests/integration/devnet-mint.test.ts
```

### What's Tested

**Configuration Tests**
- Solana connection validation
- Wallet balance verification
- IPFS connectivity

**Minting Flow** (skipped by default)
- Full NFT minting on devnet
- Metadata upload to IPFS
- Transaction confirmation
- On-chain verification

**Error Handling**
- Insufficient balance detection
- Network error handling

### Important Notes

⚠️ **The full minting test is skipped by default** to avoid burning SOL in CI/CD.

To run it locally:
1. Edit `tests/integration/devnet-mint.test.ts`
2. Remove `.skip` from the minting test
3. Run: `npm run test:integration`

---

## Manual Testing

### 1. Service Health Check

```bash
# Start service
npm run dev

# Check health endpoint
curl http://localhost:3018/health

# Expected response:
{
  "status": "healthy",
  "service": "minting-service",
  "timestamp": "2025-11-13T..."
}
```

### 2. Balance Monitoring

```bash
# Service logs should show:
# Starting balance monitor
# Balance check completed
# Wallet balance: 1.234 SOL
```

### 3. Internal Authentication

```bash
# Test with valid signature
node scripts/test-internal-auth.js

# Should return 200 OK with mint job created
```

### 4. Webhook Signature

```bash
# Test with valid webhook
node scripts/test-webhook.js

# Should return success response
```

### 5. IPFS Upload

```bash
# Test IPFS connectivity
node -e "
const { getIPFSService } = require('./dist/config/ipfs');
const ipfs = getIPFSService();
ipfs.uploadJSON({ test: true })
  .then(r => console.log('Success:', r))
  .catch(e => console.error('Error:', e));
"
```

### 6. Solana Connection

```bash
# Test Solana RPC
node -e "
const { getConnection } = require('./dist/config/solana');
const conn = getConnection();
conn.getVersion()
  .then(v => console.log('Solana version:', v))
  .catch(e => console.error('Error:', e));
"
```

---

## Test Coverage Goals

Target coverage: **70%** across all categories

Current coverage by component:

| Component | Target | Status |
|-----------|--------|--------|
| Utilities | 80% | ✅ |
| Authentication | 90% | ✅ |
| Services | 70% | ⏳ |
| Routes | 60% | ⏳ |
| Config | 80% | ✅ |

To check current coverage:
```bash
npm run test:coverage
```

---

## CI/CD Testing

### GitHub Actions Workflow

```yaml
name: Test Minting Service

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Generate coverage
        run: npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

**Note:** Integration tests are NOT run in CI/CD as they require funded wallets and can be expensive.

---

## Troubleshooting

### Tests Timing Out

If tests timeout:
```bash
# Increase timeout in jest.config.js
testTimeout: 30000  // 30 seconds
```

### Mock Issues

If mocks aren't working:
```bash
# Clear Jest cache
npx jest --clearCache

# Run tests again
npm test
```

### TypeScript Errors

```bash
# Rebuild TypeScript
npm run build

# Check types
npm run typecheck
```

### Devnet Connection Issues

```bash
# Try different RPC endpoint
SOLANA_RPC_URL=https://api.devnet.solana.com npm run test:integration

# Or use Helius/QuickNode endpoint
```

---

## Best Practices

### Writing Tests

1. **Use descriptive test names**
   ```typescript
   it('should reject request with expired timestamp', async () => {
     // Test implementation
   });
   ```

2. **Test edge cases**
   - Invalid inputs
   - Network failures
   - Boundary conditions
   - Error states

3. **Mock external dependencies**
   ```typescript
   jest.mock('../../src/config/solana');
   ```

4. **Clean up after tests**
   ```typescript
   afterEach(() => {
     jest.clearAllMocks();
   });
   ```

5. **Keep tests independent**
   - Each test should work in isolation
   - Don't rely on test execution order
   - Reset state between tests

### Test Organization

- One test file per source file
- Group related tests with `describe` blocks
- Use `beforeEach` for common setup
- Keep tests focused and simple

---

## Load Testing

For production readiness, perform load testing:

### Setup

```bash
# Install k6
brew install k6  # macOS
# or
sudo apt-get install k6  # Linux
```

### Run Load Test

```bash
# Test minting endpoint
k6 run tests/load/mint-load-test.js

# Expected results:
# - 100 req/s sustained
# - p95 latency < 2s
# - 0% error rate
```

See `tests/load/README.md` for detailed load testing procedures.

---

## Security Testing

### Authentication Tests

✅ **Covered in unit tests:**
- Invalid signatures rejected
- Expired timestamps rejected
- Unknown services blocked
- Missing secrets detected

### Penetration Testing

For production deployment:
1. Run OWASP ZAP scan
2. Test rate limiting
3. Verify no exposed secrets
4. Check for SQL injection (N/A - using parameterized queries)
5. Test CORS policies

---

## Continuous Improvement

### Adding New Tests

When adding new features:

1. **Write tests first** (TDD approach)
2. Ensure 70%+ coverage for new code
3. Include both success and failure cases
4. Update this documentation

### Monitoring Test Health

Track test metrics:
- Execution time trends
- Flaky test occurrences
- Coverage over time
- CI/CD success rate

Use these metrics to maintain test quality.

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Solana Web3.js Testing](https://solana-labs.github.io/solana-web3.js/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

## Support

For testing issues:
1. Check troubleshooting section above
2. Review test logs: `npm test -- --verbose`
3. Ask in team Slack: #minting-service-dev
4. Create issue in project tracker
