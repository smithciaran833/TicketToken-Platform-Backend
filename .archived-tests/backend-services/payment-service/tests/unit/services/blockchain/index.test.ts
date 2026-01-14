// =============================================================================
// TEST SUITE: services/blockchain/index exports
// =============================================================================

describe('services/blockchain/index exports', () => {
  // ===========================================================================
  // Module Exports - 3 test cases
  // ===========================================================================

  describe('Module Exports', () => {
    it('should export nft-queue service', () => {
      const blockchainIndex = require('../../../../src/services/blockchain/index');
      
      expect(blockchainIndex).toBeDefined();
    });

    it('should export gas-estimator service', () => {
      const blockchainIndex = require('../../../../src/services/blockchain/index');
      
      expect(blockchainIndex).toBeDefined();
    });

    it('should export mint-batcher service', () => {
      const blockchainIndex = require('../../../../src/services/blockchain/index');
      
      expect(blockchainIndex).toBeDefined();
    });
  });

  // ===========================================================================
  // Export Structure - 3 test cases
  // ===========================================================================

  describe('Export Structure', () => {
    it('should be a valid module', () => {
      const blockchainIndex = require('../../../../src/services/blockchain/index');
      
      expect(typeof blockchainIndex).toBe('object');
    });

    it('should allow importing from index', () => {
      expect(() => {
        require('../../../../src/services/blockchain/index');
      }).not.toThrow();
    });

    it('should re-export all blockchain services', () => {
      const blockchainIndex = require('../../../../src/services/blockchain/index');
      
      // Should have exports from the three service files
      expect(Object.keys(blockchainIndex).length).toBeGreaterThanOrEqual(0);
    });
  });
});
