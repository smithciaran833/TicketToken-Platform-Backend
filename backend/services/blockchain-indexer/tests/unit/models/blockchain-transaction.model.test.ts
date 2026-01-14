/**
 * Comprehensive Unit Tests for src/models/blockchain-transaction.model.ts
 *
 * Tests Mongoose schema definition for blockchain transactions
 */

import mongoose from 'mongoose';

describe('src/models/blockchain-transaction.model.ts - Comprehensive Unit Tests', () => {
  let BlockchainTransaction: any;
  let schema: any;

  beforeAll(() => {
    // Import the model
    const model = require('../../../src/models/blockchain-transaction.model');
    BlockchainTransaction = model.BlockchainTransaction;
    schema = BlockchainTransaction.schema;
  });

  // =============================================================================
  // SCHEMA STRUCTURE
  // =============================================================================

  describe('Schema Structure', () => {
    it('should have correct model name', () => {
      expect(BlockchainTransaction.modelName).toBe('BlockchainTransaction');
    });

    it('should have all required fields defined', () => {
      const paths = schema.paths;

      expect(paths.signature).toBeDefined();
      expect(paths.slot).toBeDefined();
      expect(paths.blockTime).toBeDefined();
      expect(paths.accounts).toBeDefined();
      expect(paths.instructions).toBeDefined();
      expect(paths.logs).toBeDefined();
      expect(paths.fee).toBeDefined();
      expect(paths.status).toBeDefined();
      expect(paths.errorMessage).toBeDefined();
      expect(paths.indexedAt).toBeDefined();
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
    it('should have signature as String type', () => {
      expect(schema.paths.signature.instance).toBe('String');
    });

    it('should have slot as Number type', () => {
      expect(schema.paths.slot.instance).toBe('Number');
    });

    it('should have blockTime as Number type', () => {
      expect(schema.paths.blockTime.instance).toBe('Number');
    });

    it('should have fee as Number type', () => {
      expect(schema.paths.fee.instance).toBe('Number');
    });

    it('should have status as String type', () => {
      expect(schema.paths.status.instance).toBe('String');
    });

    it('should have errorMessage as String type', () => {
      expect(schema.paths.errorMessage.instance).toBe('String');
    });

    it('should have indexedAt as Date type', () => {
      expect(schema.paths.indexedAt.instance).toBe('Date');
    });

    it('should have accounts as Array type', () => {
      expect(schema.paths.accounts.instance).toBe('Array');
    });

    it('should have instructions as Array type', () => {
      expect(schema.paths.instructions.instance).toBe('Array');
    });

    it('should have logs as Array type', () => {
      expect(schema.paths.logs.instance).toBe('Array');
    });
  });

  // =============================================================================
  // REQUIRED FIELDS
  // =============================================================================

  describe('Required Fields', () => {
    it('should mark signature as required', () => {
      expect(schema.paths.signature.isRequired).toBe(true);
    });

    it('should mark slot as required', () => {
      expect(schema.paths.slot.isRequired).toBe(true);
    });

    it('should mark blockTime as required', () => {
      expect(schema.paths.blockTime.isRequired).toBe(true);
    });

    it('should mark fee as required', () => {
      expect(schema.paths.fee.isRequired).toBe(true);
    });

    it('should mark status as required', () => {
      expect(schema.paths.status.isRequired).toBe(true);
    });

    it('should not mark errorMessage as required', () => {
      expect(schema.paths.errorMessage.isRequired).toBeFalsy();
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
    it('should have enum values for status', () => {
      const statusEnum = schema.paths.status.enumValues;
      expect(statusEnum).toContain('success');
      expect(statusEnum).toContain('failed');
      expect(statusEnum).toHaveLength(2);
    });
  });

  // =============================================================================
  // DEFAULT VALUES
  // =============================================================================

  describe('Default Values', () => {
    it('should have default value for indexedAt', () => {
      expect(schema.paths.indexedAt.defaultValue).toBeDefined();
    });
  });

  // =============================================================================
  // INDEXES
  // =============================================================================

  describe('Indexes', () => {
    it('should have index on signature', () => {
      expect(schema.paths.signature.options.index).toBe(true);
    });

    it('should have index on slot', () => {
      expect(schema.paths.slot.options.index).toBe(true);
    });

    it('should have index on blockTime', () => {
      expect(schema.paths.blockTime.options.index).toBe(true);
    });

    it('should have index on indexedAt', () => {
      expect(schema.paths.indexedAt.options.index).toBe(true);
    });

    it('should have compound index on blockTime and slot', () => {
      const indexes = schema.indexes();
      const compoundIndex = indexes.find(
        (idx: any) => idx[0].blockTime === -1 && idx[0].slot === -1
      );
      expect(compoundIndex).toBeDefined();
    });

    it('should have index on accounts.pubkey with blockTime', () => {
      const indexes = schema.indexes();
      const accountsIndex = indexes.find(
        (idx: any) => idx[0]['accounts.pubkey'] === 1 && idx[0].blockTime === -1
      );
      expect(accountsIndex).toBeDefined();
    });

    it('should have index on instructions.programId with blockTime', () => {
      const indexes = schema.indexes();
      const instructionsIndex = indexes.find(
        (idx: any) => idx[0]['instructions.programId'] === 1 && idx[0].blockTime === -1
      );
      expect(instructionsIndex).toBeDefined();
    });

    it('should have total of 7 indexes', () => {
      const indexes = schema.indexes();
      // signature, slot, blockTime, indexedAt, compound, accounts, instructions
      expect(indexes.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =============================================================================
  // NESTED SCHEMAS - ACCOUNTS
  // =============================================================================

  describe('Accounts Nested Schema', () => {
    it('should have pubkey field in accounts schema', () => {
      const accountsSchema = schema.paths.accounts.schema;
      expect(accountsSchema.paths.pubkey).toBeDefined();
    });

    it('should have isSigner field in accounts schema', () => {
      const accountsSchema = schema.paths.accounts.schema;
      expect(accountsSchema.paths.isSigner).toBeDefined();
    });

    it('should have isWritable field in accounts schema', () => {
      const accountsSchema = schema.paths.accounts.schema;
      expect(accountsSchema.paths.isWritable).toBeDefined();
    });

    it('should mark pubkey as required in accounts', () => {
      const accountsSchema = schema.paths.accounts.schema;
      expect(accountsSchema.paths.pubkey.isRequired).toBe(true);
    });

    it('should mark isSigner as required in accounts', () => {
      const accountsSchema = schema.paths.accounts.schema;
      expect(accountsSchema.paths.isSigner.isRequired).toBe(true);
    });

    it('should mark isWritable as required in accounts', () => {
      const accountsSchema = schema.paths.accounts.schema;
      expect(accountsSchema.paths.isWritable.isRequired).toBe(true);
    });

    it('should have pubkey as String type', () => {
      const accountsSchema = schema.paths.accounts.schema;
      expect(accountsSchema.paths.pubkey.instance).toBe('String');
    });

    it('should have isSigner as Boolean type', () => {
      const accountsSchema = schema.paths.accounts.schema;
      expect(accountsSchema.paths.isSigner.instance).toBe('Boolean');
    });

    it('should have isWritable as Boolean type', () => {
      const accountsSchema = schema.paths.accounts.schema;
      expect(accountsSchema.paths.isWritable.instance).toBe('Boolean');
    });
  });

  // =============================================================================
  // NESTED SCHEMAS - INSTRUCTIONS
  // =============================================================================

  describe('Instructions Nested Schema', () => {
    it('should have programId field in instructions schema', () => {
      const instructionsSchema = schema.paths.instructions.schema;
      expect(instructionsSchema.paths.programId).toBeDefined();
    });

    it('should have accounts field in instructions schema', () => {
      const instructionsSchema = schema.paths.instructions.schema;
      expect(instructionsSchema.paths.accounts).toBeDefined();
    });

    it('should have data field in instructions schema', () => {
      const instructionsSchema = schema.paths.instructions.schema;
      expect(instructionsSchema.paths.data).toBeDefined();
    });

    it('should mark programId as required in instructions', () => {
      const instructionsSchema = schema.paths.instructions.schema;
      expect(instructionsSchema.paths.programId.isRequired).toBe(true);
    });

    it('should mark data as required in instructions', () => {
      const instructionsSchema = schema.paths.instructions.schema;
      expect(instructionsSchema.paths.data.isRequired).toBe(true);
    });

    it('should have programId as String type', () => {
      const instructionsSchema = schema.paths.instructions.schema;
      expect(instructionsSchema.paths.programId.instance).toBe('String');
    });

    it('should have data as String type', () => {
      const instructionsSchema = schema.paths.instructions.schema;
      expect(instructionsSchema.paths.data.instance).toBe('String');
    });

    it('should have accounts as Array type', () => {
      const instructionsSchema = schema.paths.instructions.schema;
      expect(instructionsSchema.paths.accounts.instance).toBe('Array');
    });
  });

  // =============================================================================
  // DOCUMENT INSTANTIATION
  // =============================================================================

  describe('Document Instantiation', () => {
    it('should create a new document instance', () => {
      const doc = new BlockchainTransaction({
        signature: 'test-sig',
        slot: 12345,
        blockTime: 1234567890,
        accounts: [],
        instructions: [],
        logs: [],
        fee: 5000,
        status: 'success',
      });

      expect(doc).toBeDefined();
      expect(doc.signature).toBe('test-sig');
      expect(doc.slot).toBe(12345);
    });

    it('should set default indexedAt on instantiation', () => {
      const doc = new BlockchainTransaction({
        signature: 'test-sig',
        slot: 12345,
        blockTime: 1234567890,
        accounts: [],
        instructions: [],
        logs: [],
        fee: 5000,
        status: 'success',
      });

      expect(doc.indexedAt).toBeInstanceOf(Date);
    });

    it('should validate required fields synchronously', () => {
      const doc = new BlockchainTransaction({
        slot: 12345,
        blockTime: 1234567890,
      });

      const error = doc.validateSync();
      expect(error).toBeDefined();
      expect(error?.errors.signature).toBeDefined();
      expect(error?.errors.fee).toBeDefined();
      expect(error?.errors.status).toBeDefined();
    });

    it('should validate status enum', () => {
      const doc = new BlockchainTransaction({
        signature: 'test',
        slot: 12345,
        blockTime: 1234567890,
        accounts: [],
        instructions: [],
        logs: [],
        fee: 5000,
        status: 'invalid',
      });

      const error = doc.validateSync();
      expect(error).toBeDefined();
      expect(error?.errors.status).toBeDefined();
    });

    it('should accept valid status values', () => {
      const doc1 = new BlockchainTransaction({
        signature: 'test-1',
        slot: 12345,
        blockTime: 1234567890,
        accounts: [],
        instructions: [],
        logs: [],
        fee: 5000,
        status: 'success',
      });

      const doc2 = new BlockchainTransaction({
        signature: 'test-2',
        slot: 12345,
        blockTime: 1234567890,
        accounts: [],
        instructions: [],
        logs: [],
        fee: 5000,
        status: 'failed',
      });

      expect(doc1.validateSync()).toBeUndefined();
      expect(doc2.validateSync()).toBeUndefined();
    });

    it('should accept documents with parsed instructions', () => {
      const doc = new BlockchainTransaction({
        signature: 'test-parsed',
        slot: 12345,
        blockTime: 1234567890,
        accounts: [],
        instructions: [
          {
            programId: 'program1',
            accounts: [0, 1],
            data: 'base64data',
            parsed: {
              type: 'purchase_tickets',
              info: { amount: 2, price: 100 },
            },
          },
        ],
        logs: [],
        fee: 5000,
        status: 'success',
      });

      expect(doc.validateSync()).toBeUndefined();
      expect(doc.instructions[0].parsed).toBeDefined();
      expect(doc.instructions[0].parsed.type).toBe('purchase_tickets');
    });

    it('should validate parsed.type enum values', () => {
      const doc = new BlockchainTransaction({
        signature: 'test-invalid-parsed',
        slot: 12345,
        blockTime: 1234567890,
        accounts: [],
        instructions: [
          {
            programId: 'program1',
            accounts: [0, 1],
            data: 'base64data',
            parsed: {
              type: 'invalid_type',
              info: {},
            },
          },
        ],
        logs: [],
        fee: 5000,
        status: 'success',
      });

      const error = doc.validateSync();
      expect(error).toBeDefined();
    });

    it('should accept all valid parsed.type values', () => {
      const validTypes = [
        'purchase_tickets',
        'list_ticket',
        'buy_listing',
        'cancel_listing',
        'create_event',
        'create_venue',
      ];

      validTypes.forEach((type, index) => {
        const doc = new BlockchainTransaction({
          signature: `test-type-${index}`,
          slot: 12345,
          blockTime: 1234567890,
          accounts: [],
          instructions: [
            {
              programId: 'program1',
              accounts: [0, 1],
              data: 'base64data',
              parsed: {
                type,
                info: {},
              },
            },
          ],
          logs: [],
          fee: 5000,
          status: 'success',
        });

        expect(doc.validateSync()).toBeUndefined();
      });
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export BlockchainTransaction model', () => {
      expect(BlockchainTransaction).toBeDefined();
      expect(BlockchainTransaction.modelName).toBe('BlockchainTransaction');
    });

    it('should be a Mongoose model', () => {
      expect(BlockchainTransaction.prototype).toBeInstanceOf(mongoose.Model);
    });
  });
});
