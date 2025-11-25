import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { CircuitBreaker } from '../utils/circuit-breaker';

export class PaymentProviderFailoverService {
  private providers = ['stripe', 'paypal', 'square'];
  private circuitBreakers: Map<string, CircuitBreaker>;
  
  constructor() {
    this.circuitBreakers = new Map();
    this.providers.forEach(provider => {
      this.circuitBreakers.set(provider, new CircuitBreaker('payment', { timeout: 15000, resetTimeout: 60000 }));
    });
  }

  async processPayment(amountCents: number, token: string, preferredProvider?: string): Promise<{ success: boolean; provider: string; transactionId?: string }> {
    const providerOrder = preferredProvider ? [preferredProvider, ...this.providers.filter(p => p !== preferredProvider)] : this.providers;
    
    for (const provider of providerOrder) {
      const breaker = this.circuitBreakers.get(provider);
      if (!breaker) continue;
      
      try {
        const result = await breaker.execute(async () => {
          return await this.attemptPayment(provider, amountCents, token);
        });
        
        if (result.success) {
          logger.info('Payment successful', { provider, amountCents });
          return { success: true, provider, transactionId: result.transactionId };
        }
      } catch (error) {
        logger.warn('Payment provider failed, trying next', { provider, error });
        continue;
      }
    }
    
    throw new Error('All payment providers failed');
  }

  private async attemptPayment(provider: string, amountCents: number, token: string): Promise<{ success: boolean; transactionId?: string }> {
    // Simplified - would integrate with actual payment providers
    logger.info('Attempting payment', { provider, amountCents });
    return { success: true, transactionId: `${provider}_${Date.now()}` };
  }

  getProviderHealth(): Record<string, string> {
    const health: Record<string, string> = {};
    this.circuitBreakers.forEach((breaker, provider) => {
      health[provider] = breaker.getState();
    });
    return health;
  }
}

export const paymentProviderFailoverService = new PaymentProviderFailoverService();
