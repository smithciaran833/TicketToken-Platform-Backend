/**
 * Validation Schemas for Blockchain Service
 * 
 * AUDIT FIXES:
 * - #4: Response schemas for all routes
 * - #5: additionalProperties: false on all request schemas
 * - #47: Bulk operation validation with maxItems
 * 
 * Uses JSON Schema format compatible with Fastify
 */

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

/**
 * Solana address validation (base58 encoded, 32-44 characters)
 */
export const SolanaAddressSchema = {
  type: 'string',
  minLength: 32,
  maxLength: 44,
  pattern: '^[1-9A-HJ-NP-Za-km-z]{32,44}$',
  description: 'Base58 encoded Solana address'
};

/**
 * Solana transaction signature validation
 */
export const TransactionSignatureSchema = {
  type: 'string',
  minLength: 64,
  maxLength: 128,
  pattern: '^[1-9A-HJ-NP-Za-km-z]{64,128}$',
  description: 'Base58 encoded transaction signature'
};

/**
 * UUID validation
 */
export const UUIDSchema = {
  type: 'string',
  format: 'uuid',
  description: 'UUID v4 format'
};

/**
 * Tenant ID validation
 */
export const TenantIdSchema = {
  type: 'string',
  format: 'uuid',
  description: 'Tenant UUID'
};

// =============================================================================
// ERROR RESPONSE SCHEMAS (RFC 7807)
// =============================================================================

/**
 * RFC 7807 Problem Details response schema
 */
export const ErrorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'status', 'detail'],
  properties: {
    type: { type: 'string', description: 'Error type URI' },
    title: { type: 'string', description: 'Error title' },
    status: { type: 'integer', description: 'HTTP status code' },
    detail: { type: 'string', description: 'Error detail message' },
    code: { type: 'string', description: 'Application error code' },
    instance: { type: 'string', description: 'Request instance' },
    timestamp: { type: 'string', format: 'date-time' },
    traceId: { type: 'string', description: 'Trace/correlation ID' },
    validationErrors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          field: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  }
};

/**
 * Simple error response for backwards compatibility
 */
export const SimpleErrorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: { type: 'string' },
    message: { type: 'string' }
  }
};

// =============================================================================
// BLOCKCHAIN ROUTES SCHEMAS
// =============================================================================

/**
 * Address param schema
 */
export const AddressParamSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['address'],
  properties: {
    address: SolanaAddressSchema
  }
};

/**
 * Signature param schema
 */
export const SignatureParamSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['signature'],
  properties: {
    signature: TransactionSignatureSchema
  }
};

/**
 * Mint address param schema
 */
export const MintParamSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['mint'],
  properties: {
    mint: SolanaAddressSchema
  }
};

/**
 * Pagination query schema
 */
export const PaginationQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { 
      type: 'integer', 
      minimum: 1, 
      maximum: 100, 
      default: 10,
      description: 'Maximum number of items to return'
    },
    offset: { 
      type: 'integer', 
      minimum: 0, 
      default: 0,
      description: 'Number of items to skip'
    }
  }
};

/**
 * Balance response schema
 */
export const BalanceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['address', 'balance', 'sol'],
  properties: {
    address: SolanaAddressSchema,
    balance: { type: 'integer', description: 'Balance in lamports' },
    sol: { type: 'number', description: 'Balance in SOL' }
  }
};

/**
 * Token accounts response schema
 */
export const TokenAccountsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['address', 'count', 'tokens'],
  properties: {
    address: SolanaAddressSchema,
    count: { type: 'integer' },
    tokens: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          mint: { type: 'string' },
          owner: { type: 'string' },
          amount: { type: 'string' },
          decimals: { type: 'integer' }
        }
      }
    }
  }
};

/**
 * NFTs response schema
 */
export const NFTsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['address', 'count', 'nfts'],
  properties: {
    address: SolanaAddressSchema,
    count: { type: 'integer' },
    nfts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          mint: { type: 'string' },
          name: { type: 'string' },
          symbol: { type: 'string' },
          uri: { type: 'string' }
        }
      }
    }
  }
};

/**
 * Transaction response schema
 */
export const TransactionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['signature'],
  properties: {
    signature: TransactionSignatureSchema,
    transaction: {
      type: 'object',
      additionalProperties: true,
      description: 'Full transaction details'
    }
  }
};

/**
 * Transactions list response schema
 */
export const TransactionsListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['address', 'count', 'transactions'],
  properties: {
    address: SolanaAddressSchema,
    count: { type: 'integer' },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          signature: { type: 'string' },
          slot: { type: 'integer' },
          blockTime: { type: 'integer', nullable: true }
        }
      }
    }
  }
};

/**
 * Confirm transaction request schema
 * AUDIT FIX #5: additionalProperties: false
 */
