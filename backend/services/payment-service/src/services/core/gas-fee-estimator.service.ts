/**
 * Gas Fee Estimator Service
 * Real-time blockchain gas fee estimation for Solana and Polygon
 */

import axios from 'axios';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { SafeLogger } from '../../utils/pci-log-scrubber.util';
import { cacheService } from '../cache.service';

const logger = new SafeLogger('GasFeeEstimatorService');

// Cache configuration
const GAS_FEE_CACHE_TTL = 300; // 5 minutes (gas prices change frequently)

export enum BlockchainNetwork {
  SOLANA = 'solana',
  POLYGON = 'polygon',
  ETHEREUM = 'ethereum',
}

export interface GasFeeEstimate {
  network: BlockchainNetwork;
  feePerTransactionCents: number;
  totalFeeCents: number;
  transactionCount: number;
  gasPrice?: string; // Raw gas price for reference
  priorityFee?: string; // Priority fee if applicable
}

export class GasFeeEstimatorService {
  private solanaConnection: Connection;
  private polygonRpcUrl: string;
  private ethereumRpcUrl: string;
  private priceFeeds: Map<string, number>; // Crypto prices in USD

  constructor() {
    // Solana configuration
    const solanaNetwork = process.env.SOLANA_NETWORK || 'mainnet-beta';
    const solanaRpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl(solanaNetwork as any);
    this.solanaConnection = new Connection(solanaRpcUrl, 'confirmed');

    // Polygon configuration
    this.polygonRpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

    // Ethereum configuration (if needed in future)
    this.ethereumRpcUrl = process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';

    // Initialize price cache
    this.priceFeeds = new Map();
    
    logger.info('Gas fee estimator initialized', {
      solanaNetwork,
      hasPolygonRpc: !!process.env.POLYGON_RPC_URL,
    });
  }

