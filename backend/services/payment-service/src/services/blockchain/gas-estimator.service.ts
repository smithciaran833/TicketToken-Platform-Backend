import { Connection } from '@solana/web3.js';
import { ethers } from 'ethers';
import { GasEstimate } from '../../types';
import { blockchainConfig } from '../../config/blockchain';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'GasEstimatorService' });

export class GasEstimatorService {
  private solanaConnection: Connection;
  private polygonProvider: ethers.JsonRpcProvider;
  private cache: Map<string, { estimate: GasEstimate; timestamp: number }> = new Map();
  private cacheTTL = 60000;

  constructor() {
    this.solanaConnection = new Connection(blockchainConfig.solana.rpcUrl);
    this.polygonProvider = new ethers.JsonRpcProvider(blockchainConfig.polygon.rpcUrl);
  }

  async estimateGasFees(blockchain: 'solana' | 'polygon', ticketCount: number): Promise<GasEstimate> {
    const cacheKey = `${blockchain}_${ticketCount}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.estimate;

    let estimate: GasEstimate;
    if (blockchain === 'solana') {
      estimate = await this.estimateSolanaFees(ticketCount);
    } else {
      estimate = await this.estimatePolygonFees(ticketCount);
    }

    this.cache.set(cacheKey, { estimate, timestamp: Date.now() });
    return estimate;
  }

  private async estimateSolanaFees(ticketCount: number): Promise<GasEstimate> {
    try {
      const { blockhash } = await this.solanaConnection.getLatestBlockhash();
      const baseFee = 5000;
      const perTicketFee = 5000;
      const totalLamports = baseFee + (perTicketFee * ticketCount);
      const solPriceUSD = 25;
      const feeInSOL = totalLamports / 1_000_000_000;
      const feeInUSD = feeInSOL * solPriceUSD;
      const slot = await this.solanaConnection.getSlot();
      const congestionLevel = this.determineCongestionLevel(slot);

      return { blockchain: 'solana', estimatedFee: feeInSOL, feeInUSD, congestionLevel, timestamp: new Date() };
    } catch (error) {
      log.error({ error }, 'Solana fee estimation error');
      return { blockchain: 'solana', estimatedFee: 0.001 * ticketCount, feeInUSD: 0.025 * ticketCount, congestionLevel: 'medium', timestamp: new Date() };
    }
  }

  private async estimatePolygonFees(ticketCount: number): Promise<GasEstimate> {
    try {
      const gasPrice = await this.polygonProvider.getFeeData();
      const gasPerMint = blockchainConfig.polygon.gasLimits.mint;
      const totalGas = gasPerMint * ticketCount;
      const feeWei = totalGas * Number(gasPrice.gasPrice);
      const feeInMatic = Number(ethers.formatEther(feeWei));
      const maticPriceUSD = 0.50;
      const feeInUSD = feeInMatic * maticPriceUSD;

      return { blockchain: 'polygon', estimatedFee: feeInMatic, feeInUSD, congestionLevel: this.getPolygonCongestion(Number(gasPrice.gasPrice)), timestamp: new Date() };
    } catch (error) {
      log.error({ error }, 'Polygon fee estimation error');
      return { blockchain: 'polygon', estimatedFee: 0.01 * ticketCount, feeInUSD: 0.005 * ticketCount, congestionLevel: 'medium', timestamp: new Date() };
    }
  }

  private determineCongestionLevel(slot: number): 'low' | 'medium' | 'high' {
    const timeOfDay = new Date().getHours();
    if (timeOfDay >= 9 && timeOfDay <= 17) return 'high';
    if (timeOfDay >= 18 && timeOfDay <= 22) return 'medium';
    return 'low';
  }

  private getPolygonCongestion(gasPrice: number): 'low' | 'medium' | 'high' {
    const gweiPrice = gasPrice / 1_000_000_000;
    if (gweiPrice < 30) return 'low';
    if (gweiPrice < 100) return 'medium';
    return 'high';
  }

  async getBestBlockchain(ticketCount: number): Promise<{ recommended: 'solana' | 'polygon'; reason: string; estimates: { solana: GasEstimate; polygon: GasEstimate } }> {
    const [solanaEstimate, polygonEstimate] = await Promise.all([
      this.estimateGasFees('solana', ticketCount),
      this.estimateGasFees('polygon', ticketCount)
    ]);

    let recommended: 'solana' | 'polygon';
    let reason: string;

    if (solanaEstimate.feeInUSD < polygonEstimate.feeInUSD) {
      recommended = 'solana';
      reason = `Solana is ${((polygonEstimate.feeInUSD - solanaEstimate.feeInUSD) / polygonEstimate.feeInUSD * 100).toFixed(0)}% cheaper`;
    } else {
      recommended = 'polygon';
      reason = `Polygon is ${((solanaEstimate.feeInUSD - polygonEstimate.feeInUSD) / solanaEstimate.feeInUSD * 100).toFixed(0)}% cheaper`;
    }

    if (solanaEstimate.congestionLevel === 'high' && polygonEstimate.congestionLevel !== 'high') {
      recommended = 'polygon';
      reason = 'Solana network is congested';
    } else if (polygonEstimate.congestionLevel === 'high' && solanaEstimate.congestionLevel !== 'high') {
      recommended = 'solana';
      reason = 'Polygon network is congested';
    }

    return { recommended, reason, estimates: { solana: solanaEstimate, polygon: polygonEstimate } };
  }
}
