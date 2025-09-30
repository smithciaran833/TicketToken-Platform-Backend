import { additionalServiceUrls } from '../config/service-urls';
import { logger } from '../utils/logger';
import { 
  isValidSolanaAddress, 
  formatWalletAddress,
  verifyWalletOwnership 
} from '../utils/wallet-helper';
import { WalletInfo, WalletBalance, WalletVerification } from '../types/wallet.types';
import { config } from '../config';

class WalletServiceClass {
  async getWalletInfo(walletAddress: string): Promise<WalletInfo | null> {
    try {
      if (!isValidSolanaAddress(walletAddress)) {
        logger.warn(`Invalid wallet address: ${walletAddress}`);
        return null;
      }
      
      // In production, would fetch from blockchain
      const walletInfo: WalletInfo = {
        address: walletAddress,
        network: (process.env.SOLANA_NETWORK || 'devnet') as any,
        is_valid: true,
        is_program_wallet: false
      };
      
      // Fetch balance from blockchain service
      try {
        const balanceResponse = await fetch(
          `${additionalServiceUrls.blockchainServiceUrl}/wallet/${walletAddress}/balance`
        );
        
        if (balanceResponse.ok) {
          const data = await balanceResponse.json();
          walletInfo.balance = data.balance;
        }
      } catch (error) {
        logger.error('Error fetching wallet balance:', error);
      }
      
      return walletInfo;
    } catch (error) {
      logger.error('Error getting wallet info:', error);
      return null;
    }
  }
  
  async verifyWalletOwnership(
    userId: string,
    walletAddress: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      // Verify signature
      const isValid = await verifyWalletOwnership(walletAddress, message, signature);
      
      if (!isValid) {
        logger.warn(`Invalid signature for wallet ${formatWalletAddress(walletAddress)}`);
        return false;
      }
      
      // Store verification record
      const verification: WalletVerification = {
        wallet_address: walletAddress,
        message,
        signature,
        verified: true,
        verified_at: new Date()
      };
      
      // In production, would store in database
      logger.info(`Wallet ownership verified for user ${userId}`);
      
      return true;
    } catch (error) {
      logger.error('Error verifying wallet ownership:', error);
      return false;
    }
  }
  
  async getWalletBalance(walletAddress: string): Promise<WalletBalance | null> {
    try {
      if (!isValidSolanaAddress(walletAddress)) {
        return null;
      }
      
      // Fetch from blockchain service
      const response = await fetch(
        `${additionalServiceUrls.blockchainServiceUrl}/wallet/${walletAddress}/balance/detailed`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch balance: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return {
        wallet_address: walletAddress,
        sol_balance: data.sol_balance || 0,
        usdc_balance: data.usdc_balance || 0,
        token_count: data.token_count || 0,
        last_updated: new Date()
      };
    } catch (error) {
      logger.error('Error getting wallet balance:', error);
      return null;
    }
  }
  
  async validateWalletForTransaction(
    walletAddress: string,
    requiredAmount: number,
    currency: 'SOL' | 'USDC'
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check wallet validity
      if (!isValidSolanaAddress(walletAddress)) {
        return { valid: false, error: 'Invalid wallet address format' };
      }
      
      // Check balance
      const balance = await this.getWalletBalance(walletAddress);
      
      if (!balance) {
        return { valid: false, error: 'Could not fetch wallet balance' };
      }
      
      const currentBalance = currency === 'SOL' ? balance.sol_balance : balance.usdc_balance;
      
      if (currentBalance < requiredAmount) {
        return { 
          valid: false, 
          error: `Insufficient ${currency} balance. Required: ${requiredAmount}, Available: ${currentBalance}` 
        };
      }
      
      return { valid: true };
    } catch (error) {
      logger.error('Error validating wallet for transaction:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }
}

export const WalletService = WalletServiceClass;
export const walletService = new WalletServiceClass();
