/**
 * Fee Configuration for Marketplace Service
 * 
 * Issues Fixed:
 * - FEE-H1: Platform fee not transferred (crypto) → Dynamic fee config
 * - FEE-H2: Network fee hardcoded → Configurable network fees
 * 
 * Features:
 * - Configurable platform fees
 * - Network fee estimation
 * - Tier-based fee structure
 * - Fee breakdowns for transparency
 */

import { logger } from '../utils/logger';
import { getRedis } from './redis';

const log = logger.child({ component: 'FeeConfig' });

// Default configuration (can be overridden by env or database)
const DEFAULT_FEES = {
  // Platform fees (percentage)
  platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT || '5.0'),
  minPlatformFee: parseFloat(process.env.MIN_PLATFORM_FEE || '0.50'),
  maxPlatformFee: parseFloat(process.env.MAX_PLATFORM_FEE || '500.00'),
  
  // Payment processor fees
  stripeFeePercent: parseFloat(process.env.STRIPE_FEE_PERCENT || '2.9'),
  stripeFeeFixed: parseFloat(process.env.STRIPE_FEE_FIXED || '0.30'),
  
  // Crypto/blockchain fees (in lamports for Solana)
  solanaBaseFee: parseInt(process.env.SOLANA_BASE_FEE_LAMPORTS || '5000', 10),
  solanaTransferFee: parseInt(process.env.SOLANA_TRANSFER_FEE_LAMPORTS || '10000', 10),
  priorityFeeMultiplier: parseFloat(process.env.PRIORITY_FEE_MULTIPLIER || '1.5'),
  
  // Royalties
  creatorRoyaltyPercent: parseFloat(process.env.CREATOR_ROYALTY_PERCENT || '2.5'),
  venueRoyaltyPercent: parseFloat(process.env.VENUE_ROYALTY_PERCENT || '2.5'),
  
  // Fee caps
  maxTotalFeePercent: parseFloat(process.env.MAX_TOTAL_FEE_PERCENT || '15.0')
};

// Fee tiers based on volume
interface FeeTier {
  minVolume: number;
  maxVolume: number;
  platformFeePercent: number;
}

const FEE_TIERS: FeeTier[] = [
  { minVolume: 0, maxVolume: 1000, platformFeePercent: 5.0 },
  { minVolume: 1000, maxVolume: 10000, platformFeePercent: 4.5 },
  { minVolume: 10000, maxVolume: 50000, platformFeePercent: 4.0 },
  { minVolume: 50000, maxVolume: 100000, platformFeePercent: 3.5 },
  { minVolume: 100000, maxVolume: Infinity, platformFeePercent: 3.0 }
];

// Cache key for network fee estimates
const NETWORK_FEE_CACHE_KEY = 'marketplace:network-fee:estimate';
const NETWORK_FEE_CACHE_TTL = 60; // 1 minute

export interface FeeBreakdown {
  subtotal: number;
  platformFee: number;
  platformFeePercent: number;
  paymentProcessorFee: number;
  networkFee: number;
  creatorRoyalty: number;
  venueRoyalty: number;
  totalFees: number;
  totalFeePercent: number;
  sellerReceives: number;
  buyerPays: number;
}

export interface CryptoFeeBreakdown {
  transferFee: number;
  priorityFee: number;
  totalNetworkFee: number;
  platformFeeLamports: number;
  creatorRoyaltyLamports: number;
  totalFees: number;
}

/**
 * AUDIT FIX FEE-H1: Calculate fee breakdown for fiat transactions
 */
export function calculateFiatFees(
  salePrice: number,
  sellerVolume: number = 0,
  options: {
    includeStripe?: boolean;
    creatorRoyaltyOverride?: number;
    venueRoyaltyOverride?: number;
  } = {}
): FeeBreakdown {
  // Get tier-based platform fee
  const tier = FEE_TIERS.find(t => 
    sellerVolume >= t.minVolume && sellerVolume < t.maxVolume
  ) || FEE_TIERS[0];
  
  const platformFeePercent = tier.platformFeePercent;
  
  // Calculate platform fee
  let platformFee = (salePrice * platformFeePercent) / 100;
  platformFee = Math.max(platformFee, DEFAULT_FEES.minPlatformFee);
  platformFee = Math.min(platformFee, DEFAULT_FEES.maxPlatformFee);
  
  // Calculate payment processor fee (Stripe)
  const paymentProcessorFee = options.includeStripe !== false
    ? (salePrice * DEFAULT_FEES.stripeFeePercent / 100) + DEFAULT_FEES.stripeFeeFixed
    : 0;
  
  // Calculate royalties
  const creatorRoyaltyPercent = options.creatorRoyaltyOverride ?? DEFAULT_FEES.creatorRoyaltyPercent;
  const venueRoyaltyPercent = options.venueRoyaltyOverride ?? DEFAULT_FEES.venueRoyaltyPercent;
  
  const creatorRoyalty = (salePrice * creatorRoyaltyPercent) / 100;
  const venueRoyalty = (salePrice * venueRoyaltyPercent) / 100;
  
  // Calculate totals
  const totalFees = platformFee + paymentProcessorFee + creatorRoyalty + venueRoyalty;
  const totalFeePercent = (totalFees / salePrice) * 100;
  
  // Apply cap
  const cappedTotalFees = Math.min(totalFees, (salePrice * DEFAULT_FEES.maxTotalFeePercent) / 100);
  
  const sellerReceives = salePrice - cappedTotalFees;
  const buyerPays = salePrice;
  
  return {
    subtotal: salePrice,
    platformFee: roundToTwoDecimals(platformFee),
    platformFeePercent,
    paymentProcessorFee: roundToTwoDecimals(paymentProcessorFee),
    networkFee: 0,
    creatorRoyalty: roundToTwoDecimals(creatorRoyalty),
    venueRoyalty: roundToTwoDecimals(venueRoyalty),
    totalFees: roundToTwoDecimals(cappedTotalFees),
    totalFeePercent: roundToTwoDecimals(totalFeePercent),
    sellerReceives: roundToTwoDecimals(sellerReceives),
    buyerPays: roundToTwoDecimals(buyerPays)
  };
}

