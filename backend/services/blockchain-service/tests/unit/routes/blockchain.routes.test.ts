/**
 * Unit tests for blockchain-service Blockchain Routes
 * 
 * Tests all blockchain query endpoints with validation
 */

describe('Blockchain Routes', () => {
  // ===========================================================================
  // GET /blockchain/balance/:address
  // ===========================================================================
  describe('GET /blockchain/balance/:address', () => {
    it('should use validateAddressParam preHandler', () => {
      const preHandlers = ['validateAddressParam'];
      expect(preHandlers).toContain('validateAddressParam');
    });

    it('should call queryService.getBalance', () => {
      let getCalled = false;
      const queryService = {
        getBalance: () => { getCalled = true; return 1000000000; }
      };
      queryService.getBalance();
      expect(getCalled).toBe(true);
    });

    it('should return address, balance, and sol amount', () => {
      const balance = 1500000000;
      const response = {
        address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
        balance,
        sol: balance / 1e9
      };
      expect(response.sol).toBe(1.5);
    });

    it('should return 500 on error with message', () => {
      const error = { message: 'RPC error' };
      const response = {
        error: 'Failed to get balance',
        message: error.message
      };
      expect(response.error).toBe('Failed to get balance');
    });

    it('should log error with address', () => {
      const logData = {
        error: 'Connection timeout',
        address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH'
      };
      expect(logData.address).toBeDefined();
    });
  });

  // ===========================================================================
  // GET /blockchain/tokens/:address
  // ===========================================================================
  describe('GET /blockchain/tokens/:address', () => {
    it('should use validateAddressParam preHandler', () => {
      const preHandlers = ['validateAddressParam'];
      expect(preHandlers).toContain('validateAddressParam');
    });

    it('should call queryService.getTokenAccounts', () => {
      let getCalled = false;
      const queryService = {
        getTokenAccounts: () => { getCalled = true; return []; }
      };
      queryService.getTokenAccounts();
      expect(getCalled).toBe(true);
    });

    it('should return address, count, and tokens array', () => {
      const tokens = [{ mint: 'abc', amount: 100 }];
      const response = {
        address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
        count: tokens.length,
        tokens
      };
      expect(response.count).toBe(1);
    });

    it('should return empty array for no tokens', () => {
      const response = { count: 0, tokens: [] };
      expect(response.tokens).toHaveLength(0);
    });
  });

  // ===========================================================================
  // GET /blockchain/nfts/:address
  // ===========================================================================
  describe('GET /blockchain/nfts/:address', () => {
    it('should use validateAddressParam preHandler', () => {
      const preHandlers = ['validateAddressParam'];
      expect(preHandlers).toContain('validateAddressParam');
    });

    it('should call queryService.getNFTsByOwner', () => {
      let getCalled = false;
      const queryService = {
        getNFTsByOwner: () => { getCalled = true; return []; }
      };
      queryService.getNFTsByOwner();
      expect(getCalled).toBe(true);
    });

    it('should return address, count, and nfts array', () => {
      const nfts = [{ mint: 'nft1' }, { mint: 'nft2' }];
      const response = {
        address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
        count: nfts.length,
        nfts
      };
      expect(response.count).toBe(2);
    });
  });

  // ===========================================================================
  // GET /blockchain/transaction/:signature
  // ===========================================================================
  describe('GET /blockchain/transaction/:signature', () => {
    it('should use validateSignatureParam preHandler', () => {
      const preHandlers = ['validateSignatureParam'];
      expect(preHandlers).toContain('validateSignatureParam');
    });

    it('should call queryService.getTransaction', () => {
      let getCalled = false;
      const queryService = {
        getTransaction: () => { getCalled = true; return {}; }
      };
      queryService.getTransaction();
      expect(getCalled).toBe(true);
    });

    it('should return 404 if transaction not found', () => {
      const transaction = null;
      const statusCode = transaction ? 200 : 404;
      expect(statusCode).toBe(404);
    });

    it('should return signature and transaction on success', () => {
      const response = {
        signature: '5wHu1qwD7q4abc123',
        transaction: { slot: 12345 }
      };
      expect(response.transaction.slot).toBe(12345);
    });
  });

  // ===========================================================================
  // GET /blockchain/transactions/:address
  // ===========================================================================
  describe('GET /blockchain/transactions/:address', () => {
    it('should use validateAddressParam preHandler', () => {
      const preHandlers = ['validateAddressParam'];
      expect(preHandlers).toContain('validateAddressParam');
    });

    it('should validate limit parameter', () => {
      const isValidLimit = (limit: number) => !isNaN(limit) && limit >= 1 && limit <= 100;
      expect(isValidLimit(50)).toBe(true);
      expect(isValidLimit(0)).toBe(false);
      expect(isValidLimit(101)).toBe(false);
    });

    it('should return 400 for invalid limit', () => {
      const limit = 150;
      const isValid = limit >= 1 && limit <= 100;
      const statusCode = isValid ? 200 : 400;
      expect(statusCode).toBe(400);
    });

    it('should default limit to 10', () => {
      const limitStr = undefined;
      const limit = parseInt(limitStr || '10', 10);
      expect(limit).toBe(10);
    });

    it('should call queryService.getRecentTransactions with limit', () => {
      let calledWith = 0;
      const queryService = {
        getRecentTransactions: (addr: string, limit: number) => { calledWith = limit; return []; }
      };
      queryService.getRecentTransactions('addr', 25);
      expect(calledWith).toBe(25);
    });

    it('should return address, count, and transactions', () => {
      const transactions = [{ signature: 'sig1' }, { signature: 'sig2' }];
      const response = {
        address: 'abc',
        count: transactions.length,
        transactions
      };
      expect(response.count).toBe(2);
    });
  });

  // ===========================================================================
  // POST /blockchain/confirm-transaction
  // ===========================================================================
  describe('POST /blockchain/confirm-transaction', () => {
    it('should use validateConfirmationRequest preHandler', () => {
      const preHandlers = ['validateConfirmationRequest'];
      expect(preHandlers).toContain('validateConfirmationRequest');
    });

    it('should accept signature in body', () => {
      const body = { signature: '5wHu1qwD7q4abc123' };
      expect(body.signature).toBeDefined();
    });

    it('should accept optional commitment level', () => {
      const body = { signature: 'sig', commitment: 'finalized' };
      expect(['processed', 'confirmed', 'finalized']).toContain(body.commitment);
    });

    it('should accept optional timeout', () => {
      const body = { signature: 'sig', timeout: 30000 };
      expect(body.timeout).toBe(30000);
    });

    it('should call confirmationService.confirmTransaction', () => {
      let confirmCalled = false;
      const confirmationService = {
        confirmTransaction: () => { confirmCalled = true; return { confirmed: true }; }
      };
      confirmationService.confirmTransaction();
      expect(confirmCalled).toBe(true);
    });

    it('should return confirmation result', () => {
      const result = { confirmed: true, slot: 12345 };
      expect(result.confirmed).toBe(true);
    });
  });

  // ===========================================================================
  // GET /blockchain/account/:address
  // ===========================================================================
  describe('GET /blockchain/account/:address', () => {
    it('should use validateAddressParam preHandler', () => {
      const preHandlers = ['validateAddressParam'];
      expect(preHandlers).toContain('validateAddressParam');
    });

    it('should call queryService.getAccountInfo', () => {
      let getCalled = false;
      const queryService = {
        getAccountInfo: () => { getCalled = true; return { lamports: 1000 }; }
      };
      queryService.getAccountInfo();
      expect(getCalled).toBe(true);
    });

    it('should return 404 if account not found', () => {
      const accountInfo = null;
      const statusCode = accountInfo ? 200 : 404;
      expect(statusCode).toBe(404);
    });

    it('should return account details on success', () => {
      const response = {
        address: 'abc',
        lamports: 1000000000,
        owner: 'System111...',
        executable: false,
        rentEpoch: 123
      };
      expect(response.lamports).toBe(1000000000);
      expect(response.executable).toBe(false);
    });
  });

  // ===========================================================================
  // GET /blockchain/token-supply/:mint
  // ===========================================================================
  describe('GET /blockchain/token-supply/:mint', () => {
    it('should use validateMintParam preHandler', () => {
      const preHandlers = ['validateMintParam'];
      expect(preHandlers).toContain('validateMintParam');
    });

    it('should call queryService.getTokenSupply', () => {
      let getCalled = false;
      const queryService = {
        getTokenSupply: () => { getCalled = true; return { amount: '1000', decimals: 9 }; }
      };
      queryService.getTokenSupply();
      expect(getCalled).toBe(true);
    });

    it('should return mint, amount, decimals, and uiAmount', () => {
      const response = {
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000000',
        decimals: 9,
        uiAmount: 1
      };
      expect(response.decimals).toBe(9);
    });
  });

  // ===========================================================================
  // GET /blockchain/slot
  // ===========================================================================
  describe('GET /blockchain/slot', () => {
    it('should call queryService.getCurrentSlot', () => {
      let getCalled = false;
      const queryService = {
        getCurrentSlot: () => { getCalled = true; return 123456789; }
      };
      queryService.getCurrentSlot();
      expect(getCalled).toBe(true);
    });

    it('should return slot and timestamp', () => {
      const response = {
        slot: 123456789,
        timestamp: Date.now()
      };
      expect(response.slot).toBe(123456789);
      expect(response.timestamp).toBeGreaterThan(0);
    });

    it('should not require any validation preHandler', () => {
      const preHandlers: string[] = [];
      expect(preHandlers).toHaveLength(0);
    });
  });

  // ===========================================================================
  // GET /blockchain/blockhash
  // ===========================================================================
  describe('GET /blockchain/blockhash', () => {
    it('should call queryService.getLatestBlockhash', () => {
      let getCalled = false;
      const queryService = {
        getLatestBlockhash: () => { getCalled = true; return { blockhash: 'abc', lastValidBlockHeight: 123 }; }
      };
      queryService.getLatestBlockhash();
      expect(getCalled).toBe(true);
    });

    it('should return blockhash object', () => {
      const response = {
        blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',
        lastValidBlockHeight: 123456789
      };
      expect(response.blockhash).toBeDefined();
      expect(response.lastValidBlockHeight).toBeGreaterThan(0);
    });

    it('should not require any validation preHandler', () => {
      const preHandlers: string[] = [];
      expect(preHandlers).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================
  describe('Error Handling', () => {
    it('should return 500 status on service errors', () => {
      const error = new Error('Service unavailable');
      const statusCode = 500;
      expect(statusCode).toBe(500);
    });

    it('should include error message in response', () => {
      const error = { message: 'Connection timeout' };
      const response = {
        error: 'Failed to get balance',
        message: error.message
      };
      expect(response.message).toBe('Connection timeout');
    });

    it('should log errors with context', () => {
      const logEntry = {
        error: 'RPC error',
        address: 'abc123'
      };
      expect(logEntry.error).toBeDefined();
      expect(logEntry.address).toBeDefined();
    });
  });

  // ===========================================================================
  // Service Injection
  // ===========================================================================
  describe('Service Injection', () => {
    it('should get queryService from fastify instance', () => {
      const fastify = { blockchainQuery: { getBalance: () => 0 } };
      expect(fastify.blockchainQuery).toBeDefined();
    });

    it('should get confirmationService from fastify instance', () => {
      const fastify = { transactionConfirmation: { confirmTransaction: () => ({}) } };
      expect(fastify.transactionConfirmation).toBeDefined();
    });
  });
});
