// Test signature verification (pure unit tests)
// Full flows require integration tests with DB

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

const mockJwtService = {
  generateTokenPair: jest.fn(),
};

const mockAuditService = {
  logSessionCreated: jest.fn(),
};

jest.mock('../../../src/config/redis', () => ({ getRedis: () => mockRedis }));
jest.mock('../../../src/config/database', () => ({ pool: mockPool }));
jest.mock('../../../src/utils/logger', () => ({ logger: mockLogger }));
jest.mock('../../../src/services/jwt.service', () => ({
  JWTService: jest.fn().mockImplementation(() => mockJwtService),
}));
jest.mock('../../../src/services/audit.service', () => ({
  auditService: mockAuditService,
}));

// Mock crypto libs
jest.mock('@solana/web3.js', () => ({
  PublicKey: jest.fn().mockImplementation((key) => ({
    toBytes: () => Buffer.from(key),
  })),
}));

const mockNaclVerify = jest.fn();
jest.mock('tweetnacl', () => ({
  sign: {
    detached: {
      verify: mockNaclVerify,
    },
  },
}));

jest.mock('bs58', () => ({
  decode: jest.fn().mockReturnValue(Buffer.from('signature')),
}));

const mockVerifyMessage = jest.fn();
jest.mock('ethers', () => ({
  ethers: {
    verifyMessage: mockVerifyMessage,
  },
}));

import { WalletService } from '../../../src/services/wallet.service';

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WalletService();
  });

  describe('generateNonce', () => {
    it('generates random 32-byte hex nonce', async () => {
      const result = await service.generateNonce('publicKey123', 'solana', 'tenant-1');

      expect(result.nonce).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(result.nonce).toMatch(/^[a-f0-9]+$/);
    });

    it('returns message with nonce and timestamp', async () => {
      const result = await service.generateNonce('publicKey123', 'solana');

      expect(result.message).toContain('Sign this message');
      expect(result.message).toContain('Nonce:');
      expect(result.message).toContain('Timestamp:');
    });

    it('stores nonce in Redis with 15 min TTL', async () => {
      await service.generateNonce('publicKey123', 'solana', 'tenant-1');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('wallet-nonce'),
        900, // 15 minutes
        expect.any(String)
      );
    });

    it('stores publicKey and chain in nonce data', async () => {
      await service.generateNonce('myPublicKey', 'ethereum', 'tenant-1');

      const storedData = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(storedData.publicKey).toBe('myPublicKey');
      expect(storedData.chain).toBe('ethereum');
    });

    it('includes expiration time in stored data', async () => {
      await service.generateNonce('publicKey123', 'solana');

      const storedData = JSON.parse(mockRedis.setex.mock.calls[0][2]);
      expect(storedData.expiresAt).toBeDefined();
      expect(storedData.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('verifySolanaSignature', () => {
    it('returns true for valid signature', async () => {
      mockNaclVerify.mockReturnValue(true);

      const result = await service.verifySolanaSignature(
        'publicKey',
        'signature',
        'message'
      );

      expect(result).toBe(true);
    });

    it('returns false for invalid signature', async () => {
      mockNaclVerify.mockReturnValue(false);

      const result = await service.verifySolanaSignature(
        'publicKey',
        'signature',
        'message'
      );

      expect(result).toBe(false);
    });

    it('returns false and logs on error', async () => {
      mockNaclVerify.mockImplementation(() => {
        throw new Error('Invalid key');
      });

      const result = await service.verifySolanaSignature(
        'badKey',
        'signature',
        'message'
      );

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('verifyEthereumSignature', () => {
    it('returns true for valid signature (case-insensitive)', async () => {
      mockVerifyMessage.mockReturnValue('0xABCDEF1234567890');

      const result = await service.verifyEthereumSignature(
        '0xabcdef1234567890', // lowercase
        'signature',
        'message'
      );

      expect(result).toBe(true);
    });

    it('returns false for mismatched address', async () => {
      mockVerifyMessage.mockReturnValue('0xDIFFERENT');

      const result = await service.verifyEthereumSignature(
        '0xABCDEF',
        'signature',
        'message'
      );

      expect(result).toBe(false);
    });

    it('returns false and logs on error', async () => {
      mockVerifyMessage.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const result = await service.verifyEthereumSignature(
        '0xaddress',
        'badSig',
        'message'
      );

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
