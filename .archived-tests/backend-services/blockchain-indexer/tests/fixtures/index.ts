/**
 * Test Fixtures for Blockchain Indexer
 * 
 * AUDIT FIX: TST-7 - Test fixtures for sample data
 * 
 * Provides reusable test data for unit and integration tests.
 */

import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// CONSTANTS
// =============================================================================

export const TEST_TENANT_ID = '550e8400-e29b-41d4-a716-446655440001';
export const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440002';
export const TEST_SERVICE_ID = 'test-service';

// Valid Base58 addresses for testing
export const VALID_WALLET_ADDRESS = 'HN7cABqLq46Es1jh92dQQisAi2Kx7QJw8NprjHDqCNKp';
export const VALID_TOKEN_ADDRESS = '7nYvNBsQh7VoBaQMr5deDfVNuEDfM6Rrf3PwPEzM7sGZ';
export const VALID_SIGNATURE = '5abc123def456789012345678901234567890123456789012345678901234567890123456789012345678';

// =============================================================================
// JWT FIXTURES
// =============================================================================

export const validJwtPayload = {
  userId: TEST_USER_ID,
  tenant_id: TEST_TENANT_ID,
  iss: 'tickettoken-auth-service',
  aud: 'blockchain-indexer',
  exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  iat: Math.floor(Date.now() / 1000)
};

export const serviceJwtPayload = {
  serviceId: TEST_SERVICE_ID,
  serviceName: 'minting-service',
  tenant_id: TEST_TENANT_ID,
  iss: 'tickettoken-auth-service',
  aud: 'blockchain-indexer',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000)
};

export const expiredJwtPayload = {
  userId: TEST_USER_ID,
  tenant_id: TEST_TENANT_ID,
  iss: 'tickettoken-auth-service',
  aud: 'blockchain-indexer',
  exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
  iat: Math.floor(Date.now() / 1000) - 7200
};

// =============================================================================
// TRANSACTION FIXTURES
// =============================================================================

export function createTransactionFixture(overrides: Partial<any> = {}) {
  return {
    id: uuidv4(),
    signature: `${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`.padEnd(88, 'x'),
    slot: 123456789,
    block_time: new Date().toISOString(),
    instruction_type: 'transfer',
    fee: 5000,
    status: 'confirmed',
    processed_at: new Date().toISOString(),
    tenant_id: TEST_TENANT_ID,
    ...overrides
  };
}

export const sampleTransaction = createTransactionFixture({
  signature: VALID_SIGNATURE,
  instruction_type: 'mint_nft'
});

export const sampleTransactions = [
  createTransactionFixture({ instruction_type: 'mint_nft' }),
  createTransactionFixture({ instruction_type: 'transfer' }),
  createTransactionFixture({ instruction_type: 'burn' })
];

// =============================================================================
// WALLET ACTIVITY FIXTURES
// =============================================================================

export function createWalletActivityFixture(overrides: Partial<any> = {}) {
  return {
    _id: uuidv4(),
    walletAddress: VALID_WALLET_ADDRESS,
    activityType: 'transfer',
    assetId: VALID_TOKEN_ADDRESS,
    amount: 1,
    timestamp: new Date(),
    signature: createTransactionFixture().signature,
    from: VALID_WALLET_ADDRESS,
    to: 'J9rXz8hnPxjZvNqRhJ7Pz4qbXgLr2vCMw5J9jYqXnYpK',
    tenant_id: TEST_TENANT_ID,
    ...overrides
  };
}

export const sampleWalletActivity = createWalletActivityFixture();

export const sampleWalletActivities = [
  createWalletActivityFixture({ activityType: 'mint' }),
  createWalletActivityFixture({ activityType: 'transfer' }),
  createWalletActivityFixture({ activityType: 'transfer' }),
  createWalletActivityFixture({ activityType: 'burn' })
];

// =============================================================================
// MARKETPLACE EVENT FIXTURES
// =============================================================================

export function createMarketplaceEventFixture(overrides: Partial<any> = {}) {
  return {
    _id: uuidv4(),
    marketplace: 'magic-eden',
    eventType: 'listing',
    price: '1.5',
    currency: 'SOL',
    seller: VALID_WALLET_ADDRESS,
    buyer: null,
    assetId: VALID_TOKEN_ADDRESS,
    signature: createTransactionFixture().signature,
    timestamp: new Date(),
    tenant_id: TEST_TENANT_ID,
    ...overrides
  };
}

export const sampleMarketplaceEvent = createMarketplaceEventFixture();

