import {
  isValidSolanaAddress,
  isValidSignature,
  sanitizeString,
  validateAddressParam,
  validateSignatureParam
} from '../../src/middleware/validation';
import { Keypair } from '@solana/web3.js';

describe('Validation Middleware', () => {
  describe('isValidSolanaAddress', () => {
    it('should validate correct Solana addresses', () => {
      const validAddress = Keypair.generate().publicKey.toString();
      expect(isValidSolanaAddress(validAddress)).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(isValidSolanaAddress('invalid')).toBe(false);
      expect(isValidSolanaAddress('')).toBe(false);
      expect(isValidSolanaAddress('123')).toBe(false);
    });

    it('should reject non-string inputs', () => {
      expect(isValidSolanaAddress(null as any)).toBe(false);
      expect(isValidSolanaAddress(undefined as any)).toBe(false);
      expect(isValidSolanaAddress(123 as any)).toBe(false);
    });
  });

  describe('isValidSignature', () => {
    it('should validate correct signature format', () => {
      const validSig = '5' + 'a'.repeat(87); // 88 chars base58
      expect(isValidSignature(validSig)).toBe(true);
    });

    it('should reject invalid signature formats', () => {
      expect(isValidSignature('tooshort')).toBe(false);
      expect(isValidSignature('')).toBe(false);
      expect(isValidSignature('invalid!@#$')).toBe(false);
    });

    it('should reject non-string inputs', () => {
      expect(isValidSignature(null as any)).toBe(false);
      expect(isValidSignature(undefined as any)).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should remove dangerous characters', () => {
      expect(sanitizeString('<script>')).toBe('script');
      expect(sanitizeString('test"value')).toBe('testvalue');
      expect(sanitizeString("test'value")).toBe('testvalue');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  test  ')).toBe('test');
    });

    it('should limit length to 500 chars', () => {
      const longString = 'a'.repeat(600);
      expect(sanitizeString(longString)).toHaveLength(500);
    });

    it('should handle non-string inputs', () => {
      expect(sanitizeString(null as any)).toBe('');
      expect(sanitizeString(undefined as any)).toBe('');
    });
  });

  describe('validateAddressParam', () => {
    let mockRequest: any;
    let mockReply: any;

    beforeEach(() => {
      mockRequest = {
        params: {},
        url: '/test',
        ip: '127.0.0.1'
      };

      mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };
    });

    it('should accept valid Solana address', async () => {
      const validAddress = Keypair.generate().publicKey.toString();
      mockRequest.params.address = validAddress;

      await validateAddressParam(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should reject invalid Solana address', async () => {
      mockRequest.params.address = 'invalid-address';

      await validateAddressParam(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid Solana address format'
      });
    });
  });

  describe('validateSignatureParam', () => {
    let mockRequest: any;
    let mockReply: any;

    beforeEach(() => {
      mockRequest = {
        params: {},
        url: '/test',
        ip: '127.0.0.1'
      };

      mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };
    });

    it('should accept valid signature', async () => {
      const validSig = '5' + 'a'.repeat(87);
      mockRequest.params.signature = validSig;

      await validateSignatureParam(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should reject invalid signature', async () => {
      mockRequest.params.signature = 'invalid';

      await validateSignatureParam(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid transaction signature format'
      });
    });
  });
});
