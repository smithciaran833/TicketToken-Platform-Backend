import TransactionProcessor from '../../src/processors/transactionProcessor';
import { Connection } from '@solana/web3.js';
import db from '../../src/utils/database';
import { BlockchainTransaction } from '../../src/models/blockchain-transaction.model';
import { WalletActivity } from '../../src/models/wallet-activity.model';

// Don't mock @solana/web3.js here - it's mocked globally in setup.ts
jest.mock('../../src/utils/database');
jest.mock('../../src/models/blockchain-transaction.model');
jest.mock('../../src/models/wallet-activity.model');

describe('TransactionProcessor', () => {
  let processor: TransactionProcessor;
  let mockConnection: jest.Mocked<Connection>;
  
  beforeEach(() => {
    mockConnection = {
      getParsedTransaction: jest.fn(),
    } as any;
    
    processor = new TransactionProcessor(mockConnection);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('parseInstructionType', () => {
    it('should identify MINT_NFT instruction from logs', () => {
      const transaction = {
        meta: {
          logMessages: [
            'Program log: Instruction: MintNft',
            'Program log: Minted token to wallet'
          ]
        }
      };
      
      // @ts-ignore - accessing private method for testing
      const type = processor.parseInstructionType(transaction);
      expect(type).toBe('MINT_NFT');
    });
    
    it('should identify TRANSFER instruction from logs', () => {
      const transaction = {
        meta: {
          logMessages: [
            'Program log: Instruction: Transfer',
            'Program log: Transferred token'
          ]
        }
      };
      
      // @ts-ignore
      const type = processor.parseInstructionType(transaction);
      expect(type).toBe('TRANSFER');
    });
    
    it('should identify BURN instruction from logs', () => {
      const transaction = {
        meta: {
          logMessages: [
            'Program log: Instruction: Burn',
            'Program log: Burned token'
          ]
        }
      };
      
      // @ts-ignore
      const type = processor.parseInstructionType(transaction);
      expect(type).toBe('BURN');
    });
    
    it('should return UNKNOWN for unrecognized instructions', () => {
      const transaction = {
        meta: {
          logMessages: ['Some other instruction']
        }
      };
      
      // @ts-ignore
      const type = processor.parseInstructionType(transaction);
      expect(type).toBe('UNKNOWN');
    });

    it('should handle transactions with no logs', () => {
      const transaction = {
        meta: {
          logMessages: []
        }
      };
      
      // @ts-ignore
      const type = processor.parseInstructionType(transaction);
      expect(type).toBe('UNKNOWN');
    });
  });
  
  describe('checkExists', () => {
    it('should return true if transaction exists in database', async () => {
      (db.query as jest.Mock).mockResolvedValue({ 
        rows: [{ signature: 'test-signature' }] 
      });
      
      // @ts-ignore
      const exists = await processor.checkExists('test-signature');
      
      expect(exists).toBe(true);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['test-signature']
      );
    });
    
    it('should return false if transaction does not exist', async () => {
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });
      
      // @ts-ignore
      const exists = await processor.checkExists('test-signature');
      
      expect(exists).toBe(false);
    });

    it('should handle database errors', async () => {
      (db.query as jest.Mock).mockRejectedValue(new Error('DB connection failed'));
      
      // @ts-ignore
      await expect(processor.checkExists('test-signature')).rejects.toThrow('DB connection failed');
    });
  });
  
  describe('extractMintData', () => {
    it('should extract token ID and owner from mint transaction', () => {
      const transaction = {
        meta: {
          postTokenBalances: [{
            mint: 'mint-address-123',
            owner: 'owner-wallet-789'
          }]
        }
      };
      
      // @ts-ignore
      const data = processor.extractMintData(transaction);
      
      expect(data).not.toBeNull();
      expect(data).toHaveProperty('tokenId');
      expect(data).toHaveProperty('owner');
      expect(data!.tokenId).toBe('mint-address-123');
      expect(data!.owner).toBe('owner-wallet-789');
    });

    it('should handle missing token balances', () => {
      const transaction = {
        meta: {}
      };
      
      // @ts-ignore
      const data = processor.extractMintData(transaction);
      
      expect(data).not.toBeNull();
      if (data) {
        expect(data.tokenId).toBeUndefined();
        expect(data.owner).toBeUndefined();
      }
    });
  });

  describe('extractTransferData', () => {
    it('should extract source, destination, and token from transfer', () => {
      const transaction = {
        meta: {
          preTokenBalances: [{
            owner: 'source-wallet'
          }],
          postTokenBalances: [{
            mint: 'token-mint',
            owner: 'dest-wallet'
          }]
        }
      };
      
      // @ts-ignore
      const data = processor.extractTransferData(transaction);
      
      expect(data).toHaveProperty('tokenId');
      expect(data).toHaveProperty('previousOwner');
      expect(data).toHaveProperty('newOwner');
      expect(data!.tokenId).toBe('token-mint');
      expect(data!.previousOwner).toBe('source-wallet');
      expect(data!.newOwner).toBe('dest-wallet');
    });
  });

  describe('extractBurnData', () => {
    it('should extract token ID from burn transaction', () => {
      const transaction = {
        meta: {
          preTokenBalances: [{
            mint: 'token-mint'
          }]
        }
      };
      
      // @ts-ignore
      const data = processor.extractBurnData(transaction);
      
      expect(data).toHaveProperty('tokenId');
      expect(data!.tokenId).toBe('token-mint');
    });
  });
  
  describe('processTransaction', () => {
    const mockSignatureInfo = {
      signature: 'test-signature-123',
      slot: 12345,
      blockTime: 1234567890,
      err: null,
      memo: null,
      confirmationStatus: 'confirmed' as const
    };

    it('should skip already processed transactions', async () => {
      (db.query as jest.Mock).mockResolvedValue({ 
        rows: [{ signature: 'test-signature-123' }] 
      });
      
      await processor.processTransaction(mockSignatureInfo);
      
      expect(mockConnection.getParsedTransaction).not.toHaveBeenCalled();
    });
    
    it('should process new MINT transaction', async () => {
      // Mock checkExists to return false (not processed)
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // checkExists
        .mockResolvedValueOnce({ rows: [] }) // update tickets
        .mockResolvedValueOnce({ rows: [] }); // recordTransaction
      
      const mockTx = {
        slot: 12345,
        blockTime: 1234567890,
        transaction: { 
          message: { 
            accountKeys: [{ pubkey: { toString: () => 'mint-addr' } }],
            instructions: [{ programId: { toString: () => 'program-id' }, accounts: [], data: '' }]
          } 
        },
        meta: {
          logMessages: ['Program log: Instruction: MintNft'],
          postTokenBalances: [{ mint: 'token-id', owner: 'owner-addr' }],
          err: null,
          fee: 5000
        }
      };
      
      mockConnection.getParsedTransaction.mockResolvedValue(mockTx as any);
      (BlockchainTransaction.create as jest.Mock).mockResolvedValue({});
      (WalletActivity.create as jest.Mock).mockResolvedValue({});
      
      await processor.processTransaction(mockSignatureInfo);
      
      expect(mockConnection.getParsedTransaction).toHaveBeenCalledWith(
        'test-signature-123',
        expect.objectContaining({ maxSupportedTransactionVersion: 0 })
      );
      expect(BlockchainTransaction.create).toHaveBeenCalled();
    });

    it('should process TRANSFER transaction', async () => {
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // checkExists
        .mockResolvedValueOnce({ rows: [] }) // update tickets
        .mockResolvedValueOnce({ rows: [] }) // insert ticket_transfers
        .mockResolvedValueOnce({ rows: [] }); // recordTransaction
      
      const mockTx = {
        slot: 12345,
        blockTime: 1234567890,
        transaction: { 
          message: { 
            accountKeys: [{ pubkey: { toString: () => 'token-addr' } }],
            instructions: [{ programId: { toString: () => 'program-id' }, accounts: [], data: '' }]
          } 
        },
        meta: {
          logMessages: ['Program log: Instruction: Transfer'],
          preTokenBalances: [{ owner: 'from-addr' }],
          postTokenBalances: [{ mint: 'token-id', owner: 'to-addr' }],
          err: null,
          fee: 5000
        }
      };
      
      mockConnection.getParsedTransaction.mockResolvedValue(mockTx as any);
      (BlockchainTransaction.create as jest.Mock).mockResolvedValue({});
      (WalletActivity.create as jest.Mock).mockResolvedValue({});
      
      await processor.processTransaction(mockSignatureInfo);
      
      expect(WalletActivity.create).toHaveBeenCalled();
    });

    it('should process BURN transaction', async () => {
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // checkExists
        .mockResolvedValueOnce({ rows: [] }) // update tickets
        .mockResolvedValueOnce({ rows: [] }); // recordTransaction
      
      const mockTx = {
        slot: 12345,
        blockTime: 1234567890,
        transaction: { 
          message: { 
            accountKeys: [{ pubkey: { toString: () => 'token-addr' } }],
            instructions: [{ programId: { toString: () => 'program-id' }, accounts: [], data: '' }]
          } 
        },
        meta: {
          logMessages: ['Program log: Instruction: Burn'],
          preTokenBalances: [{ mint: 'token-id', owner: 'owner-addr' }],
          err: null,
          fee: 5000
        }
      };
      
      mockConnection.getParsedTransaction.mockResolvedValue(mockTx as any);
      (BlockchainTransaction.create as jest.Mock).mockResolvedValue({});
      (WalletActivity.create as jest.Mock).mockResolvedValue({});
      
      await processor.processTransaction(mockSignatureInfo);
      
      expect(WalletActivity.create).toHaveBeenCalled();
    });

    it('should handle failed transactions', async () => {
      (db.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // checkExists
        .mockResolvedValueOnce({ rows: [] }); // recordTransaction
      
      const mockTx = {
        slot: 12345,
        blockTime: 1234567890,
        transaction: { 
          message: { 
            accountKeys: [{ pubkey: { toString: () => 'addr' } }],
            instructions: [{ programId: { toString: () => 'program-id' }, accounts: [], data: '' }]
          }
        },
        meta: {
          logMessages: [],
          err: { InstructionError: [0, 'Custom'] },
          fee: 5000
        }
      };
      
      mockConnection.getParsedTransaction.mockResolvedValue(mockTx as any);
      (BlockchainTransaction.create as jest.Mock).mockResolvedValue({});
      
      await processor.processTransaction(mockSignatureInfo);
      
      const createCall = (BlockchainTransaction.create as jest.Mock).mock.calls[0][0];
      expect(createCall.status).toBe('failed');
      expect(createCall.errorMessage).toBeDefined();
    });

    it('should handle MongoDB duplicate key errors gracefully', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
      
      const mockTx = {
        slot: 12345,
        blockTime: 1234567890,
        transaction: { message: { accountKeys: [] } },
        meta: {
          logMessages: [],
          err: null,
          fee: 5000
        }
      };
      
      mockConnection.getParsedTransaction.mockResolvedValue(mockTx as any);
      
      const duplicateError: any = new Error('Duplicate key');
      duplicateError.code = 11000;
      (BlockchainTransaction.create as jest.Mock).mockRejectedValue(duplicateError);
      
      // Should not throw
      await expect(processor.processTransaction(mockSignatureInfo)).resolves.not.toThrow();
    });

    it('should handle RPC errors', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
      
      mockConnection.getParsedTransaction.mockRejectedValue(
        new Error('RPC request failed')
      );
      
      await expect(processor.processTransaction(mockSignatureInfo)).rejects.toThrow('RPC request failed');
    });
  });

  describe('saveToMongoDB', () => {
    it('should save transaction to MongoDB with correct structure', async () => {
      const mockTx = {
        slot: 12345,
        blockTime: 1234567890,
        transaction: { 
          message: { 
            accountKeys: [{ pubkey: { toString: () => 'key1' }, signer: false, writable: true }],
            instructions: [{ programId: { toString: () => 'prog1' }, accounts: [], data: '' }]
          }
        },
        meta: {
          logMessages: ['log1', 'log2'],
          err: null,
          fee: 5000
        }
      };
      
      (BlockchainTransaction.create as jest.Mock).mockResolvedValue({});
      
      // @ts-ignore
      await processor.saveToMongoDB(mockTx, 'signature-123', 12345, 1234567890);
      
      expect(BlockchainTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          signature: 'signature-123',
          slot: 12345,
          blockTime: 1234567890,
          logs: expect.arrayContaining(['log1', 'log2']),
          fee: 5000,
          status: 'success'
        })
      );
    });
  });

  describe('recordTransaction', () => {
    it('should insert transaction record into PostgreSQL', async () => {
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });
      
      // @ts-ignore
      await processor.recordTransaction('signature-123', 12345, 1234567890, 'MINT_NFT');
      
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO indexed_transactions'),
        ['signature-123', 12345, 1234567890, 'MINT_NFT']
      );
    });
  });
});
