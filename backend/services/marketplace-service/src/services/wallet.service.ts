/**
 * Wallet Service for Marketplace Service
 * 
 * Issues Fixed:
 * - S2S-3: No auth headers for S2S calls → Added HMAC authentication
 * - S2S-5: No circuit breaker → Added circuit breaker with retry
 * - GD-2: No timeout on external calls → Added timeout config
 */

import { additionalServiceUrls } from '../config/service-urls';
import { logger } from '../utils/logger';
import { 
  isValidSolanaAddress, 
  formatWalletAddress,
  verifyWalletOwnership 
} from '../utils/wallet-helper';
import { WalletInfo, WalletBalance, WalletVerification } from '../types/wallet.types';
import { config } from '../config';
import { buildInternalHeaders } from '../middleware/internal-auth';
import { withCircuitBreakerAndRetry } from '../utils/circuit-breaker';
import { ExternalServiceError } from '../errors';

// AUDIT FIX GD-2: Configurable timeout for external calls
const FETCH_TIMEOUT_MS = parseInt(process.env.EXTERNAL_SERVICE_TIMEOUT || '10000', 10);

/**
 * AUDIT FIX S2S-3: Authenticated fetch with internal auth headers
 */
async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
  requestId?: string
): Promise<Response> {
  const body = options.body ? JSON.parse(options.body as string) : {};
  const headers = buildInternalHeaders(body, requestId);
  
  // AUDIT FIX GD-2: Add timeout using AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

class WalletServiceClass {
  private log = logger.child({ component: 'WalletService' });
  
  async getWalletInfo(walletAddress: string, requestId?: string): Promise<WalletInfo | null> {
    try {
      if (!isValidSolanaAddress(walletAddress)) {
        this.log.warn('Invalid wallet address', { walletAddress: formatWalletAddress(walletAddress) });
        return null;
      }
      
      const walletInfo: WalletInfo = {
        address: walletAddress,
        network: (process.env.SOLANA_NETWORK || 'devnet') as any,
        is_valid: true,
        is_program_wallet: false
      };
      
      // AUDIT FIX S2S-3/S2S-5: Fetch balance with auth and circuit breaker
      try {
        const data = await withCircuitBreakerAndRetry(
          'blockchain-service',
          async () => {
            const response = await authenticatedFetch(
              `${additionalServiceUrls.blockchainServiceUrl}/wallet/${walletAddress}/balance`,
              { method: 'GET' },
              requestId
            );
            
            if (!response.ok) {
              throw new ExternalServiceError('Blockchain Service', `HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response.json();
          },
          { failureThreshold: 5, timeout: 30000 },
          { maxRetries: 2, initialDelayMs: 500 }
        );
        
        walletInfo.balance = data.balance;
      } catch (error: any) {
        this.log.error('Error fetching wallet balance', {
          error: error.message,
          walletAddress: formatWalletAddress(walletAddress),
          requestId
        });
        // Don't fail - return partial info
      }
      
      return walletInfo;
    } catch (error: any) {
      this.log.error('Error getting wallet info', {
        error: error.message,
        walletAddress: formatWalletAddress(walletAddress)
      });
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
        this.log.warn('Invalid wallet signature', {
          walletAddress: formatWalletAddress(walletAddress),
          userId
        });
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
      this.log.info('Wallet ownership verified', {
        userId,
        walletAddress: formatWalletAddress(walletAddress)
      });
      
      return true;
    } catch (error: any) {
      this.log.error('Error verifying wallet ownership', {
        error: error.message,
        walletAddress: formatWalletAddress(walletAddress),
        userId
      });
      return false;
    }
  }
  
  async getWalletBalance(walletAddress: string, requestId?: string): Promise<WalletBalance | null> {
    try {
      if (!isValidSolanaAddress(walletAddress)) {
        return null;
      }
      
      // AUDIT FIX S2S-3/S2S-5: Authenticated call with circuit breaker
      const data = await withCircuitBreakerAndRetry(
        'blockchain-service',
        async () => {
          const response = await authenticatedFetch(
            `${additionalServiceUrls.blockchainServiceUrl}/wallet/${walletAddress}/balance/detailed`,
            { method: 'GET' },
            requestId
          );
          
          if (!response.ok) {
            throw new ExternalServiceError(
              'Blockchain Service',
              `Failed to fetch balance: ${response.statusText}`,
              undefined,
              { statusCode: response.status }
            );
          }
          
          return response.json();
        },
        { failureThreshold: 5, timeout: 30000 },
        { maxRetries: 3, initialDelayMs: 1000 }
      );
      
      return {
        wallet_address: walletAddress,
        sol_balance: data.sol_balance || 0,
        usdc_balance: data.usdc_balance || 0,
        token_count: data.token_count || 0,
        last_updated: new Date()
      };
    } catch (error: any) {
      this.log.error('Error getting wallet balance', {
        error: error.message,
        walletAddress: formatWalletAddress(walletAddress),
        requestId,
        errorCode: error.code
      });
      return null;
    }
  }
  
  async validateWalletForTransaction(
    walletAddress: string,
    requiredAmount: number,
    currency: 'SOL' | 'USDC',
    requestId?: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check wallet validity
      if (!isValidSolanaAddress(walletAddress)) {
        return { valid: false, error: 'Invalid wallet address format' };
      }
      
      // Check balance
      const balance = await this.getWalletBalance(walletAddress, requestId);
      
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
    } catch (error: any) {
      this.log.error('Error validating wallet for transaction', {
        error: error.message,
        walletAddress: formatWalletAddress(walletAddress),
        requiredAmount,
        currency
      });
      return { valid: false, error: 'Validation failed' };
    }
  }
}

export const WalletService = WalletServiceClass;
export const walletService = new WalletServiceClass();
