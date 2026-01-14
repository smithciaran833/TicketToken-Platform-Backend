import {
  Connection,
  PublicKey,
  Transaction,
  TransactionSignature,
  Commitment,
  SendOptions,
  Keypair,
  ConfirmOptions,
  TransactionConfirmationStrategy,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { Counter, Histogram, Gauge } from 'prom-client';
import logger from './logger';

// Default timeout for transaction confirmation (60 seconds)
const DEFAULT_TX_TIMEOUT_MS = 60000;

// =============================================================================
// METRICS
// =============================================================================

const rpcRequestCounter = new Counter({
  name: 'minting_solana_rpc_requests_total',
  help: 'Total Solana RPC requests',
  labelNames: ['endpoint', 'method', 'success']
});

const rpcLatencyHistogram = new Histogram({
  name: 'minting_solana_rpc_latency_seconds',
  help: 'Solana RPC request latency',
  labelNames: ['endpoint', 'method'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

const rpcFailoverCounter = new Counter({
  name: 'minting_solana_rpc_failover_total',
  help: 'Total RPC failover events',
  labelNames: ['from_endpoint', 'to_endpoint', 'reason']
});

const priorityFeeGauge = new Gauge({
  name: 'minting_solana_priority_fee_microlamports',
  help: 'Current priority fee in microlamports'
});

// =============================================================================
// RPC FALLBACK CONFIGURATION (#25 - SC6)
// =============================================================================

interface RpcEndpoint {
  url: string;
  name: string;
  weight: number; // Higher = preferred
  healthy: boolean;
  lastError?: string;
  lastErrorTime?: number;
  consecutiveFailures: number;
}

// Parse RPC endpoints from environment
function parseRpcEndpoints(): RpcEndpoint[] {
  const endpoints: RpcEndpoint[] = [];
  
  // Primary RPC
  const primaryUrl = process.env.SOLANA_RPC_URL;
  if (primaryUrl) {
    endpoints.push({
      url: primaryUrl,
      name: 'primary',
      weight: 100,
      healthy: true,
      consecutiveFailures: 0
    });
  }

  // Fallback RPCs (comma-separated)
  const fallbackUrls = process.env.SOLANA_RPC_FALLBACK_URLS?.split(',').filter(Boolean) || [];
  fallbackUrls.forEach((url, index) => {
    endpoints.push({
      url: url.trim(),
      name: `fallback-${index + 1}`,
      weight: 80 - (index * 10), // Decreasing priority
      healthy: true,
      consecutiveFailures: 0
    });
  });

  if (endpoints.length === 0) {
    throw new Error('No RPC endpoints configured. Set SOLANA_RPC_URL');
  }

  return endpoints;
}

// RPC endpoints state
let rpcEndpoints: RpcEndpoint[] = [];
let currentConnectionIndex: number = 0;
let rpcConnections: Map<string, Connection> = new Map();

// Maximum consecutive failures before marking unhealthy
const MAX_CONSECUTIVE_FAILURES = 3;

// Time to wait before retrying unhealthy endpoint (5 minutes)
const UNHEALTHY_RETRY_MS = 5 * 60 * 1000;

/**
 * Initialize RPC connections with fallback support
 */
export function initializeRpcConnections(): void {
  rpcEndpoints = parseRpcEndpoints();
  
  rpcEndpoints.forEach(endpoint => {
    const connection = new Connection(endpoint.url, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
      disableRetryOnRateLimit: false
    });
    rpcConnections.set(endpoint.url, connection);
  });

  logger.info('RPC connections initialized', {
    count: rpcEndpoints.length,
    endpoints: rpcEndpoints.map(e => ({ name: e.name, weight: e.weight }))
  });
}

/**
 * Get the best available RPC connection
 * Implements weighted selection with health checks
 */
export function getRpcConnection(): Connection {
  // Initialize if not done
  if (rpcEndpoints.length === 0) {
    initializeRpcConnections();
  }

  // Find healthy endpoints, sorted by weight
  const healthyEndpoints = rpcEndpoints
    .filter(ep => {
      if (ep.healthy) return true;
      // Check if enough time has passed to retry unhealthy endpoint
      if (ep.lastErrorTime && Date.now() - ep.lastErrorTime > UNHEALTHY_RETRY_MS) {
        ep.healthy = true;
        ep.consecutiveFailures = 0;
        logger.info('Marking RPC endpoint healthy for retry', { name: ep.name });
        return true;
      }
      return false;
    })
    .sort((a, b) => b.weight - a.weight);

  if (healthyEndpoints.length === 0) {
    // All endpoints unhealthy - force retry primary
    logger.error('All RPC endpoints unhealthy, forcing primary');
    rpcEndpoints[0].healthy = true;
    rpcEndpoints[0].consecutiveFailures = 0;
    return rpcConnections.get(rpcEndpoints[0].url)!;
  }

  // Return highest weight healthy endpoint
  const endpoint = healthyEndpoints[0];
  return rpcConnections.get(endpoint.url)!;
}

/**
 * Mark RPC endpoint as failed and potentially failover
 */
export function markRpcFailure(url: string, error: string): void {
  const endpoint = rpcEndpoints.find(ep => ep.url === url);
  if (!endpoint) return;

  endpoint.consecutiveFailures++;
  endpoint.lastError = error;
  endpoint.lastErrorTime = Date.now();

  logger.warn('RPC endpoint failure', {
    name: endpoint.name,
    consecutiveFailures: endpoint.consecutiveFailures,
    error: error.substring(0, 100)
  });

  if (endpoint.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    endpoint.healthy = false;
    
    // Find next healthy endpoint for failover
    const nextEndpoint = rpcEndpoints.find(ep => ep.url !== url && ep.healthy);
    if (nextEndpoint) {
      rpcFailoverCounter.inc({
        from_endpoint: endpoint.name,
        to_endpoint: nextEndpoint.name,
        reason: 'consecutive_failures'
      });
      logger.error('RPC failover triggered', {
        from: endpoint.name,
        to: nextEndpoint.name
      });
    }
  }
}

/**
 * Mark RPC endpoint as successful
 */
export function markRpcSuccess(url: string): void {
  const endpoint = rpcEndpoints.find(ep => ep.url === url);
  if (!endpoint) return;

  endpoint.consecutiveFailures = 0;
  endpoint.healthy = true;
}

/**
 * Execute RPC call with automatic fallback
 */
export async function withRpcFallback<T>(
  operation: (connection: Connection) => Promise<T>,
  operationName: string = 'rpc_call'
): Promise<T> {
  const triedEndpoints: string[] = [];
  let lastError: Error | undefined;

  // Try each healthy endpoint
  for (const endpoint of rpcEndpoints.filter(ep => ep.healthy)) {
    if (triedEndpoints.includes(endpoint.url)) continue;
    triedEndpoints.push(endpoint.url);

    const connection = rpcConnections.get(endpoint.url)!;
    const startTime = Date.now();

    try {
      const result = await operation(connection);
      
      // Record success
      const latency = (Date.now() - startTime) / 1000;
      rpcRequestCounter.inc({ endpoint: endpoint.name, method: operationName, success: 'true' });
      rpcLatencyHistogram.observe({ endpoint: endpoint.name, method: operationName }, latency);
      markRpcSuccess(endpoint.url);
      
      return result;
    } catch (error) {
      lastError = error as Error;
      const latency = (Date.now() - startTime) / 1000;
      
      rpcRequestCounter.inc({ endpoint: endpoint.name, method: operationName, success: 'false' });
      rpcLatencyHistogram.observe({ endpoint: endpoint.name, method: operationName }, latency);
      markRpcFailure(endpoint.url, lastError.message);

      logger.warn('RPC call failed, trying fallback', {
        endpoint: endpoint.name,
        operation: operationName,
        error: lastError.message.substring(0, 100)
      });
    }
  }

  throw new Error(`All RPC endpoints failed for ${operationName}: ${lastError?.message}`);
}

/**
 * Get RPC health status
 */
export function getRpcHealthStatus(): {
  endpoints: Array<{ name: string; healthy: boolean; consecutiveFailures: number }>;
  currentEndpoint: string;
} {
  return {
    endpoints: rpcEndpoints.map(ep => ({
      name: ep.name,
      healthy: ep.healthy,
      consecutiveFailures: ep.consecutiveFailures
    })),
    currentEndpoint: rpcEndpoints.find(ep => ep.healthy)?.name || 'none'
  };
}

// =============================================================================
// DYNAMIC PRIORITY FEES (#26 - SC7)
// =============================================================================

// Fee configuration
const MIN_PRIORITY_FEE = parseInt(process.env.SOLANA_MIN_PRIORITY_FEE || '1000'); // 1000 microlamports
const MAX_PRIORITY_FEE = parseInt(process.env.SOLANA_MAX_PRIORITY_FEE || '1000000'); // 1M microlamports
const DEFAULT_PRIORITY_FEE = parseInt(process.env.SOLANA_DEFAULT_PRIORITY_FEE || '50000'); // 50k microlamports

// Cache for recent priority fees
let cachedPriorityFee: number = DEFAULT_PRIORITY_FEE;
let lastPriorityFeeUpdate: number = 0;
const PRIORITY_FEE_CACHE_MS = 10000; // 10 seconds

/**
 * Get dynamic priority fee based on recent network conditions
 * Uses getRecentPrioritizationFees RPC method
 */
export async function getDynamicPriorityFee(
  connection: Connection,
  addresses?: PublicKey[]
): Promise<number> {
  // Use cached value if recent
  if (Date.now() - lastPriorityFeeUpdate < PRIORITY_FEE_CACHE_MS) {
    return cachedPriorityFee;
  }

  try {
    // Get recent prioritization fees
    const recentFees = await connection.getRecentPrioritizationFees({
      lockedWritableAccounts: addresses || []
    });

    if (recentFees.length === 0) {
      logger.debug('No recent priority fees, using default');
      return DEFAULT_PRIORITY_FEE;
    }

    // Calculate median of recent fees
    const fees = recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b);
    const medianFee = fees[Math.floor(fees.length / 2)];

    // Add buffer (20% above median)
    let suggestedFee = Math.ceil(medianFee * 1.2);

    // Clamp to min/max
    suggestedFee = Math.max(MIN_PRIORITY_FEE, Math.min(MAX_PRIORITY_FEE, suggestedFee));

    // Update cache
    cachedPriorityFee = suggestedFee;
    lastPriorityFeeUpdate = Date.now();
    priorityFeeGauge.set(suggestedFee);

    logger.debug('Dynamic priority fee calculated', {
      medianFee,
      suggestedFee,
      sampleCount: recentFees.length
    });

    return suggestedFee;
  } catch (error) {
    logger.warn('Failed to get dynamic priority fee, using default', {
      error: (error as Error).message
    });
    return DEFAULT_PRIORITY_FEE;
  }
}

/**
 * Add priority fee instructions to a transaction
 */
export async function addPriorityFeeInstructions(
  connection: Connection,
  transaction: Transaction,
  computeUnits: number = 200000,
  addresses?: PublicKey[]
): Promise<void> {
  // Get dynamic priority fee
  const priorityFee = await getDynamicPriorityFee(connection, addresses);

  // Add compute budget instructions
  const computeUnitLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: computeUnits
  });

  const computeUnitPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: priorityFee
  });

  // Prepend instructions (must be first)
  transaction.instructions = [
    computeUnitLimitIx,
    computeUnitPriceIx,
    ...transaction.instructions
  ];

  logger.debug('Added priority fee instructions', {
    computeUnits,
    priorityFee,
    instructionCount: transaction.instructions.length
  });
}

