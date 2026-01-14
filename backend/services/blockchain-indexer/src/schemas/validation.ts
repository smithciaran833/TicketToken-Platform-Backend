/**
 * Validation Schemas for Blockchain Indexer
 * 
 * AUDIT FIX: INP-2 - Base58 pattern validation for signatures/addresses
 * AUDIT FIX: INP-3 - Bounded offset parameter
 * AUDIT FIX: VAL-1 - additionalProperties: false on all schemas
 * AUDIT FIX: INP-9 - maxLength on tokenId (already applied)
 * AUDIT FIX: INP-10 - Consolidated schemas with Zod
 * AUDIT FIX: EXT-5 - External API response validation
 */

import { z } from 'zod';

// =============================================================================
// CONSTANTS
// =============================================================================

// AUDIT FIX: INP-3 - Maximum offset to prevent DoS via large pagination
const MAX_OFFSET = 10000;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

// AUDIT FIX: INP-2 - Base58 character set (Solana uses modified base58)
// Base58 excludes 0, O, I, l to avoid confusion
const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_PATTERN = `^[${BASE58_CHARS}]+$`;

// Solana signature is 88 characters in base58
// Solana address is 32-44 characters in base58
const SIGNATURE_PATTERN = `^[${BASE58_CHARS}]{87,88}$`;
const ADDRESS_PATTERN = `^[${BASE58_CHARS}]{32,44}$`;

// =============================================================================
// PARAM SCHEMAS (for URL parameters)
// =============================================================================

/**
 * Transaction signature parameter schema
 * AUDIT FIX: INP-2 - Base58 validation
 */
export const transactionSignatureSchema = {
  type: 'object',
  required: ['signature'],
  additionalProperties: false,
  properties: {
    signature: { 
      type: 'string', 
      minLength: 87, 
      maxLength: 88,
      pattern: SIGNATURE_PATTERN,
      description: 'Solana transaction signature (base58 encoded)'
    }
  }
};

/**
 * Wallet address parameter schema
 * AUDIT FIX: INP-2 - Base58 validation
 */
export const walletAddressSchema = {
  type: 'object',
  required: ['address'],
  additionalProperties: false,
  properties: {
    address: { 
      type: 'string', 
      minLength: 32, 
      maxLength: 44,
      pattern: ADDRESS_PATTERN,
      description: 'Solana wallet address (base58 encoded)'
    }
  }
};

/**
 * Slot number parameter schema
 */
export const slotSchema = {
  type: 'object',
  required: ['slot'],
  additionalProperties: false,
  properties: {
    slot: { 
      type: 'string', 
      pattern: '^[0-9]+$',
      maxLength: 20,
      description: 'Solana slot number'
    }
  }
};

/**
 * Token ID parameter schema
 * AUDIT FIX: INP-2 - Base58 validation for NFT mint addresses
 */
export const tokenIdSchema = {
  type: 'object',
  required: ['tokenId'],
  additionalProperties: false,
  properties: {
    tokenId: { 
      type: 'string', 
      minLength: 32, 
      maxLength: 44,
      pattern: ADDRESS_PATTERN,
      description: 'NFT token/mint address (base58 encoded)'
    }
  }
};

// =============================================================================
// QUERY SCHEMAS (for query parameters)
// =============================================================================

/**
 * Pagination query schema
 * AUDIT FIX: INP-3 - Bounded offset
 */
export const paginationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { 
      type: 'number', 
      minimum: 1, 
      maximum: MAX_LIMIT, 
      default: DEFAULT_LIMIT,
      description: `Number of results (max ${MAX_LIMIT})`
    },
    offset: { 
      type: 'number', 
      minimum: 0, 
      maximum: MAX_OFFSET,
      default: 0,
      description: `Result offset (max ${MAX_OFFSET})`
    }
  }
};

/**
 * Wallet activity query schema
 * AUDIT FIX: INP-3 - Bounded offset
 */
export const walletActivityQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { 
      type: 'number', 
      minimum: 1, 
      maximum: MAX_LIMIT, 
      default: DEFAULT_LIMIT 
    },
    offset: { 
      type: 'number', 
      minimum: 0, 
      maximum: MAX_OFFSET,
      default: 0 
    },
    activityType: { 
      type: 'string', 
      enum: ['mint', 'transfer', 'burn', 'all'],
      default: 'all'
    }
  }
};

