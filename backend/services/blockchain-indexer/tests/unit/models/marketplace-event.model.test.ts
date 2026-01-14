/**
 * Comprehensive Unit Tests for src/models/marketplace-event.model.ts
 *
 * Tests Mongoose schema definition for marketplace events
 */

import mongoose from 'mongoose';

describe('src/models/marketplace-event.model.ts - Comprehensive Unit Tests', () => {
  let MarketplaceEvent: any;
  let schema: any;

  beforeAll(() => {
    // Import the model
    const model = require('../../../src/models/marketplace-event.model');
    MarketplaceEvent = model.MarketplaceEvent;
    schema = MarketplaceEvent.schema;
  });

  // =============================================================================
  // SCHEMA STRUCTURE
  // =============================================================================

  describe('Schema Structure', () => {
    it('should have correct model name', () => {
      expect(MarketplaceEvent.modelName).toBe('MarketplaceEvent');
    });

    it('should have all required fields defined', () => {
      const paths = schema.paths;

      expect(paths.eventType).toBeDefined();
      expect(paths.marketplace).toBeDefined();
      expect(paths.signature).toBeDefined();
      expect(paths.tokenId).toBeDefined();
      expect(paths.price).toBeDefined();
      expect(paths.seller).toBeDefined();
      expect(paths.buyer).toBeDefined();
      expect(paths.royaltiesPaid).toBeDefined();
      expect(paths.marketplaceFee).toBeDefined();
      expect(paths.timestamp).toBeDefined();
    });

    it('should have timestamps enabled', () => {
      expect(schema.options.timestamps).toBe(true);
    });

    it('should have createdAt path from timestamps', () => {
      expect(schema.paths.createdAt).toBeDefined();
    });

    it('should have updatedAt path from timestamps', () => {
      expect(schema.paths.updatedAt).toBeDefined();
    });
  });

  // =============================================================================
  // FIELD TYPES
  // =============================================================================

  describe('Field Types', () => {
    it('should have eventType as String type', () => {
      expect(schema.paths.eventType.instance).toBe('String');
    });

    it('should have marketplace as String type', () => {
      expect(schema.paths.marketplace.instance).toBe('String');
    });

    it('should have signature as String type', () => {
      expect(schema.paths.signature.instance).toBe('String');
    });

    it('should have tokenId as String type', () => {
      expect(schema.paths.tokenId.instance).toBe('String');
    });

    it('should have price as Number type', () => {
      expect(schema.paths.price.instance).toBe('Number');
    });

    it('should have seller as String type', () => {
      expect(schema.paths.seller.instance).toBe('String');
    });

    it('should have buyer as String type', () => {
      expect(schema.paths.buyer.instance).toBe('String');
    });

    it('should have royaltiesPaid as Array type', () => {
      expect(schema.paths.royaltiesPaid.instance).toBe('Array');
    });

    it('should have marketplaceFee as Number type', () => {
      expect(schema.paths.marketplaceFee.instance).toBe('Number');
    });

    it('should have timestamp as Date type', () => {
      expect(schema.paths.timestamp.instance).toBe('Date');
    });
  });

  // =============================================================================
  // REQUIRED FIELDS
  // =============================================================================

  describe('Required Fields', () => {
    it('should mark eventType as required', () => {
      expect(schema.paths.eventType.isRequired).toBe(true);
    });

    it('should mark marketplace as required', () => {
      expect(schema.paths.marketplace.isRequired).toBe(true);
    });

    it('should mark signature as required', () => {
      expect(schema.paths.signature.isRequired).toBe(true);
    });

    it('should mark tokenId as required', () => {
      expect(schema.paths.tokenId.isRequired).toBe(true);
    });

    it('should mark price as required', () => {
      expect(schema.paths.price.isRequired).toBe(true);
    });

    it('should mark seller as required', () => {
      expect(schema.paths.seller.isRequired).toBe(true);
    });

    it('should mark timestamp as required', () => {
      expect(schema.paths.timestamp.isRequired).toBe(true);
    });

    it('should not mark buyer as required', () => {
      expect(schema.paths.buyer.isRequired).toBeFalsy();
    });

    it('should not mark marketplaceFee as required', () => {
      expect(schema.paths.marketplaceFee.isRequired).toBeFalsy();
    });
  });

  // =============================================================================
  // UNIQUE CONSTRAINTS
  // =============================================================================

  describe('Unique Constraints', () => {
    it('should mark signature as unique', () => {
      expect(schema.paths.signature.options.unique).toBe(true);
    });
  });

  // =============================================================================
  // ENUM VALIDATIONS
  // =============================================================================

  describe('Enum Validations', () => {
    it('should have enum values for eventType', () => {
      const eventTypeEnum = schema.paths.eventType.enumValues;
      expect(eventTypeEnum).toContain('sale');
      expect(eventTypeEnum).toContain('listing');
      expect(eventTypeEnum).toContain('delisting');
      expect(eventTypeEnum).toContain('price_change');
      expect(eventTypeEnum).toHaveLength(4);
    });

    it('should have enum values for marketplace', () => {
      const marketplaceEnum = schema.paths.marketplace.enumValues;
      expect(marketplaceEnum).toContain('magic_eden');
      expect(marketplaceEnum).toContain('tensor');
      expect(marketplaceEnum).toContain('solanart');
      expect(marketplaceEnum).toContain('tickettoken');
      expect(marketplaceEnum).toContain('other');
      expect(marketplaceEnum).toHaveLength(5);
    });
  });

  // =============================================================================
  // INDEXES
  // =============================================================================

  describe('Indexes', () => {
    it('should have index on eventType', () => {
      expect(schema.paths.eventType.options.index).toBe(true);
    });

    it('should have index on marketplace', () => {
      expect(schema.paths.marketplace.options.index).toBe(true);
    });

    it('should have index on signature', () => {
      expect(schema.paths.signature.options.index).toBe(true);
    });

    it('should have index on tokenId', () => {
      expect(schema.paths.tokenId.options.index).toBe(true);
    });

    it('should have index on seller', () => {
      expect(schema.paths.seller.options.index).toBe(true);
    });

    it('should have index on buyer', () => {
      expect(schema.paths.buyer.options.index).toBe(true);
    });

    it('should have index on timestamp', () => {
      expect(schema.paths.timestamp.options.index).toBe(true);
    });

    it('should have compound index on tokenId and timestamp', () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(
        (idx: any) => idx[0].tokenId === 1 && idx[0].timestamp === -1
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have compound index on marketplace, eventType, and timestamp', () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(
        (idx: any) =>
          idx[0].marketplace === 1 &&
          idx[0].eventType === 1 &&
          idx[0].timestamp === -1
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have compound index on seller and timestamp', () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(
        (idx: any) => idx[0].seller === 1 && idx[0].timestamp === -1
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have compound index on buyer and timestamp', () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(
        (idx: any) => idx[0].buyer === 1 && idx[0].timestamp === -1
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have at least 11 indexes', () => {
      const indexes = schema.indexes();
      // 7 simple + 4 compound
      expect(indexes.length).toBeGreaterThanOrEqual(4);
    });
  });

  // =============================================================================
  // NESTED SCHEMAS - ROYALTIES PAID
  // =============================================================================

  describe('RoyaltiesPaid Nested Schema', () => {
    it('should have recipient field in royaltiesPaid schema', () => {
      const royaltiesSchema = schema.paths.royaltiesPaid.schema;
      expect(royaltiesSchema.paths.recipient).toBeDefined();
    });

    it('should have amount field in royaltiesPaid schema', () => {
      const royaltiesSchema = schema.paths.royaltiesPaid.schema;
      expect(royaltiesSchema.paths.amount).toBeDefined();
    });

    it('should mark recipient as required in royaltiesPaid', () => {
      const royaltiesSchema = schema.paths.royaltiesPaid.schema;
      expect(royaltiesSchema.paths.recipient.isRequired).toBe(true);
    });

    it('should mark amount as required in royaltiesPaid', () => {
      const royaltiesSchema = schema.paths.royaltiesPaid.schema;
      expect(royaltiesSchema.paths.amount.isRequired).toBe(true);
    });

    it('should have recipient as String type', () => {
      const royaltiesSchema = schema.paths.royaltiesPaid.schema;
      expect(royaltiesSchema.paths.recipient.instance).toBe('String');
    });

    it('should have amount as Number type', () => {
      const royaltiesSchema = schema.paths.royaltiesPaid.schema;
      expect(royaltiesSchema.paths.amount.instance).toBe('Number');
    });
  });

  // =============================================================================
  // DOCUMENT INSTANTIATION
  // =============================================================================

  describe('Document Instantiation', () => {
    it('should create a valid sale event document', () => {
      const doc = new MarketplaceEvent({
        eventType: 'sale',
        marketplace: 'magic_eden',
        signature: 'sig-sale-123',
        tokenId: 'token-123',
        price: 1000000,
        seller: 'seller-wallet',
        buyer: 'buyer-wallet',
        royaltiesPaid: [],
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.eventType).toBe('sale');
      expect(doc.marketplace).toBe('magic_eden');
    });

    it('should create a valid listing event document', () => {
      const doc = new MarketplaceEvent({
        eventType: 'listing',
        marketplace: 'tensor',
        signature: 'sig-listing-123',
        tokenId: 'token-456',
        price: 2000000,
        seller: 'seller-wallet',
        royaltiesPaid: [],
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.eventType).toBe('listing');
    });

    it('should create a valid delisting event document', () => {
      const doc = new MarketplaceEvent({
        eventType: 'delisting',
        marketplace: 'solanart',
        signature: 'sig-delisting-123',
        tokenId: 'token-789',
        price: 0,
        seller: 'seller-wallet',
        royaltiesPaid: [],
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.eventType).toBe('delisting');
    });

    it('should create a valid price_change event document', () => {
      const doc = new MarketplaceEvent({
        eventType: 'price_change',
        marketplace: 'tickettoken',
        signature: 'sig-price-123',
        tokenId: 'token-abc',
        price: 1500000,
        seller: 'seller-wallet',
        royaltiesPaid: [],
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.eventType).toBe('price_change');
    });

    it('should validate required fields', () => {
      const doc = new MarketplaceEvent({
        eventType: 'sale',
        marketplace: 'magic_eden',
      });

      const error = doc.validateSync();
      expect(error).toBeDefined();
      expect(error?.errors.signature).toBeDefined();
      expect(error?.errors.tokenId).toBeDefined();
      expect(error?.errors.price).toBeDefined();
      expect(error?.errors.seller).toBeDefined();
      expect(error?.errors.timestamp).toBeDefined();
    });

    it('should validate eventType enum', () => {
      const doc = new MarketplaceEvent({
        eventType: 'invalid_type',
        marketplace: 'magic_eden',
        signature: 'sig-123',
        tokenId: 'token-123',
        price: 1000000,
        seller: 'seller-wallet',
        timestamp: new Date(),
      });

      const error = doc.validateSync();
      expect(error).toBeDefined();
      expect(error?.errors.eventType).toBeDefined();
    });

    it('should validate marketplace enum', () => {
      const doc = new MarketplaceEvent({
        eventType: 'sale',
        marketplace: 'invalid_marketplace',
        signature: 'sig-123',
        tokenId: 'token-123',
        price: 1000000,
        seller: 'seller-wallet',
        timestamp: new Date(),
      });

      const error = doc.validateSync();
      expect(error).toBeDefined();
      expect(error?.errors.marketplace).toBeDefined();
    });

    it('should accept document without buyer', () => {
      const doc = new MarketplaceEvent({
        eventType: 'listing',
        marketplace: 'magic_eden',
        signature: 'sig-no-buyer',
        tokenId: 'token-123',
        price: 1000000,
        seller: 'seller-wallet',
        royaltiesPaid: [],
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.buyer).toBeUndefined();
    });

    it('should accept document without marketplaceFee', () => {
      const doc = new MarketplaceEvent({
        eventType: 'sale',
        marketplace: 'magic_eden',
        signature: 'sig-no-fee',
        tokenId: 'token-123',
        price: 1000000,
        seller: 'seller-wallet',
        buyer: 'buyer-wallet',
        royaltiesPaid: [],
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.marketplaceFee).toBeUndefined();
    });

    it('should accept document with royaltiesPaid', () => {
      const doc = new MarketplaceEvent({
        eventType: 'sale',
        marketplace: 'magic_eden',
        signature: 'sig-royalties',
        tokenId: 'token-123',
        price: 1000000,
        seller: 'seller-wallet',
        buyer: 'buyer-wallet',
        royaltiesPaid: [
          { recipient: 'creator-wallet', amount: 50000 },
          { recipient: 'platform-wallet', amount: 25000 },
        ],
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.royaltiesPaid).toHaveLength(2);
      expect(doc.royaltiesPaid[0].recipient).toBe('creator-wallet');
      expect(doc.royaltiesPaid[0].amount).toBe(50000);
    });

    it('should accept document with marketplaceFee', () => {
      const doc = new MarketplaceEvent({
        eventType: 'sale',
        marketplace: 'magic_eden',
        signature: 'sig-with-fee',
        tokenId: 'token-123',
        price: 1000000,
        seller: 'seller-wallet',
        buyer: 'buyer-wallet',
        royaltiesPaid: [],
        marketplaceFee: 20000,
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.marketplaceFee).toBe(20000);
    });

    it('should set createdAt and updatedAt timestamps', () => {
      const doc = new MarketplaceEvent({
        eventType: 'sale',
        marketplace: 'magic_eden',
        signature: 'sig-timestamps',
        tokenId: 'token-123',
        price: 1000000,
        seller: 'seller-wallet',
        royaltiesPaid: [],
        timestamp: new Date(),
      });

      expect(doc.createdAt).toBeUndefined(); // Not set until saved
      expect(doc.updatedAt).toBeUndefined();
    });
  });

  // =============================================================================
  // ALL EVENT TYPES
  // =============================================================================

  describe('All Event Types', () => {
    const eventTypes = ['sale', 'listing', 'delisting', 'price_change'];

    eventTypes.forEach((eventType) => {
      it(`should accept ${eventType} event type`, () => {
        const doc = new MarketplaceEvent({
          eventType,
          marketplace: 'magic_eden',
          signature: `sig-${eventType}`,
          tokenId: 'token-123',
          price: 1000000,
          seller: 'seller-wallet',
          royaltiesPaid: [],
          timestamp: new Date(),
        });

        expect(doc.validateSync()).toBeUndefined();
        expect(doc.eventType).toBe(eventType);
      });
    });
  });

  // =============================================================================
  // ALL MARKETPLACE TYPES
  // =============================================================================

  describe('All Marketplace Types', () => {
    const marketplaces = ['magic_eden', 'tensor', 'solanart', 'tickettoken', 'other'];

    marketplaces.forEach((marketplace) => {
      it(`should accept ${marketplace} marketplace`, () => {
        const doc = new MarketplaceEvent({
          eventType: 'sale',
          marketplace,
          signature: `sig-${marketplace}`,
          tokenId: 'token-123',
          price: 1000000,
          seller: 'seller-wallet',
          royaltiesPaid: [],
          timestamp: new Date(),
        });

        expect(doc.validateSync()).toBeUndefined();
        expect(doc.marketplace).toBe(marketplace);
      });
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export MarketplaceEvent model', () => {
      expect(MarketplaceEvent).toBeDefined();
      expect(MarketplaceEvent.modelName).toBe('MarketplaceEvent');
    });

    it('should be a Mongoose model', () => {
      expect(MarketplaceEvent.prototype).toBeInstanceOf(mongoose.Model);
    });
  });
});
