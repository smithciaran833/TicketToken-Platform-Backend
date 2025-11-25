/**
 * Graceful Degradation Utility
 * Provides fallback behavior when services degrade
 */

import { SafeLogger } from './pci-log-scrubber.util';
import { circuitBreakerManager } from './circuit-breaker';

const logger = new SafeLogger('GracefulDegradation');

export enum DegradationLevel {
  FULL = 'FULL',           // All features working
  PARTIAL = 'PARTIAL',     // Some features degraded
  MINIMAL = 'MINIMAL',     // Only critical features
}

export interface ServiceHealth {
  database: boolean;
  redis: boolean;
  taxjar: boolean;
  blockchain: boolean;
  stripe: boolean;
}

export class GracefulDegradationManager {
  private currentLevel: DegradationLevel = DegradationLevel.FULL;
  private serviceHealth: ServiceHealth = {
    database: true,
    redis: true,
    taxjar: true,
    blockchain: true,
    stripe: true,
  };

  /**
   * Update service health status
   */
  updateServiceHealth(service: keyof ServiceHealth, isHealthy: boolean): void {
    this.serviceHealth[service] = isHealthy;
    
    // Recalculate degradation level
    const previousLevel = this.currentLevel;
    this.currentLevel = this.calculateDegradationLevel();

    if (previousLevel !== this.currentLevel) {
      logger.warn('Degradation level changed', {
        from: previousLevel,
        to: this.currentLevel,
        serviceHealth: this.serviceHealth,
      });
    }
  }

  /**
   * Calculate current degradation level based on service health
   */
  private calculateDegradationLevel(): DegradationLevel {
    const { database, redis, taxjar, blockchain, stripe } = this.serviceHealth;

    // Database or Stripe down = MINIMAL (critical services)
    if (!database || !stripe) {
      return DegradationLevel.MINIMAL;
    }

    // Redis, TaxJar, or Blockchain down = PARTIAL
    if (!redis || !taxjar || !blockchain) {
      return DegradationLevel.PARTIAL;
    }

    return DegradationLevel.FULL;
  }

  /**
   * Get current degradation level
   */
  getDegradationLevel(): DegradationLevel {
    return this.currentLevel;
  }

  /**
   * Check if a feature should be available
   */
  isFeatureAvailable(feature: string): boolean {
    const featureRequirements: Record<string, DegradationLevel> = {
      'payment_processing': DegradationLevel.MINIMAL,
      'refunds': DegradationLevel.PARTIAL,
      'dynamic_fees': DegradationLevel.PARTIAL,
      'real_time_tax': DegradationLevel.FULL,
      'blockchain_minting': DegradationLevel.FULL,
      'analytics': DegradationLevel.FULL,
    };

    const required = featureRequirements[feature] || DegradationLevel.FULL;
    const current = this.currentLevel;

    const levels = [DegradationLevel.MINIMAL, DegradationLevel.PARTIAL, DegradationLevel.FULL];
    return levels.indexOf(current) >= levels.indexOf(required);
  }

  /**
   * Get fallback value when service is degraded
   */
  getFallback<T>(
    serviceCall: () => Promise<T>,
    fallbackValue: T,
    serviceName: string
  ): Promise<T> {
    return this.withFallback(serviceCall, fallbackValue, serviceName);
  }

  /**
   * Execute function with fallback on failure
   */
  private async withFallback<T>(
    fn: () => Promise<T>,
    fallback: T,
    context: string
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      logger.warn('Service call failed, using fallback', {
        context,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return fallback;
    }
  }
}

// Singleton instance
export const degradationManager = new GracefulDegradationManager();

/**
 * Decorator for graceful degradation
 */
export function WithFallback<T>(fallbackValue: T, serviceName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        logger.warn('Method failed, using fallback', {
          service: serviceName,
          method: propertyKey,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return fallbackValue;
      }
    };

    return descriptor;
  };
}

/**
 * Execute with circuit breaker and fallback
 */