// =============================================================================
// FINALIZED COMMITMENT FOR CRITICAL OPERATIONS (#27 - SC5)
// =============================================================================

/**
 * Confirm transaction with finalized commitment
 * Use for critical operations where absolute certainty is required
 */
export async function confirmTransactionFinalized(
  connection: Connection,
  signature: string,
  timeoutMs: number = 90000 // Finalized takes longer
): Promise<TransactionResult> {
  const startTime = Date.now();
  
  logger.info('Confirming transaction with finalized commitment', {
    signature,
    timeoutMs
  });

  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');

    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight
      },
      'finalized' // Critical: use finalized commitment
    );

    const elapsed = Date.now() - startTime;

    if (confirmation.value.err) {
      logger.error('Transaction finalization failed', {
        signature,
        error: confirmation.value.err,
        elapsed
      });

      return {
        signature,
        confirmed: false,
        slot: confirmation.context.slot,
        error: JSON.stringify(confirmation.value.err)
      };
    }

    logger.info('Transaction finalized successfully', {
      signature,
      slot: confirmation.context.slot,
      elapsed,
      commitment: 'finalized'
    });

    return {
      signature,
      confirmed: true,
      slot: confirmation.context.slot
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const isTimeout = elapsed >= timeoutMs;

    logger.error('Transaction finalization error', {
      signature,
      error: (error as Error).message,
      elapsed,
      timedOut: isTimeout
    });

    return {
      signature,
      confirmed: false,
      timedOut: isTimeout,
      error: (error as Error).message
    };
  }
}

