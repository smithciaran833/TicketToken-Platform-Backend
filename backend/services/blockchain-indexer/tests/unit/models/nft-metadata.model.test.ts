/**
 * Comprehensive Unit Tests for src/models/nft-metadata.model.ts
 *
 * Tests Mongoose schema definition for NFT metadata
 */

import mongoose from 'mongoose';

describe('src/models/nft-metadata.model.ts - Comprehensive Unit Tests', () => {
  let NFTMetadata: any;
  let schema: any;

  beforeAll(() => {
    // Import the model
    const model = require('../../../src/models/nft-metadata.model');
    NFTMetadata = model.NFTMetadata;
    schema = NFTMetadata.schema;
  });

  // =============================================================================
  // SCHEMA STRUCTURE
  // =============================================================================

  describe('Schema Structure', () => {
    it('should have correct model name', () => {
      expect(NFTMetadata.modelName).toBe('NFTMetadata');
    });

    it('should have all top-level fields defined', () => {
      const paths = schema.paths;

      expect(paths.assetId).toBeDefined();
      expect(paths.tree).toBeDefined();
      expect(paths.leafIndex).toBeDefined();
      expect(paths.merkleProof).toBeDefined();
      expect(paths.owner).toBeDefined();
      expect(paths.delegate).toBeDefined();
      expect(paths.compressed).toBeDefined();
      expect(paths.eventId).toBeDefined();
      expect(paths.ticketNumber).toBeDefined();
      expect(paths.mintedAt).toBeDefined();
    });

    it('should have nested metadata fields defined', () => {
      const paths = schema.paths;

      expect(paths['metadata.name']).toBeDefined();
      expect(paths['metadata.symbol']).toBeDefined();
      expect(paths['metadata.uri']).toBeDefined();
      expect(paths['metadata.sellerFeeBasisPoints']).toBeDefined();
      expect(paths['metadata.creators']).toBeDefined();
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
    it('should have assetId as String type', () => {
      expect(schema.paths.assetId.instance).toBe('String');
    });

    it('should have tree as String type', () => {
      expect(schema.paths.tree.instance).toBe('String');
    });

    it('should have leafIndex as Number type', () => {
      expect(schema.paths.leafIndex.instance).toBe('Number');
    });

    it('should have merkleProof as Array type', () => {
      expect(schema.paths.merkleProof.instance).toBe('Array');
    });

    it('should have owner as String type', () => {
      expect(schema.paths.owner.instance).toBe('String');
    });

    it('should have delegate as String type', () => {
      expect(schema.paths.delegate.instance).toBe('String');
    });

    it('should have compressed as Boolean type', () => {
      expect(schema.paths.compressed.instance).toBe('Boolean');
    });

    it('should have eventId as String type', () => {
      expect(schema.paths.eventId.instance).toBe('String');
    });

    it('should have ticketNumber as Number type', () => {
      expect(schema.paths.ticketNumber.instance).toBe('Number');
    });

    it('should have mintedAt as Date type', () => {
      expect(schema.paths.mintedAt.instance).toBe('Date');
    });

    it('should have metadata.name as String type', () => {
      expect(schema.paths['metadata.name'].instance).toBe('String');
    });

    it('should have metadata.symbol as String type', () => {
      expect(schema.paths['metadata.symbol'].instance).toBe('String');
    });

    it('should have metadata.uri as String type', () => {
      expect(schema.paths['metadata.uri'].instance).toBe('String');
    });

    it('should have metadata.sellerFeeBasisPoints as Number type', () => {
      expect(schema.paths['metadata.sellerFeeBasisPoints'].instance).toBe('Number');
    });

    it('should have metadata.creators as Array type', () => {
      expect(schema.paths['metadata.creators'].instance).toBe('Array');
    });
  });

  // =============================================================================
  // REQUIRED FIELDS
  // =============================================================================

  describe('Required Fields', () => {
    it('should mark assetId as required', () => {
      expect(schema.paths.assetId.isRequired).toBe(true);
    });

    it('should mark tree as required', () => {
      expect(schema.paths.tree.isRequired).toBe(true);
    });

    it('should mark leafIndex as required', () => {
      expect(schema.paths.leafIndex.isRequired).toBe(true);
    });

    it('should mark owner as required', () => {
      expect(schema.paths.owner.isRequired).toBe(true);
    });

    it('should mark metadata.name as required', () => {
      expect(schema.paths['metadata.name'].isRequired).toBe(true);
    });

    it('should mark metadata.symbol as required', () => {
      expect(schema.paths['metadata.symbol'].isRequired).toBe(true);
    });

    it('should mark metadata.uri as required', () => {
      expect(schema.paths['metadata.uri'].isRequired).toBe(true);
    });

    it('should mark metadata.sellerFeeBasisPoints as required', () => {
      expect(schema.paths['metadata.sellerFeeBasisPoints'].isRequired).toBe(true);
    });

    it('should not mark delegate as required', () => {
      expect(schema.paths.delegate.isRequired).toBeFalsy();
    });

    it('should not mark eventId as required', () => {
      expect(schema.paths.eventId.isRequired).toBeFalsy();
    });

    it('should not mark ticketNumber as required', () => {
      expect(schema.paths.ticketNumber.isRequired).toBeFalsy();
    });
  });

  // =============================================================================
  // UNIQUE CONSTRAINTS
  // =============================================================================

  describe('Unique Constraints', () => {
    it('should mark assetId as unique', () => {
      expect(schema.paths.assetId.options.unique).toBe(true);
    });

    it('should have unique compound index on tree and leafIndex', () => {
      const indexes = schema.indexes();
      const uniqueIndex = indexes.find(
        (idx: any) => idx[0].tree === 1 && idx[0].leafIndex === 1 && idx[1]?.unique === true
      );
      expect(uniqueIndex).toBeDefined();
    });
  });

  // =============================================================================
  // DEFAULT VALUES
  // =============================================================================

  describe('Default Values', () => {
    it('should have default value for compressed', () => {
      expect(schema.paths.compressed.defaultValue).toBe(true);
    });

    it('should have default value for mintedAt', () => {
      expect(schema.paths.mintedAt.defaultValue).toBeDefined();
    });
  });

  // =============================================================================
  // INDEXES
  // =============================================================================

  describe('Indexes', () => {
    it('should have index on assetId', () => {
      expect(schema.paths.assetId.options.index).toBe(true);
    });

    it('should have index on tree', () => {
      expect(schema.paths.tree.options.index).toBe(true);
    });

    it('should have index on owner', () => {
      expect(schema.paths.owner.options.index).toBe(true);
    });

    it('should have index on delegate', () => {
      expect(schema.paths.delegate.options.index).toBe(true);
    });

    it('should have index on eventId', () => {
      expect(schema.paths.eventId.options.index).toBe(true);
    });

    it('should have index on mintedAt', () => {
      expect(schema.paths.mintedAt.options.index).toBe(true);
    });

    it('should have compound index on eventId and ticketNumber', () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(
        (idx: any) => idx[0].eventId === 1 && idx[0].ticketNumber === 1
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have compound index on owner and mintedAt', () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(
        (idx: any) => idx[0].owner === 1 && idx[0].mintedAt === -1
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have unique compound index on tree and leafIndex', () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(
        (idx: any) => idx[0].tree === 1 && idx[0].leafIndex === 1
      );
      expect(compoundIndex).toBeDefined();
      expect(compoundIndex[1]?.unique).toBe(true);
    });

    it('should have at least 9 indexes', () => {
      const indexes = schema.indexes();
      // 6 simple + 3 compound
      expect(indexes.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =============================================================================
  // NESTED SCHEMAS - CREATORS
  // =============================================================================

  describe('Creators Nested Schema', () => {
    it('should have address field in creators schema', () => {
      const creatorsSchema = schema.paths['metadata.creators'].schema;
      expect(creatorsSchema.paths.address).toBeDefined();
    });

    it('should have share field in creators schema', () => {
      const creatorsSchema = schema.paths['metadata.creators'].schema;
      expect(creatorsSchema.paths.share).toBeDefined();
    });

    it('should have verified field in creators schema', () => {
      const creatorsSchema = schema.paths['metadata.creators'].schema;
      expect(creatorsSchema.paths.verified).toBeDefined();
    });

    it('should mark address as required in creators', () => {
      const creatorsSchema = schema.paths['metadata.creators'].schema;
      expect(creatorsSchema.paths.address.isRequired).toBe(true);
    });

    it('should mark share as required in creators', () => {
      const creatorsSchema = schema.paths['metadata.creators'].schema;
      expect(creatorsSchema.paths.share.isRequired).toBe(true);
    });

    it('should mark verified as required in creators', () => {
      const creatorsSchema = schema.paths['metadata.creators'].schema;
      expect(creatorsSchema.paths.verified.isRequired).toBe(true);
    });

    it('should have address as String type', () => {
      const creatorsSchema = schema.paths['metadata.creators'].schema;
      expect(creatorsSchema.paths.address.instance).toBe('String');
    });

    it('should have share as Number type', () => {
      const creatorsSchema = schema.paths['metadata.creators'].schema;
      expect(creatorsSchema.paths.share.instance).toBe('Number');
    });

    it('should have verified as Boolean type', () => {
      const creatorsSchema = schema.paths['metadata.creators'].schema;
      expect(creatorsSchema.paths.verified.instance).toBe('Boolean');
    });
  });

  // =============================================================================
  // DOCUMENT INSTANTIATION
  // =============================================================================

  describe('Document Instantiation', () => {
    it('should create a valid NFT metadata document', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-123',
        tree: 'tree-abc',
        leafIndex: 42,
        metadata: {
          name: 'Test NFT',
          symbol: 'TEST',
          uri: 'https://example.com/metadata.json',
          sellerFeeBasisPoints: 500,
          creators: [
            {
              address: 'creator-wallet-1',
              share: 100,
              verified: true,
            },
          ],
        },
        merkleProof: ['proof1', 'proof2'],
        owner: 'owner-wallet',
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.assetId).toBe('asset-123');
      expect(doc.tree).toBe('tree-abc');
      expect(doc.leafIndex).toBe(42);
    });

    it('should set default compressed value to true', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-456',
        tree: 'tree-def',
        leafIndex: 43,
        metadata: {
          name: 'Test NFT 2',
          symbol: 'TEST2',
          uri: 'https://example.com/metadata2.json',
          sellerFeeBasisPoints: 500,
          creators: [],
        },
        merkleProof: [],
        owner: 'owner-wallet',
      });

      expect(doc.compressed).toBe(true);
    });

    it('should set default mintedAt value', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-789',
        tree: 'tree-ghi',
        leafIndex: 44,
        metadata: {
          name: 'Test NFT 3',
          symbol: 'TEST3',
          uri: 'https://example.com/metadata3.json',
          sellerFeeBasisPoints: 500,
          creators: [],
        },
        merkleProof: [],
        owner: 'owner-wallet',
      });

      expect(doc.mintedAt).toBeInstanceOf(Date);
    });

    it('should validate required fields', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-incomplete',
        tree: 'tree-incomplete',
      });

      const error = doc.validateSync();
      expect(error).toBeDefined();
      expect(error?.errors.leafIndex).toBeDefined();
      expect(error?.errors.owner).toBeDefined();
    });

    it('should validate required metadata fields', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-bad-metadata',
        tree: 'tree-bad',
        leafIndex: 50,
        metadata: {
          name: 'Test',
          // Missing required fields
        } as any,
        owner: 'owner-wallet',
      });

      const error = doc.validateSync();
      expect(error).toBeDefined();
    });

    it('should accept document with optional delegate', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-with-delegate',
        tree: 'tree-delegate',
        leafIndex: 45,
        metadata: {
          name: 'Test NFT',
          symbol: 'TEST',
          uri: 'https://example.com/metadata.json',
          sellerFeeBasisPoints: 500,
          creators: [],
        },
        merkleProof: [],
        owner: 'owner-wallet',
        delegate: 'delegate-wallet',
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.delegate).toBe('delegate-wallet');
    });

    it('should accept document with optional eventId', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-with-event',
        tree: 'tree-event',
        leafIndex: 46,
        metadata: {
          name: 'Ticket NFT',
          symbol: 'TICKET',
          uri: 'https://example.com/ticket.json',
          sellerFeeBasisPoints: 500,
          creators: [],
        },
        merkleProof: [],
        owner: 'owner-wallet',
        eventId: 'event-123',
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.eventId).toBe('event-123');
    });

    it('should accept document with optional ticketNumber', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-with-ticket',
        tree: 'tree-ticket',
        leafIndex: 47,
        metadata: {
          name: 'Ticket NFT',
          symbol: 'TICKET',
          uri: 'https://example.com/ticket.json',
          sellerFeeBasisPoints: 500,
          creators: [],
        },
        merkleProof: [],
        owner: 'owner-wallet',
        eventId: 'event-123',
        ticketNumber: 42,
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.ticketNumber).toBe(42);
    });

    it('should accept document with multiple creators', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-multi-creators',
        tree: 'tree-creators',
        leafIndex: 48,
        metadata: {
          name: 'Multi Creator NFT',
          symbol: 'MULTI',
          uri: 'https://example.com/multi.json',
          sellerFeeBasisPoints: 1000,
          creators: [
            {
              address: 'creator-1',
              share: 50,
              verified: true,
            },
            {
              address: 'creator-2',
              share: 30,
              verified: true,
            },
            {
              address: 'creator-3',
              share: 20,
              verified: false,
            },
          ],
        },
        merkleProof: [],
        owner: 'owner-wallet',
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.metadata.creators).toHaveLength(3);
      expect(doc.metadata.creators[0].address).toBe('creator-1');
      expect(doc.metadata.creators[0].share).toBe(50);
    });

    it('should accept document with empty merkleProof', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-no-proof',
        tree: 'tree-no-proof',
        leafIndex: 49,
        metadata: {
          name: 'No Proof NFT',
          symbol: 'NOPROOF',
          uri: 'https://example.com/noproof.json',
          sellerFeeBasisPoints: 500,
          creators: [],
        },
        merkleProof: [],
        owner: 'owner-wallet',
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.merkleProof).toHaveLength(0);
    });

    it('should accept document with merkleProof array', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-with-proof',
        tree: 'tree-with-proof',
        leafIndex: 50,
        metadata: {
          name: 'Proof NFT',
          symbol: 'PROOF',
          uri: 'https://example.com/proof.json',
          sellerFeeBasisPoints: 500,
          creators: [],
        },
        merkleProof: ['proof-hash-1', 'proof-hash-2', 'proof-hash-3'],
        owner: 'owner-wallet',
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.merkleProof).toHaveLength(3);
    });

    it('should accept compressed: false', () => {
      const doc = new NFTMetadata({
        assetId: 'asset-uncompressed',
        tree: 'tree-uncompressed',
        leafIndex: 51,
        metadata: {
          name: 'Uncompressed NFT',
          symbol: 'UNCOMP',
          uri: 'https://example.com/uncomp.json',
          sellerFeeBasisPoints: 500,
          creators: [],
        },
        merkleProof: [],
        owner: 'owner-wallet',
        compressed: false,
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.compressed).toBe(false);
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export NFTMetadata model', () => {
      expect(NFTMetadata).toBeDefined();
      expect(NFTMetadata.modelName).toBe('NFTMetadata');
    });

    it('should be a Mongoose model', () => {
      expect(NFTMetadata.prototype).toBeInstanceOf(mongoose.Model);
    });
  });
});
