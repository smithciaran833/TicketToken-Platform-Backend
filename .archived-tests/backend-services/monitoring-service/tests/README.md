# Monitoring Service Tests

This directory contains the test suite for the monitoring service.

## Test Structure

```
tests/
├── setup.ts                    # Global test setup
├── unit/                       # Unit tests
│   ├── checkers/              # Health checker tests
│   │   └── database.checker.test.ts
│   └── alerting/              # Alerting system tests
│       ├── rule.engine.test.ts
│       └── escalation.manager.test.ts
└── integration/               # Integration tests
    └── health-check.test.ts
```

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- database.checker.test.ts

# Run in watch mode
npm test -- --watch
```

## Test Coverage

Coverage thresholds are configured in `jest.config.js`:
- Branches: 85%
- Functions: 85%
- Lines: 85%
- Statements: 85%

## Writing Tests

### Unit Tests

Unit tests should:
- Test individual components in isolation
- Mock external dependencies
- Focus on specific functionality
- Be fast and deterministic

Example:
```typescript
describe('ComponentName', () => {
  let component: ComponentName;
  
  beforeEach(() => {
    component = new ComponentName();
  });
  
  it('should do something', () => {
    const result = component.method();
    expect(result).toBe(expected);
  });
});
```

### Integration Tests

Integration tests should:
- Test multiple components working together
- Use test databases/services when possible
- Verify end-to-end workflows
- Clean up resources after tests

## Test Utilities

See `setup.ts` for global utilities:
- `createMockLogger()` - Creates a mock logger
- `sleep(ms)` - Promise-based delay

## Mock Data

Keep test data:
- Minimal but representative
- Well-documented
- Reusable across tests

## Best Practices

1. **Descriptive test names** - Use "should" statements
2. **Arrange-Act-Assert** pattern
3. **One assertion per test** (when possible)
4. **Clean up** - Reset mocks and state between tests
5. **Avoid test interdependence** - Tests should be independent
6. **Test edge cases** - Don't just test happy paths

## Continuous Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Pre-deployment checks

## Troubleshooting

### Tests timing out
- Check for unresolved promises
- Increase timeout in jest.config.js
- Use `jest.setTimeout()` for specific tests

### Flaky tests
- Check for race conditions
- Ensure proper cleanup
- Mock time-dependent code

### Coverage not detected
- Verify file paths in coverage configuration
- Check that files are being imported correctly
- Ensure TypeScript compilation is working

## Contributing

When adding new features:
1. Write tests first (TDD)
2. Ensure all tests pass
3. Maintain coverage thresholds
4. Update this README if needed
