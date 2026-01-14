/**
 * Comprehensive Unit Tests for src/schemas/validation.ts
 * 
 * Tests all validation schemas, helpers, and Zod schemas
 */

import {
  ValidationConstants,
  transactionSignatureSchema,
  walletAddressSchema,
  slotSchema,
  tokenIdSchema,
  paginationSchema,
  walletActivityQuerySchema,
  marketplaceQuerySchema,
  discrepanciesQuerySchema,
  isValidBase58,
  isValidSignature,
  isValidAddress,
  sanitizePagination,
  validateMintData,
  validateTransferData,
  validateBurnData,
  validateTransactionAccounts,
  validateOwnerAddress,
  ZodBase58Address,
  ZodBase58Signature,
  ZodPagination,
  ZodTransactionSignatureParam,
  ZodWalletAddressParam,
  ZodTokenIdParam,
  ZodSlotParam,
  ZodWalletActivityQuery,
  ZodMarketplaceQuery,
  ZodDiscrepanciesQuery,
  ZodRpcGetSlotResponse,
  ZodRpcGetBlockHeightResponse,
  ZodRpcGetBalanceResponse,
  ZodParsedTransaction,
  ZodRpcGetTransactionResponse,
  ZodRpcGetSignaturesResponse,
  ZodRpcGetBlockResponse,
  validateRpcResponse,
  safeValidateRpcResponse,
} from '../../../src/schemas/validation';