/**
 * Marketplace query schema
 * AUDIT FIX: INP-3 - Bounded offset
 */
export const marketplaceQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    marketplace: { 
      type: 'string', 
      maxLength: 64,
      pattern: '^[a-zA-Z0-9_-]+$',
      description: 'Marketplace identifier'
    },
    limit: { 
      type: 'number', 
      minimum: 1, 
      maximum: MAX_LIMIT, 
      default: DEFAULT_LIMIT 
    },
    offset: { 
      type: 'number', 
      minimum: 0, 
      maximum: MAX_OFFSET,
      default: 0 
    }
  }
};

/**
 * Discrepancies query schema
 * AUDIT FIX: INP-3 - Bounded offset
 */
export const discrepanciesQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    resolved: { type: 'boolean' },
    limit: { 
      type: 'number', 
      minimum: 1, 
      maximum: MAX_LIMIT, 
      default: DEFAULT_LIMIT 
    },
    offset: { 
      type: 'number', 
      minimum: 0, 
      maximum: MAX_OFFSET,
      default: 0 
    }
  }
};

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate base58 string
 */
export function isValidBase58(value: string): boolean {
  return new RegExp(BASE58_PATTERN).test(value);
}

/**
 * Validate Solana signature
 */
export function isValidSignature(value: string): boolean {
  return value.length >= 87 && value.length <= 88 && isValidBase58(value);
}

/**
 * Validate Solana address
 */
export function isValidAddress(value: string): boolean {
  return value.length >= 32 && value.length <= 44 && isValidBase58(value);
}

/**
 * Sanitize pagination parameters
 */
export function sanitizePagination(
  limit?: number,
  offset?: number
): { limit: number; offset: number } {
  return {
    limit: Math.min(Math.max(limit || DEFAULT_LIMIT, 1), MAX_LIMIT),
    offset: Math.min(Math.max(offset || 0, 0), MAX_OFFSET)
  };
}

// Export constants for use elsewhere
export const ValidationConstants = {
  MAX_OFFSET,
  MAX_LIMIT,
  DEFAULT_LIMIT,
  BASE58_PATTERN,
  SIGNATURE_PATTERN,
  ADDRESS_PATTERN
};

// =============================================================================
// BLOCKCHAIN DATA VALIDATION
// AUDIT FIX: INP-4 - Validate extracted blockchain data
// =============================================================================

/**
 * Validated mint data from blockchain transaction
 */
export interface ValidatedMintData {
  tokenId: string;
  owner: string;
  ticketId: string | null;
}

/**
 * Validated transfer data from blockchain transaction
 */
export interface ValidatedTransferData {
  tokenId: string;
  previousOwner: string;
  newOwner: string;
}

/**
 * Validated burn data from blockchain transaction
 */
export interface ValidatedBurnData {
  tokenId: string;
}

/**
 * Validate and extract mint data from transaction
 * Returns null if data is invalid or missing required fields
 */
export function validateMintData(tx: any): ValidatedMintData | null {
  try {
    const tokenId = tx.meta?.postTokenBalances?.[0]?.mint;
    const owner = tx.meta?.postTokenBalances?.[0]?.owner;

    // Validate required fields exist
    if (!tokenId || !owner) {
      return null;
    }

    // Validate tokenId is valid base58 address
    if (typeof tokenId !== 'string' || !isValidAddress(tokenId)) {
      return null;
    }

    // Validate owner is valid base58 address
    if (typeof owner !== 'string' || !isValidAddress(owner)) {
      return null;
    }

    return {
      tokenId,
      owner,
      ticketId: null
    };
  } catch {
    return null;
  }
}

/**
 * Validate and extract transfer data from transaction
 * Returns null if data is invalid or missing required fields
 */
