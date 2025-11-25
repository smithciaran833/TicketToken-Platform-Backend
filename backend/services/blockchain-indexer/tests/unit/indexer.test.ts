import BlockchainIndexer from '../../src/indexer';
import { Connection } from '@solana/web3.js';
import db from '../../src/utils/database';

// Don't mock @solana/web3.js here - it's mocked globally in setup.ts
jest.mock('../../src/utils/database');
jest.mock('../../src/processors/transactionProcessor');

describe('BlockchainIndexer', () => {
  let indexer: BlockchainIndexer;

  const mockConfig = {
    solana: {
      rpcUrl: 'https://api.devnet.solana.com',
      wsUrl: 'wss://api.devnet.solana.com',
      commitment: 'confirmed' as const,
      programId: 'test-program-id-123'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    indexer = new BlockchainIndexer(mockConfig as any);
  });

  describe('initialize', () => {
    it('should load last processed slot from database', async () => {
      (db.query as jest.Mock).mockResolvedValue({
        rows: [{
          last_processed_slot: 1000,
          last_processed_signature: 'test-signature'
        }]
      });

      // Use the mocked connection from constructor
      const mockConnection = (indexer as any).connection;
      mockConnection.getSlot.mockResolvedValue(2000);

      const result = await indexer.initialize();

      expect(result).toBe(true);
      expect((indexer as any).lastProcessedSlot).toBe(1000);
      expect((indexer as any).currentSlot).toBe(2000);
      expect((indexer as any).syncStats.lag).toBe(1000);
    });

    it('should start from slot 0 if no previous state exists', async () => {
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Use the mocked connection from constructor
      const mockConnection = (indexer as any).connection;
      mockConnection.getSlot.mockResolvedValue(5000);

      const result = await indexer.initialize();

      expect(result).toBe(true);
      expect((indexer as any).lastProcessedSlot).toBe(0);
      expect((indexer as any).currentSlot).toBe(5000);
    });

    it('should handle database query errors', async () => {
      (db.query as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

      const result = await indexer.initialize();

      expect(result).toBe(false);
    });

    it('should handle RPC connection errors', async () => {
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Use the mocked connection from constructor
      const mockConnection = (indexer as any).connection;
      mockConnection.getSlot.mockRejectedValue(new Error('RPC connection failed'));

      const result = await indexer.initialize();

      expect(result).toBe(false);
    });
  });

  describe('start', () => {
    it('should update database and set running state', async () => {
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      await indexer.start();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE indexer_state'),
        undefined
      );
      expect((indexer as any).isRunning).toBe(true);
    });
  });

  describe('stop', () => {
    it('should update database and set running to false', async () => {
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });
      (indexer as any).isRunning = true;

      await indexer.stop();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE indexer_state'),
        undefined
      );
      expect((indexer as any).isRunning).toBe(false);
    });

    it('should unsubscribe from WebSocket', async () => {
      const mockRemove = jest.fn().mockResolvedValue(undefined);
      (indexer as any).subscription = 123;
      (indexer as any).connection = {
        removeAccountChangeListener: mockRemove
      };
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      await indexer.stop();

      expect(mockRemove).toHaveBeenCalledWith(123);
    });

    it('should handle missing subscription gracefully', async () => {
      (indexer as any).subscription = undefined;
      (db.query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(indexer.stop()).resolves.toBeUndefined();
    });
  });
});
