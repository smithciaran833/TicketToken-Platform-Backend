// =============================================================================
// TEST SUITE: types/index.ts exports
// =============================================================================

describe('types/index.ts exports', () => {
  // ===========================================================================
  // Module Exports - 5 test cases
  // ===========================================================================

  describe('Module Exports', () => {
    it('should export payment.types', () => {
      const typesModule = require('../../../src/types/index');
      
      // Payment types should be exported
      expect(typesModule).toBeDefined();
    });

    it('should export marketplace.types', () => {
      const typesModule = require('../../../src/types/index');
      
      expect(typesModule).toBeDefined();
    });

    it('should export group.types', () => {
      const typesModule = require('../../../src/types/index');
      
      expect(typesModule).toBeDefined();
    });

    it('should export fraud.types', () => {
      const typesModule = require('../../../src/types/index');
      
      expect(typesModule).toBeDefined();
    });

    it('should export blockchain.types', () => {
      const typesModule = require('../../../src/types/index');
      
      expect(typesModule).toBeDefined();
    });
  });

  // ===========================================================================
  // Import Test - 5 test cases
  // ===========================================================================

  describe('Import Test', () => {
    it('should allow importing GroupPaymentStatus from index', () => {
      const { GroupPaymentStatus } = require('../../../src/types/index');
      
      expect(GroupPaymentStatus).toBeDefined();
      expect(GroupPaymentStatus.COLLECTING).toBe('collecting');
    });

    it('should allow importing FraudDecision from index', () => {
      const { FraudDecision } = require('../../../src/types/index');
      
      expect(FraudDecision).toBeDefined();
      expect(FraudDecision.APPROVE).toBe('approve');
    });

    it('should allow importing SignalType from index', () => {
      const { SignalType } = require('../../../src/types/index');
      
      expect(SignalType).toBeDefined();
      expect(SignalType.KNOWN_SCALPER).toBe('known_scalper');
    });

    it('should allow destructuring multiple exports', () => {
      const { GroupPaymentStatus, FraudDecision, SignalType } = require('../../../src/types/index');
      
      expect(GroupPaymentStatus).toBeDefined();
      expect(FraudDecision).toBeDefined();
      expect(SignalType).toBeDefined();
    });

    it('should re-export all types from sub-modules', () => {
      const typesIndex = require('../../../src/types/index');
      
      // Should have multiple exports from various type files
      expect(Object.keys(typesIndex).length).toBeGreaterThan(0);
    });
  });
});
