/**
 * Auth Middleware (Deprecated) Unit Tests
 * 
 * This tests the security measure that disables the deprecated auth.ts file
 */

describe('Auth Middleware (Deprecated)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should throw security error when imported', () => {
    expect(() => {
      require('../../../src/middleware/auth');
    }).toThrow('SECURITY: middleware/auth.ts has been disabled');
  });

  it('should throw error mentioning mock authentication bypass', () => {
    expect(() => {
      require('../../../src/middleware/auth');
    }).toThrow(/mock authentication that bypassed all security/);
  });

  it('should throw error recommending auth.middleware.ts', () => {
    expect(() => {
      require('../../../src/middleware/auth');
    }).toThrow(/Use auth\.middleware\.ts for proper JWT validation/);
  });

  it('should prevent any code execution after the throw', () => {
    let importSucceeded = false;
    
    try {
      require('../../../src/middleware/auth');
      importSucceeded = true;
    } catch (error) {
      // Expected
    }

    expect(importSucceeded).toBe(false);
  });

  it('should not export any usable functions', () => {
    let exports: any = null;
    
    try {
      exports = require('../../../src/middleware/auth');
    } catch (error) {
      // Error is thrown before exports are available
      expect(exports).toBeNull();
    }
  });
});
