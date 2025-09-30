import { logger } from './logger';

// Mock Solana connection configuration
export interface SolanaConfig {
  endpoint: string;
  commitment: 'processed' | 'confirmed' | 'finalized';
}

// Get Solana configuration
export const getSolanaConfig = (): SolanaConfig => {
  return {
    endpoint: process.env.SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com',
    commitment: 'confirmed'
  };
};

// Confirm transaction on chain
export const confirmTransaction = async (signature: string, maxRetries: number = 3): Promise<boolean> => {
  logger.info(`Confirming transaction ${signature}`);
  
  let retries = 0;
  while (retries < maxRetries) {
    try {
      // In production, this would use @solana/web3.js to check transaction status
      // For now, simulate confirmation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate 90% success rate
      if (Math.random() > 0.1) {
        logger.info(`Transaction ${signature} confirmed`);
        return true;
      }
      
      retries++;
    } catch (error) {
      logger.error(`Error confirming transaction ${signature}:`, error);
      retries++;
    }
  }
  
  return false;
};

// Get current block height
export const getBlockHeight = async (): Promise<number> => {
  try {
    // In production, would fetch from Solana RPC
    // For now, return mock block height
    return Math.floor(Date.now() / 1000);
  } catch (error) {
    logger.error('Error getting block height:', error);
    return 0;
  }
};

// Calculate transaction fee
export const estimateTransactionFee = async (programId?: string): Promise<number> => {
  try {
    // Base fee in lamports (0.000005 SOL)
    const baseFee = 5000;
    
    // Additional fee for program execution
    const programFee = programId ? 5000 : 0;
    
    return baseFee + programFee;
  } catch (error) {
    logger.error('Error estimating transaction fee:', error);
    return 10000; // Default to 0.00001 SOL
  }
};

// Parse transaction error
export const parseTransactionError = (error: any): string => {
  if (!error) return 'Unknown transaction error';
  
  // Common Solana errors
  if (error.message?.includes('insufficient funds')) {
    return 'Insufficient funds for transaction';
  }
  
  if (error.message?.includes('account not found')) {
    return 'Account not found on chain';
  }
  
  if (error.message?.includes('signature verification failed')) {
    return 'Invalid transaction signature';
  }
  
  return error.message || 'Transaction failed';
};