export function validateTransferData(tx: any): ValidatedTransferData | null {
  try {
    const tokenId = tx.meta?.postTokenBalances?.[0]?.mint;
    const previousOwner = tx.meta?.preTokenBalances?.[0]?.owner;
    const newOwner = tx.meta?.postTokenBalances?.[0]?.owner;

    // Validate required fields exist
    if (!tokenId || !newOwner) {
      return null;
    }

    // Validate tokenId is valid base58 address
    if (typeof tokenId !== 'string' || !isValidAddress(tokenId)) {
      return null;
    }

    // Validate newOwner is valid base58 address
    if (typeof newOwner !== 'string' || !isValidAddress(newOwner)) {
      return null;
    }

    // previousOwner can be undefined for some transfers, but if present must be valid
    if (previousOwner !== undefined && previousOwner !== null) {
      if (typeof previousOwner !== 'string' || !isValidAddress(previousOwner)) {
        return null;
      }
    }

    return {
      tokenId,
      previousOwner: previousOwner || '',
      newOwner
    };
  } catch {
    return null;
  }
}

/**
 * Validate and extract burn data from transaction
 * Returns null if data is invalid or missing required fields
 */
export function validateBurnData(tx: any): ValidatedBurnData | null {
  try {
    const tokenId = tx.meta?.preTokenBalances?.[0]?.mint;

    // Validate required field exists
    if (!tokenId) {
      return null;
    }

    // Validate tokenId is valid base58 address
    if (typeof tokenId !== 'string' || !isValidAddress(tokenId)) {
      return null;
    }

    return {
      tokenId
    };
  } catch {
    return null;
  }
}

/**
 * Validate transaction accounts array
 */
export function validateTransactionAccounts(accounts: any[]): boolean {
  if (!Array.isArray(accounts)) {
    return false;
  }

  return accounts.every(account => {
    if (!account || typeof account !== 'object') {
      return false;
    }

    // pubkey must be valid base58
    if (!account.pubkey || typeof account.pubkey.toString !== 'function') {
      return false;
    }

    const pubkeyStr = account.pubkey.toString();
    return isValidAddress(pubkeyStr);
  });
}

/**
 * Validate owner address from token balances
 */
export function validateOwnerAddress(owner: any): string | null {
  if (!owner || typeof owner !== 'string') {
    return null;
  }

  if (!isValidAddress(owner)) {
    return null;
  }

  return owner;
}

// =============================================================================
// ZOD SCHEMAS - CONSOLIDATED
// AUDIT FIX: INP-10 - Centralized schema definitions with Zod
// =============================================================================

/**
 * Base58 address schema (reusable)
 */
export const ZodBase58Address = z.string()
  .min(32, 'Address too short')
  .max(44, 'Address too long')
  .regex(new RegExp(ADDRESS_PATTERN), 'Invalid base58 address');

/**
 * Base58 signature schema (reusable)
 */
export const ZodBase58Signature = z.string()
  .min(87, 'Signature too short')
  .max(88, 'Signature too long')
  .regex(new RegExp(SIGNATURE_PATTERN), 'Invalid base58 signature');

/**
 * Pagination schema (reusable)
 */
export const ZodPagination = z.object({
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.number().int().min(0).max(MAX_OFFSET).default(0)
}).strict();

/**
 * Transaction signature param schema
 */
export const ZodTransactionSignatureParam = z.object({
  signature: ZodBase58Signature
}).strict();

/**
 * Wallet address param schema
 */
export const ZodWalletAddressParam = z.object({
  address: ZodBase58Address
}).strict();

/**
 * Token ID param schema
 */
export const ZodTokenIdParam = z.object({
  tokenId: ZodBase58Address
}).strict();

/**
 * Slot param schema
 */
export const ZodSlotParam = z.object({
  slot: z.string().regex(/^[0-9]+$/).max(20)
}).strict();

/**
 * Wallet activity query schema
 */
export const ZodWalletActivityQuery = ZodPagination.extend({
  activityType: z.enum(['mint', 'transfer', 'burn', 'all']).default('all')
}).strict();

/**
 * Marketplace query schema
 */
export const ZodMarketplaceQuery = ZodPagination.extend({
  marketplace: z.string().max(64).regex(/^[a-zA-Z0-9_-]+$/).optional()
}).strict();

/**
 * Discrepancies query schema
 */
export const ZodDiscrepanciesQuery = ZodPagination.extend({
  resolved: z.boolean().optional()
}).strict();

// =============================================================================
// EXTERNAL API RESPONSE VALIDATION
// AUDIT FIX: EXT-5 - Validate external API (RPC) responses with Zod
// =============================================================================

/**
 * Solana RPC getSlot response schema
 */
export const ZodRpcGetSlotResponse = z.number().int().nonnegative();

