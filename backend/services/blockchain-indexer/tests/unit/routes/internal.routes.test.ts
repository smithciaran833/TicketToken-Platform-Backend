// @ts-nocheck
/**
 * Internal Routes Unit Tests - blockchain-indexer
 *
 * Tests for the internal routes endpoints:
 * - POST /internal/marketplace/sales
 * - GET /internal/nfts/:tokenId
 * - GET /internal/transactions/:txHash
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Mock environment
process.env.INTERNAL_HMAC_SECRET = 'test-secret-key-must-be-32-chars-long';
process.env.USE_NEW_HMAC = 'false'; // Disable HMAC for route logic tests
process.env.NODE_ENV = 'test';

// Mock the MongoDB models
jest.mock('../../../src/models/nft-metadata.model', () => ({
  NFTMetadata: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock('../../../src/models/marketplace-event.model', () => ({
  MarketplaceEvent: jest.fn().mockImplementation((data) => ({
    ...data,
    _id: 'mock-sale-id',
    save: jest.fn().mockResolvedValue({ _id: 'mock-sale-id', ...data }),
  })),
}));

jest.mock('../../../src/models/blockchain-transaction.model', () => ({
  BlockchainTransaction: {
    findOne: jest.fn(),
  },
}));

// Mock logger
const mockChildLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => mockChildLogger),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import internalRoutes from '../../../src/routes/internal.routes';
import { NFTMetadata } from '../../../src/models/nft-metadata.model';
import { MarketplaceEvent } from '../../../src/models/marketplace-event.model';
import { BlockchainTransaction } from '../../../src/models/blockchain-transaction.model';

describe('Internal Routes - blockchain-indexer', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(internalRoutes, { prefix: '/internal' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // POST /internal/marketplace/sales
  // =========================================================================

  describe('POST /internal/marketplace/sales', () => {
    const validSalePayload = {
      signature: 'tx-signature-123',
      tokenId: 'token-abc',
      price: 1000,
      seller: 'seller-wallet',
      buyer: 'buyer-wallet',
      marketplace: 'tickettoken',
    };

    test('should record a new marketplace sale', async () => {
      (MarketplaceEvent as any).findOne = jest.fn().mockResolvedValue(null);
      (NFTMetadata.findOneAndUpdate as jest.Mock).mockResolvedValue({ assetId: 'token-abc' });

      const response = await app.inject({
        method: 'POST',
        url: '/internal/marketplace/sales',
        payload: validSalePayload,
        headers: {
          'x-internal-service': 'payment-service',
          'x-trace-id': 'trace-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.sale).toBeDefined();
      expect(body.sale.tokenId).toBe('token-abc');
    });

    test('should return existing sale if already recorded (idempotency)', async () => {
      const existingSale = {
        _id: 'existing-sale-id',
        signature: 'tx-signature-123',
        tokenId: 'token-abc',
        price: 1000,
      };
      (MarketplaceEvent as any).findOne = jest.fn().mockResolvedValue(existingSale);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/marketplace/sales',
        payload: validSalePayload,
        headers: {
          'x-internal-service': 'payment-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Sale already recorded');
    });

    test('should return 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/marketplace/sales',
        payload: { signature: 'sig' }, // Missing required fields
        headers: {
          'x-internal-service': 'payment-service',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // GET /internal/nfts/:tokenId
  // =========================================================================

  describe('GET /internal/nfts/:tokenId', () => {
    const mockNft = {
      assetId: 'token-123',
      tree: 'merkle-tree-address',
      leafIndex: 42,
      owner: 'owner-wallet',
      delegate: null,
      compressed: true,
      eventId: 'event-456',
      ticketNumber: 'TKT-001',
      mintedAt: new Date(),
      metadata: {
        name: 'Test Ticket',
        symbol: 'TKT',
        uri: 'https://example.com/metadata.json',
        sellerFeeBasisPoints: 500,
        creators: [{ address: 'creator', share: 100 }],
      },
    };

    test('should return NFT metadata for valid token', async () => {
      (NFTMetadata.findOne as jest.Mock).mockResolvedValue(mockNft);

      const response = await app.inject({
        method: 'GET',
        url: '/internal/nfts/token-123',
        headers: {
          'x-internal-service': 'ticket-service',
          'x-trace-id': 'trace-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.nft).toBeDefined();
      expect(body.nft.assetId).toBe('token-123');
      expect(body.nft.owner).toBe('owner-wallet');
      expect(body.nft.metadata.name).toBe('Test Ticket');
    });

    test('should return 404 for non-existent token', async () => {
      (NFTMetadata.findOne as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/internal/nfts/non-existent-token',
        headers: {
          'x-internal-service': 'ticket-service',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('NFT not found');
    });
  });

  // =========================================================================
  // GET /internal/transactions/:txHash
  // =========================================================================

  describe('GET /internal/transactions/:txHash', () => {
    const mockTransaction = {
      signature: 'tx-hash-789',
      slot: 12345678,
      blockTime: Date.now() / 1000,
      status: 'confirmed',
      fee: 5000,
      errorMessage: null,
      accounts: ['account1', 'account2'],
      instructions: [
        {
          programId: 'program-id',
          parsed: { type: 'transfer', info: {} },
        },
      ],
      indexedAt: new Date(),
    };

    test('should return transaction details for valid hash', async () => {
      (BlockchainTransaction.findOne as jest.Mock).mockResolvedValue(mockTransaction);

      const response = await app.inject({
        method: 'GET',
        url: '/internal/transactions/tx-hash-789',
        headers: {
          'x-internal-service': 'minting-service',
          'x-trace-id': 'trace-789',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.transaction).toBeDefined();
      expect(body.transaction.signature).toBe('tx-hash-789');
      expect(body.transaction.status).toBe('confirmed');
      expect(body.transaction.slot).toBe(12345678);
    });

    test('should return 404 for non-existent transaction', async () => {
      (BlockchainTransaction.findOne as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/internal/transactions/non-existent-tx',
        headers: {
          'x-internal-service': 'minting-service',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Transaction not found');
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      (NFTMetadata.findOne as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/internal/nfts/token-error',
        headers: {
          'x-internal-service': 'ticket-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });
  });
});