describe('src/schemas/validation.ts - Comprehensive Unit Tests', () => {

  // =============================================================================
  // CONSTANTS
  // =============================================================================

  describe('ValidationConstants', () => {
    it('should export MAX_OFFSET as 10000', () => {
      expect(ValidationConstants.MAX_OFFSET).toBe(10000);
    });

    it('should export MAX_LIMIT as 100', () => {
      expect(ValidationConstants.MAX_LIMIT).toBe(100);
    });

    it('should export DEFAULT_LIMIT as 50', () => {
      expect(ValidationConstants.DEFAULT_LIMIT).toBe(50);
    });

    it('should export BASE58_PATTERN', () => {
      expect(ValidationConstants.BASE58_PATTERN).toBeDefined();
      expect(typeof ValidationConstants.BASE58_PATTERN).toBe('string');
    });

    it('should export SIGNATURE_PATTERN for 87-88 character base58', () => {
      expect(ValidationConstants.SIGNATURE_PATTERN).toBeDefined();
      expect(typeof ValidationConstants.SIGNATURE_PATTERN).toBe('string');
    });

    it('should export ADDRESS_PATTERN for 32-44 character base58', () => {
      expect(ValidationConstants.ADDRESS_PATTERN).toBeDefined();
      expect(typeof ValidationConstants.ADDRESS_PATTERN).toBe('string');
    });
  });

  // =============================================================================
  // JSON SCHEMA STRUCTURES
  // =============================================================================

  describe('transactionSignatureSchema', () => {
    it('should require signature field', () => {
      expect(transactionSignatureSchema.required).toContain('signature');
    });

    it('should have additionalProperties set to false', () => {
      expect(transactionSignatureSchema.additionalProperties).toBe(false);
    });

    it('should have signature with minLength 87', () => {
      expect(transactionSignatureSchema.properties.signature.minLength).toBe(87);
    });

    it('should have signature with maxLength 88', () => {
      expect(transactionSignatureSchema.properties.signature.maxLength).toBe(88);
    });

    it('should have signature pattern defined', () => {
      expect(transactionSignatureSchema.properties.signature.pattern).toBeDefined();
    });
  });

  describe('walletAddressSchema', () => {
    it('should require address field', () => {
      expect(walletAddressSchema.required).toContain('address');
    });

    it('should have additionalProperties set to false', () => {
      expect(walletAddressSchema.additionalProperties).toBe(false);
    });

    it('should have address with minLength 32', () => {
      expect(walletAddressSchema.properties.address.minLength).toBe(32);
    });

    it('should have address with maxLength 44', () => {
      expect(walletAddressSchema.properties.address.maxLength).toBe(44);
    });

    it('should have address pattern defined', () => {
      expect(walletAddressSchema.properties.address.pattern).toBeDefined();
    });
  });

  describe('slotSchema', () => {
    it('should require slot field', () => {
      expect(slotSchema.required).toContain('slot');
    });

    it('should have additionalProperties set to false', () => {
      expect(slotSchema.additionalProperties).toBe(false);
    });

    it('should have numeric pattern', () => {
      expect(slotSchema.properties.slot.pattern).toBe('^[0-9]+$');
    });

    it('should have maxLength 20', () => {
      expect(slotSchema.properties.slot.maxLength).toBe(20);
    });
  });

  describe('tokenIdSchema', () => {
    it('should require tokenId field', () => {
      expect(tokenIdSchema.required).toContain('tokenId');
    });

    it('should have additionalProperties set to false', () => {
      expect(tokenIdSchema.additionalProperties).toBe(false);
    });

    it('should have tokenId with minLength 32', () => {
      expect(tokenIdSchema.properties.tokenId.minLength).toBe(32);
    });

    it('should have tokenId with maxLength 44', () => {
      expect(tokenIdSchema.properties.tokenId.maxLength).toBe(44);
    });
  });

  describe('paginationSchema', () => {
    it('should have additionalProperties set to false', () => {
      expect(paginationSchema.additionalProperties).toBe(false);
    });

    it('should have limit with minimum 1', () => {
      expect(paginationSchema.properties.limit.minimum).toBe(1);
    });

    it('should have limit with maximum 100', () => {
      expect(paginationSchema.properties.limit.maximum).toBe(100);
    });

    it('should have limit default of 50', () => {
      expect(paginationSchema.properties.limit.default).toBe(50);
    });

    it('should have offset with minimum 0', () => {
      expect(paginationSchema.properties.offset.minimum).toBe(0);
    });

    it('should have offset with maximum 10000', () => {
      expect(paginationSchema.properties.offset.maximum).toBe(10000);
    });

    it('should have offset default of 0', () => {
      expect(paginationSchema.properties.offset.default).toBe(0);
    });
  });

  describe('walletActivityQuerySchema', () => {
    it('should have additionalProperties set to false', () => {
      expect(walletActivityQuerySchema.additionalProperties).toBe(false);
    });

    it('should have activityType enum', () => {
      expect(walletActivityQuerySchema.properties.activityType.enum).toEqual([
        'mint', 'transfer', 'burn', 'all'
      ]);
    });

    it('should have activityType default of all', () => {
      expect(walletActivityQuerySchema.properties.activityType.default).toBe('all');
    });

    it('should have pagination fields', () => {
      expect(walletActivityQuerySchema.properties.limit).toBeDefined();
      expect(walletActivityQuerySchema.properties.offset).toBeDefined();
    });
  });

  describe('marketplaceQuerySchema', () => {
    it('should have additionalProperties set to false', () => {
      expect(marketplaceQuerySchema.additionalProperties).toBe(false);
    });

    it('should have marketplace maxLength of 64', () => {
      expect(marketplaceQuerySchema.properties.marketplace.maxLength).toBe(64);
    });

    it('should have marketplace pattern for alphanumeric with dashes', () => {
      expect(marketplaceQuerySchema.properties.marketplace.pattern).toBe('^[a-zA-Z0-9_-]+$');
    });

    it('should have pagination fields', () => {
      expect(marketplaceQuerySchema.properties.limit).toBeDefined();
      expect(marketplaceQuerySchema.properties.offset).toBeDefined();
    });
  });

  describe('discrepanciesQuerySchema', () => {
    it('should have additionalProperties set to false', () => {
      expect(discrepanciesQuerySchema.additionalProperties).toBe(false);
    });

    it('should have resolved boolean field', () => {
      expect(discrepanciesQuerySchema.properties.resolved.type).toBe('boolean');
    });

    it('should have pagination fields', () => {
      expect(discrepanciesQuerySchema.properties.limit).toBeDefined();
      expect(discrepanciesQuerySchema.properties.offset).toBeDefined();
    });
  });

  // =============================================================================
  // VALIDATION HELPER FUNCTIONS
  // =============================================================================

  describe('isValidBase58()', () => {
    it('should return true for valid base58 string', () => {
      expect(isValidBase58('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz')).toBe(true);
    });

    it('should return true for typical Solana address', () => {
      expect(isValidBase58('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK')).toBe(true);
    });

    it('should return false for string with 0', () => {
      expect(isValidBase58('ABC0DEF')).toBe(false);
    });

    it('should return false for string with O', () => {
      expect(isValidBase58('ABCODEF')).toBe(false);
    });

    it('should return false for string with I', () => {
      expect(isValidBase58('ABCIDEF')).toBe(false);
    });

    it('should return false for string with l (lowercase L)', () => {
      expect(isValidBase58('ABClDEF')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidBase58('')).toBe(false);
    });

    it('should return false for string with special characters', () => {
      expect(isValidBase58('ABC@DEF')).toBe(false);
    });

    it('should return false for string with spaces', () => {
      expect(isValidBase58('ABC DEF')).toBe(false);
    });
  });

  describe('isValidSignature()', () => {
    // Valid 88 character base58 signature
    const validSignature88 = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
    // Valid 87 character base58 signature
    const validSignature87 = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';
    
    it('should return true for 87 character base58 signature', () => {
      expect(isValidSignature(validSignature87)).toBe(true);
    });

    it('should return true for 88 character base58 signature', () => {
      expect(isValidSignature(validSignature88)).toBe(true);
    });

    it('should return false for 86 character signature (too short)', () => {
      const sig86 = validSignature87.substring(0, 86);
      expect(isValidSignature(sig86)).toBe(false);
    });

    it('should return false for 89 character signature (too long)', () => {
      const sig89 = validSignature88 + 'K';
      expect(isValidSignature(sig89)).toBe(false);
    });

    it('should return false for signature with invalid base58 chars', () => {
      const invalidSig = '0' + validSignature87.substring(1);
      expect(isValidSignature(invalidSig)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidSignature('')).toBe(false);
    });
  });

  describe('isValidAddress()', () => {
    const validAddress = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5C';
    
    it('should return true for 32 character base58 address', () => {
      const addr32 = validAddress.substring(0, 32);
      expect(isValidAddress(addr32)).toBe(true);
    });

    it('should return true for 44 character base58 address', () => {
      const addr44 = validAddress + 'NSKK';
      expect(isValidAddress(addr44)).toBe(true);
    });

    it('should return true for typical Solana address (around 43-44 chars)', () => {
      expect(isValidAddress('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK')).toBe(true);
    });

    it('should return false for 31 character address (too short)', () => {
      const addr31 = validAddress.substring(0, 31);
      expect(isValidAddress(addr31)).toBe(false);
    });

    it('should return false for 45 character address (too long)', () => {
      const addr45 = validAddress + 'NSKKK';
      expect(isValidAddress(addr45)).toBe(false);
    });

    it('should return false for address with invalid base58 chars', () => {
      const invalidAddr = '0' + validAddress.substring(1, 32);
      expect(isValidAddress(invalidAddr)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidAddress('')).toBe(false);
    });
  });

  describe('sanitizePagination()', () => {
    it('should use default limit when not provided', () => {
      const result = sanitizePagination();
      expect(result.limit).toBe(50);
    });

    it('should use default offset when not provided', () => {
      const result = sanitizePagination();
      expect(result.offset).toBe(0);
    });

    it('should accept valid limit and offset', () => {
      const result = sanitizePagination(25, 100);
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(100);
    });

    it('should clamp limit to MAX_LIMIT (100)', () => {
      const result = sanitizePagination(200);
      expect(result.limit).toBe(100);
    });

    it('should use default limit when 0 is passed (due to falsy check)', () => {
      // This tests actual behavior: limit || DEFAULT_LIMIT treats 0 as falsy
      const result = sanitizePagination(0);
      expect(result.limit).toBe(50);
    });

    it('should clamp negative limit to minimum 1', () => {
      const result = sanitizePagination(-5);
      expect(result.limit).toBe(1);
    });

    it('should clamp offset to MAX_OFFSET (10000)', () => {
      const result = sanitizePagination(50, 20000);
      expect(result.offset).toBe(10000);
    });

    it('should clamp negative offset to 0', () => {
      const result = sanitizePagination(50, -10);
      expect(result.offset).toBe(0);
    });

    it('should handle undefined limit', () => {
      const result = sanitizePagination(undefined, 100);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(100);
    });

    it('should handle undefined offset', () => {
      const result = sanitizePagination(25, undefined);
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(0);
    });
  });

  // =============================================================================
  // BLOCKCHAIN DATA VALIDATION
  // =============================================================================

  describe('validateMintData()', () => {
    it('should return valid mint data for correct transaction', () => {
      const tx = {
        meta: {
          postTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
            owner: 'HXtBm8XZbxaTt41uqaKhwUAa6Z1aPyvJdsZVENiWsetg'
          }]
        }
      };

      const result = validateMintData(tx);
      expect(result).not.toBeNull();
      expect(result?.tokenId).toBe('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
      expect(result?.owner).toBe('HXtBm8XZbxaTt41uqaKhwUAa6Z1aPyvJdsZVENiWsetg');
      expect(result?.ticketId).toBeNull();
    });

    it('should return null when tokenId is missing', () => {
      const tx = {
        meta: {
          postTokenBalances: [{
            owner: 'HXtBm8XZbxaTt41uqaKhwUAa6Z1aPyvJdsZVENiWsetg'
          }]
        }
      };

      expect(validateMintData(tx)).toBeNull();
    });

    it('should return null when owner is missing', () => {
      const tx = {
        meta: {
          postTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK'
          }]
        }
      };

      expect(validateMintData(tx)).toBeNull();
    });

    it('should return null when tokenId is invalid base58', () => {
      const tx = {
        meta: {
          postTokenBalances: [{
            mint: 'INVALID0ADDRESS',
            owner: 'HXtBm8XZbxaTt41uqaKhwUAa6Z1aPyvJdsZVENiWsetg'
          }]
        }
      };

      expect(validateMintData(tx)).toBeNull();
    });

    it('should return null when owner is invalid base58', () => {
      const tx = {
        meta: {
          postTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
            owner: 'INVALID0ADDRESS'
          }]
        }
      };

      expect(validateMintData(tx)).toBeNull();
    });

    it('should return null when tokenId is not a string', () => {
      const tx = {
        meta: {
          postTokenBalances: [{
            mint: 12345,
            owner: 'HXtBm8XZbxaTt41uqaKhwUAa6Z1aPyvJdsZVENiWsetg'
          }]
        }
      };

      expect(validateMintData(tx)).toBeNull();
    });

    it('should return null when meta is missing', () => {
      const tx = {};
      expect(validateMintData(tx)).toBeNull();
    });

    it('should return null when postTokenBalances is missing', () => {
      const tx = { meta: {} };
      expect(validateMintData(tx)).toBeNull();
    });

    it('should return null when postTokenBalances is empty', () => {
      const tx = {
        meta: {
          postTokenBalances: []
        }
      };
      expect(validateMintData(tx)).toBeNull();
    });

    it('should handle exceptions gracefully', () => {
      const tx = null;
      expect(validateMintData(tx)).toBeNull();
    });
  });

  describe('validateTransferData()', () => {
    it('should return valid transfer data for correct transaction', () => {
      const tx = {
        meta: {
          preTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
            owner: 'HXtBm8XZbxaTt41uqaKhwUAa6Z1aPyvJdsZVENiWsetg'
          }],
          postTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
            owner: 'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS'
          }]
        }
      };

      const result = validateTransferData(tx);
      expect(result).not.toBeNull();
      expect(result?.tokenId).toBe('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
      expect(result?.previousOwner).toBe('HXtBm8XZbxaTt41uqaKhwUAa6Z1aPyvJdsZVENiWsetg');
      expect(result?.newOwner).toBe('GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS');
    });

    it('should allow undefined previousOwner', () => {
      const tx = {
        meta: {
          postTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
            owner: 'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS'
          }]
        }
      };

      const result = validateTransferData(tx);
      expect(result).not.toBeNull();
      expect(result?.previousOwner).toBe('');
    });

    it('should allow null previousOwner', () => {
      const tx = {
        meta: {
          preTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
            owner: null
          }],
          postTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
            owner: 'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS'
          }]
        }
      };

      const result = validateTransferData(tx);
      expect(result).not.toBeNull();
      expect(result?.previousOwner).toBe('');
    });

    it('should return null when tokenId is missing', () => {
      const tx = {
        meta: {
          postTokenBalances: [{
            owner: 'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS'
          }]
        }
      };

      expect(validateTransferData(tx)).toBeNull();
    });

    it('should return null when newOwner is missing', () => {
      const tx = {
        meta: {
          postTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK'
          }]
        }
      };

      expect(validateTransferData(tx)).toBeNull();
    });

    it('should return null when tokenId is invalid base58', () => {
      const tx = {
        meta: {
          postTokenBalances: [{
            mint: 'INVALID0ADDRESS',
            owner: 'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS'
          }]
        }
      };

      expect(validateTransferData(tx)).toBeNull();
    });

    it('should return null when newOwner is invalid base58', () => {
      const tx = {
        meta: {
          postTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
            owner: 'INVALID0ADDRESS'
          }]
        }
      };

      expect(validateTransferData(tx)).toBeNull();
    });

    it('should return null when previousOwner is invalid base58', () => {
      const tx = {
        meta: {
          preTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
            owner: 'INVALID0ADDRESS'
          }],
          postTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
            owner: 'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS'
          }]
        }
      };

      expect(validateTransferData(tx)).toBeNull();
    });

    it('should handle exceptions gracefully', () => {
      const tx = null;
      expect(validateTransferData(tx)).toBeNull();
    });
  });

  describe('validateBurnData()', () => {
    it('should return valid burn data for correct transaction', () => {
      const tx = {
        meta: {
          preTokenBalances: [{
            mint: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK'
          }]
        }
      };

      const result = validateBurnData(tx);
      expect(result).not.toBeNull();
      expect(result?.tokenId).toBe('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
    });

    it('should return null when tokenId is missing', () => {
      const tx = {
        meta: {
          preTokenBalances: [{}]
        }
      };

      expect(validateBurnData(tx)).toBeNull();
    });

    it('should return null when tokenId is invalid base58', () => {
      const tx = {
        meta: {
          preTokenBalances: [{
            mint: 'INVALID0ADDRESS'
          }]
        }
      };

      expect(validateBurnData(tx)).toBeNull();
    });

    it('should return null when tokenId is not a string', () => {
      const tx = {
        meta: {
          preTokenBalances: [{
            mint: 12345
          }]
        }
      };

      expect(validateBurnData(tx)).toBeNull();
    });

    it('should return null when meta is missing', () => {
      const tx = {};
      expect(validateBurnData(tx)).toBeNull();
    });

    it('should return null when preTokenBalances is missing', () => {
      const tx = { meta: {} };
      expect(validateBurnData(tx)).toBeNull();
    });

    it('should return null when preTokenBalances is empty', () => {
      const tx = {
        meta: {
          preTokenBalances: []
        }
      };
      expect(validateBurnData(tx)).toBeNull();
    });

    it('should handle exceptions gracefully', () => {
      const tx = null;
      expect(validateBurnData(tx)).toBeNull();
    });
  });

  describe('validateTransactionAccounts()', () => {
    it('should return true for valid accounts array', () => {
      const accounts = [
        { pubkey: { toString: () => 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK' } },
        { pubkey: { toString: () => 'HXtBm8XZbxaTt41uqaKhwUAa6Z1aPyvJdsZVENiWsetg' } }
      ];

      expect(validateTransactionAccounts(accounts)).toBe(true);
    });

    it('should return false for non-array input', () => {
      expect(validateTransactionAccounts({} as any)).toBe(false);
      expect(validateTransactionAccounts(null as any)).toBe(false);
      expect(validateTransactionAccounts(undefined as any)).toBe(false);
    });

    it('should return false when account is not an object', () => {
      const accounts = ['not an object'];
      expect(validateTransactionAccounts(accounts as any)).toBe(false);
    });

    it('should return false when account is null', () => {
      const accounts = [null];
      expect(validateTransactionAccounts(accounts as any)).toBe(false);
    });

    it('should return false when pubkey is missing', () => {
      const accounts = [{}];
      expect(validateTransactionAccounts(accounts as any)).toBe(false);
    });

    it('should return false when pubkey does not have toString', () => {
      const accounts = [{ pubkey: 'string' }];
      expect(validateTransactionAccounts(accounts as any)).toBe(false);
    });

    it('should return false when pubkey is invalid base58', () => {
      const accounts = [
        { pubkey: { toString: () => 'INVALID0ADDRESS' } }
      ];
      expect(validateTransactionAccounts(accounts as any)).toBe(false);
    });

    it('should return true for empty array', () => {
      expect(validateTransactionAccounts([])).toBe(true);
    });
  });

  describe('validateOwnerAddress()', () => {
    it('should return valid address string', () => {
      const owner = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
      expect(validateOwnerAddress(owner)).toBe(owner);
    });

    it('should return null for invalid base58 address', () => {
      expect(validateOwnerAddress('INVALID0ADDRESS')).toBeNull();
    });

    it('should return null for non-string input', () => {
      expect(validateOwnerAddress(12345 as any)).toBeNull();
      expect(validateOwnerAddress({} as any)).toBeNull();
      expect(validateOwnerAddress([] as any)).toBeNull();
    });

    it('should return null for null', () => {
      expect(validateOwnerAddress(null)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(validateOwnerAddress(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(validateOwnerAddress('')).toBeNull();
    });
  });

  // =============================================================================
  // ZOD SCHEMAS
  // =============================================================================

  describe('ZodBase58Address', () => {
    it('should accept valid 44 character address', () => {
      const result = ZodBase58Address.safeParse('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
      expect(result.success).toBe(true);
    });

    it('should accept valid 32 character address', () => {
      const result = ZodBase58Address.safeParse('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX');
      expect(result.success).toBe(true);
    });

    it('should reject address shorter than 32 characters', () => {
      const result = ZodBase58Address.safeParse('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVF');
      expect(result.success).toBe(false);
    });

    it('should reject address longer than 44 characters', () => {
      const result = ZodBase58Address.safeParse('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKKKKKKK');
      expect(result.success).toBe(false);
    });

    it('should reject invalid base58 characters', () => {
      const result = ZodBase58Address.safeParse('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG0CNSKK');
      expect(result.success).toBe(false);
    });
  });

  describe('ZodBase58Signature', () => {
    const validSig88 = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
    const validSig87 = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQU';
    
    it('should accept valid 87 character signature', () => {
      const result = ZodBase58Signature.safeParse(validSig87);
      expect(result.success).toBe(true);
    });

    it('should accept valid 88 character signature', () => {
      const result = ZodBase58Signature.safeParse(validSig88);
      expect(result.success).toBe(true);
    });

    it('should reject signature shorter than 87 characters', () => {
      const result = ZodBase58Signature.safeParse(validSig87.substring(0, 86));
      expect(result.success).toBe(false);
    });

    it('should reject signature longer than 88 characters', () => {
      const result = ZodBase58Signature.safeParse(validSig88 + 'K');
      expect(result.success).toBe(false);
    });

    it('should reject invalid base58 characters', () => {
      const result = ZodBase58Signature.safeParse('0' + validSig87.substring(1));
      expect(result.success).toBe(false);
    });
  });

  describe('ZodPagination', () => {
    it('should accept valid pagination', () => {
      const result = ZodPagination.safeParse({ limit: 50, offset: 100 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(100);
      }
    });

    it('should use default limit of 50', () => {
      const result = ZodPagination.safeParse({ offset: 0 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('should use default offset of 0', () => {
      const result = ZodPagination.safeParse({ limit: 25 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.offset).toBe(0);
      }
    });

    it('should reject limit less than 1', () => {
      const result = ZodPagination.safeParse({ limit: 0, offset: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject limit greater than 100', () => {
      const result = ZodPagination.safeParse({ limit: 101, offset: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const result = ZodPagination.safeParse({ limit: 50, offset: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject offset greater than 10000', () => {
      const result = ZodPagination.safeParse({ limit: 50, offset: 10001 });
      expect(result.success).toBe(false);
    });

    it('should reject additional properties', () => {
      const result = ZodPagination.safeParse({ limit: 50, offset: 0, extra: 'field' });
      expect(result.success).toBe(false);
    });
  });

  describe('ZodTransactionSignatureParam', () => {
    it('should accept valid signature param', () => {
      const sig = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
      const result = ZodTransactionSignatureParam.safeParse({ signature: sig });
      expect(result.success).toBe(true);
    });

    it('should reject invalid signature', () => {
      const result = ZodTransactionSignatureParam.safeParse({ signature: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should reject missing signature', () => {
      const result = ZodTransactionSignatureParam.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('ZodWalletAddressParam', () => {
    it('should accept valid address param', () => {
      const result = ZodWalletAddressParam.safeParse({ 
        address: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK' 
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid address', () => {
      const result = ZodWalletAddressParam.safeParse({ address: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('ZodTokenIdParam', () => {
    it('should accept valid tokenId param', () => {
      const result = ZodTokenIdParam.safeParse({ 
        tokenId: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK' 
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid tokenId', () => {
      const result = ZodTokenIdParam.safeParse({ tokenId: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('ZodSlotParam', () => {
    it('should accept valid numeric slot string', () => {
      const result = ZodSlotParam.safeParse({ slot: '12345' });
      expect(result.success).toBe(true);
    });

    it('should reject non-numeric slot', () => {
      const result = ZodSlotParam.safeParse({ slot: 'abc' });
      expect(result.success).toBe(false);
    });

    it('should reject slot longer than 20 characters', () => {
      const result = ZodSlotParam.safeParse({ slot: '123456789012345678901' });
      expect(result.success).toBe(false);
    });
  });

  describe('ZodWalletActivityQuery', () => {
    it('should accept valid activity query', () => {
      const result = ZodWalletActivityQuery.safeParse({ 
        limit: 25, 
        offset: 50, 
        activityType: 'mint' 
      });
      expect(result.success).toBe(true);
    });

    it('should use default activityType of all', () => {
      const result = ZodWalletActivityQuery.safeParse({ limit: 25, offset: 0 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activityType).toBe('all');
      }
    });

    it('should accept all valid activityType values', () => {
      const types = ['mint', 'transfer', 'burn', 'all'];
      types.forEach(type => {
        const result = ZodWalletActivityQuery.safeParse({ activityType: type });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid activityType', () => {
      const result = ZodWalletActivityQuery.safeParse({ activityType: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('ZodMarketplaceQuery', () => {
    it('should accept valid marketplace query', () => {
      const result = ZodMarketplaceQuery.safeParse({ 
        marketplace: 'magic-eden', 
        limit: 25, 
        offset: 0 
      });
      expect(result.success).toBe(true);
    });

    it('should allow optional marketplace', () => {
      const result = ZodMarketplaceQuery.safeParse({ limit: 25, offset: 0 });
      expect(result.success).toBe(true);
    });

    it('should reject marketplace longer than 64 characters', () => {
      const longName = 'a'.repeat(65);
      const result = ZodMarketplaceQuery.safeParse({ marketplace: longName });
      expect(result.success).toBe(false);
    });

    it('should reject marketplace with invalid characters', () => {
      const result = ZodMarketplaceQuery.safeParse({ marketplace: 'magic@eden' });
      expect(result.success).toBe(false);
    });

    it('should accept marketplace with hyphens and underscores', () => {
      const result = ZodMarketplaceQuery.safeParse({ marketplace: 'magic_eden-v2' });
      expect(result.success).toBe(true);
    });
  });

  describe('ZodDiscrepanciesQuery', () => {
    it('should accept valid discrepancies query', () => {
      const result = ZodDiscrepanciesQuery.safeParse({ 
        resolved: true, 
        limit: 25, 
        offset: 0 
      });
      expect(result.success).toBe(true);
    });

    it('should allow optional resolved field', () => {
      const result = ZodDiscrepanciesQuery.safeParse({ limit: 25, offset: 0 });
      expect(result.success).toBe(true);
    });

    it('should reject non-boolean resolved', () => {
      const result = ZodDiscrepanciesQuery.safeParse({ resolved: 'yes' });
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // RPC RESPONSE VALIDATION
  // =============================================================================

  describe('ZodRpcGetSlotResponse', () => {
    it('should accept valid slot number', () => {
      const result = ZodRpcGetSlotResponse.safeParse(123456);
      expect(result.success).toBe(true);
    });

    it('should accept 0', () => {
      const result = ZodRpcGetSlotResponse.safeParse(0);
      expect(result.success).toBe(true);
    });

    it('should reject negative numbers', () => {
      const result = ZodRpcGetSlotResponse.safeParse(-1);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer', () => {
      const result = ZodRpcGetSlotResponse.safeParse(123.45);
      expect(result.success).toBe(false);
    });

    it('should reject string', () => {
      const result = ZodRpcGetSlotResponse.safeParse('123456');
      expect(result.success).toBe(false);
    });
  });

  describe('ZodRpcGetBalanceResponse', () => {
    it('should accept valid balance response', () => {
      const response = {
        context: { slot: 123456 },
        value: 1000000000
      };
      const result = ZodRpcGetBalanceResponse.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject missing context', () => {
      const response = { value: 1000000000 };
      const result = ZodRpcGetBalanceResponse.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should reject missing value', () => {
      const response = { context: { slot: 123456 } };
      const result = ZodRpcGetBalanceResponse.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('ZodParsedTransaction', () => {
    it('should accept valid parsed transaction', () => {
      const tx = {
        slot: 123456,
        blockTime: 1234567890,
        meta: {
          err: null,
          fee: 5000,
          preBalances: [1000000],
          postBalances: [995000],
          logMessages: ['Program log: success']
        },
        transaction: {
          message: {
            accountKeys: [],
            instructions: []
          },
          signatures: ['5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW']
        }
      };
      const result = ZodParsedTransaction.safeParse(tx);
      expect(result.success).toBe(true);
    });

    it('should accept null blockTime', () => {
      const tx = {
        slot: 123456,
        blockTime: null,
        meta: null,
        transaction: {
          message: { accountKeys: [], instructions: [] },
          signatures: []
        }
      };
      const result = ZodParsedTransaction.safeParse(tx);
      expect(result.success).toBe(true);
    });

    it('should accept null meta', () => {
      const tx = {
        slot: 123456,
        meta: null,
        transaction: {
          message: { accountKeys: [], instructions: [] },
          signatures: []
        }
      };
      const result = ZodParsedTransaction.safeParse(tx);
      expect(result.success).toBe(true);
    });
  });

  describe('validateRpcResponse()', () => {
    it('should return typed result for valid response', () => {
      const result = validateRpcResponse(123456, ZodRpcGetSlotResponse, 'getSlot');
      expect(result).toBe(123456);
    });

    it('should throw error for invalid response', () => {
      expect(() => {
        validateRpcResponse('invalid', ZodRpcGetSlotResponse, 'getSlot');
      }).toThrow('getSlot validation failed');
    });

    it('should include validation details in error', () => {
      expect(() => {
        validateRpcResponse('invalid', ZodRpcGetSlotResponse);
      }).toThrow('validation failed');
    });

    it('should use default context when not provided', () => {
      expect(() => {
        validateRpcResponse('invalid', ZodRpcGetSlotResponse);
      }).toThrow('RPC response validation failed');
    });
  });

  describe('safeValidateRpcResponse()', () => {
    it('should return typed result for valid response', () => {
      const result = safeValidateRpcResponse(123456, ZodRpcGetSlotResponse);
      expect(result).toBe(123456);
    });

    it('should return null for invalid response', () => {
      const result = safeValidateRpcResponse('invalid', ZodRpcGetSlotResponse);
      expect(result).toBeNull();
    });

    it('should not throw error for invalid response', () => {
      expect(() => {
        safeValidateRpcResponse('invalid', ZodRpcGetSlotResponse);
      }).not.toThrow();
    });
  });

});