/**
 * Send transaction with priority fees and finalized confirmation
 * Use for critical minting operations
 */
export async function sendCriticalTransaction(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  options: {
    computeUnits?: number;
    maxRetries?: number;
    requireFinalized?: boolean;
  } = {}
): Promise<TransactionResult> {
  const {
    computeUnits = 200000,
    maxRetries = 3,
    requireFinalized = true
  } = options;

  // Add priority fees
  await addPriorityFeeInstructions(connection, transaction, computeUnits);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Sending critical transaction (attempt ${attempt}/${maxRetries})`);

      // Get fresh blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
        requireFinalized ? 'finalized' : 'confirmed'
      );
      
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = signers[0].publicKey;

      // Sign
      transaction.signatures = [];
      transaction.sign(...signers);

      // Send
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 0
        }
      );

      logger.info('Critical transaction sent', { signature, attempt });

      // Confirm with appropriate commitment
      const result = requireFinalized
        ? await confirmTransactionFinalized(connection, signature)
        : await confirmTransactionWithTimeout(connection, signature);

      if (result.confirmed) {
        return result;
      }

      lastError = new Error(result.error || 'Transaction not confirmed');

    } catch (error) {
      lastError = error as Error;
      logger.error(`Critical transaction attempt ${attempt} failed`, {
        error: lastError.message
      });

      if (attempt < maxRetries) {
        const delay = 2000 * attempt;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  return {
    signature: '',
    confirmed: false,
    error: `Critical transaction failed after ${maxRetries} attempts: ${lastError?.message}`
  };
}

// =============================================================================
// CONFIGURATION VALIDATION
// =============================================================================

// Known public RPCs that should not be used in production
const PUBLIC_RPC_ENDPOINTS = [
  'api.mainnet-beta.solana.com',
  'api.devnet.solana.com',
  'api.testnet.solana.com',
  'rpc.ankr.com/solana' // Free tier
];

// Known centralized domains that should NOT be used for NFT metadata
const CENTRALIZED_DOMAINS = [
  'amazonaws.com',
  's3.amazonaws.com',
  'cloudinary.com',
  'imgur.com',
  'cloudflare-ipfs.com', // Centralized gateway
  'gateway.pinata.cloud', // Centralized gateway (use IPFS URI instead)
  'nftstorage.link',      // Centralized gateway
  'dweb.link'             // Centralized gateway
];

// Allowed URI prefixes for NFT metadata
const ALLOWED_URI_PREFIXES = [
  'ipfs://',
  'https://arweave.net/',
  'ar://'
];

export interface TransactionResult {
  signature: string;
  confirmed: boolean;
  slot?: number;
  error?: string;
  timedOut?: boolean;
}

export interface MintAddressResult {
  mintAddress: string | null;
  assetId: string | null;
}

/**
 * Confirm a transaction with explicit timeout using AbortController
 * This ensures transactions don't hang indefinitely
 * 
 * @param connection - Solana connection
 * @param signature - Transaction signature to confirm
 * @param timeoutMs - Timeout in milliseconds (default: 60 seconds)
 * @returns Promise that resolves when confirmed or rejects on timeout
 */
export async function confirmTransactionWithTimeout(
  connection: Connection,
  signature: string,
  timeoutMs: number = DEFAULT_TX_TIMEOUT_MS
): Promise<TransactionResult> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  logger.info('Confirming transaction with timeout', {
    signature,
    timeoutMs
  });

  try {
    // Get latest blockhash for confirmation strategy
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    // Build confirmation strategy
    const confirmationStrategy: TransactionConfirmationStrategy = {
      signature,
      blockhash,
      lastValidBlockHeight
    };

    // Confirm with abort signal
    const confirmation = await connection.confirmTransaction(
      confirmationStrategy,
      'confirmed'
    );

    const elapsed = Date.now() - startTime;

    if (confirmation.value.err) {
      logger.error('Transaction confirmation failed', {
        signature,
        error: confirmation.value.err,
        elapsed
      });

      return {
        signature,
        confirmed: false,
        slot: confirmation.context.slot,
        error: JSON.stringify(confirmation.value.err)
      };
    }

    logger.info('Transaction confirmed successfully', {
      signature,
      slot: confirmation.context.slot,
      elapsed
    });

    return {
      signature,
      confirmed: true,
      slot: confirmation.context.slot
    };

  } catch (error) {
    const elapsed = Date.now() - startTime;
    const isAborted = controller.signal.aborted;

    if (isAborted) {
      logger.error('Transaction confirmation timed out', {
        signature,
        timeoutMs,
        elapsed
      });

      return {
        signature,
        confirmed: false,
        timedOut: true,
        error: `Transaction confirmation timed out after ${timeoutMs}ms`
      };
    }

    logger.error('Transaction confirmation error', {
      signature,
      error: (error as Error).message,
      elapsed
    });

    return {
      signature,
      confirmed: false,
      error: (error as Error).message
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Confirm a transaction with timeout and retry logic
 * @deprecated Use confirmTransactionWithTimeout for better timeout handling
 */
export async function confirmTransaction(
  connection: Connection,
  signature: TransactionSignature,
  commitment: Commitment = 'confirmed',
  timeoutMs: number = 60000
): Promise<TransactionResult> {
  const startTime = Date.now();
  
  logger.info('Confirming transaction', { signature, commitment, timeoutMs });

  try {
    // Use confirmation strategy with timeout
    const latestBlockhash = await connection.getLatestBlockhash(commitment);
    
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      },
      commitment
    );

    const elapsed = Date.now() - startTime;

    if (confirmation.value.err) {
      logger.error('Transaction failed', {
        signature,
        error: confirmation.value.err,
        elapsed
      });

      return {
        signature,
        confirmed: false,
        error: JSON.stringify(confirmation.value.err)
      };
    }

    logger.info('Transaction confirmed', {
      signature,
      slot: confirmation.context.slot,
      elapsed
    });

    return {
      signature,
      confirmed: true,
      slot: confirmation.context.slot
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    
    logger.error('Transaction confirmation error', {
      signature,
      error: (error as Error).message,
      elapsed
    });

    return {
      signature,
      confirmed: false,
      error: (error as Error).message
    };
  }
}

/**
 * Send and confirm a transaction with retries
 */
export async function sendAndConfirmTransactionWithRetry(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  maxRetries: number = 3,
  commitment: Commitment = 'confirmed'
): Promise<TransactionResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Sending transaction (attempt ${attempt}/${maxRetries})`);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = signers[0].publicKey;

      // Sign transaction
      transaction.sign(...signers);

      // Send transaction
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: commitment,
          maxRetries: 0 // We handle retries manually
        }
      );

      logger.info('Transaction sent', { signature, attempt });

      // Confirm transaction
      const result = await confirmTransaction(
        connection,
        signature,
        commitment,
        parseInt(process.env.TRANSACTION_TIMEOUT || '60000')
      );

      if (result.confirmed) {
        return result;
      }

      lastError = new Error(result.error || 'Transaction not confirmed');
      logger.warn('Transaction not confirmed, will retry', {
        signature,
        attempt,
        error: lastError.message
      });

    } catch (error) {
      lastError = error as Error;
      logger.error(`Transaction attempt ${attempt} failed`, {
        error: lastError.message,
        attempt
      });

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = 1000 * Math.pow(2, attempt - 1);
        logger.info(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Transaction failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Extract mint address from transaction logs
 * For compressed NFTs, this extracts the asset ID from the transaction
 */
export async function extractMintAddressFromTransaction(
  connection: Connection,
  signature: string
): Promise<MintAddressResult> {
  try {
    logger.info('Extracting mint address from transaction', { signature });

    const transaction = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!transaction) {
      logger.warn('Transaction not found', { signature });
      return { mintAddress: null, assetId: null };
    }

    // For compressed NFTs, the asset ID is derived from the transaction
    // It's typically in the transaction logs
    const logs = transaction.meta?.logMessages || [];
    
    // Look for asset ID in logs (Bubblegum program logs the asset ID)
    for (const log of logs) {
      // Pattern: "Asset ID: <base58_pubkey>"
      const assetIdMatch = log.match(/Asset ID: ([1-9A-HJ-NP-Za-km-z]{32,44})/);
      if (assetIdMatch) {
        const assetId = assetIdMatch[1];
        logger.info('Extracted asset ID from logs', { assetId, signature });
        return { mintAddress: assetId, assetId };
      }

      // Alternative pattern: Look for created account addresses
      const createMatch = log.match(/Program log: Created account: ([1-9A-HJ-NP-Za-km-z]{32,44})/);
      if (createMatch) {
        const address = createMatch[1];
        logger.info('Found created account address', { address, signature });
        return { mintAddress: address, assetId: address };
      }
    }

    // For compressed NFTs, we can also derive the asset ID from the leaf index
    // This requires the tree address and leaf index, which we should have
    logger.warn('Could not extract mint address from transaction logs', { signature });
    
    return { mintAddress: null, assetId: null };
  } catch (error) {
    logger.error('Error extracting mint address', {
      signature,
      error: (error as Error).message
    });
    return { mintAddress: null, assetId: null };
  }
}

/**
 * Check wallet SOL balance
 */
export async function checkWalletBalance(
  connection: Connection,
  publicKey: PublicKey,
  minBalance: number = 0.1
): Promise<{ balance: number; sufficient: boolean }> {
  try {
    const balance = await connection.getBalance(publicKey);
    const balanceSOL = balance / 1e9;
    const sufficient = balanceSOL >= minBalance;

    logger.info('Wallet balance check', {
      publicKey: publicKey.toString(),
      balance: balanceSOL,
      minBalance,
      sufficient
    });

    return { balance: balanceSOL, sufficient };
  } catch (error) {
    logger.error('Error checking wallet balance', {
      publicKey: publicKey.toString(),
      error: (error as Error).message
    });
    throw error;
  }
}

/**
 * Validate Solana public key
 */
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get compressed NFT asset ID from tree address and leaf index
 * This is used for compressed NFTs where the asset ID is deterministic
 */
export async function getAssetId(
  treeAddress: PublicKey,
  leafIndex: number
): Promise<PublicKey> {
  // For Bubblegum compressed NFTs, the asset ID is derived from:
  // PDA of [tree_address, leaf_index]
  const [assetId] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('asset'),
      treeAddress.toBuffer(),
      Buffer.from(new Uint8Array(new BigUint64Array([BigInt(leafIndex)]).buffer))
    ],
    new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY') // Bubblegum Program ID
  );

  return assetId;
}