/**
 * Solana RPC getBlockHeight response schema
 */
export const ZodRpcGetBlockHeightResponse = z.number().int().nonnegative();

/**
 * Solana RPC getBalance response schema
 */
export const ZodRpcGetBalanceResponse = z.object({
  context: z.object({
    slot: z.number().int().nonnegative()
  }),
  value: z.number().nonnegative()
});

/**
 * Token balance schema
 */
const ZodTokenBalance = z.object({
  accountIndex: z.number().int().nonnegative(),
  mint: ZodBase58Address,
  owner: ZodBase58Address.optional(),
  uiTokenAmount: z.object({
    amount: z.string(),
    decimals: z.number().int().nonnegative(),
    uiAmount: z.number().nullable(),
    uiAmountString: z.string()
  }).optional()
}).passthrough();

/**
 * Transaction meta schema
 */
const ZodTransactionMeta = z.object({
  err: z.any().nullable(),
  fee: z.number().int().nonnegative(),
  preBalances: z.array(z.number().nonnegative()),
  postBalances: z.array(z.number().nonnegative()),
  preTokenBalances: z.array(ZodTokenBalance).optional(),
  postTokenBalances: z.array(ZodTokenBalance).optional(),
  logMessages: z.array(z.string()).optional().nullable()
}).passthrough();

/**
 * Parsed transaction schema
 */
export const ZodParsedTransaction = z.object({
  slot: z.number().int().nonnegative(),
  blockTime: z.number().int().nullable().optional(),
  meta: ZodTransactionMeta.nullable(),
  transaction: z.object({
    message: z.object({
      accountKeys: z.array(z.any()),
      instructions: z.array(z.any())
    }).passthrough(),
    signatures: z.array(z.string())
  }).passthrough()
}).passthrough();

/**
 * Solana RPC getTransaction response schema
 */
export const ZodRpcGetTransactionResponse = ZodParsedTransaction.nullable();

/**
 * Solana RPC getSignaturesForAddress response schema
 */
export const ZodRpcGetSignaturesResponse = z.array(z.object({
  signature: ZodBase58Signature,
  slot: z.number().int().nonnegative(),
  err: z.any().nullable(),
  blockTime: z.number().int().nullable().optional(),
  memo: z.string().nullable().optional(),
  confirmationStatus: z.enum(['processed', 'confirmed', 'finalized']).optional()
}));

/**
 * Solana RPC getBlock response schema (simplified)
 */
export const ZodRpcGetBlockResponse = z.object({
  blockhash: z.string(),
  previousBlockhash: z.string(),
  parentSlot: z.number().int().nonnegative(),
  blockTime: z.number().int().nullable().optional(),
  blockHeight: z.number().int().nonnegative().nullable().optional(),
  transactions: z.array(z.any()).optional()
}).passthrough().nullable();

/**
 * Generic RPC response wrapper
 */
export const ZodRpcResponseWrapper = <T extends z.ZodType>(resultSchema: T) => z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: resultSchema,
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional()
  }).optional()
});

/**
 * Validate RPC response with schema
 * Returns typed result or throws on validation error
 */
export function validateRpcResponse<T>(
  response: unknown,
  schema: z.ZodType<T>,
  context: string = 'RPC response'
): T {
  const result = schema.safeParse(response);
  if (!result.success) {
    const errorDetails = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`${context} validation failed: ${errorDetails}`);
  }
  return result.data;
}

/**
 * Safe RPC response validation (returns null on failure instead of throwing)
 */
export function safeValidateRpcResponse<T>(
  response: unknown,
  schema: z.ZodType<T>
): T | null {
  const result = schema.safeParse(response);
  return result.success ? result.data : null;
}

// Export Zod types for use in other files
export type RpcGetSlotResponse = z.infer<typeof ZodRpcGetSlotResponse>;
export type RpcGetBalanceResponse = z.infer<typeof ZodRpcGetBalanceResponse>;
export type RpcGetTransactionResponse = z.infer<typeof ZodRpcGetTransactionResponse>;
export type RpcGetSignaturesResponse = z.infer<typeof ZodRpcGetSignaturesResponse>;
export type RpcGetBlockResponse = z.infer<typeof ZodRpcGetBlockResponse>;
export type ParsedTransaction = z.infer<typeof ZodParsedTransaction>;
