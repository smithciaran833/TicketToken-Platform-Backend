// WP-12 Phase 5: Failover Manager for Multi-Provider Support

const EventEmitter = require('events');

class FailoverManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.providers = config.providers || {};
    this.currentProviders = {};
    this.providerHealth = {};
    this.failureCount = {};
    
    // Initialize current providers to first in list
    Object.keys(this.providers).forEach(service => {
      this.currentProviders[service] = 0;
      this.failureCount[service] = {};
      this.providers[service].forEach(provider => {
        this.failureCount[service][provider] = 0;
        this.providerHealth[service] = this.providerHealth[service] || {};
        this.providerHealth[service][provider] = true;
      });
    });
  }

  async executeWithFailover(service, operation) {
    const providers = this.providers[service];
    if (!providers || providers.length === 0) {
      throw new Error(`No providers configured for service: ${service}`);
    }

    let lastError;
    const startIndex = this.currentProviders[service];
    
    // Try each provider starting from current
    for (let i = 0; i < providers.length; i++) {
      const providerIndex = (startIndex + i) % providers.length;
      const provider = providers[providerIndex];
      
      if (!this.providerHealth[service][provider]) {
        console.log(`⚠️  Skipping unhealthy provider: ${provider}`);
        continue;
      }
      
      try {
        console.log(`Using provider: ${provider} for ${service}`);
        const result = await operation(provider);
        
        // Success - reset failure count
        this.failureCount[service][provider] = 0;
        this.currentProviders[service] = providerIndex;
        
        return result;
        
      } catch (error) {
        lastError = error;
        console.error(`Provider ${provider} failed:`, error.message);
        
        // Track failures
        this.failureCount[service][provider]++;
        
        // Mark unhealthy after 3 consecutive failures
        if (this.failureCount[service][provider] >= 3) {
          this.markUnhealthy(service, provider);
        }
        
        // Try next provider
        continue;
      }
    }
    
    // All providers failed
    this.emit('all-providers-failed', { service, error: lastError });
    throw new Error(`All providers failed for ${service}: ${lastError.message}`);
  }

  markUnhealthy(service, provider) {
    this.providerHealth[service][provider] = false;
    console.log(`❌ Provider marked unhealthy: ${provider}`);
    this.emit('provider-unhealthy', { service, provider });
    
    // Schedule health check in 5 minutes
    setTimeout(() => this.healthCheck(service, provider), 300000);
  }

  async healthCheck(service, provider) {
    console.log(`🏥 Health check for ${provider}`);
    // This would call actual health endpoint
    // For now, just mark as healthy again
    this.providerHealth[service][provider] = true;
    this.failureCount[service][provider] = 0;
    console.log(`✅ Provider ${provider} marked healthy`);
  }

  getStatus() {
    return {
      currentProviders: this.currentProviders,
      providerHealth: this.providerHealth,
      failureCount: this.failureCount
    };
  }
}

module.exports = FailoverManager;