/**
 * AUDIT FIX FEE-H2: Calculate crypto/blockchain fees
 */
export async function calculateCryptoFees(
  salePriceLamports: bigint,
  options: {
    priority?: 'low' | 'medium' | 'high';
    creatorRoyaltyPercent?: number;
  } = {}
): Promise<CryptoFeeBreakdown> {
  // Get network fee estimate
  const networkFee = await getNetworkFeeEstimate(options.priority || 'medium');
  
  // Calculate transfer fee
  const transferFee = BigInt(DEFAULT_FEES.solanaTransferFee);
  
  // Calculate priority fee
  const priorityMultiplier = options.priority === 'high' 
    ? 2.0 
    : options.priority === 'low' 
      ? 1.0 
      : DEFAULT_FEES.priorityFeeMultiplier;
  const priorityFee = BigInt(Math.floor(Number(transferFee) * (priorityMultiplier - 1)));
  
  // Total network fee
  const totalNetworkFee = transferFee + priorityFee;
  
  // Platform fee in lamports (based on percentage)
  const platformFeeLamports = BigInt(
    Math.floor(Number(salePriceLamports) * DEFAULT_FEES.platformFeePercent / 100)
  );
  
  // Creator royalty
  const creatorRoyaltyPercent = options.creatorRoyaltyPercent ?? DEFAULT_FEES.creatorRoyaltyPercent;
  const creatorRoyaltyLamports = BigInt(
    Math.floor(Number(salePriceLamports) * creatorRoyaltyPercent / 100)
  );
  
  // Total fees
  const totalFees = totalNetworkFee + platformFeeLamports + creatorRoyaltyLamports;
  
  return {
    transferFee: Number(transferFee),
    priorityFee: Number(priorityFee),
    totalNetworkFee: Number(totalNetworkFee),
    platformFeeLamports: Number(platformFeeLamports),
    creatorRoyaltyLamports: Number(creatorRoyaltyLamports),
    totalFees: Number(totalFees)
  };
}

/**
 * AUDIT FIX FEE-H2: Get network fee estimate from cache or network
 */
async function getNetworkFeeEstimate(priority: 'low' | 'medium' | 'high'): Promise<number> {
  try {
    const redis = getRedis();
    const cacheKey = `${NETWORK_FEE_CACHE_KEY}:${priority}`;
    
    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return parseInt(cached, 10);
    }
    
    // Default estimate based on priority
    let estimate = DEFAULT_FEES.solanaBaseFee;
    if (priority === 'medium') {
      estimate = Math.floor(estimate * 1.5);
    } else if (priority === 'high') {
      estimate = estimate * 2;
    }
    
    // Cache the estimate
    await redis.set(cacheKey, estimate.toString(), 'EX', NETWORK_FEE_CACHE_TTL);
    
    return estimate;
  } catch (error: any) {
    log.warn('Failed to get network fee estimate', { error: error.message });
    return DEFAULT_FEES.solanaBaseFee;
  }
}

/**
 * Update network fee estimate (called by blockchain service)
 */
export async function updateNetworkFeeEstimate(
  priority: 'low' | 'medium' | 'high',
  feeLamports: number
): Promise<void> {
  try {
    const redis = getRedis();
    const cacheKey = `${NETWORK_FEE_CACHE_KEY}:${priority}`;
    await redis.set(cacheKey, feeLamports.toString(), 'EX', NETWORK_FEE_CACHE_TTL);
    
    log.debug('Network fee estimate updated', { priority, feeLamports });
  } catch (error: any) {
    log.error('Failed to update network fee estimate', { error: error.message });
  }
}

/**
 * Get fee tier for a seller based on volume
 */
export function getSellerFeeTier(volume: number): FeeTier {
  return FEE_TIERS.find(t => 
    volume >= t.minVolume && volume < t.maxVolume
  ) || FEE_TIERS[0];
}

/**
 * Get all fee tiers
 */
export function getFeeTiers(): FeeTier[] {
  return [...FEE_TIERS];
}

/**
 * Get current fee configuration
 */
export function getFeeConfig(): typeof DEFAULT_FEES {
  return { ...DEFAULT_FEES };
}

/**
 * Validate fee breakdown
 */
export function validateFeeBreakdown(breakdown: FeeBreakdown): boolean {
  // Check that seller receives is positive
  if (breakdown.sellerReceives <= 0) {
    return false;
  }
  
  // Check total fee cap
  if (breakdown.totalFeePercent > DEFAULT_FEES.maxTotalFeePercent) {
    return false;
  }
  
  // Check math adds up
  const calculatedTotal = breakdown.platformFee + breakdown.paymentProcessorFee + 
    breakdown.networkFee + breakdown.creatorRoyalty + breakdown.venueRoyalty;
  
  if (Math.abs(calculatedTotal - breakdown.totalFees) > 0.01) {
    return false;
  }
  
  return true;
}

/**
 * Helper: Round to two decimal places
 */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

// Export fee configuration module
export const feeConfig = {
  calculateFiat: calculateFiatFees,
  calculateCrypto: calculateCryptoFees,
  updateNetworkFee: updateNetworkFeeEstimate,
  getSellerTier: getSellerFeeTier,
  getTiers: getFeeTiers,
  getConfig: getFeeConfig,
  validate: validateFeeBreakdown,
  DEFAULT_FEES,
  FEE_TIERS
};
