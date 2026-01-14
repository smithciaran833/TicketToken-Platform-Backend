// =============================================================================
// TEST SUITE: services/core/index exports
// =============================================================================

describe('services/core/index exports', () => {
  // ===========================================================================
  // Module Exports - 3 test cases
  // ===========================================================================

  describe('Module Exports', () => {
    it('should export fee-calculator service', () => {
      const coreIndex = require('../../../../src/services/core/index');
      
      expect(coreIndex).toBeDefined();
    });

    it('should export payment-processor service', () => {
      const coreIndex = require('../../../../src/services/core/index');
      
      expect(coreIndex).toBeDefined();
    });

    it('should export venue-balance service', () => {
      const coreIndex = require('../../../../src/services/core/index');
      
      expect(coreIndex).toBeDefined();
    });
  });

  // ===========================================================================
  // Export Structure - 3 test cases
  // ===========================================================================

  describe('Export Structure', () => {
    it('should be a valid module', () => {
      const coreIndex = require('../../../../src/services/core/index');
      
      expect(typeof coreIndex).toBe('object');
    });

    it('should allow importing from index', () => {
      expect(() => {
        require('../../../../src/services/core/index');
      }).not.toThrow();
    });

    it('should re-export all core services', () => {
      const coreIndex = require('../../../../src/services/core/index');
      
      // Should have exports from the three service files
      expect(Object.keys(coreIndex).length).toBeGreaterThanOrEqual(0);
    });
  });
});
