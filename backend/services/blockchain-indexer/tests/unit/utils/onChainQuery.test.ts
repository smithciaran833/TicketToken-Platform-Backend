/**
 * Comprehensive Unit Tests for src/utils/onChainQuery.ts
 *
 * Tests on-chain query utilities for Solana blockchain
 */

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

// Mock @solana/web3.js
const mockPublicKey = jest.fn();
const mockConnection = {
  getParsedAccountInfo: jest.fn(),
  getTokenLargestAccounts: jest.fn(),
  getSignaturesForAddress: jest.fn(),
  getParsedTransaction: jest.fn(),
};

jest.mock('@solana/web3.js', () => ({
  PublicKey: mockPublicKey,
  Connection: jest.fn(() => mockConnection),
}));

// Mock @metaplex-foundation/js
const mockNfts = {
  findByMint: jest.fn(),
};

const mockMetaplex = {
  nfts: jest.fn(() => mockNfts),
};

const mockMetaplexMake = jest.fn(() => mockMetaplex);

jest.mock('@metaplex-foundation/js', () => ({
  Metaplex: {
    make: mockMetaplexMake,
  },
}));

import OnChainQuery from '../../../src/utils/onChainQuery';

describe('src/utils/onChainQuery.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPublicKey.mockImplementation((key: string) => ({ toString: () => key }));
  });

  // =============================================================================
  // CONSTRUCTOR
  // =============================================================================

  describe('Constructor', () => {
    it('should create instance with connection', () => {
      const query = new OnChainQuery(mockConnection as any);
      expect(query).toBeInstanceOf(OnChainQuery);
    });

    it('should initialize Metaplex', () => {
      new OnChainQuery(mockConnection as any);
      expect(mockMetaplexMake).toHaveBeenCalledWith(mockConnection);
    });
  });

  // =============================================================================
  // GET TOKEN STATE
  // =============================================================================

  describe('getTokenState()', () => {
    it('should return non-existent state when mint not found', async () => {
      const query = new OnChainQuery(mockConnection as any);
      mockConnection.getParsedAccountInfo.mockResolvedValue({ value: null });

      const result = await query.getTokenState('token123');

      expect(result).toEqual({
        exists: false,
        burned: true,
        owner: null,
        supply: 0,
      });
    });

    it('should return burned state when supply is 0', async () => {
      const query = new OnChainQuery(mockConnection as any);
      mockConnection.getParsedAccountInfo.mockResolvedValue({
        value: {
          data: {
            parsed: {
              info: {
                supply: '0',
              },
            },
          },
        },
      });

      const result = await query.getTokenState('token123');

      expect(result).toEqual({
        exists: true,
        burned: true,
        owner: null,
        supply: 0,
      });
    });

    it('should return burned state when no largest accounts', async () => {
      const query = new OnChainQuery(mockConnection as any);
      mockConnection.getParsedAccountInfo.mockResolvedValue({
        value: {
          data: {
            parsed: {
              info: {
                supply: '1',
              },
            },
          },
        },
      });
      mockConnection.getTokenLargestAccounts.mockResolvedValue({
        value: [],
      });

      const result = await query.getTokenState('token123');

      expect(result).toEqual({
        exists: true,
        burned: true,
        owner: null,
        supply: 1,
      });
    });

    it('should return active token state', async () => {
      const query = new OnChainQuery(mockConnection as any);
      
      // First call for mint info
      mockConnection.getParsedAccountInfo
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  supply: '1',
                },
              },
            },
          },
        })
        // Second call for token account
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  owner: 'owner123',
                  state: 'initialized',
                  tokenAmount: {
                    uiAmount: 1,
                  },
                },
              },
            },
          },
        });

      mockConnection.getTokenLargestAccounts.mockResolvedValue({
        value: [{ address: 'token-account-123' }],
      });

      const result = await query.getTokenState('token123');

      expect(result).toEqual({
        exists: true,
        burned: false,
        owner: 'owner123',
        supply: 1,
        frozen: false,
      });
    });

    it('should return frozen state', async () => {
      const query = new OnChainQuery(mockConnection as any);
      
      mockConnection.getParsedAccountInfo
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  supply: '1',
                },
              },
            },
          },
        })
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  owner: 'owner123',
                  state: 'frozen',
                  tokenAmount: {
                    uiAmount: 1,
                  },
                },
              },
            },
          },
        });

      mockConnection.getTokenLargestAccounts.mockResolvedValue({
        value: [{ address: 'token-account-123' }],
      });

      const result = await query.getTokenState('token123');

      expect(result).toEqual({
        exists: true,
        burned: true,
        owner: 'owner123',
        supply: 0,
      });
    });

    it('should return burned when token account has 0 amount', async () => {
      const query = new OnChainQuery(mockConnection as any);
      
      mockConnection.getParsedAccountInfo
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  supply: '1',
                },
              },
            },
          },
        })
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  owner: 'owner123',
                  state: 'initialized',
                  tokenAmount: {
                    uiAmount: 0,
                  },
                },
              },
            },
          },
        });

      mockConnection.getTokenLargestAccounts.mockResolvedValue({
        value: [{ address: 'token-account-123' }],
      });

      const result = await query.getTokenState('token123');

      expect(result).toEqual({
        exists: true,
        burned: true,
        owner: 'owner123',
        supply: 0,
      });
    });

    it('should handle account not found error', async () => {
      const query = new OnChainQuery(mockConnection as any);
      mockConnection.getParsedAccountInfo.mockRejectedValue(
        new Error('could not find account')
      );

      const result = await query.getTokenState('token123');

      expect(result).toEqual({
        exists: false,
        burned: true,
        owner: null,
        supply: 0,
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw other errors', async () => {
      const query = new OnChainQuery(mockConnection as any);
      mockConnection.getParsedAccountInfo.mockRejectedValue(new Error('Network error'));

      await expect(query.getTokenState('token123')).rejects.toThrow('Network error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle null token account info', async () => {
      const query = new OnChainQuery(mockConnection as any);
      
      mockConnection.getParsedAccountInfo
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  supply: '1',
                },
              },
            },
          },
        })
        .mockResolvedValueOnce({ value: null });

      mockConnection.getTokenLargestAccounts.mockResolvedValue({
        value: [{ address: 'token-account-123' }],
      });

      const result = await query.getTokenState('token123');

      expect(result).toEqual({
        exists: true,
        burned: true,
        owner: null,
        supply: 1,
      });
    });
  });

  // =============================================================================
  // GET NFT METADATA
  // =============================================================================

  describe('getNFTMetadata()', () => {
    it('should return NFT metadata', async () => {
      const query = new OnChainQuery(mockConnection as any);
      
      const mockNFT = {
        name: 'Test NFT',
        symbol: 'TEST',
        uri: 'https://example.com/metadata.json',
        sellerFeeBasisPoints: 500,
        creators: [{ address: 'creator1', verified: true, share: 100 }],
        collection: { address: 'collection1', verified: true },
        uses: null,
      };

      mockNfts.findByMint.mockResolvedValue(mockNFT);

      const result = await query.getNFTMetadata('token123');

      expect(result).toEqual({
        name: 'Test NFT',
        symbol: 'TEST',
        uri: 'https://example.com/metadata.json',
        sellerFeeBasisPoints: 500,
        creators: [{ address: 'creator1', verified: true, share: 100 }],
        collection: { address: 'collection1', verified: true },
        uses: null,
      });
      expect(mockNfts.findByMint).toHaveBeenCalledWith({
        mintAddress: expect.anything(),
      });
    });

    it('should return null on error', async () => {
      const query = new OnChainQuery(mockConnection as any);
      mockNfts.findByMint.mockRejectedValue(new Error('NFT not found'));

      const result = await query.getNFTMetadata('token123');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle metadata with minimal fields', async () => {
      const query = new OnChainQuery(mockConnection as any);
      
      const mockNFT = {
        name: 'Minimal NFT',
        symbol: 'MIN',
        uri: 'https://example.com/min.json',
        sellerFeeBasisPoints: 0,
        creators: [],
        collection: null,
        uses: null,
      };

      mockNfts.findByMint.mockResolvedValue(mockNFT);

      const result = await query.getNFTMetadata('token123');

      expect(result).toEqual(mockNFT);
    });
  });

  // =============================================================================
  // GET TRANSACTION HISTORY
  // =============================================================================

  describe('getTransactionHistory()', () => {
    it('should return transaction history', async () => {
      const query = new OnChainQuery(mockConnection as any);

      const mockSignatures = [
        {
          signature: 'sig1',
          slot: 100,
          blockTime: 1234567890,
          err: null,
        },
        {
          signature: 'sig2',
          slot: 101,
          blockTime: 1234567900,
          err: null,
        },
      ];

      const mockTx1 = {
        meta: {
          logMessages: ['Program log: MintTo'],
        },
      };

      const mockTx2 = {
        meta: {
          logMessages: ['Program log: Transfer'],
        },
      };

      mockConnection.getSignaturesForAddress.mockResolvedValue(mockSignatures);
      mockConnection.getParsedTransaction
        .mockResolvedValueOnce(mockTx1)
        .mockResolvedValueOnce(mockTx2);

      const result = await query.getTransactionHistory('token123', 10);

      expect(result).toEqual([
        {
          signature: 'sig1',
          slot: 100,
          blockTime: 1234567890,
          type: 'MINT',
          success: true,
        },
        {
          signature: 'sig2',
          slot: 101,
          blockTime: 1234567900,
          type: 'TRANSFER',
          success: true,
        },
      ]);
    });

    it('should use default limit of 10', async () => {
      const query = new OnChainQuery(mockConnection as any);
      mockConnection.getSignaturesForAddress.mockResolvedValue([]);

      await query.getTransactionHistory('token123');

      expect(mockConnection.getSignaturesForAddress).toHaveBeenCalledWith(
        expect.anything(),
        { limit: 10 },
        'confirmed'
      );
    });

    it('should handle custom limit', async () => {
      const query = new OnChainQuery(mockConnection as any);
      mockConnection.getSignaturesForAddress.mockResolvedValue([]);

      await query.getTransactionHistory('token123', 50);

      expect(mockConnection.getSignaturesForAddress).toHaveBeenCalledWith(
        expect.anything(),
        { limit: 50 },
        'confirmed'
      );
    });

    it('should handle failed transactions', async () => {
      const query = new OnChainQuery(mockConnection as any);

      const mockSignatures = [
        {
          signature: 'sig1',
          slot: 100,
          blockTime: 1234567890,
          err: { InstructionError: [0, 'Custom'] },
        },
      ];

      const mockTx = {
        meta: {
          logMessages: ['Program log: Transfer'],
        },
      };

      mockConnection.getSignaturesForAddress.mockResolvedValue(mockSignatures);
      mockConnection.getParsedTransaction.mockResolvedValue(mockTx);

      const result = await query.getTransactionHistory('token123');

      expect(result[0].success).toBe(false);
    });

    it('should handle null blockTime', async () => {
      const query = new OnChainQuery(mockConnection as any);

      const mockSignatures = [
        {
          signature: 'sig1',
          slot: 100,
          blockTime: null,
          err: null,
        },
      ];

      const mockTx = {
        meta: {
          logMessages: ['Program log: MintTo'],
        },
      };

      mockConnection.getSignaturesForAddress.mockResolvedValue(mockSignatures);
      mockConnection.getParsedTransaction.mockResolvedValue(mockTx);

      const result = await query.getTransactionHistory('token123');

      expect(result[0].blockTime).toBeNull();
    });

    it('should skip null transactions', async () => {
      const query = new OnChainQuery(mockConnection as any);

      const mockSignatures = [
        {
          signature: 'sig1',
          slot: 100,
          blockTime: 1234567890,
          err: null,
        },
        {
          signature: 'sig2',
          slot: 101,
          blockTime: 1234567900,
          err: null,
        },
      ];

      mockConnection.getSignaturesForAddress.mockResolvedValue(mockSignatures);
      mockConnection.getParsedTransaction
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          meta: {
            logMessages: ['Program log: Transfer'],
          },
        });

      const result = await query.getTransactionHistory('token123');

      expect(result).toHaveLength(1);
      expect(result[0].signature).toBe('sig2');
    });

    it('should return empty array on error', async () => {
      const query = new OnChainQuery(mockConnection as any);
      mockConnection.getSignaturesForAddress.mockRejectedValue(new Error('Network error'));

      const result = await query.getTransactionHistory('token123');

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // PARSE TRANSACTION TYPE
  // =============================================================================

  describe('parseTransactionType()', () => {
    it('should parse MINT type', () => {
      const query = new OnChainQuery(mockConnection as any);
      const tx = {
        meta: {
          logMessages: ['Program log: MintTo'],
        },
      };

      const result = query.parseTransactionType(tx);
      expect(result).toBe('MINT');
    });

    it('should parse TRANSFER type', () => {
      const query = new OnChainQuery(mockConnection as any);
      const tx = {
        meta: {
          logMessages: ['Program log: Transfer completed'],
        },
      };

      const result = query.parseTransactionType(tx);
      expect(result).toBe('TRANSFER');
    });

    it('should parse BURN type', () => {
      const query = new OnChainQuery(mockConnection as any);
      const tx = {
        meta: {
          logMessages: ['Program log: Burn'],
        },
      };

      const result = query.parseTransactionType(tx);
      expect(result).toBe('BURN');
    });

    it('should parse APPROVE type', () => {
      const query = new OnChainQuery(mockConnection as any);
      const tx = {
        meta: {
          logMessages: ['Program log: Approve'],
        },
      };

      const result = query.parseTransactionType(tx);
      expect(result).toBe('APPROVE');
    });

    it('should parse REVOKE type', () => {
      const query = new OnChainQuery(mockConnection as any);
      const tx = {
        meta: {
          logMessages: ['Program log: Revoke'],
        },
      };

      const result = query.parseTransactionType(tx);
      expect(result).toBe('REVOKE');
    });

    it('should parse FREEZE type', () => {
      const query = new OnChainQuery(mockConnection as any);
      const tx = {
        meta: {
          logMessages: ['Program log: Freeze'],
        },
      };

      const result = query.parseTransactionType(tx);
      expect(result).toBe('FREEZE');
    });

    it('should parse THAW type', () => {
      const query = new OnChainQuery(mockConnection as any);
      const tx = {
        meta: {
          logMessages: ['Program log: Thaw'],
        },
      };

      const result = query.parseTransactionType(tx);
      expect(result).toBe('THAW');
    });

    it('should return UNKNOWN for unrecognized types', () => {
      const query = new OnChainQuery(mockConnection as any);
      const tx = {
        meta: {
          logMessages: ['Program log: Something else'],
        },
      };

      const result = query.parseTransactionType(tx);
      expect(result).toBe('UNKNOWN');
    });

    it('should handle missing logs', () => {
      const query = new OnChainQuery(mockConnection as any);
      const tx = {
        meta: {},
      };

      const result = query.parseTransactionType(tx);
      expect(result).toBe('UNKNOWN');
    });

    it('should handle empty logs array', () => {
      const query = new OnChainQuery(mockConnection as any);
      const tx = {
        meta: {
          logMessages: [],
        },
      };

      const result = query.parseTransactionType(tx);
      expect(result).toBe('UNKNOWN');
    });

    it('should return first matching type', () => {
      const query = new OnChainQuery(mockConnection as any);
      const tx = {
        meta: {
          logMessages: [
            'Program log: MintTo',
            'Program log: Transfer', // Should not reach this
          ],
        },
      };

      const result = query.parseTransactionType(tx);
      expect(result).toBe('MINT');
    });
  });

  // =============================================================================
  // VERIFY OWNERSHIP
  // =============================================================================

  describe('verifyOwnership()', () => {
    it('should return valid for correct owner', async () => {
      const query = new OnChainQuery(mockConnection as any);
      
      mockConnection.getParsedAccountInfo
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  supply: '1',
                },
              },
            },
          },
        })
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  owner: 'owner123',
                  state: 'initialized',
                  tokenAmount: {
                    uiAmount: 1,
                  },
                },
              },
            },
          },
        });

      mockConnection.getTokenLargestAccounts.mockResolvedValue({
        value: [{ address: 'token-account-123' }],
      });

      const result = await query.verifyOwnership('token123', 'owner123');

      expect(result).toEqual({
        valid: true,
        reason: null,
        actualOwner: 'owner123',
      });
    });

    it('should return invalid for burned token', async () => {
      const query = new OnChainQuery(mockConnection as any);
      mockConnection.getParsedAccountInfo.mockResolvedValue({
        value: {
          data: {
            parsed: {
              info: {
                supply: '0',
              },
            },
          },
        },
      });

      const result = await query.verifyOwnership('token123', 'owner123');

      expect(result).toEqual({
        valid: false,
        reason: 'TOKEN_BURNED',
        actualOwner: null,
      });
    });

    it('should return invalid for non-existent token', async () => {
      const query = new OnChainQuery(mockConnection as any);
      mockConnection.getParsedAccountInfo.mockResolvedValue({ value: null });

      const result = await query.verifyOwnership('token123', 'owner123');

      expect(result).toEqual({
        valid: false,
        reason: 'TOKEN_NOT_FOUND',
        actualOwner: null,
      });
    });

    it('should return invalid for ownership mismatch', async () => {
      const query = new OnChainQuery(mockConnection as any);
      
      mockConnection.getParsedAccountInfo
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  supply: '1',
                },
              },
            },
          },
        })
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  owner: 'actual-owner',
                  state: 'initialized',
                  tokenAmount: {
                    uiAmount: 1,
                  },
                },
              },
            },
          },
        });

      mockConnection.getTokenLargestAccounts.mockResolvedValue({
        value: [{ address: 'token-account-123' }],
      });

      const result = await query.verifyOwnership('token123', 'expected-owner');

      expect(result).toEqual({
        valid: false,
        reason: 'OWNERSHIP_MISMATCH',
        actualOwner: 'actual-owner',
      });
    });
  });

  // =============================================================================
  // INTEGRATION TESTS
  // =============================================================================

  describe('Integration Tests', () => {
    it('should handle complete token lifecycle query', async () => {
      const query = new OnChainQuery(mockConnection as any);

      // Get token state
      mockConnection.getParsedAccountInfo
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  supply: '1',
                },
              },
            },
          },
        })
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  owner: 'owner123',
                  state: 'initialized',
                  tokenAmount: {
                    uiAmount: 1,
                  },
                },
              },
            },
          },
        });

      mockConnection.getTokenLargestAccounts.mockResolvedValue({
        value: [{ address: 'token-account-123' }],
      });

      const state = await query.getTokenState('token123');
      expect(state.exists).toBe(true);
      expect(state.burned).toBe(false);

      // Get metadata
      mockNfts.findByMint.mockResolvedValue({
        name: 'Test NFT',
        symbol: 'TEST',
        uri: 'https://example.com/metadata.json',
        sellerFeeBasisPoints: 500,
        creators: [],
        collection: null,
        uses: null,
      });

      const metadata = await query.getNFTMetadata('token123');
      expect(metadata).not.toBeNull();
      expect(metadata!.name).toBe('Test NFT');

      // Get history
      mockConnection.getSignaturesForAddress.mockResolvedValue([
        {
          signature: 'sig1',
          slot: 100,
          blockTime: 1234567890,
          err: null,
        },
      ]);

      mockConnection.getParsedTransaction.mockResolvedValue({
        meta: {
          logMessages: ['Program log: MintTo'],
        },
      });

      const history = await query.getTransactionHistory('token123');
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('MINT');

      // Verify ownership
      mockConnection.getParsedAccountInfo
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  supply: '1',
                },
              },
            },
          },
        })
        .mockResolvedValueOnce({
          value: {
            data: {
              parsed: {
                info: {
                  owner: 'owner123',
                  state: 'initialized',
                  tokenAmount: {
                    uiAmount: 1,
                  },
                },
              },
            },
          },
        });

      mockConnection.getTokenLargestAccounts.mockResolvedValue({
        value: [{ address: 'token-account-123' }],
      });

      const verification = await query.verifyOwnership('token123', 'owner123');
      expect(verification.valid).toBe(true);
    });
  });
});