export const ConfirmTransactionRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['signature'],
  properties: {
    signature: TransactionSignatureSchema,
    commitment: {
      type: 'string',
      enum: ['processed', 'confirmed', 'finalized'],
      default: 'confirmed',
      description: 'Confirmation commitment level'
    },
    timeout: {
      type: 'integer',
      minimum: 1000,
      maximum: 120000,
      default: 60000,
      description: 'Timeout in milliseconds'
    }
  }
};

/**
 * Confirm transaction response schema
 */
export const ConfirmTransactionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmed', 'signature'],
  properties: {
    confirmed: { type: 'boolean' },
    signature: TransactionSignatureSchema,
    slot: { type: 'integer', nullable: true },
    confirmations: { type: 'integer', nullable: true },
    err: { type: 'object', nullable: true, additionalProperties: true }
  }
};

/**
 * Account info response schema
 */
export const AccountInfoResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['address', 'lamports', 'owner', 'executable', 'rentEpoch'],
  properties: {
    address: SolanaAddressSchema,
    lamports: { type: 'integer' },
    owner: { type: 'string' },
    executable: { type: 'boolean' },
    rentEpoch: { type: 'integer' }
  }
};

/**
 * Token supply response schema
 */
export const TokenSupplyResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['mint', 'amount', 'decimals'],
  properties: {
    mint: SolanaAddressSchema,
    amount: { type: 'string' },
    decimals: { type: 'integer' },
    uiAmount: { type: 'number', nullable: true }
  }
};

/**
 * Current slot response schema
 */
export const SlotResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['slot', 'timestamp'],
  properties: {
    slot: { type: 'integer' },
    timestamp: { type: 'integer' }
  }
};

/**
 * Blockhash response schema
 */
export const BlockhashResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['blockhash', 'lastValidBlockHeight'],
  properties: {
    blockhash: { type: 'string' },
    lastValidBlockHeight: { type: 'integer' }
  }
};

// =============================================================================
// INTERNAL MINT ROUTES SCHEMAS
// =============================================================================

/**
 * Mint tickets request schema
 * AUDIT FIX #5: additionalProperties: false
 * AUDIT FIX #47: maxItems on array for bulk validation
 */
export const MintTicketsRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ticketIds', 'eventId', 'userId'],
  properties: {
    ticketIds: {
      type: 'array',
      minItems: 1,
      maxItems: 100, // AUDIT FIX #47: Limit bulk operations
      items: UUIDSchema,
      description: 'Array of ticket IDs to mint (max 100)'
    },
    eventId: UUIDSchema,
    userId: UUIDSchema,
    tenantId: TenantIdSchema,
    queue: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      default: 'ticket.mint',
      description: 'Queue name for routing'
    },
    metadata: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', maxLength: 100 },
        symbol: { type: 'string', maxLength: 10 },
        description: { type: 'string', maxLength: 1000 },
        image: { type: 'string', format: 'uri', maxLength: 500 },
        eventName: { type: 'string', maxLength: 200 },
        eventDate: { type: 'string', format: 'date-time' },
        venue: { type: 'string', maxLength: 200 },
        tier: { type: 'string', maxLength: 50 },
        seatNumber: { type: 'string', maxLength: 20 }
      }
    }
  }
};

/**
 * Mint tickets response schema
 */
export const MintTicketsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'jobIds'],
  properties: {
    success: { type: 'boolean' },
    jobIds: {
      type: 'array',
      items: { type: 'string' }
    },
    message: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ticketId: { type: 'string' },
          error: { type: 'string' }
        }
      }
    }
  }
};

/**
 * Single mint request schema
 * AUDIT FIX #5: additionalProperties: false
 */
export const SingleMintRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ticketId', 'eventId', 'userId'],
  properties: {
    ticketId: UUIDSchema,
    eventId: UUIDSchema,
    userId: UUIDSchema,
    tenantId: TenantIdSchema,
    metadata: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', maxLength: 100 },
        symbol: { type: 'string', maxLength: 10 },
        description: { type: 'string', maxLength: 1000 },
        image: { type: 'string', format: 'uri', maxLength: 500 },
        eventName: { type: 'string', maxLength: 200 },
        eventDate: { type: 'string', format: 'date-time' },
        venue: { type: 'string', maxLength: 200 },
        tier: { type: 'string', maxLength: 50 },
        seatNumber: { type: 'string', maxLength: 20 }
      }
    }
  }
};

/**
 * Mint status response schema
 */
