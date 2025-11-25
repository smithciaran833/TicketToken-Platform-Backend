import { Redis } from 'ioredis';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'PCICompliance' });

export class PCIComplianceService {
  private redis: Redis;
  
  constructor(redis: Redis) {
    this.redis = redis;
  }
  
  // Never store card data - only tokens
  async validateNoCardStorage(data: any): Promise<boolean> {
    const sensitivePatterns = [
      /\b\d{13,19}\b/, // Card numbers
      /\b\d{3,4}\b/, // CVV
      /^(0[1-9]|1[0-2])\/\d{2,4}$/ // Expiry dates
    ];
    
    const jsonString = JSON.stringify(data);
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(jsonString)) {
        log.error('CRITICAL: Attempt to store card data detected');
        await this.logSecurityIncident('CARD_DATA_STORAGE_ATTEMPT', data);
        return false;
      }
    }
    
    return true;
  }
  
  async logSecurityIncident(type: string, metadata: any): Promise<void> {
    const incident = {
      type,
      timestamp: new Date().toISOString(),
      metadata: this.sanitizeForLogging(metadata)
    };
    
    await this.redis.lpush('security:incidents', JSON.stringify(incident));
    
    // Alert security team in production
    if (process.env.NODE_ENV === 'production') {
      log.error('Security incident', { type });
    }
  }
  
  private sanitizeForLogging(data: any): any {
    const sanitized = { ...data };
    
    // Remove any potential sensitive data
    delete sanitized.cardNumber;
    delete sanitized.cvv;
    delete sanitized.pin;
    delete sanitized.password;
    
    return sanitized;
  }
}