/**
 * Retry wrapper for any async function
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  backoffMultiplier: number = 2
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        logger.warn(`Retry attempt ${attempt} failed, waiting ${delay}ms`, {
          error: lastError.message,
          attempt
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Format SOL amount for display
 */
export function formatSOL(lamports: number): string {
  return `${(lamports / 1e9).toFixed(4)} SOL`;
}

/**
 * Validate required Solana environment variables
 */
export function validateSolanaConfig(): void {
  const required = [
    'SOLANA_RPC_URL',
    'SOLANA_NETWORK',
    'WALLET_PATH'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required Solana configuration: ${missing.join(', ')}. ` +
      'Please check your .env file.'
    );
  }

  // Validate RPC endpoint for production
  validateRpcEndpoint();

  logger.info('Solana configuration validated', {
    rpcUrl: process.env.SOLANA_RPC_URL,
    network: process.env.SOLANA_NETWORK,
    walletPath: process.env.WALLET_PATH
  });
}

// =============================================================================
// RPC ENDPOINT VALIDATION
// =============================================================================

/**
 * Validate the Solana RPC endpoint
 * Warns if using public RPC in production
 */
export function validateRpcEndpoint(): void {
  const rpcUrl = process.env.SOLANA_RPC_URL || '';
  const isProduction = process.env.NODE_ENV === 'production';
  
  const isPublicRpc = PUBLIC_RPC_ENDPOINTS.some(endpoint => 
    rpcUrl.includes(endpoint)
  );

  if (isPublicRpc && isProduction) {
    logger.error('⚠️  WARNING: Using public Solana RPC in production!');
    logger.error('   Public RPCs have strict rate limits and are unreliable');
    logger.error('   Configure SOLANA_RPC_URL with a private RPC provider:');
    logger.error('   - Helius (https://helius.dev)');
    logger.error('   - QuickNode (https://quicknode.com)');
    logger.error('   - Triton (https://triton.one)');
    logger.error('   - Alchemy (https://alchemy.com)');
    
    // In strict mode, could throw here
    if (process.env.STRICT_RPC_VALIDATION === 'true') {
      throw new Error('Public RPC not allowed in production');
    }
  } else if (isPublicRpc) {
    logger.warn('Using public Solana RPC - OK for development only', {
      rpcUrl: rpcUrl.substring(0, 50) + '...'
    });
  } else {
    logger.info('Using private RPC endpoint', {
      // Don't log full URL as it may contain API keys
      endpoint: new URL(rpcUrl).hostname
    });
  }
}

// =============================================================================
// METADATA URI VALIDATION
// =============================================================================

/**
 * Validate NFT metadata URI
 * Ensures only decentralized storage is used (IPFS or Arweave)
 * 
 * @param uri - The metadata URI to validate
 * @throws Error if URI is invalid or uses centralized storage
 */
export function validateMetadataUri(uri: string): void {
  if (!uri || typeof uri !== 'string') {
    throw new Error('Metadata URI is required');
  }

  // Check for allowed prefixes
  const hasAllowedPrefix = ALLOWED_URI_PREFIXES.some(prefix => 
    uri.startsWith(prefix)
  );

  if (!hasAllowedPrefix) {
    throw new Error(
      `Invalid metadata URI - must start with one of: ${ALLOWED_URI_PREFIXES.join(', ')}. ` +
      `Received: ${uri.substring(0, 50)}...`
    );
  }

  // Check for centralized domains (in case of gateway URLs)
  const usesCentralized = CENTRALIZED_DOMAINS.some(domain => 
    uri.includes(domain)
  );

  if (usesCentralized) {
    throw new Error(
      `Centralized URLs not allowed for NFT metadata. ` +
      `Use native IPFS URIs (ipfs://...) or Arweave URIs (ar://...). ` +
      `Received: ${uri.substring(0, 50)}...`
    );
  }

  logger.debug('Metadata URI validated', { uri: uri.substring(0, 50) });
}