export const MintStatusResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ticketId', 'status'],
  properties: {
    ticketId: UUIDSchema,
    tenantId: TenantIdSchema,
    status: {
      type: 'string',
      enum: ['pending', 'minting', 'completed', 'failed'],
      description: 'Current mint status'
    },
    transactionSignature: TransactionSignatureSchema,
    mintAddress: SolanaAddressSchema,
    metadataUri: { type: 'string', format: 'uri' },
    slot: { type: 'integer' },
    error: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

// =============================================================================
// HEALTH ROUTES SCHEMAS
// =============================================================================

/**
 * Health check response schema
 */
export const HealthResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: {
      type: 'string',
      enum: ['healthy', 'degraded', 'unhealthy']
    },
    version: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
    uptime: { type: 'number' },
    checks: {
      type: 'object',
      additionalProperties: false,
      properties: {
        database: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['up', 'down'] },
            latencyMs: { type: 'number' }
          }
        },
        redis: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['up', 'down'] },
            latencyMs: { type: 'number' }
          }
        },
        solana: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['up', 'down'] },
            latencyMs: { type: 'number' },
            slot: { type: 'integer' }
          }
        }
      }
    }
  }
};

/**
 * Liveness response schema (minimal)
 */
export const LivenessResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['ok'] }
  }
};

/**
 * Readiness response schema
 */
export const ReadinessResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'ready'],
  properties: {
    status: { type: 'string', enum: ['ok', 'not_ready'] },
    ready: { type: 'boolean' },
    dependencies: {
      type: 'object',
      additionalProperties: false,
      properties: {
        database: { type: 'boolean' },
        redis: { type: 'boolean' },
        solana: { type: 'boolean' }
      }
    }
  }
};

// =============================================================================
// ROUTE SCHEMA COLLECTIONS
// =============================================================================

/**
 * Standard response codes with schemas
 */
export const StandardResponses = {
  400: {
    description: 'Bad Request - Invalid input',
    schema: ErrorResponseSchema
  },
  401: {
    description: 'Unauthorized - Authentication required',
    schema: ErrorResponseSchema
  },
  403: {
    description: 'Forbidden - Insufficient permissions',
    schema: ErrorResponseSchema
  },
  404: {
    description: 'Not Found - Resource does not exist',
    schema: ErrorResponseSchema
  },
  409: {
    description: 'Conflict - Resource already exists',
    schema: ErrorResponseSchema
  },
  429: {
    description: 'Too Many Requests - Rate limit exceeded',
    schema: ErrorResponseSchema
  },
  500: {
    description: 'Internal Server Error',
    schema: ErrorResponseSchema
  },
  503: {
    description: 'Service Unavailable',
    schema: ErrorResponseSchema
  }
};

/**
 * Helper to build route schema with standard responses
 */
export function buildRouteSchema(config: {
  summary: string;
  description?: string;
  tags?: string[];
  params?: object;
  querystring?: object;
  body?: object;
  response: {
    [statusCode: number]: { description: string; schema: object };
  };
}): object {
  const standardErrorCodes = [400, 401, 403, 404, 500];
  const errorResponses: Record<number, object> = {};
  
  for (const code of standardErrorCodes) {
    if (!config.response[code]) {
      const standard = StandardResponses[code as keyof typeof StandardResponses];
      if (standard) {
        errorResponses[code] = {
          description: standard.description,
          ...standard.schema
        };
      }
    }
  }

  const response: Record<number, object> = {};
  for (const [code, value] of Object.entries(config.response)) {
    response[Number(code)] = {
      description: value.description,
      ...value.schema
    };
  }

  return {
    schema: {
      summary: config.summary,
      description: config.description,
      tags: config.tags || ['blockchain'],
      ...(config.params && { params: config.params }),
      ...(config.querystring && { querystring: config.querystring }),
      ...(config.body && { body: config.body }),
      response: {
        ...response,
        ...errorResponses
      }
    }
  };
}

export default {
  // Common
  SolanaAddressSchema,
  TransactionSignatureSchema,
  UUIDSchema,
  TenantIdSchema,
  
  // Errors
  ErrorResponseSchema,
  SimpleErrorResponseSchema,
  StandardResponses,
  
  // Blockchain routes
  AddressParamSchema,
  SignatureParamSchema,
  MintParamSchema,
  PaginationQuerySchema,
  BalanceResponseSchema,
  TokenAccountsResponseSchema,
  NFTsResponseSchema,
  TransactionResponseSchema,
  TransactionsListResponseSchema,
  ConfirmTransactionRequestSchema,
  ConfirmTransactionResponseSchema,
  AccountInfoResponseSchema,
  TokenSupplyResponseSchema,
  SlotResponseSchema,
  BlockhashResponseSchema,
  
  // Internal mint routes
  MintTicketsRequestSchema,
  MintTicketsResponseSchema,
  SingleMintRequestSchema,
  MintStatusResponseSchema,
  
  // Health routes
  HealthResponseSchema,
  LivenessResponseSchema,
  ReadinessResponseSchema,
  
  // Helper
  buildRouteSchema
};