export const sampleMarketplaceEvents = [
  createMarketplaceEventFixture({ eventType: 'listing', price: '2.0' }),
  createMarketplaceEventFixture({ eventType: 'sale', price: '1.8', buyer: 'BuyerAddress123...' }),
  createMarketplaceEventFixture({ eventType: 'delisting' }),
  createMarketplaceEventFixture({ marketplace: 'tensor', eventType: 'bid', price: '1.5' })
];

// =============================================================================
// DISCREPANCY FIXTURES
// =============================================================================

export function createDiscrepancyFixture(overrides: Partial<any> = {}) {
  return {
    id: uuidv4(),
    assetId: VALID_TOKEN_ADDRESS,
    discrepancyType: 'owner_mismatch',
    onChainOwner: VALID_WALLET_ADDRESS,
    databaseOwner: 'J9rXz8hnPxjZvNqRhJ7Pz4qbXgLr2vCMw5J9jYqXnYpK',
    resolved: false,
    resolvedAt: null,
    resolution: null,
    detectedAt: new Date().toISOString(),
    tenant_id: TEST_TENANT_ID,
    ...overrides
  };
}

export const sampleDiscrepancy = createDiscrepancyFixture();

export const sampleDiscrepancies = [
  createDiscrepancyFixture({ discrepancyType: 'owner_mismatch' }),
  createDiscrepancyFixture({ discrepancyType: 'missing_on_chain', resolved: true, resolution: 'burned' }),
  createDiscrepancyFixture({ discrepancyType: 'missing_in_db' })
];

// =============================================================================
// INDEXER STATE FIXTURES
// =============================================================================

export const sampleIndexerState = {
  id: 1,
  last_processed_slot: 123456789,
  last_processed_signature: VALID_SIGNATURE,
  indexer_version: '1.0.0',
  is_running: true,
  started_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// =============================================================================
// MONGODB DOCUMENT FIXTURES
// =============================================================================

export const sampleBlockchainTransaction = {
  _id: uuidv4(),
  signature: VALID_SIGNATURE,
  slot: 123456789,
  blockTime: 1704153600,
  meta: {
    fee: 5000,
    preBalances: [1000000000, 0],
    postBalances: [999995000, 5000],
    err: null
  },
  transaction: {
    message: {
      accountKeys: [VALID_WALLET_ADDRESS, VALID_TOKEN_ADDRESS],
      instructions: []
    },
    signatures: [VALID_SIGNATURE]
  },
  parsedInstructions: [
    {
      programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      type: 'transfer',
      data: {}
    }
  ],
  tenant_id: TEST_TENANT_ID,
  processed_at: new Date()
};

// =============================================================================
// ERROR FIXTURES
// =============================================================================

export const sampleValidationError = {
  type: 'https://api.tickettoken.com/errors/VALIDATION_ERROR',
  title: 'Validation Error',
  status: 400,
  detail: 'Invalid signature format',
  instance: '/api/v1/transactions/invalid',
  timestamp: new Date().toISOString()
};

export const sampleAuthError = {
  type: 'https://api.tickettoken.com/errors/AUTHENTICATION_REQUIRED',
  title: 'Authentication Required',
  status: 401,
  detail: 'Missing or invalid authentication token',
  instance: '/api/v1/transactions',
  timestamp: new Date().toISOString()
};

export const sampleNotFoundError = {
  type: 'https://api.tickettoken.com/errors/NOT_FOUND',
  title: 'Not Found',
  status: 404,
  detail: 'Transaction not found',
  instance: '/api/v1/transactions/' + VALID_SIGNATURE,
  timestamp: new Date().toISOString()
};

// =============================================================================
// REQUEST FIXTURES
// =============================================================================

export const sampleQueryParams = {
  limit: 50,
  offset: 0,
  activityType: 'all'
};

export const samplePaginationResponse = {
  total: 150,
  limit: 50,
  offset: 0,
  hasMore: true
};

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create multiple transaction fixtures
 */
export function createTransactions(count: number, overrides: Partial<any> = {}) {
  return Array.from({ length: count }, () => createTransactionFixture(overrides));
}

/**
 * Create multiple wallet activities
 */
export function createWalletActivities(count: number, overrides: Partial<any> = {}) {
  return Array.from({ length: count }, () => createWalletActivityFixture(overrides));
}

/**
 * Create multiple marketplace events
 */
export function createMarketplaceEvents(count: number, overrides: Partial<any> = {}) {
  return Array.from({ length: count }, () => createMarketplaceEventFixture(overrides));
}

/**
 * Create a test request context
 */
export function createRequestContext(overrides: Partial<any> = {}) {
  return {
    requestId: uuidv4(),
    correlationId: uuidv4(),
    user: {
      userId: TEST_USER_ID,
      tenant_id: TEST_TENANT_ID
    },
    tenantId: TEST_TENANT_ID,
    ...overrides
  };
}