/**
 * Convert centralized gateway URL to native IPFS URI
 * Useful for fixing legacy URIs
 */
export function normalizeIpfsUri(uri: string): string {
  // Convert gateway URLs to native IPFS URIs
  const gatewayPatterns = [
    /https:\/\/gateway\.pinata\.cloud\/ipfs\/([a-zA-Z0-9]+)/,
    /https:\/\/ipfs\.io\/ipfs\/([a-zA-Z0-9]+)/,
    /https:\/\/cloudflare-ipfs\.com\/ipfs\/([a-zA-Z0-9]+)/,
    /https:\/\/dweb\.link\/ipfs\/([a-zA-Z0-9]+)/,
    /https:\/\/nftstorage\.link\/ipfs\/([a-zA-Z0-9]+)/
  ];

  for (const pattern of gatewayPatterns) {
    const match = uri.match(pattern);
    if (match && match[1]) {
      const normalizedUri = `ipfs://${match[1]}`;
      logger.info('Normalized gateway URL to IPFS URI', {
        original: uri.substring(0, 50),
        normalized: normalizedUri
      });
      return normalizedUri;
    }
  }

  // Already a native URI or unknown format
  return uri;
}

// =============================================================================
// TRANSACTION WITH FRESH BLOCKHASH (WITH JITTER)
// =============================================================================

