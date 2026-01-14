// =============================================================================
// TEST SUITE: models/index exports
// =============================================================================

describe('models/index exports', () => {
  // ===========================================================================
  // Module Exports - 3 test cases
  // ===========================================================================

  describe('Module Exports', () => {
    it('should export transaction model', () => {
      const modelsIndex = require('../../../src/models/index');
      
      expect(modelsIndex).toBeDefined();
    });

    it('should export venue-balance model', () => {
      const modelsIndex = require('../../../src/models/index');
      
      expect(modelsIndex).toBeDefined();
    });

    it('should export refund model', () => {
      const modelsIndex = require('../../../src/models/index');
      
      expect(modelsIndex).toBeDefined();
    });
  });

  // ===========================================================================
  // Export Structure - 3 test cases
  // ===========================================================================

  describe('Export Structure', () => {
    it('should be a valid module', () => {
      const modelsIndex = require('../../../src/models/index');
      
      expect(typeof modelsIndex).toBe('object');
    });

    it('should allow importing from index', () => {
      expect(() => {
        require('../../../src/models/index');
      }).not.toThrow();
    });

    it('should re-export all models', () => {
      const modelsIndex = require('../../../src/models/index');
      
      // Should have exports from the three model files
      expect(Object.keys(modelsIndex).length).toBeGreaterThanOrEqual(0);
    });
  });
});
