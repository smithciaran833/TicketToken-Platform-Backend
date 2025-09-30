import { logger } from '../config/logger';

interface ProviderHealth {
  provider: string;
  healthy: boolean;
  lastCheck: Date;
  failureCount: number;
  successCount: number;
}

export class ProviderManager {
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly MAX_FAILURES = 3;
  
  constructor() {
    this.initializeProviders();
    this.startHealthChecks();
  }

  private initializeProviders() {
    // Initialize provider health tracking
    this.providerHealth.set('sendgrid', {
      provider: 'sendgrid',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('aws-ses', {
      provider: 'aws-ses',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('twilio', {
      provider: 'twilio',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });

    this.providerHealth.set('aws-sns', {
      provider: 'aws-sns',
      healthy: true,
      lastCheck: new Date(),
      failureCount: 0,
      successCount: 0,
    });
  }

  private startHealthChecks() {
    setInterval(() => {
      this.checkProviderHealth();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private async checkProviderHealth() {
    for (const [name, health] of this.providerHealth) {
      try {
        // Implement actual health check based on provider
        // For now, using the existing connection status
        health.lastCheck = new Date();
        
        // Mark unhealthy if too many failures
        if (health.failureCount >= this.MAX_FAILURES) {
          health.healthy = false;
          logger.warn(`Provider ${name} marked unhealthy`, {
            failureCount: health.failureCount
          });
        }
      } catch (error) {
        logger.error(`Health check failed for ${name}`, error);
      }
    }
  }

  async getHealthyEmailProvider(): Promise<string> {
    // Primary provider
    if (this.providerHealth.get('sendgrid')?.healthy) {
      return 'sendgrid';
    }
    
    // Fallback provider
    if (this.providerHealth.get('aws-ses')?.healthy) {
      logger.info('Failing over to AWS SES from SendGrid');
      return 'aws-ses';
    }
    
    throw new Error('No healthy email providers available');
  }

  async getHealthySmsProvider(): Promise<string> {
    // Primary provider
    if (this.providerHealth.get('twilio')?.healthy) {
      return 'twilio';
    }
    
    // Fallback provider
    if (this.providerHealth.get('aws-sns')?.healthy) {
      logger.info('Failing over to AWS SNS from Twilio');
      return 'aws-sns';
    }
    
    throw new Error('No healthy SMS providers available');
  }

  recordSuccess(provider: string) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.successCount++;
      health.failureCount = 0; // Reset failure count on success
      health.healthy = true;
    }
  }

  recordFailure(provider: string, error: Error) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.failureCount++;
      logger.error(`Provider ${provider} failure`, {
        failureCount: health.failureCount,
        error: error.message
      });
      
      if (health.failureCount >= this.MAX_FAILURES) {
        health.healthy = false;
      }
    }
  }

  getProviderStatus(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }
}

export const providerManager = new ProviderManager();