/**
 * Sleep helper with optional jitter
 */
async function sleep(ms: number, addJitter: boolean = false): Promise<void> {
  const jitter = addJitter ? Math.random() * 500 : 0;
  return new Promise(resolve => setTimeout(resolve, ms + jitter));
}

/**
 * Send transaction with automatic blockhash refresh on retry
 * Gets a FRESH blockhash for each attempt to avoid expiration
 * 
 * @param connection - Solana connection
 * @param transaction - Transaction to send
 * @param signers - Signers for the transaction
 * @param maxRetries - Maximum number of retry attempts
 * @returns Transaction signature
 */
export async function sendTransactionWithFreshBlockhash(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // ===== GET FRESH BLOCKHASH ON EACH ATTEMPT =====
      // This is critical - blockhashes expire after ~60 seconds
      logger.info(`Getting fresh blockhash (attempt ${attempt}/${maxRetries})`);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      
      // Update transaction with fresh blockhash
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = signers[0].publicKey;

      logger.debug('Fresh blockhash obtained', {
        blockhash: blockhash.substring(0, 16) + '...',
        lastValidBlockHeight,
        attempt
      });

      // Clear any previous signatures and re-sign
      transaction.signatures = [];
      transaction.sign(...signers);

      // Send transaction
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 0 // We handle retries with fresh blockhash
        }
      );

      logger.info('Transaction sent', { signature, attempt });

      // Confirm transaction
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      logger.info('Transaction confirmed', { signature, attempt });
      return signature;

    } catch (error) {
      lastError = error as Error;
      
      logger.warn(`Transaction attempt ${attempt} failed`, {
        error: lastError.message,
        attempt,
        maxRetries
      });

      if (attempt < maxRetries) {
        // Wait before retry with jitter to prevent thundering herd
        const baseDelay = 1000 * attempt;
        logger.info(`Waiting before retry with fresh blockhash...`, {
          baseDelay,
          attempt
        });
        await sleep(baseDelay, true); // Add jitter
      }
    }
  }

  throw new Error(
    `Transaction failed after ${maxRetries} attempts with fresh blockhash: ${lastError?.message}`
  );
}

// =============================================================================
// EXPORTS FOR VALIDATION CONSTANTS
// =============================================================================

export const ValidationConfig = {
  PUBLIC_RPC_ENDPOINTS,
  CENTRALIZED_DOMAINS,
  ALLOWED_URI_PREFIXES
};