export async function executeWithDegradation<T>(
  serviceName: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  const breaker = circuitBreakerManager.getBreaker(serviceName);

  try {
    return await breaker.execute(fn);
  } catch (error) {
    logger.warn('Circuit breaker open or execution failed, using fallback', {
      serviceName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Update service health
    degradationManager.updateServiceHealth(
      serviceName as keyof ServiceHealth,
      false
    );

    return fallback;
  }
}

/**
 * Tax calculation with fallback to static rates
 */
export async function calculateTaxWithFallback(
  amountCents: number,
  state: string,
  taxjarFn: () => Promise<number>
): Promise<{ taxCents: number; source: 'taxjar' | 'fallback' }> {
  // Try TaxJar first
  if (degradationManager.isFeatureAvailable('real_time_tax')) {
    try {
      const taxCents = await executeWithDegradation(
        'taxjar',
        taxjarFn,
        0 // Will use fallback below if this fails
      );

      if (taxCents > 0) {
        return { taxCents, source: 'taxjar' };
      }
    } catch (error) {
      logger.warn('TaxJar calculation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Fallback to static rates
  const fallbackRates: Record<string, number> = {
    'AL': 0.04, 'AK': 0.00, 'AZ': 0.056, 'AR': 0.065, 'CA': 0.0725,
    'CO': 0.029, 'CT': 0.0635, 'DE': 0.00, 'FL': 0.06, 'GA': 0.04,
    'HI': 0.04, 'ID': 0.06, 'IL': 0.0625, 'IN': 0.07, 'IA': 0.06,
    'KS': 0.065, 'KY': 0.06, 'LA': 0.0445, 'ME': 0.055, 'MD': 0.06,
    'MA': 0.0625, 'MI': 0.06, 'MN': 0.06875, 'MS': 0.07, 'MO': 0.04225,
    'MT': 0.00, 'NE': 0.055, 'NV': 0.0685, 'NH': 0.00, 'NJ': 0.06625,
    'NM': 0.05125, 'NY': 0.04, 'NC': 0.0475, 'ND': 0.05, 'OH': 0.0575,
    'OK': 0.045, 'OR': 0.00, 'PA': 0.06, 'RI': 0.07, 'SC': 0.06,
    'SD': 0.045, 'TN': 0.07, 'TX': 0.0625, 'UT': 0.0485, 'VT': 0.06,
    'VA': 0.053, 'WA': 0.065, 'WV': 0.06, 'WI': 0.05, 'WY': 0.04,
  };

  const rate = fallbackRates[state] || 0.07; // Default 7%
  const taxCents = Math.round(amountCents * rate);

  logger.info('Using fallback tax rate', {
    state,
    rate,
    taxCents,
  });

  return { taxCents, source: 'fallback' };
}

/**
 * Blockchain fee estimation with fallback
 */
export async function estimateGasWithFallback(
  ticketCount: number,
  blockchainFn: () => Promise<number>
): Promise<{ feeCents: number; source: 'blockchain' | 'fallback' }> {
  if (degradationManager.isFeatureAvailable('blockchain_minting')) {
    try {
      const feeCents = await executeWithDegradation(
        'blockchain',
        blockchainFn,
        0
      );

      if (feeCents > 0) {
        return { feeCents, source: 'blockchain' };
      }
    } catch (error) {
      logger.warn('Blockchain fee estimation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Fallback to fixed rate
  const fallbackFeeCents = 50 * ticketCount; // 50 cents per ticket

  logger.info('Using fallback gas fee', {
    ticketCount,
    feeCents: fallbackFeeCents,
  });

  return { feeCents: fallbackFeeCents, source: 'fallback' };
}

/**
 * Health check with degradation status
 */
export function getHealthStatus() {
  return {
    degradationLevel: degradationManager.getDegradationLevel(),
    serviceHealth: (degradationManager as any).serviceHealth,
    isHealthy: degradationManager.getDegradationLevel() === DegradationLevel.FULL,
    circuitBreakers: circuitBreakerManager.getAllStates(),
  };
}
