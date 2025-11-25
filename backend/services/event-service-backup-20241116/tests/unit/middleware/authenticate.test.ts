import { authenticate } from '../../../src/middleware/authenticate';

describe('Authenticate Middleware', () => {
  it('should export authenticateFastify as authenticate', () => {
    expect(authenticate).toBeDefined();
    expect(typeof authenticate).toBe('function');
  });
});