  /**
   * Estimate gas fees for ticket minting
   * @param ticketCount Number of tickets to mint
   * @param network Blockchain network to use
   */
  async estimateGasFees(
    ticketCount: number,
    network: BlockchainNetwork = BlockchainNetwork.SOLANA
  ): Promise<GasFeeEstimate> {
    const cacheKey = `gas:fee:${network}:${ticketCount}`;

    return cacheService.getOrCompute(
      cacheKey,
      async () => {
        try {
          switch (network) {
            case BlockchainNetwork.SOLANA:
              return await this.estimateSolanaFees(ticketCount);
            case BlockchainNetwork.POLYGON:
              return await this.estimatePolygonFees(ticketCount);
            case BlockchainNetwork.ETHEREUM:
              return await this.estimateEthereumFees(ticketCount);
            default:
              throw new Error(`Unsupported network: ${network}`);
          }
        } catch (error) {
          logger.error('Gas fee estimation failed, using fallback', {
            network,
            ticketCount,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          
          // Fallback to conservative estimates
          return this.getFallbackEstimate(ticketCount, network);
        }
      },
      GAS_FEE_CACHE_TTL
    );
  }

  /**
   * Estimate Solana transaction fees
   */
  private async estimateSolanaFees(ticketCount: number): Promise<GasFeeEstimate> {
    try {
      // Get recent blockhash and fee calculator
      const { feeCalculator } = await this.solanaConnection.getRecentBlockhash();
      
      // Solana fees are per signature, not per computation
      // Each ticket mint requires 1 transaction with 1 signature
      const lamportsPerSignature = feeCalculator.lamportsPerSignature;
      
      // Get SOL price in USD
      const solPriceUsd = await this.getCryptoPrice('SOL');
      
      // Calculate cost
      const lamportsPerTicket = lamportsPerSignature;
      const totalLamports = lamportsPerTicket * ticketCount;
      const solCost = totalLamports / 1_000_000_000; // Convert lamports to SOL
      const usdCost = solCost * solPriceUsd;
      const costCents = Math.round(usdCost * 100);

      logger.info('Solana gas fee estimated', {
        ticketCount,
        lamportsPerSignature,
        totalLamports,
        solCost: solCost.toFixed(6),
        usdCost: usdCost.toFixed(2),
        costCents,
      });

      return {
        network: BlockchainNetwork.SOLANA,
        feePerTransactionCents: Math.round(costCents / ticketCount),
        totalFeeCents: costCents,
        transactionCount: ticketCount,
        gasPrice: `${lamportsPerSignature} lamports`,
      };
    } catch (error) {
      logger.error('Solana fee estimation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Estimate Polygon transaction fees
   */
  private async estimatePolygonFees(ticketCount: number): Promise<GasFeeEstimate> {
    try {
      // Get current gas price from Polygon network
      const response = await axios.post(
        this.polygonRpcUrl,
        {
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
          id: 1,
        },
        {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const gasPriceWei = BigInt(response.data.result);
      const gasPriceGwei = Number(gasPriceWei) / 1_000_000_000;

      // Estimate gas units needed per ticket mint
      // NFT minting on Polygon typically costs ~100k-200k gas
      const gasUnitsPerMint = 150000;
      
      // Get MATIC price in USD
      const maticPriceUsd = await this.getCryptoPrice('MATIC');
      
      // Calculate cost
      const totalGasUnits = gasUnitsPerMint * ticketCount;
      const maticCostPerTicket = (gasPriceGwei * gasUnitsPerMint) / 1_000_000_000;
      const totalMaticCost = maticCostPerTicket * ticketCount;
      const usdCost = totalMaticCost * maticPriceUsd;
      const costCents = Math.round(usdCost * 100);

      logger.info('Polygon gas fee estimated', {
        ticketCount,
        gasPriceGwei: gasPriceGwei.toFixed(2),
        gasUnitsPerMint,
        totalGasUnits,
        maticCost: totalMaticCost.toFixed(6),
        usdCost: usdCost.toFixed(2),
        costCents,
      });

      return {
        network: BlockchainNetwork.POLYGON,
        feePerTransactionCents: Math.round(costCents / ticketCount),
        totalFeeCents: costCents,
        transactionCount: ticketCount,
        gasPrice: `${gasPriceGwei.toFixed(2)} Gwei`,
      };
    } catch (error) {
      logger.error('Polygon fee estimation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Estimate Ethereum transaction fees (for future use)
   */
  private async estimateEthereumFees(ticketCount: number): Promise<GasFeeEstimate> {
    // Similar to Polygon but with different gas costs and ETH price
    // Not implemented in this phase but structure is here
    logger.warn('Ethereum fee estimation not yet implemented');
    return this.getFallbackEstimate(ticketCount, BlockchainNetwork.ETHEREUM);
  }

  /**
   * Get cryptocurrency price in USD
   * Uses CoinGecko API (free tier)
   */
  private async getCryptoPrice(symbol: string): Promise<number> {
    const cacheKey = `crypto:price:${symbol}`;
    
    return cacheService.getOrCompute(
      cacheKey,
      async () => {
        try {
          const coinIds: Record<string, string> = {
            'SOL': 'solana',
            'MATIC': 'matic-network',
            'ETH': 'ethereum',
          };

          const coinId = coinIds[symbol];
          if (!coinId) {
            throw new Error(`Unknown cryptocurrency symbol: ${symbol}`);
          }

          const response = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price`,
            {
              params: {
                ids: coinId,
                vs_currencies: 'usd',
              },
              timeout: 5000,
            }
          );

          const price = response.data[coinId]?.usd;
          if (!price) {
            throw new Error(`Price not found for ${symbol}`);
          }

          logger.info('Crypto price fetched', { symbol, price });
          return price;
        } catch (error) {
          logger.error('Failed to fetch crypto price, using fallback', {
            symbol,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          
          // Fallback prices (conservative estimates)
          const fallbackPrices: Record<string, number> = {
            'SOL': 100,    // $100 per SOL
            'MATIC': 1,    // $1 per MATIC
            'ETH': 3000,   // $3000 per ETH
          };
          
          return fallbackPrices[symbol] || 1;
        }
      },
      300 // Cache price for 5 minutes
    );
  }

  /**
   * Fallback gas fee estimates (conservative)
   */
  private getFallbackEstimate(
    ticketCount: number,
    network: BlockchainNetwork
  ): GasFeeEstimate {
    // Conservative fallback estimates in cents
    const fallbackRates: Record<BlockchainNetwork, number> = {
      [BlockchainNetwork.SOLANA]: 5,    // 5 cents per transaction
      [BlockchainNetwork.POLYGON]: 10,  // 10 cents per transaction
      [BlockchainNetwork.ETHEREUM]: 500, // $5 per transaction (ETH is expensive)
    };

    const feePerTransaction = fallbackRates[network];
    const totalFee = feePerTransaction * ticketCount;

    logger.warn('Using fallback gas fee estimate', {
      network,
      ticketCount,
      feePerTransaction,
      totalFee,
    });

    return {
      network,
      feePerTransactionCents: feePerTransaction,
      totalFeeCents: totalFee,
      transactionCount: ticketCount,
      gasPrice: 'fallback',
    };
  }

  /**
   * Get current network congestion level
   * Returns 'low', 'medium', or 'high'
   */
  async getNetworkCongestion(network: BlockchainNetwork): Promise<string> {
    // This could be enhanced with real-time data
    // For now, return 'medium' as default
    return 'medium';
  }
}
