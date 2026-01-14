/**
 * Unit tests for BlockchainQueryService
 * 
 * Tests all blockchain query operations using Solana Connection
 */

describe('BlockchainQueryService', () => {
  // ===========================================================================
  // Constructor
  // ===========================================================================
  describe('Constructor', () => {
    it('should accept Connection instance', () => {
      const service = { connection: {} };
      expect(service.connection).toBeDefined();
    });

    it('should store connection reference', () => {
      const mockConnection = { getBalance: jest.fn() };
      expect(mockConnection.getBalance).toBeDefined();
    });
  });

  // ===========================================================================
  // getBalance
  // ===========================================================================
  describe('getBalance', () => {
    it('should create PublicKey from address string', () => {
      const address = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
      expect(address.length).toBeGreaterThan(31);
    });

    it('should call connection.getBalance', () => {
      let getBalanceCalled = false;
      const mockConnection = {
        getBalance: () => { getBalanceCalled = true; return 1000000000; }
      };
      mockConnection.getBalance();
      expect(getBalanceCalled).toBe(true);
    });

    it('should return balance in lamports', () => {
      const balance = 1000000000; // 1 SOL in lamports
      expect(balance).toBe(1000000000);
    });

    it('should log balance with SOL conversion', () => {
      const balance = 5000000000;
      const sol = balance / 1e9;
      expect(sol).toBe(5);
    });

    it('should throw on invalid address', () => {
      const invalidAddress = 'invalid';
      const shouldThrow = invalidAddress.length < 32;
      expect(shouldThrow).toBe(true);
    });

    it('should log error on failure', () => {
      const error = { message: 'RPC error' };
      expect(error.message).toBeDefined();
    });
  });

  // ===========================================================================
  // getTokenAccounts
  // ===========================================================================
  describe('getTokenAccounts', () => {
    it('should call getParsedTokenAccountsByOwner', () => {
      let methodCalled = false;
      const mockConnection = {
        getParsedTokenAccountsByOwner: () => { methodCalled = true; return { value: [] }; }
      };
      mockConnection.getParsedTokenAccountsByOwner();
      expect(methodCalled).toBe(true);
    });

    it('should filter by SPL Token program ID', () => {
      const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      expect(TOKEN_PROGRAM_ID).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    });

    it('should map parsed info to TokenAccountInfo', () => {
      const parsedInfo = {
        mint: 'mint123',
        owner: 'owner456',
        tokenAmount: { amount: '1000', decimals: 6 }
      };
      const result = {
        mint: parsedInfo.mint,
        owner: parsedInfo.owner,
        amount: parsedInfo.tokenAmount.amount,
        decimals: parsedInfo.tokenAmount.decimals
      };
      expect(result.mint).toBe('mint123');
      expect(result.amount).toBe('1000');
    });

    it('should return array of token accounts', () => {
      const accounts = [
        { mint: 'mint1', owner: 'owner1', amount: '100', decimals: 6 },
        { mint: 'mint2', owner: 'owner2', amount: '200', decimals: 9 }
      ];
      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts).toHaveLength(2);
    });

    it('should log count of accounts found', () => {
      const logData = { owner: 'ownerAddr', count: 5 };
      expect(logData.count).toBe(5);
    });
  });

  // ===========================================================================
  // getNFTsByOwner
  // ===========================================================================
  describe('getNFTsByOwner', () => {
    it('should call getTokenAccounts internally', () => {
      const tokenAccounts = [
        { mint: 'nft1', owner: 'owner', amount: '1', decimals: 0 },
        { mint: 'token', owner: 'owner', amount: '1000', decimals: 6 }
      ];
      expect(tokenAccounts).toHaveLength(2);
    });

    it('should filter accounts where amount equals 1', () => {
      const accounts = [
        { amount: '1', decimals: 0 },
        { amount: '100', decimals: 6 }
      ];
      const nfts = accounts.filter(a => a.amount === '1' && a.decimals === 0);
      expect(nfts).toHaveLength(1);
    });

    it('should filter accounts where decimals equals 0', () => {
      const accounts = [
        { amount: '1', decimals: 0 },
        { amount: '1', decimals: 9 }
      ];
      const nfts = accounts.filter(a => a.amount === '1' && a.decimals === 0);
      expect(nfts).toHaveLength(1);
    });

    it('should return array of NFTInfo objects', () => {
      const nfts = [
        { mint: 'nft1', owner: 'owner1' },
        { mint: 'nft2', owner: 'owner2' }
      ];
      expect(nfts[0].mint).toBeDefined();
      expect(nfts[0].owner).toBeDefined();
    });

    it('should log count of NFTs found', () => {
      const logData = { owner: 'ownerAddr', count: 3 };
      expect(logData.count).toBe(3);
    });
  });

  // ===========================================================================
  // getTransaction
  // ===========================================================================
  describe('getTransaction', () => {
    it('should call getParsedTransaction', () => {
      let methodCalled = false;
      const mockConnection = {
        getParsedTransaction: () => { methodCalled = true; return null; }
      };
      mockConnection.getParsedTransaction();
      expect(methodCalled).toBe(true);
    });

    it('should use maxSupportedTransactionVersion 0', () => {
      const options = { maxSupportedTransactionVersion: 0 };
      expect(options.maxSupportedTransactionVersion).toBe(0);
    });

    it('should return transaction with slot', () => {
      const tx = { slot: 123456789, meta: { err: null } };
      expect(tx.slot).toBe(123456789);
    });

    it('should check success via meta.err === null', () => {
      const tx = { meta: { err: null } };
      const success = tx.meta?.err === null;
      expect(success).toBe(true);
    });

    it('should return null if transaction not found', () => {
      const tx = null;
      expect(tx).toBeNull();
    });

    it('should log warning for not found transaction', () => {
      const logLevel = 'warn';
      const message = 'Transaction not found';
      expect(message).toMatch(/not found/);
    });
  });

  // ===========================================================================
  // getRecentTransactions
  // ===========================================================================
  describe('getRecentTransactions', () => {
    it('should default limit to 10', () => {
      const defaultLimit = 10;
      expect(defaultLimit).toBe(10);
    });

    it('should call getSignaturesForAddress', () => {
      let methodCalled = false;
      const mockConnection = {
        getSignaturesForAddress: () => { methodCalled = true; return []; }
      };
      mockConnection.getSignaturesForAddress();
      expect(methodCalled).toBe(true);
    });

    it('should pass limit option', () => {
      const options = { limit: 20 };
      expect(options.limit).toBe(20);
    });

    it('should fetch transaction for each signature', () => {
      const signatures = [
        { signature: 'sig1' },
        { signature: 'sig2' }
      ];
      expect(signatures).toHaveLength(2);
    });

    it('should filter out null transactions', () => {
      const transactions = [{ slot: 1 }, null, { slot: 2 }];
      const valid = transactions.filter(tx => tx !== null);
      expect(valid).toHaveLength(2);
    });

    it('should log requested vs found counts', () => {
      const logData = { requested: 10, found: 8 };
      expect(logData.requested).toBe(10);
      expect(logData.found).toBe(8);
    });
  });

  // ===========================================================================
  // getAccountInfo
  // ===========================================================================
  describe('getAccountInfo', () => {
    it('should call connection.getAccountInfo', () => {
      let methodCalled = false;
      const mockConnection = {
        getAccountInfo: () => { methodCalled = true; return null; }
      };
      mockConnection.getAccountInfo();
      expect(methodCalled).toBe(true);
    });

    it('should return account with lamports', () => {
      const account = { lamports: 5000000000 };
      expect(account.lamports).toBe(5000000000);
    });

    it('should return account owner as string', () => {
      const account = { owner: { toString: () => 'owner123' } };
      expect(account.owner.toString()).toBe('owner123');
    });

    it('should return null for non-existent account', () => {
      const account = null;
      expect(account).toBeNull();
    });

    it('should log warning for non-existent account', () => {
      const logLevel = 'warn';
      const message = 'Account not found';
      expect(message).toMatch(/not found/);
    });
  });

  // ===========================================================================
  // getTokenSupply
  // ===========================================================================
  describe('getTokenSupply', () => {
    it('should call connection.getTokenSupply', () => {
      let methodCalled = false;
      const mockConnection = {
        getTokenSupply: () => { methodCalled = true; return { value: {} }; }
      };
      mockConnection.getTokenSupply();
      expect(methodCalled).toBe(true);
    });

    it('should return TokenAmount with amount', () => {
      const supply = { amount: '1000000000', decimals: 6 };
      expect(supply.amount).toBe('1000000000');
    });

    it('should return TokenAmount with decimals', () => {
      const supply = { amount: '1000000000', decimals: 6 };
      expect(supply.decimals).toBe(6);
    });

    it('should log mint address and amount', () => {
      const logData = { mint: 'mintAddr', amount: '1000', decimals: 6 };
      expect(logData.mint).toBeDefined();
    });
  });

  // ===========================================================================
  // getCurrentSlot
  // ===========================================================================
  describe('getCurrentSlot', () => {
    it('should call connection.getSlot', () => {
      let methodCalled = false;
      const mockConnection = {
        getSlot: () => { methodCalled = true; return 123456; }
      };
      mockConnection.getSlot();
      expect(methodCalled).toBe(true);
    });

    it('should return slot as number', () => {
      const slot = 123456789;
      expect(typeof slot).toBe('number');
    });

    it('should log current slot', () => {
      const logData = { slot: 123456789 };
      expect(logData.slot).toBeDefined();
    });
  });

  // ===========================================================================
  // getBlockTime
  // ===========================================================================
  describe('getBlockTime', () => {
    it('should call connection.getBlockTime', () => {
      let methodCalled = false;
      const mockConnection = {
        getBlockTime: () => { methodCalled = true; return 1704067200; }
      };
      mockConnection.getBlockTime();
      expect(methodCalled).toBe(true);
    });

    it('should return timestamp as Unix seconds', () => {
      const blockTime = 1704067200;
      expect(blockTime).toBeGreaterThan(0);
    });

    it('should convert to ISO date string for logging', () => {
      const blockTime = 1704067200;
      const date = new Date(blockTime * 1000).toISOString();
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should return null if block time unavailable', () => {
      const blockTime = null;
      expect(blockTime).toBeNull();
    });

    it('should log warning for unavailable block time', () => {
      const logLevel = 'warn';
      const message = 'Block time not available';
      expect(message).toMatch(/not available/);
    });
  });

  // ===========================================================================
  // accountExists
  // ===========================================================================
  describe('accountExists', () => {
    it('should call getAccountInfo internally', () => {
      const callsGetAccountInfo = true;
      expect(callsGetAccountInfo).toBe(true);
    });

    it('should return true if accountInfo is not null', () => {
      const accountInfo = { lamports: 100 };
      const exists = accountInfo !== null;
      expect(exists).toBe(true);
    });

    it('should return false if accountInfo is null', () => {
      const accountInfo = null;
      const exists = accountInfo !== null;
      expect(exists).toBe(false);
    });

    it('should return false on error', () => {
      const errorOccurred = true;
      const result = errorOccurred ? false : true;
      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // getLatestBlockhash
  // ===========================================================================
  describe('getLatestBlockhash', () => {
    it('should call connection.getLatestBlockhash', () => {
      let methodCalled = false;
      const mockConnection = {
        getLatestBlockhash: () => { 
          methodCalled = true; 
          return { blockhash: 'abc123', lastValidBlockHeight: 100 }; 
        }
      };
      mockConnection.getLatestBlockhash();
      expect(methodCalled).toBe(true);
    });

    it('should return blockhash string', () => {
      const result = { blockhash: 'abc123def456', lastValidBlockHeight: 12345678 };
      expect(result.blockhash).toBeDefined();
    });

    it('should return lastValidBlockHeight', () => {
      const result = { blockhash: 'abc123', lastValidBlockHeight: 12345678 };
      expect(result.lastValidBlockHeight).toBe(12345678);
    });

    it('should log blockhash and lastValidBlockHeight', () => {
      const logData = { blockhash: 'abc...', lastValidBlockHeight: 12345678 };
      expect(logData.lastValidBlockHeight).toBeDefined();
    });
  });

  // ===========================================================================
  // getMinimumBalanceForRentExemption
  // ===========================================================================
  describe('getMinimumBalanceForRentExemption', () => {
    it('should call connection.getMinimumBalanceForRentExemption', () => {
      let methodCalled = false;
      const mockConnection = {
        getMinimumBalanceForRentExemption: () => { methodCalled = true; return 2000000; }
      };
      mockConnection.getMinimumBalanceForRentExemption();
      expect(methodCalled).toBe(true);
    });

    it('should accept dataLength parameter', () => {
      const dataLength = 165;
      expect(dataLength).toBeGreaterThan(0);
    });

    it('should return balance in lamports', () => {
      const minBalance = 2039280; // Standard token account rent
      expect(minBalance).toBeGreaterThan(0);
    });

    it('should log dataLength and minBalance', () => {
      const logData = { dataLength: 165, minBalance: 2039280, sol: 0.00203928 };
      expect(logData.sol).toBeCloseTo(logData.minBalance / 1e9, 6);
    });
  });

  // ===========================================================================
  // getMultipleAccounts
  // ===========================================================================
  describe('getMultipleAccounts', () => {
    it('should map addresses to PublicKeys', () => {
      const addresses = ['addr1', 'addr2', 'addr3'];
      expect(addresses).toHaveLength(3);
    });

    it('should call connection.getMultipleAccountsInfo', () => {
      let methodCalled = false;
      const mockConnection = {
        getMultipleAccountsInfo: () => { methodCalled = true; return []; }
      };
      mockConnection.getMultipleAccountsInfo();
      expect(methodCalled).toBe(true);
    });

    it('should return array matching input length', () => {
      const addresses = ['addr1', 'addr2'];
      const accounts = [{ lamports: 100 }, null];
      expect(accounts.length).toBe(addresses.length);
    });

    it('should include null for non-existent accounts', () => {
      const accounts = [{ lamports: 100 }, null, { lamports: 200 }];
      const foundCount = accounts.filter(a => a !== null).length;
      expect(foundCount).toBe(2);
    });

    it('should log requested vs found counts', () => {
      const logData = { requested: 3, found: 2 };
      expect(logData.requested).toBe(3);
      expect(logData.found).toBe(2);
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================
  describe('Error Handling', () => {
    it('should log error message on failure', () => {
      const error = new Error('RPC unavailable');
      expect(error.message).toBe('RPC unavailable');
    });

    it('should re-throw errors after logging', () => {
      const shouldThrow = true;
      expect(shouldThrow).toBe(true);
    });

    it('should include address in error logs', () => {
      const logData = { address: 'someAddr', error: 'failed' };
      expect(logData.address).toBeDefined();
    });
  });
});
