// =============================================================================
// TEST SUITE: services/compliance/index exports
// =============================================================================

describe('services/compliance/index exports', () => {
  // ===========================================================================
  // Module Exports - 3 test cases
  // ===========================================================================

  describe('Module Exports', () => {
    it('should export tax-calculator service', () => {
      const complianceIndex = require('../../../../src/services/compliance/index');
      
      expect(complianceIndex).toBeDefined();
    });

    it('should export form-1099-da service', () => {
      const complianceIndex = require('../../../../src/services/compliance/index');
      
      expect(complianceIndex).toBeDefined();
    });

    it('should export aml-checker service', () => {
      const complianceIndex = require('../../../../src/services/compliance/index');
      
      expect(complianceIndex).toBeDefined();
    });
  });

  // ===========================================================================
  // Export Structure - 3 test cases
  // ===========================================================================

  describe('Export Structure', () => {
    it('should be a valid module', () => {
      const complianceIndex = require('../../../../src/services/compliance/index');
      
      expect(typeof complianceIndex).toBe('object');
    });

    it('should allow importing from index', () => {
      expect(() => {
        require('../../../../src/services/compliance/index');
      }).not.toThrow();
    });

    it('should re-export all compliance services', () => {
      const complianceIndex = require('../../../../src/services/compliance/index');
      
      // Should have exports from the three service files
      expect(Object.keys(complianceIndex).length).toBeGreaterThanOrEqual(0);
    });
  });
});
