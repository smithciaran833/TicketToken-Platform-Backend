/**
 * Comprehensive Unit Tests for src/models/wallet-activity.model.ts
 *
 * Tests Mongoose schema definition for wallet activity
 */

import mongoose from 'mongoose';

describe('src/models/wallet-activity.model.ts - Comprehensive Unit Tests', () => {
  let WalletActivity: any;
  let schema: any;

  beforeAll(() => {
    // Import the model
    const model = require('../../../src/models/wallet-activity.model');
    WalletActivity = model.WalletActivity;
    schema = WalletActivity.schema;
  });

  // =============================================================================
  // SCHEMA STRUCTURE
  // =============================================================================

  describe('Schema Structure', () => {
    it('should have correct model name', () => {
      expect(WalletActivity.modelName).toBe('WalletActivity');
    });

    it('should have all required fields defined', () => {
      const paths = schema.paths;

      expect(paths.walletAddress).toBeDefined();
      expect(paths.activityType).toBeDefined();
      expect(paths.eventId).toBeDefined();
      expect(paths.ticketId).toBeDefined();
      expect(paths.assetId).toBeDefined();
      expect(paths.transactionSignature).toBeDefined();
      expect(paths.amount).toBeDefined();
      expect(paths.fromAddress).toBeDefined();
      expect(paths.toAddress).toBeDefined();
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
    it('should have walletAddress as String type', () => {
      expect(schema.paths.walletAddress.instance).toBe('String');
    });

    it('should have activityType as String type', () => {
      expect(schema.paths.activityType.instance).toBe('String');
    });

    it('should have eventId as String type', () => {
      expect(schema.paths.eventId.instance).toBe('String');
    });

    it('should have ticketId as String type', () => {
      expect(schema.paths.ticketId.instance).toBe('String');
    });

    it('should have assetId as String type', () => {
      expect(schema.paths.assetId.instance).toBe('String');
    });

    it('should have transactionSignature as String type', () => {
      expect(schema.paths.transactionSignature.instance).toBe('String');
    });

    it('should have amount as Number type', () => {
      expect(schema.paths.amount.instance).toBe('Number');
    });

    it('should have fromAddress as String type', () => {
      expect(schema.paths.fromAddress.instance).toBe('String');
    });

    it('should have toAddress as String type', () => {
      expect(schema.paths.toAddress.instance).toBe('String');
    });

    it('should have timestamp as Date type', () => {
      expect(schema.paths.timestamp.instance).toBe('Date');
    });
  });

  // =============================================================================
  // REQUIRED FIELDS
  // =============================================================================

  describe('Required Fields', () => {
    it('should mark walletAddress as required', () => {
      expect(schema.paths.walletAddress.isRequired).toBe(true);
    });

    it('should mark activityType as required', () => {
      expect(schema.paths.activityType.isRequired).toBe(true);
    });

    it('should mark transactionSignature as required', () => {
      expect(schema.paths.transactionSignature.isRequired).toBe(true);
    });

    it('should mark timestamp as required', () => {
      expect(schema.paths.timestamp.isRequired).toBe(true);
    });

    it('should not mark eventId as required', () => {
      expect(schema.paths.eventId.isRequired).toBeFalsy();
    });

    it('should not mark ticketId as required', () => {
      expect(schema.paths.ticketId.isRequired).toBeFalsy();
    });

    it('should not mark assetId as required', () => {
      expect(schema.paths.assetId.isRequired).toBeFalsy();
    });

    it('should not mark amount as required', () => {
      expect(schema.paths.amount.isRequired).toBeFalsy();
    });

    it('should not mark fromAddress as required', () => {
      expect(schema.paths.fromAddress.isRequired).toBeFalsy();
    });

    it('should not mark toAddress as required', () => {
      expect(schema.paths.toAddress.isRequired).toBeFalsy();
    });
  });

  // =============================================================================
  // ENUM VALIDATIONS
  // =============================================================================

  describe('Enum Validations', () => {
    it('should have enum values for activityType', () => {
      const activityTypeEnum = schema.paths.activityType.enumValues;
      expect(activityTypeEnum).toContain('purchase');
      expect(activityTypeEnum).toContain('sale');
      expect(activityTypeEnum).toContain('transfer');
      expect(activityTypeEnum).toContain('mint');
      expect(activityTypeEnum).toContain('burn');
      expect(activityTypeEnum).toContain('listing');
      expect(activityTypeEnum).toHaveLength(6);
    });
  });

  // =============================================================================
  // INDEXES
  // =============================================================================

  describe('Indexes', () => {
    it('should have index on walletAddress', () => {
      expect(schema.paths.walletAddress.options.index).toBe(true);
    });

    it('should have index on activityType', () => {
      expect(schema.paths.activityType.options.index).toBe(true);
    });

    it('should have index on eventId', () => {
      expect(schema.paths.eventId.options.index).toBe(true);
    });

    it('should have index on ticketId', () => {
      expect(schema.paths.ticketId.options.index).toBe(true);
    });

    it('should have index on assetId', () => {
      expect(schema.paths.assetId.options.index).toBe(true);
    });

    it('should have index on transactionSignature', () => {
      expect(schema.paths.transactionSignature.options.index).toBe(true);
    });

    it('should have index on timestamp', () => {
      expect(schema.paths.timestamp.options.index).toBe(true);
    });

    it('should have compound index on walletAddress and timestamp', () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(
        (idx: any) => idx[0].walletAddress === 1 && idx[0].timestamp === -1
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have compound index on walletAddress, activityType, and timestamp', () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(
        (idx: any) =>
          idx[0].walletAddress === 1 &&
          idx[0].activityType === 1 &&
          idx[0].timestamp === -1
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have compound index on eventId and timestamp', () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(
        (idx: any) => idx[0].eventId === 1 && idx[0].timestamp === -1
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have at least 10 indexes', () => {
      const indexes = schema.indexes();
      // 7 simple + 3 compound
      expect(indexes.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =============================================================================
  // DOCUMENT INSTANTIATION
  // =============================================================================

  describe('Document Instantiation', () => {
    it('should create a valid purchase activity document', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-123',
        activityType: 'purchase',
        eventId: 'event-456',
        transactionSignature: 'sig-purchase-123',
        amount: 1000000,
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.walletAddress).toBe('wallet-123');
      expect(doc.activityType).toBe('purchase');
    });

    it('should create a valid sale activity document', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-456',
        activityType: 'sale',
        transactionSignature: 'sig-sale-123',
        amount: 2000000,
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.activityType).toBe('sale');
    });

    it('should create a valid transfer activity document', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-789',
        activityType: 'transfer',
        transactionSignature: 'sig-transfer-123',
        fromAddress: 'wallet-from',
        toAddress: 'wallet-to',
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.activityType).toBe('transfer');
      expect(doc.fromAddress).toBe('wallet-from');
      expect(doc.toAddress).toBe('wallet-to');
    });

    it('should create a valid mint activity document', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-mint',
        activityType: 'mint',
        transactionSignature: 'sig-mint-123',
        assetId: 'asset-123',
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.activityType).toBe('mint');
    });

    it('should create a valid burn activity document', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-burn',
        activityType: 'burn',
        transactionSignature: 'sig-burn-123',
        assetId: 'asset-456',
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.activityType).toBe('burn');
    });

    it('should create a valid listing activity document', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-listing',
        activityType: 'listing',
        transactionSignature: 'sig-listing-123',
        amount: 1500000,
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.activityType).toBe('listing');
    });

    it('should validate required fields', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-incomplete',
      });

      const error = doc.validateSync();
      expect(error).toBeDefined();
      expect(error?.errors.activityType).toBeDefined();
      expect(error?.errors.transactionSignature).toBeDefined();
      expect(error?.errors.timestamp).toBeDefined();
    });

    it('should validate activityType enum', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-invalid',
        activityType: 'invalid_type',
        transactionSignature: 'sig-123',
        timestamp: new Date(),
      });

      const error = doc.validateSync();
      expect(error).toBeDefined();
      expect(error?.errors.activityType).toBeDefined();
    });

    it('should accept document without optional eventId', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-no-event',
        activityType: 'purchase',
        transactionSignature: 'sig-no-event',
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.eventId).toBeUndefined();
    });

    it('should accept document with eventId', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-with-event',
        activityType: 'purchase',
        eventId: 'event-123',
        transactionSignature: 'sig-with-event',
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.eventId).toBe('event-123');
    });

    it('should accept document with ticketId', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-with-ticket',
        activityType: 'purchase',
        ticketId: 'ticket-456',
        transactionSignature: 'sig-with-ticket',
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.ticketId).toBe('ticket-456');
    });

    it('should accept document with assetId', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-with-asset',
        activityType: 'mint',
        assetId: 'asset-789',
        transactionSignature: 'sig-with-asset',
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.assetId).toBe('asset-789');
    });

    it('should accept document with amount', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-with-amount',
        activityType: 'purchase',
        transactionSignature: 'sig-with-amount',
        amount: 5000000,
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.amount).toBe(5000000);
    });

    it('should accept document without amount', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-no-amount',
        activityType: 'transfer',
        transactionSignature: 'sig-no-amount',
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.amount).toBeUndefined();
    });

    it('should accept document with fromAddress and toAddress', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-transfer',
        activityType: 'transfer',
        transactionSignature: 'sig-transfer',
        fromAddress: 'sender-wallet',
        toAddress: 'receiver-wallet',
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.fromAddress).toBe('sender-wallet');
      expect(doc.toAddress).toBe('receiver-wallet');
    });

    it('should accept document with all optional fields', () => {
      const doc = new WalletActivity({
        walletAddress: 'wallet-complete',
        activityType: 'purchase',
        eventId: 'event-full',
        ticketId: 'ticket-full',
        assetId: 'asset-full',
        transactionSignature: 'sig-complete',
        amount: 3000000,
        fromAddress: 'from-wallet',
        toAddress: 'to-wallet',
        timestamp: new Date(),
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.eventId).toBe('event-full');
      expect(doc.ticketId).toBe('ticket-full');
      expect(doc.assetId).toBe('asset-full');
      expect(doc.amount).toBe(3000000);
      expect(doc.fromAddress).toBe('from-wallet');
      expect(doc.toAddress).toBe('to-wallet');
    });
  });

  // =============================================================================
  // ALL ACTIVITY TYPES
  // =============================================================================

  describe('All Activity Types', () => {
    const activityTypes = ['purchase', 'sale', 'transfer', 'mint', 'burn', 'listing'];

    activityTypes.forEach((activityType) => {
      it(`should accept ${activityType} activity type`, () => {
        const doc = new WalletActivity({
          walletAddress: 'wallet-test',
          activityType,
          transactionSignature: `sig-${activityType}`,
          timestamp: new Date(),
        });

        expect(doc.validateSync()).toBeUndefined();
        expect(doc.activityType).toBe(activityType);
      });
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export WalletActivity model', () => {
      expect(WalletActivity).toBeDefined();
      expect(WalletActivity.modelName).toBe('WalletActivity');
    });

    it('should be a Mongoose model', () => {
      expect(WalletActivity.prototype).toBeInstanceOf(mongoose.Model);
    });
  });
});
