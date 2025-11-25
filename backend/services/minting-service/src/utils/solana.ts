import {
  Connection,
  PublicKey,
  Transaction,
  TransactionSignature,
  Commitment,
  SendOptions,
  Keypair,
  ConfirmOptions
} from '@solana/web3.js';
import logger from './logger';

export interface TransactionResult {
  signature: string;
  confirmed: boolean;
  slot?: number;
  error?: string;
}

export interface MintAddressResult {
  mintAddress: string | null;
  assetId: string | null;
}

/**
 * Confirm a transaction with timeout and retry logic
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

  logger.info('Solana configuration validated', {
    rpcUrl: process.env.SOLANA_RPC_URL,
    network: process.env.SOLANA_NETWORK,
    walletPath: process.env.WALLET_PATH
  });
}
